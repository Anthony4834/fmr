#!/usr/bin/env bun

/**
 * Compute Section 8 investment scores for all ZIP codes
 *
 * Algorithm:
 * - Annual Gross Rent = 12 × FMR
 * - Annual Property Taxes = Property Value × Tax Rate
 * - Net Yield = (Annual Rent - Annual Taxes) / Property Value
 * - Score = Normalized to 100 (average)
 *
 * Priority: 3BR → 2BR → 4BR (skip if only 0BR/1BR available)
 *
 * Usage:
 *   bun scripts/compute-investment-scores.ts
 *   bun scripts/compute-investment-scores.ts --year 2026
 *   bun scripts/compute-investment-scores.ts --state CA
 */

import { sql } from "@vercel/postgres";
import { config } from "dotenv";
import { configureDatabase } from "../lib/db";
import { getLatestFMRYear } from "../lib/queries";
import { createSchema } from "../lib/schema";

config();

if (process.env.POSTGRES_URL) {
  configureDatabase({ connectionString: process.env.POSTGRES_URL });
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let year: number | null = null;
  let stateFilter: string | null = null;
  let zhviMonth: Date | null = null;
  let acsVintage: number | null = null;
  let useHistorical: boolean = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--year" && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 2020 && n <= 2030) {
        year = n;
      }
      i++;
    } else if (a === "--state" && args[i + 1]) {
      stateFilter = args[i + 1].trim().toUpperCase();
      i++;
    } else if (a === "--zhvi-month" && args[i + 1]) {
      const date = new Date(args[i + 1]);
      if (!isNaN(date.getTime())) {
        zhviMonth = date;
      }
      i++;
    } else if (a === "--acs-vintage" && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 2009 && n <= 2100) {
        acsVintage = n;
      }
      i++;
    } else if (a === "--historical" || a === "--1-year-ago") {
      useHistorical = true;
    }
  }

  return { year, stateFilter, zhviMonth, acsVintage, useHistorical };
}

interface ZipScoreData {
  zipCode: string;
  stateCode: string | null;
  cityName: string | null;
  countyName: string | null;
  countyFips: string | null;
  bedroomCount: number;
  propertyValue: number;
  taxRate: number;
  annualRent: number;
  annualTaxes: number;
  netYield: number;
  rentToPriceRatio: number;
  // Historical data tracking
  zhviMonth: Date | null;
  acsVintage: number | null;
  // Normalization tracking
  rawZhvi: number;
  countyZhviMedian: number | null;
  blendedZhvi: number | null;
  priceFloorApplied: boolean;
  rentCapApplied: boolean;
  countyBlendingApplied: boolean;
  rawRentToPriceRatio: number;
}

function computeScore(data: ZipScoreData): number {
  // Net Yield = (Annual Rent - Annual Taxes) / Property Value
  return data.netYield;
}

