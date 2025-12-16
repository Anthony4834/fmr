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
  // Demand data
  zordiMetro: string | null;
  zordiValue: number | null;
  zordiDelta3m: number | null;
  zoriYoy: number | null;
  demandScore: number | null;
  demandMultiplier: number | null;
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
    canonical_county_lookup AS (
      -- Get canonical county name for each FIPS+state combination
      -- Use the most common county_name for each FIPS+state to ensure consistency
      SELECT DISTINCT ON (county_fips, state_code)
        county_fips,
        state_code,
        county_name
      FROM (
        SELECT 
          county_fips,
          state_code,
          county_name,
          COUNT(*) as name_count
        FROM zip_county_mapping
        WHERE county_fips IS NOT NULL
          AND LENGTH(TRIM(county_fips)) = 5
          AND state_code IS NOT NULL
        GROUP BY county_fips, state_code, county_name
      ) ranked
      ORDER BY county_fips, state_code, name_count DESC, county_name
    ),
    zip_data AS (
      SELECT 
        z.zip_code,
        z.state_code,
        z.city_name,
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
        -- Use canonical county name from FIPS lookup, fallback to original ZHVI name
        -- We'll resolve this in the final SELECT after grouping
        z.county_name,
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
        ) as fmr_value,
        MAX(tax.effective_tax_rate) as tax_rate,
        MAX(tax.acs_vintage) as acs_vintage
      FROM latest_zhvi z
      LEFT JOIN zip_fmr_combined fmr ON 
        fmr.zip_code = z.zip_code
        AND fmr.state_code = z.state_code
      LEFT JOIN zip_county_mapping zcm ON 
        zcm.zip_code = z.zip_code
        AND zcm.state_code = z.state_code
      LEFT JOIN canonical_county_lookup ccl ON 
        ccl.county_fips = COALESCE(
          CASE WHEN zcm.county_name = z.county_name THEN zcm.county_fips END,
          CASE 
            WHEN LOWER(REGEXP_REPLACE(zcm.county_name, '\\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\\s*$', '', 'i')) = 
                 LOWER(REGEXP_REPLACE(z.county_name, '\\s+(County|Parish|Borough|Municipality|Census Area|City and Borough)\\s*$', '', 'i'))
            THEN zcm.county_fips 
          END,
          zcm.county_fips
        )
        AND ccl.state_code = z.state_code
      LEFT JOIN zip_tax tax ON tax.zcta = z.zip_code
      WHERE tax.effective_tax_rate IS NOT NULL
        AND z.zhvi IS NOT NULL
        AND z.zhvi > 0
      GROUP BY z.zip_code, z.state_code, z.city_name, z.county_name`;

  if (stateFilter) {
    queryText += ` AND z.state_code = $${params.length + 1}`;
    params.push(stateFilter);
  }

  queryText += `
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
    ),
    zip_data_with_canonical AS (
      SELECT 
        zd.zip_code,
        zd.state_code,
        zd.city_name,
        -- Use canonical county name from FIPS lookup, fallback to original ZHVI name
        COALESCE(ccl.county_name, zd.county_name) as county_name,
        zd.county_fips,
        zd.selected_bedroom as bedroom_count,
        zd.zip_zhvi,
        county_zhvi.zhvi_median as county_zhvi_median,
        zd.tax_rate,
        zd.acs_vintage,
        zd.fmr_value,
        (zd.fmr_value * 12) as annual_rent
      FROM zip_data zd
      LEFT JOIN canonical_county_lookup ccl ON 
        ccl.county_fips = zd.county_fips
        AND ccl.state_code = zd.state_code
      LEFT JOIN zhvi_rollup_monthly county_zhvi ON (
        county_zhvi.geo_type = 'county'
        AND county_zhvi.month = $1
        AND county_zhvi.bedroom_count = zd.selected_bedroom
        AND county_zhvi.state_code = zd.state_code
        AND (
          -- Primary: match by FIPS (most reliable)
          (county_zhvi.county_fips = zd.county_fips AND zd.county_fips IS NOT NULL)
          -- Fallback: match by county_name only when FIPS is missing
          OR (county_zhvi.county_name = COALESCE(ccl.county_name, zd.county_name) AND zd.county_fips IS NULL)
        )
      )
    ),
    -- Get latest ZORDI month for demand data
    latest_zordi_month AS (
      SELECT MAX(month) as month FROM zillow_zordi_metro_monthly
    ),
    -- Get ZORDI values with 3-month delta
    zordi_current AS (
      SELECT
        z.region_name,
        z.zordi as zordi_value,
        z_prev.zordi as zordi_3m_ago,
        CASE
          WHEN z_prev.zordi IS NOT NULL AND z_prev.zordi != 0
          THEN (z.zordi - z_prev.zordi) / z_prev.zordi
          ELSE NULL
        END as zordi_delta_3m
      FROM zillow_zordi_metro_monthly z
      CROSS JOIN latest_zordi_month lzm
      LEFT JOIN zillow_zordi_metro_monthly z_prev ON
        z_prev.region_name = z.region_name
        AND z_prev.region_type = z.region_type
        AND z_prev.month = (lzm.month - INTERVAL '3 months')::date
      WHERE z.month = lzm.month
        AND z.region_type IN ('msa', 'metro')
    ),
    -- Get latest ZORI month
    latest_zori_month AS (
      SELECT MAX(month) as month FROM zillow_zori_zip_monthly
    ),
    -- Calculate ZORI YoY growth for each ZIP
    zori_growth AS (
      SELECT
        zc.zip_code,
        zc.zori as zori_current,
        zp.zori as zori_1y_ago,
        CASE
          WHEN zp.zori IS NOT NULL AND zp.zori > 0
          THEN (zc.zori - zp.zori) / zp.zori
          ELSE NULL
        END as zori_yoy
      FROM zillow_zori_zip_monthly zc
      CROSS JOIN latest_zori_month lsm
      LEFT JOIN zillow_zori_zip_monthly zp ON
        zp.zip_code = zc.zip_code
        AND zp.month = (lsm.month - INTERVAL '1 year')::date
      WHERE zc.month = lsm.month
    ),
    -- County-level metro fallback: find most common metro for ZIPs in same county
    -- This allows us to map ZIPs without direct metro data by using metro assignments
    -- from other ZIPs in the same county. This significantly improves coverage by
    -- mapping ~8,352 additional ZIPs that would otherwise lack demand data.
    county_metro_fallback AS (
      SELECT 
        zcm.county_fips,
        zcm.state_code,
        MODE() WITHIN GROUP (ORDER BY COALESCE(cbsa.cbsa_name, zori.metro_name)) as county_metro_name
      FROM zip_county_mapping zcm
      -- Get metro mappings for ZIPs in this county (from CBSA or ZORI)
      LEFT JOIN cbsa_zip_mapping cbsa ON cbsa.zip_code = zcm.zip_code
      LEFT JOIN zillow_zori_zip_monthly zori ON 
        zori.zip_code = zcm.zip_code
        AND zori.metro_name IS NOT NULL
      WHERE COALESCE(cbsa.cbsa_name, zori.metro_name) IS NOT NULL
        AND zcm.county_fips IS NOT NULL
        AND zcm.state_code IS NOT NULL
      GROUP BY zcm.county_fips, zcm.state_code
      HAVING COUNT(DISTINCT COALESCE(cbsa.cbsa_name, zori.metro_name)) > 0
    ),
    -- Map ZIPs to metro areas via CBSA, metro_name from ZORI, or county-level fallback
    -- Normalize metro names for better matching:
    -- 1. Extract primary city from multi-city names (e.g., "Harrisburg-Carlisle, PA" -> "Harrisburg, PA")
    -- 2. Remove state codes for matching
    zip_metro_mapping AS (
      SELECT DISTINCT ON (target_zip.zip_code)
        target_zip.zip_code,
        COALESCE(
          -- Priority 1: CBSA mapping (most reliable)
          cbsa.cbsa_name,
          -- Priority 2: ZORI metro_name
          zori.metro_name,
          -- Priority 3: County-level fallback (NEW)
          cmf.county_metro_name
        ) as metro_name,
        -- Extract primary city: take everything before first "-" or ","
        -- Then normalize: lowercase and remove state codes
        LOWER(
          REGEXP_REPLACE(
            SPLIT_PART(
              COALESCE(
                cbsa.cbsa_name,
                zori.metro_name,
                cmf.county_metro_name
              ),
              '-',
              1
            ),
            ',\\s*[A-Z]{2}(-[A-Z]{2})*',
            '',
            'g'
          )
        ) as metro_name_normalized
      FROM zip_data_with_canonical target_zip
      -- Try CBSA mapping first
      LEFT JOIN cbsa_zip_mapping cbsa ON cbsa.zip_code = target_zip.zip_code
      -- Try ZORI metro_name
      LEFT JOIN zillow_zori_zip_monthly zori ON 
        zori.zip_code = target_zip.zip_code
        AND zori.metro_name IS NOT NULL
      -- Try county-level fallback
      LEFT JOIN county_metro_fallback cmf ON
        cmf.county_fips = target_zip.county_fips
        AND cmf.state_code = target_zip.state_code
      WHERE COALESCE(cbsa.cbsa_name, zori.metro_name, cmf.county_metro_name) IS NOT NULL
      ORDER BY target_zip.zip_code, 
        -- Prefer CBSA > ZORI > county fallback
        CASE WHEN cbsa.cbsa_name IS NOT NULL THEN 1
             WHEN zori.metro_name IS NOT NULL THEN 2
             ELSE 3 END
    ),
    -- Normalize ZORDI region names for matching (extract primary city, remove state codes)
    zordi_normalized AS (
      SELECT 
        region_name,
        LOWER(
          REGEXP_REPLACE(
            SPLIT_PART(region_name, '-', 1),
            ',\\s*[A-Z]{2}(-[A-Z]{2})*',
            '',
            'g'
          )
        ) as region_name_normalized
      FROM zordi_current
    )
    SELECT
      zdc.zip_code,
      zdc.state_code,
      zdc.city_name,
      zdc.county_name,
      zdc.county_fips,
      zdc.bedroom_count,
      zdc.zip_zhvi,
      zdc.county_zhvi_median,
      zdc.tax_rate,
      zdc.acs_vintage,
      zdc.fmr_value,
      zdc.annual_rent,
      -- Demand data
      zmm.metro_name as zordi_metro,
      zrd.zordi_value,
      zrd.zordi_delta_3m,
      zg.zori_yoy
    FROM zip_data_with_canonical zdc
    LEFT JOIN zip_metro_mapping zmm ON zmm.zip_code = zdc.zip_code
    LEFT JOIN zordi_normalized zn ON zn.region_name_normalized = zmm.metro_name_normalized
    LEFT JOIN zordi_current zrd ON zrd.region_name = zn.region_name
    LEFT JOIN zori_growth zg ON zg.zip_code = zdc.zip_code
    WHERE zdc.tax_rate IS NOT NULL
      AND zdc.zip_zhvi IS NOT NULL
      AND zdc.fmr_value IS NOT NULL
      AND zdc.zip_zhvi > 0
      AND zdc.tax_rate > 0
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

    // Extract demand data from row (will be populated by the query)
    const zordiMetro = row.zordi_metro || null;
    const zordiValue = row.zordi_value ? Number(row.zordi_value) : null;
    const zordiDelta3m = row.zordi_delta_3m ? Number(row.zordi_delta_3m) : null;
    const zoriYoy = row.zori_yoy ? Number(row.zori_yoy) : null;

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
      // Demand data (will be computed after percentile ranking)
      zordiMetro,
      zordiValue,
      zordiDelta3m,
      zoriYoy,
      demandScore: null, // Computed later
      demandMultiplier: null, // Computed later
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

  // ============================================================================
  // Compute Demand Scores using percentile ranking
  // Formula:
  //   demand_level = pct_rank(ZORDI_metro_latest)
  //   demand_momentum = pct_rank(ΔZORDI_metro_3m)
  //   rent_pressure = pct_rank(ZORI_zip_yoy)
  //   DEMAND_SCORE = 0.5*demand_level + 0.3*demand_momentum + 0.2*rent_pressure
  // 
  // Demand Multiplier Logic (applied after score normalization):
  //   - Green threshold (score >= 100):
  //     * Positive demand (score > 50): marginal increase (1.0 to 1.05)
  //     * Negative demand (score < 50): heavy penalty (0.70 to 0.90)
  //   - Red threshold (score < 100):
  //     * Positive demand (score > 50): no change (multiplier = 1.0)
  //     * Negative demand (score < 50): heavy penalty (0.70 to 0.90)
  // ============================================================================

  // Helper function for percentile rank (0-100)
  function computePercentileRank(values: number[]): Map<number, number> {
    const sorted = [...values].filter(v => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
    const ranks = new Map<number, number>();
    for (let i = 0; i < sorted.length; i++) {
      // Percentile rank: percentage of values that fall below this value
      ranks.set(sorted[i]!, (i / (sorted.length - 1 || 1)) * 100);
    }
    return ranks;
  }

  // Collect demand metrics for percentile ranking
  const zordiValues = scores.map(s => s.zordiValue).filter(v => v !== null) as number[];
  const zordiDeltas = scores.map(s => s.zordiDelta3m).filter(v => v !== null) as number[];
  const zoriYoys = scores.map(s => s.zoriYoy).filter(v => v !== null) as number[];

  const zordiRanks = computePercentileRank(zordiValues);
  const zordiDeltaRanks = computePercentileRank(zordiDeltas);
  const zoriYoyRanks = computePercentileRank(zoriYoys);

  // Count how many ZIPs have demand data
  let demandDataCount = 0;

  // Compute demand scores for each ZIP
  for (const score of scores) {
    let demandLevel: number | null = null;
    let demandMomentum: number | null = null;
    let rentPressure: number | null = null;

    if (score.zordiValue !== null && zordiRanks.has(score.zordiValue)) {
      demandLevel = zordiRanks.get(score.zordiValue)!;
    }
    if (score.zordiDelta3m !== null && zordiDeltaRanks.has(score.zordiDelta3m)) {
      demandMomentum = zordiDeltaRanks.get(score.zordiDelta3m)!;
    }
    if (score.zoriYoy !== null && zoriYoyRanks.has(score.zoriYoy)) {
      rentPressure = zoriYoyRanks.get(score.zoriYoy)!;
    }

    // Compute weighted demand score (only if we have at least demand level)
    if (demandLevel !== null) {
      // If missing components, reweight to available data
      let totalWeight = 0;
      let weightedSum = 0;

      if (demandLevel !== null) {
        weightedSum += 0.5 * demandLevel;
        totalWeight += 0.5;
      }
      if (demandMomentum !== null) {
        weightedSum += 0.3 * demandMomentum;
        totalWeight += 0.3;
      }
      if (rentPressure !== null) {
        weightedSum += 0.2 * rentPressure;
        totalWeight += 0.2;
      }

      // Normalize to 0-100 scale
      const demandScore = totalWeight > 0 ? (weightedSum / totalWeight) : 50;
      score.demandScore = demandScore;
      // Demand multiplier will be computed after normalization based on score threshold

      demandDataCount++;
    } else {
      // No demand data - assign low demand score
      // Demand multiplier will be computed after normalization based on score threshold
      score.demandScore = 10; // Low score indicating insufficient data / low demand
    }
  }

  // Count ZIPs without demand data (assigned low score)
  const noDemandDataCount = scores.length - demandDataCount;

  console.log(`Demand Data Statistics:`);
  console.log(`  ZIPs with ZORDI data: ${zordiValues.length}`);
  console.log(`  ZIPs with ZORDI momentum: ${zordiDeltas.length}`);
  console.log(`  ZIPs with ZORI YoY growth: ${zoriYoys.length}`);
  console.log(`  ZIPs with computed demand score: ${demandDataCount}`);
  console.log(`  ZIPs without demand data (penalized): ${noDemandDataCount}\n`);

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

    // Compute demand multiplier based on score threshold and demand score
    // New logic:
    // - Green threshold (score >= 100): positive demand = small increase, negative demand = heavy penalty
    // - Red threshold (score < 100): positive demand = no change, negative demand = heavy penalty
    let demandMultiplier: number;
    const demandScore = score.demandScore ?? 10; // Default to low if missing
    
    if (cappedScore >= 100) {
      // Green threshold: already above median
      if (demandScore > 50) {
        // Positive demand: marginal increase (1.0 to 1.05)
        demandMultiplier = 1.0 + 0.05 * (demandScore - 50) / 50;
        demandMultiplier = Math.min(1.05, demandMultiplier);
      } else {
        // Negative demand: heavy penalty (0.70 to 0.90)
        // Penalty increases as demand gets worse
        demandMultiplier = 0.70 + 0.20 * (demandScore / 50);
        demandMultiplier = Math.max(0.70, demandMultiplier);
      }
    } else {
      // Red threshold: below median
      if (demandScore > 50) {
        // Positive demand: no increase (multiplier = 1.0)
        demandMultiplier = 1.0;
      } else {
        // Negative demand: heavy penalty (0.70 to 0.90)
        // Same penalty as green threshold for negative demand
        demandMultiplier = 0.70 + 0.20 * (demandScore / 50);
        demandMultiplier = Math.max(0.70, demandMultiplier);
      }
    }
    
    score.demandMultiplier = demandMultiplier;
    const scoreWithDemand = Math.min(cappedScore * demandMultiplier, 300);

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
      scoreWithDemand: scoreWithDemand,
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

  // Debug: Check if demand data is present in deduplicated scores
  const withDemand = deduplicatedScores.filter(s => s.demandScore !== null).length;
  console.log(`Debug: ${withDemand} deduplicated scores have demand data\n`);
  
  // Debug: Sample a few scores with demand to verify values
  const sampleWithDemand = deduplicatedScores.filter(s => s.demandScore !== null).slice(0, 3);
  if (sampleWithDemand.length > 0) {
    console.log('Debug: Sample scores with demand data:');
    sampleWithDemand.forEach(s => {
      console.log(`  ZIP ${s.zipCode}: demandScore=${s.demandScore}, multiplier=${s.demandMultiplier}, scoreWithDemand=${s.scoreWithDemand}`);
    });
    console.log();
  }
  
  // Debug: Check if values are preserved in the first batch
  if (deduplicatedScores.length > 0) {
    const firstWithDemand = deduplicatedScores.find(s => s.demandScore !== null);
    if (firstWithDemand) {
      console.log(`Debug: First score with demand - ZIP ${firstWithDemand.zipCode}, bedroom=${firstWithDemand.bedroomCount}, demandScore=${firstWithDemand.demandScore}`);
      console.log(`  Will be inserted at index in first batch\n`);
    }
  }

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
      const base = j * 31; // 31 total fields (26 original + 5 demand fields: demand_score, demand_multiplier, score_with_demand, zordi_metro, zori_yoy)
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}, $${base + 21}, $${base + 22}, $${base + 23}, $${base + 24}, $${base + 25}, $${base + 26}, $${base + 27}, $${base + 28}, $${base + 29}, $${base + 30}, $${base + 31})`
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
        s.rawRentToPriceRatio,
        // Demand data
        s.demandScore,
        s.demandMultiplier,
        s.scoreWithDemand,
        s.zordiMetro,
        s.zoriYoy
      );
      
    }

    await sql.query(
      `
      INSERT INTO investment_score (
        geo_type, geo_key, zip_code, state_code, city_name, county_name, county_fips,
        bedroom_count, fmr_year, zhvi_month, acs_vintage, property_value, tax_rate, annual_rent, annual_taxes,
        net_yield, rent_to_price_ratio, score, data_sufficient,
        raw_zhvi, county_zhvi_median, blended_zhvi, price_floor_applied,
        rent_cap_applied, county_blending_applied, raw_rent_to_price_ratio,
        demand_score, demand_multiplier, score_with_demand, zordi_metro, zori_yoy
      )
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (geo_type, geo_key, bedroom_count, fmr_year, zhvi_month, acs_vintage)
      DO UPDATE SET
        state_code = EXCLUDED.state_code,
        city_name = EXCLUDED.city_name,
        county_name = EXCLUDED.county_name,
        county_fips = EXCLUDED.county_fips,
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
        demand_score = EXCLUDED.demand_score,
        demand_multiplier = EXCLUDED.demand_multiplier,
        score_with_demand = EXCLUDED.score_with_demand,
        zordi_metro = EXCLUDED.zordi_metro,
        zori_yoy = EXCLUDED.zori_yoy,
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
