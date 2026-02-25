#!/usr/bin/env bun

/**
 * Dump all current investment scores to CSV
 * 
 * This script exports all investment scores from the database to a CSV file
 * with all relevant fields including scores, property values, demand data, etc.
 * 
 * Usage:
 *   bun scripts/dump-investment-scores.ts
 *   bun scripts/dump-investment-scores.ts --year 2026
 *   bun scripts/dump-investment-scores.ts --output investment-scores.csv
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { writeFileSync } from 'fs';
import { configureDatabase } from '../lib/db';

config();

if (process.env.POSTGRES_URL) {
  configureDatabase({ connectionString: process.env.POSTGRES_URL });
}

interface InvestmentScoreRecord {
  id: number;
  geo_type: string;
  geo_key: string;
  zip_code: string | null;
  state_code: string | null;
  city_name: string | null;
  county_name: string | null;
  county_fips: string | null;
  bedroom_count: number;
  fmr_year: number;
  zhvi_month: Date | null;
  acs_vintage: number | null;
  property_value: number;
  tax_rate: number;
  annual_rent: number;
  annual_taxes: number;
  net_yield: number;
  rent_to_price_ratio: number;
  score: number;
  data_sufficient: boolean;
  raw_zhvi: number | null;
  county_zhvi_median: number | null;
  blended_zhvi: number | null;
  price_floor_applied: boolean;
  rent_cap_applied: boolean;
  county_blending_applied: boolean;
  raw_rent_to_price_ratio: number | null;
  computed_at: Date;
  demand_score: number | null;
  demand_multiplier: number | null;
  score_with_demand: number | null;
  zordi_metro: string | null;
}

function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // If the value contains comma, quote, or newline, wrap it in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function dumpInvestmentScores(year?: number, outputFile?: string) {
  console.log(`\n=== Dumping Investment Scores ===\n`);

  // Build query
  let result;
  if (year) {
    console.log(`Filtering by FMR year: ${year}\n`);
    result = await sql`
      SELECT 
        id,
        geo_type,
        geo_key,
        zip_code,
        state_code,
        city_name,
        county_name,
        county_fips,
        bedroom_count,
        fmr_year,
        zhvi_month,
        acs_vintage,
        property_value,
        tax_rate,
        annual_rent,
        annual_taxes,
        net_yield,
        rent_to_price_ratio,
        score,
        data_sufficient,
        raw_zhvi,
        county_zhvi_median,
        blended_zhvi,
        price_floor_applied,
        rent_cap_applied,
        county_blending_applied,
        raw_rent_to_price_ratio,
        computed_at,
        demand_score,
        demand_multiplier,
        score_with_demand,
        zordi_metro
      FROM investment_score
      WHERE fmr_year = ${year}
      ORDER BY fmr_year DESC, geo_type, state_code, zip_code, bedroom_count
    `;
  } else {
    result = await sql`
      SELECT 
        id,
        geo_type,
        geo_key,
        zip_code,
        state_code,
        city_name,
        county_name,
        county_fips,
        bedroom_count,
        fmr_year,
        zhvi_month,
        acs_vintage,
        property_value,
        tax_rate,
        annual_rent,
        annual_taxes,
        net_yield,
        rent_to_price_ratio,
        score,
        data_sufficient,
        raw_zhvi,
        county_zhvi_median,
        blended_zhvi,
        price_floor_applied,
        rent_cap_applied,
        county_blending_applied,
        raw_rent_to_price_ratio,
        computed_at,
        demand_score,
        demand_multiplier,
        score_with_demand,
        zordi_metro
      FROM investment_score
      ORDER BY fmr_year DESC, geo_type, state_code, zip_code, bedroom_count
    `;
  }

  if (result.rows.length === 0) {
    console.log('❌ No investment scores found in database.');
    return;
  }

  console.log(`Found ${result.rows.length} investment score records\n`);

  // Generate filename if not provided
  const timestamp = Date.now();
  const filename = outputFile || `investment-scores-dump-${timestamp}.csv`;

  // CSV header
  const headers = [
    'id',
    'geo_type',
    'geo_key',
    'zip_code',
    'state_code',
    'city_name',
    'county_name',
    'county_fips',
    'bedroom_count',
    'fmr_year',
    'zhvi_month',
    'acs_vintage',
    'property_value',
    'tax_rate',
    'annual_rent',
    'annual_taxes',
    'net_yield',
    'rent_to_price_ratio',
    'score',
    'data_sufficient',
    'raw_zhvi',
    'county_zhvi_median',
    'blended_zhvi',
    'price_floor_applied',
    'rent_cap_applied',
    'county_blending_applied',
    'raw_rent_to_price_ratio',
    'computed_at',
    'demand_score',
    'demand_multiplier',
    'score_with_demand',
    'zordi_metro'
  ];

  // Convert rows to CSV
  const csvRows = [
    headers.join(','),
    ...result.rows.map((row: any) => {
      return [
        row.id,
        escapeCsvField(row.geo_type),
        escapeCsvField(row.geo_key),
        escapeCsvField(row.zip_code),
        escapeCsvField(row.state_code),
        escapeCsvField(row.city_name),
        escapeCsvField(row.county_name),
        escapeCsvField(row.county_fips),
        row.bedroom_count,
        row.fmr_year,
        row.zhvi_month ? new Date(row.zhvi_month).toISOString().split('T')[0] : '',
        escapeCsvField(row.acs_vintage),
        row.property_value,
        row.tax_rate,
        row.annual_rent,
        row.annual_taxes,
        row.net_yield,
        row.rent_to_price_ratio,
        row.score,
        row.data_sufficient,
        escapeCsvField(row.raw_zhvi),
        escapeCsvField(row.county_zhvi_median),
        escapeCsvField(row.blended_zhvi),
        row.price_floor_applied,
        row.rent_cap_applied,
        row.county_blending_applied,
        escapeCsvField(row.raw_rent_to_price_ratio),
        row.computed_at ? new Date(row.computed_at).toISOString() : '',
        escapeCsvField(row.demand_score),
        escapeCsvField(row.demand_multiplier),
        escapeCsvField(row.score_with_demand),
        escapeCsvField(row.zordi_metro)
      ].join(',');
    })
  ];

  // Write to file
  writeFileSync(filename, csvRows.join('\n'), 'utf-8');

  // Generate summary statistics
  const records = result.rows;
  const byGeoType: Record<string, number> = {};
  const byYear: Record<string, number> = {};
  const byState: Record<string, number> = {};
  let withDemandData = 0;
  let withScoreWithDemand = 0;

  for (const row of records) {
    byGeoType[row.geo_type] = (byGeoType[row.geo_type] || 0) + 1;
    byYear[String(row.fmr_year)] = (byYear[String(row.fmr_year)] || 0) + 1;
    if (row.state_code) {
      byState[row.state_code] = (byState[row.state_code] || 0) + 1;
    }
    if (row.demand_score !== null) {
      withDemandData++;
    }
    if (row.score_with_demand !== null) {
      withScoreWithDemand++;
    }
  }

  console.log(`\n=== Summary ===\n`);
  console.log(`Total records: ${records.length}`);
  console.log(`\nBy geo type:`);
  for (const [type, count] of Object.entries(byGeoType).sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${type}: ${count}`);
  }
  console.log(`\nBy FMR year:`);
  for (const [yr, count] of Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0]))) {
    console.log(`  - ${yr}: ${count}`);
  }
  console.log(`\nBy state (top 10):`);
  const topStates = Object.entries(byState)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [state, count] of topStates) {
    console.log(`  - ${state}: ${count}`);
  }
  console.log(`\nDemand data coverage:`);
  console.log(`  - Records with demand_score: ${withDemandData} (${((withDemandData / records.length) * 100).toFixed(1)}%)`);
  console.log(`  - Records with score_with_demand: ${withScoreWithDemand} (${((withScoreWithDemand / records.length) * 100).toFixed(1)}%)`);

  // Score statistics
  const scores = records.map((r: any) => Number(r.score)).filter((s: number) => !isNaN(s));
  if (scores.length > 0) {
    scores.sort((a, b) => a - b);
    console.log(`\nScore statistics:`);
    console.log(`  - Min: ${scores[0]!.toFixed(2)}`);
    console.log(`  - 25th percentile: ${scores[Math.floor(scores.length * 0.25)]!.toFixed(2)}`);
    console.log(`  - Median: ${scores[Math.floor(scores.length * 0.5)]!.toFixed(2)}`);
    console.log(`  - 75th percentile: ${scores[Math.floor(scores.length * 0.75)]!.toFixed(2)}`);
    console.log(`  - Max: ${scores[scores.length - 1]!.toFixed(2)}`);
  }

  console.log(`\n✅ Export complete!`);
  console.log(`\nOutput file: ${filename}`);
  console.log(`\nFile size: ${(csvRows.join('\n').length / 1024).toFixed(2)} KB\n`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
let year: number | undefined;
let outputFile: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--year' && args[i + 1]) {
    year = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--output' && args[i + 1]) {
    outputFile = args[i + 1];
    i++;
  }
}

dumpInvestmentScores(year, outputFile)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