async function computeZipScores(
  fmrYear: number,
  stateFilter: string | null,
  zhviMonthOverride: Date | null = null,
  acsVintageOverride: number | null = null,
  useHistorical: boolean = false
) {
  // Ensure schema exists
  await createSchema();

  console.log(`\n=== Computing Investment Scores (FMR Year: ${fmrYear}) ===\n`);

  // Determine which ZHVI month to use
  let targetMonth: Date | null = null;
  if (zhviMonthOverride) {
    targetMonth = zhviMonthOverride;
    console.log(`Using specified ZHVI month: ${targetMonth.toISOString().slice(0, 7)}\n`);
  } else if (useHistorical) {
    // Calculate 1 year ago from today
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    // Round to first of the month
    oneYearAgo.setDate(1);
    targetMonth = oneYearAgo;
    console.log(`Using historical ZHVI month (1 year ago): ${targetMonth.toISOString().slice(0, 7)}\n`);
  } else {
    // Get latest ZHVI month
    const latestMonthRes = await sql`
      SELECT MAX(month) as latest_month
      FROM zhvi_zip_bedroom_monthly
      LIMIT 1
    `;
    targetMonth = latestMonthRes.rows[0]?.latest_month || null;
    if (!targetMonth) {
      console.log("❌ No ZHVI data found. Run index:zip-latest first.");
      return;
    }
    console.log(`Using latest ZHVI month: ${targetMonth.toISOString().slice(0, 7)}\n`);
  }

  // Determine which ACS vintage to use
  let targetVintage: number | null = null;
  if (acsVintageOverride) {
    targetVintage = acsVintageOverride;
    console.log(`Using specified ACS vintage: ${targetVintage}\n`);
  } else if (useHistorical) {
    // Calculate vintage from 1 year ago (ACS vintages are typically year-based)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    targetVintage = oneYearAgo.getFullYear() - 1; // ACS 5-year data is typically 1-2 years behind
    console.log(`Using historical ACS vintage (approx 1 year ago): ${targetVintage}\n`);
  }

  // Build query to get ZIPs with FMR, property value, and tax rate
  // Priority: 3BR → 2BR → 4BR
  // FMR can come from SAFMR (zip-level) or county FMR (fallback)
  // Includes county-level ZHVI medians for blending
  const params: any[] = [targetMonth, fmrYear];
  
  let zipTaxWhere = 'WHERE effective_tax_rate IS NOT NULL';
  if (targetVintage) {
    zipTaxWhere += ` AND acs_vintage = $${params.length + 1}`;
    params.push(targetVintage);
  }
  
  let queryText = `
    WITH latest_zhvi AS (
      SELECT DISTINCT ON (zip_code, bedroom_count)
        zip_code,
        bedroom_count,
        zhvi,
        state_code,
        city_name,
        county_name
      FROM zhvi_zip_bedroom_monthly
      WHERE month = $1::date
        AND bedroom_count IN (2, 3, 4)
      ORDER BY zip_code, bedroom_count, month DESC
    ),
    zip_safmr AS (
      SELECT 
        zip_code,
        bedroom_2 as fmr_2br,
        bedroom_3 as fmr_3br,
        bedroom_4 as fmr_4br
      FROM safmr_data
      WHERE year = $2
    ),
    county_fmr AS (
      SELECT 
        fd.county_code,
        fd.state_code,
        fd.bedroom_2 as fmr_2br,
        fd.bedroom_3 as fmr_3br,
        fd.bedroom_4 as fmr_4br
      FROM fmr_data fd
      WHERE fd.year = $2
    ),
    zip_tax AS (
      SELECT 
        zcta,
        acs_vintage,
        effective_tax_rate
      FROM acs_tax_zcta_latest
      ${zipTaxWhere}
    ),
    zip_fmr_combined AS (
      SELECT 
        z.zip_code,
        z.state_code,
        COALESCE(
          safmr.fmr_2br,
          MAX(cfmr.fmr_2br)
        ) as fmr_2br,
        COALESCE(
          safmr.fmr_3br,
          MAX(cfmr.fmr_3br)
        ) as fmr_3br,
        COALESCE(
          safmr.fmr_4br,
          MAX(cfmr.fmr_4br)
        ) as fmr_4br
      FROM latest_zhvi z
      LEFT JOIN zip_safmr safmr ON safmr.zip_code = z.zip_code
      LEFT JOIN zip_county_mapping zcm ON zcm.zip_code = z.zip_code
        AND zcm.state_code = z.state_code
      LEFT JOIN county_fmr cfmr ON cfmr.county_code = zcm.county_fips 
        AND cfmr.state_code = z.state_code
      GROUP BY z.zip_code, z.state_code, safmr.fmr_2br, safmr.fmr_3br, safmr.fmr_4br
    ),
    zip_data AS (
      SELECT 
        z.zip_code,
        z.state_code,
        z.city_name,
        z.county_name,
        -- Get FIPS from zip_county_mapping, normalizing county names for matching
        -- ZHVI has "County" suffix, zip_county_mapping may not (or vice versa)
        COALESCE(
          -- First try: exact match on county_name
          MAX(CASE WHEN zcm.county_name = z.county_name THEN zcm.county_fips END),
          -- Second try: normalized match (remove "County", "Parish", etc. suffixes)
          MAX(CASE 
            WHEN LOWER(REGEXP_REPLACE(zcm.county_name, '\\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\\s*$', '', 'i')) = 
                 LOWER(REGEXP_REPLACE(z.county_name, '\\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\\s*$', '', 'i'))
            THEN zcm.county_fips 
          END),
          -- Fallback: any FIPS for this ZIP+state (ZIP might span counties, pick one)
          MAX(zcm.county_fips)
        ) as county_fips,
        -- Priority: 3BR → 2BR → 4BR
        COALESCE(
          MAX(CASE WHEN z.bedroom_count = 3 AND z.zhvi IS NOT NULL THEN z.zhvi END),
          MAX(CASE WHEN z.bedroom_count = 2 AND z.zhvi IS NOT NULL THEN z.zhvi END),
          MAX(CASE WHEN z.bedroom_count = 4 AND z.zhvi IS NOT NULL THEN z.zhvi END)
        ) as zip_zhvi,
        COALESCE(
          MAX(CASE WHEN z.bedroom_count = 3 THEN 3 END),
          MAX(CASE WHEN z.bedroom_count = 2 THEN 2 END),
          MAX(CASE WHEN z.bedroom_count = 4 THEN 4 END)
        ) as selected_bedroom,
        COALESCE(
          MAX(CASE WHEN z.bedroom_count = 3 THEN fmr.fmr_3br END),
          MAX(CASE WHEN z.bedroom_count = 2 THEN fmr.fmr_2br END),
          MAX(CASE WHEN z.bedroom_count = 4 THEN fmr.fmr_4br END)
        ) as fmr_value
      FROM latest_zhvi z
      LEFT JOIN zip_fmr_combined fmr ON 
        fmr.zip_code = z.zip_code
        AND fmr.state_code = z.state_code
      LEFT JOIN zip_county_mapping zcm ON 
        zcm.zip_code = z.zip_code
        AND zcm.state_code = z.state_code
      LEFT JOIN zip_tax tax ON tax.zcta = z.zip_code
      WHERE tax.effective_tax_rate IS NOT NULL
        AND z.zhvi IS NOT NULL
        AND z.zhvi > 0`;

  if (stateFilter) {
    queryText += ` AND z.state_code = $${params.length + 1}`;
    params.push(stateFilter);
  }

  queryText += `
      GROUP BY z.zip_code, z.state_code, z.city_name, z.county_name
      HAVING 
        COALESCE(
          MAX(CASE WHEN z.bedroom_count = 3 AND z.zhvi IS NOT NULL THEN z.zhvi END),
          MAX(CASE WHEN z.bedroom_count = 2 AND z.zhvi IS NOT NULL THEN z.zhvi END),
          MAX(CASE WHEN z.bedroom_count = 4 AND z.zhvi IS NOT NULL THEN z.zhvi END)
        ) IS NOT NULL
        AND COALESCE(
          MAX(CASE WHEN z.bedroom_count = 3 THEN fmr.fmr_3br END),
          MAX(CASE WHEN z.bedroom_count = 2 THEN fmr.fmr_2br END),
          MAX(CASE WHEN z.bedroom_count = 4 THEN fmr.fmr_4br END)
        ) IS NOT NULL
    )
    SELECT 
      zd.zip_code,
      zd.state_code,
      zd.city_name,
      zd.county_name,
      zd.county_fips,
      zd.selected_bedroom as bedroom_count,
      zd.zip_zhvi,
      county_zhvi.zhvi_median as county_zhvi_median,
      tax.effective_tax_rate as tax_rate,
      tax.acs_vintage,
      zd.fmr_value,
      (zd.fmr_value * 12) as annual_rent
    FROM zip_data zd
    LEFT JOIN zip_county_mapping zcm ON 
      zcm.zip_code = zd.zip_code
      AND zcm.county_name = zd.county_name
      AND zcm.state_code = zd.state_code
    LEFT JOIN zhvi_rollup_monthly county_zhvi ON (
      county_zhvi.geo_type = 'county'
      AND county_zhvi.month = $1
      AND county_zhvi.bedroom_count = zd.selected_bedroom
      AND county_zhvi.state_code = zd.state_code
      AND (
        -- Primary: match by FIPS (most reliable)
        (county_zhvi.county_fips = zd.county_fips AND zd.county_fips IS NOT NULL)
        -- Fallback: match by county_name only when FIPS is missing
        OR (county_zhvi.county_name = zd.county_name AND zd.county_fips IS NULL)
      )
    )
    LEFT JOIN zip_tax tax ON tax.zcta = zd.zip_code
    WHERE tax.effective_tax_rate IS NOT NULL
      AND zd.zip_zhvi IS NOT NULL
      AND zd.fmr_value IS NOT NULL
      AND zd.zip_zhvi > 0
      AND tax.effective_tax_rate > 0
  `;

  const result = await sql.query(queryText, params);

  if (result.rows.length === 0) {
    console.log("❌ No ZIP codes found with complete data.");
    return;
  }

  console.log(`Found ${result.rows.length} ZIP codes with complete data\n`);

  // Compute scores and deduplicate by ZIP code (keep first occurrence)
  const seenZips = new Set<string>();
  const scores: ZipScoreData[] = [];
  let skippedInvalid = 0;
  let priceFloorApplied = 0;
  let rentCapApplied = 0;
  let blendingApplied = 0;
  for (const row of result.rows) {
    const zipCode = row.zip_code;

    // Skip duplicates - each ZIP should only appear once
    if (seenZips.has(zipCode)) {
      continue;
    }
    seenZips.add(zipCode);

    const zipZhvi = Number(row.zip_zhvi);
    const countyZhviMedian = row.county_zhvi_median
      ? Number(row.county_zhvi_median)
      : null;
    const taxRate = Number(row.tax_rate);
    const annualRent = Number(row.annual_rent);
    const acsVintage = row.acs_vintage ? Number(row.acs_vintage) : null;

    // Validate basic data quality
    if (annualRent <= 0 || annualRent > 500_000) {
      // Skip unrealistic annual rent (> $500k/year)
      skippedInvalid++;
      continue;
    }
    if (taxRate < 0 || taxRate > 0.1) {
      // Skip unrealistic tax rates (> 10%)
      skippedInvalid++;
      continue;
    }

    // Fix #3: Blend ZHVI with County Median (60% ZIP + 40% County)
    // Only blend if county median exists and ZIP value is low (< $150k)
    let blendedZhvi = zipZhvi;
    let wasBlended = false;
    if (
      countyZhviMedian &&
      countyZhviMedian > 0 &&
      zipZhvi < 150_000 &&
      zipZhvi > 0
    ) {
      blendedZhvi = 0.6 * zipZhvi + 0.4 * countyZhviMedian;
      wasBlended = true;
      blendingApplied++;
    }

    // Fix #1: Price Floor by Replacement Cost Proxy
    // Regional floor: $90k-$120k (using $100k as conservative default)
    const PRICE_FLOOR = 100_000;
    const effectivePropertyValue = Math.max(blendedZhvi, PRICE_FLOOR);
    const priceFloorWasApplied = blendedZhvi < PRICE_FLOOR;
    if (priceFloorWasApplied) {
      priceFloorApplied++;
    }

    // Fix #2: Cap Rent-to-Price Ratio at 18% (institutional standard)
    const RENT_TO_PRICE_CAP = 0.18;
    const rawRentToPriceRatio = annualRent / effectivePropertyValue;
    const cappedAnnualRent =
      rawRentToPriceRatio > RENT_TO_PRICE_CAP
        ? effectivePropertyValue * RENT_TO_PRICE_CAP
        : annualRent;
    const rentCapWasApplied = rawRentToPriceRatio > RENT_TO_PRICE_CAP;
    if (rentCapWasApplied) {
      rentCapApplied++;
    }

    // Calculate taxes and yield with normalized values
    const annualTaxes = effectivePropertyValue * taxRate;
    const netYield = (cappedAnnualRent - annualTaxes) / effectivePropertyValue;
    const rentToPriceRatio = cappedAnnualRent / effectivePropertyValue;

    // Skip if net yield is negative (after all normalizations)
    if (netYield < 0) {
      skippedInvalid++;
      continue;
    }

    // Fix #4: Soft Penalty for Low Absolute Prices
    // Penalty = log(P / 100k) for P < $100k, but we already floor at $100k
    // So this is mainly for tracking purposes
    const pricePenalty =
      effectivePropertyValue < 100_000
        ? Math.log10(effectivePropertyValue / 100_000)
        : 1.0;

    scores.push({
      zipCode,
      stateCode: row.state_code || null,
      cityName: row.city_name || null,
      countyName: row.county_name || null,
      countyFips: row.county_fips || null,
      bedroomCount: Number(row.bedroom_count),
      propertyValue: effectivePropertyValue, // Use normalized value
      taxRate,
      annualRent: cappedAnnualRent, // Use capped rent
      annualTaxes,
      netYield,
      rentToPriceRatio,
      // Historical data tracking
      zhviMonth: targetMonth ? new Date(targetMonth) : null,
      acsVintage: acsVintage,
      // Normalization tracking
      rawZhvi: zipZhvi,
      countyZhviMedian: countyZhviMedian || null,
      blendedZhvi: wasBlended ? blendedZhvi : null,
      priceFloorApplied: priceFloorWasApplied,
      rentCapApplied: rentCapWasApplied,
      countyBlendingApplied: wasBlended,
      rawRentToPriceRatio,
    });
  }

  if (scores.length === 0) {
    console.log(`❌ No valid scores computed after filtering. Skipped ${skippedInvalid} invalid records.`);
    return;
  }

  if (skippedInvalid > 0) {
    console.log(`⚠️  Skipped ${skippedInvalid} ZIP codes with invalid/unrealistic data\n`);
  }

  // Report normalization statistics
  console.log(`\nNormalization Statistics:`);
  console.log(`  Price floor applied: ${priceFloorApplied} ZIPs`);
  console.log(`  Rent-to-price cap applied: ${rentCapApplied} ZIPs`);
  console.log(`  County blending applied: ${blendingApplied} ZIPs\n`);

  // Compute median yield for normalization
  const yields = scores.map((s) => s.netYield).sort((a, b) => a - b);
  const medianYield =
    yields.length % 2 === 0
      ? (yields[yields.length / 2 - 1]! + yields[yields.length / 2]!) / 2
      : yields[Math.floor(yields.length / 2)]!;

  console.log(`Valid scores: ${scores.length}`);
  console.log(`Median yield: ${(medianYield * 100).toFixed(2)}%\n`);

  // Normalize scores (100 = average)
  // Cap scores at 300 (3x median) to prevent extreme outliers from skewing results
  const cappedZips: Array<{
    zipCode: string;
    rawScore: number;
    propertyValue: number;
    annualRent: number;
    taxRate: number;
    netYield: number;
    stateCode: string | null;
    cityName: string | null;
    countyName: string | null;
  }> = [];

  const normalizedScores = scores.map((score) => {
    const rawScore = (score.netYield / medianYield) * 100;
    const cappedScore = Math.min(rawScore, 300);
    
    // Track ZIPs that hit the cap
    if (rawScore > 300) {
      cappedZips.push({
        zipCode: score.zipCode,
        rawScore,
        propertyValue: score.propertyValue,
        annualRent: score.annualRent,
        taxRate: score.taxRate,
        netYield: score.netYield,
        stateCode: score.stateCode,
        cityName: score.cityName,
        countyName: score.countyName,
      });
    }
    
    return {
      ...score,
      score: cappedScore,
    };
  });

  // Deduplicate by ZIP code (keep first occurrence) to avoid ON CONFLICT issues
  const uniqueScores = new Map<string, (typeof normalizedScores)[0]>();
  for (const score of normalizedScores) {
    if (!uniqueScores.has(score.zipCode)) {
      uniqueScores.set(score.zipCode, score);
    }
  }
  const deduplicatedScores = Array.from(uniqueScores.values());

  console.log(
    `Deduplicated: ${normalizedScores.length} → ${deduplicatedScores.length} unique ZIP codes\n`
  );

  // Insert/update scores
  console.log("Inserting scores into database...\n");
  let inserted = 0;
  const batchSize = 1000;

  for (let i = 0; i < deduplicatedScores.length; i += batchSize) {
    const batch = deduplicatedScores.slice(i, i + batchSize);
    const values: any[] = [];
    const placeholders: string[] = [];

    for (let j = 0; j < batch.length; j++) {
      const s = batch[j]!;
      const base = j * 26;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${
          base + 5
        }, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${
          base + 10
        }, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${
          base + 15
        }, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${
          base + 20
        }, $${base + 21}, $${base + 22}, $${base + 23}, $${base + 24}, $${
          base + 25
        }, $${base + 26})`
      );
      values.push(
        "zip",
        s.zipCode,
        s.zipCode,
        s.stateCode,
        s.cityName,
        s.countyName,
        s.countyFips,
        s.bedroomCount,
        fmrYear,
        // Historical data tracking
        s.zhviMonth,
        s.acsVintage,
        s.propertyValue,
        s.taxRate,
        s.annualRent,
        s.annualTaxes,
        s.netYield,
        s.rentToPriceRatio,
        s.score,
        true,
        // Normalization tracking
        s.rawZhvi,
        s.countyZhviMedian,
        s.blendedZhvi,
        s.priceFloorApplied,
        s.rentCapApplied,
        s.countyBlendingApplied,
        s.rawRentToPriceRatio
      );
    }

    await sql.query(
      `
      INSERT INTO investment_score (
        geo_type, geo_key, zip_code, state_code, city_name, county_name, county_fips,
        bedroom_count, fmr_year, zhvi_month, acs_vintage, property_value, tax_rate, annual_rent, annual_taxes,
        net_yield, rent_to_price_ratio, score, data_sufficient,
        raw_zhvi, county_zhvi_median, blended_zhvi, price_floor_applied,
        rent_cap_applied, county_blending_applied, raw_rent_to_price_ratio
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (geo_type, geo_key, bedroom_count, fmr_year, zhvi_month, acs_vintage)
      DO UPDATE SET
        property_value = EXCLUDED.property_value,
        tax_rate = EXCLUDED.tax_rate,
        annual_rent = EXCLUDED.annual_rent,
        annual_taxes = EXCLUDED.annual_taxes,
        net_yield = EXCLUDED.net_yield,
        rent_to_price_ratio = EXCLUDED.rent_to_price_ratio,
        score = EXCLUDED.score,
        data_sufficient = EXCLUDED.data_sufficient,
        raw_zhvi = EXCLUDED.raw_zhvi,
        county_zhvi_median = EXCLUDED.county_zhvi_median,
        blended_zhvi = EXCLUDED.blended_zhvi,
        price_floor_applied = EXCLUDED.price_floor_applied,
        rent_cap_applied = EXCLUDED.rent_cap_applied,
        county_blending_applied = EXCLUDED.county_blending_applied,
        raw_rent_to_price_ratio = EXCLUDED.raw_rent_to_price_ratio,
        computed_at = NOW()
      `,
      values
    );

    inserted += batch.length;
    process.stdout.write(
      `\rInserted ${inserted}/${deduplicatedScores.length} scores...`
    );
  }

  console.log(`\n\n✅ Computed ${inserted} investment scores`);
  console.log(`\nScore distribution:`);
  const scoreValues = deduplicatedScores
    .map((s) => s.score)
    .sort((a, b) => a - b);
  console.log(`  Min: ${scoreValues[0]!.toFixed(1)}`);
  console.log(
    `  25th percentile: ${scoreValues[
      Math.floor(scoreValues.length * 0.25)
    ]!.toFixed(1)}`
  );
  console.log(
    `  Median: ${scoreValues[Math.floor(scoreValues.length * 0.5)]!.toFixed(1)}`
  );
  console.log(
    `  75th percentile: ${scoreValues[
      Math.floor(scoreValues.length * 0.75)
    ]!.toFixed(1)}`
  );
  console.log(`  Max: ${scoreValues[scoreValues.length - 1]!.toFixed(1)}`);

  // Report capped ZIPs
  if (cappedZips.length > 0) {
    console.log(`\n⚠️  Found ${cappedZips.length} ZIP codes that hit the score cap (300)`);
    console.log(`These were capped from higher raw scores. Investigating...\n`);
    console.log("─".repeat(100));
    console.log(
      "ZIP Code".padEnd(12) +
        "State".padEnd(8) +
        "Location".padEnd(30) +
        "Raw Score".padEnd(12) +
        "Property Value".padEnd(18) +
        "Annual Rent".padEnd(15) +
        "Tax Rate".padEnd(12) +
        "Net Yield"
    );
    console.log("─".repeat(100));

    // Sort by raw score descending
    const sortedCapped = cappedZips.sort((a, b) => b.rawScore - a.rawScore);

    // Show top 20
    const toShow = sortedCapped.slice(0, 20);
    for (const zip of toShow) {
      const location = [zip.cityName, zip.countyName]
        .filter(Boolean)
        .join(", ")
        .slice(0, 28);
      console.log(
        zip.zipCode.padEnd(12) +
          (zip.stateCode || "N/A").padEnd(8) +
          location.padEnd(30) +
          zip.rawScore.toFixed(1).padEnd(12) +
          `$${zip.propertyValue.toLocaleString()}`.padEnd(18) +
          `$${zip.annualRent.toLocaleString()}`.padEnd(15) +
          `${(zip.taxRate * 100).toFixed(2)}%`.padEnd(12) +
          `${(zip.netYield * 100).toFixed(2)}%`
      );
    }

    if (cappedZips.length > 20) {
      console.log(`\n... and ${cappedZips.length - 20} more capped ZIP codes`);
    }

    console.log("\nAnalysis:");
    const avgPropertyValue =
      cappedZips.reduce((sum, z) => sum + z.propertyValue, 0) /
      cappedZips.length;
    const avgAnnualRent =
      cappedZips.reduce((sum, z) => sum + z.annualRent, 0) / cappedZips.length;
    const avgTaxRate =
      cappedZips.reduce((sum, z) => sum + z.taxRate, 0) / cappedZips.length;
    const avgNetYield =
      cappedZips.reduce((sum, z) => sum + z.netYield, 0) / cappedZips.length;

    console.log(`  Average property value: $${avgPropertyValue.toLocaleString()}`);
    console.log(`  Average annual rent: $${avgAnnualRent.toLocaleString()}`);
    console.log(`  Average tax rate: ${(avgTaxRate * 100).toFixed(2)}%`);
    console.log(`  Average net yield: ${(avgNetYield * 100).toFixed(2)}%`);

    // Check if low property values are the issue
    const lowValueCount = cappedZips.filter((z) => z.propertyValue < 100_000)
      .length;
    if (lowValueCount > 0) {
      console.log(
        `\n  ⚠️  ${lowValueCount} (${(
          (lowValueCount / cappedZips.length) *
          100
        ).toFixed(1)}%) have property values < $100k`
      );
      console.log(
        `     This suggests data quality issues - property values may be underestimated`
      );
    }

    // Check for very high rent-to-price ratios
    const highRatioCount = cappedZips.filter(
      (z) => z.annualRent / z.propertyValue > 0.3
    ).length;
    if (highRatioCount > 0) {
      console.log(
        `\n  ⚠️  ${highRatioCount} (${(
          (highRatioCount / cappedZips.length) *
          100
        ).toFixed(1)}%) have rent-to-price ratios > 30%`
      );
      console.log(
        `     This is unusually high and may indicate data mismatches`
      );
    }
  }
}

// Export for use in API routes
export { computeZipScores };

if (import.meta.main) {
  const { year, stateFilter, zhviMonth, acsVintage, useHistorical } = parseArgs(process.argv);
  const fmrYear = year || (await getLatestFMRYear());

  computeZipScores(fmrYear, stateFilter, zhviMonth, acsVintage, useHistorical)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("❌ Error:", e);
      process.exit(1);
    });
}
