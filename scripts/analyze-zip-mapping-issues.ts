#!/usr/bin/env bun

/**
 * Analyze ZIP County Mapping Issues
 * 
 * This script provides detailed analysis of ZIP codes with county mapping issues:
 * - ZIPs without any county mapping
 * - ZIPs with multiple county mappings
 * 
 * Usage:
 *   bun scripts/analyze-zip-mapping-issues.ts
 */

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';

config();

async function analyzeMappingIssues() {
  console.log('\n=== ZIP County Mapping Issues Analysis ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Overall statistics
  console.log('📊 Overall Statistics:');
  const overallStats = await query(`
    SELECT 
      COUNT(*) FILTER (WHERE issue_type = 'NO_MAPPING') as no_mapping_count,
      COUNT(*) FILTER (WHERE issue_type = 'MULTIPLE_MAPPINGS') as multiple_mappings_count,
      COUNT(*) as total_issues
    FROM zip_county_mapping_issues
  `);
  
  const stats = overallStats[0];
  console.log(`  Total Issues: ${parseInt(stats.total_issues).toLocaleString()}`);
  console.log(`  ZIPs Without Mapping: ${parseInt(stats.no_mapping_count).toLocaleString()}`);
  console.log(`  ZIPs With Multiple Mappings: ${parseInt(stats.multiple_mappings_count).toLocaleString()}`);

  // Breakdown by issue type
  console.log('\n📋 Breakdown by Issue Type:');
  
  const noMappingStats = await query(`
    SELECT COUNT(*) as count
    FROM zip_county_mapping_issues
    WHERE issue_type = 'NO_MAPPING'
  `);
  console.log(`\n  NO_MAPPING: ${parseInt(noMappingStats[0].count).toLocaleString()} ZIPs`);
  
  const multipleMappingStats = await query(`
    SELECT 
      COUNT(*) as total,
      AVG(county_count)::numeric(10,2) as avg_counties,
      MAX(county_count) as max_counties,
      MIN(county_count) as min_counties
    FROM zip_county_mapping_issues
    WHERE issue_type = 'MULTIPLE_MAPPINGS'
  `);
  const multiStats = multipleMappingStats[0];
  console.log(`\n  MULTIPLE_MAPPINGS: ${parseInt(multiStats.total).toLocaleString()} ZIPs`);
  console.log(`    Average counties per ZIP: ${parseFloat(multiStats.avg_counties).toFixed(2)}`);
  console.log(`    Min counties: ${multiStats.min_counties}`);
  console.log(`    Max counties: ${multiStats.max_counties}`);

  // Sample ZIPs without mapping (by state)
  console.log('\n🔍 Sample ZIPs Without Mapping (by state):');
  const noMappingByState = await query(`
    SELECT 
      SUBSTRING(zip_code, 1, 1) as first_digit,
      COUNT(*) as count
    FROM zip_county_mapping_issues
    WHERE issue_type = 'NO_MAPPING'
    GROUP BY SUBSTRING(zip_code, 1, 1)
    ORDER BY count DESC
    LIMIT 10
  `);
  console.log('  Top ZIP ranges (by first digit):');
  for (const row of noMappingByState) {
    console.log(`    ${row.first_digit}xxxx: ${parseInt(row.count).toLocaleString()} ZIPs`);
  }

  // Sample ZIPs with multiple mappings
  console.log('\n🔍 Sample ZIPs With Multiple Mappings:');
  const multiMappingSamples = await query(`
    SELECT zip_code, county_count, counties
    FROM zip_county_mapping_issues
    WHERE issue_type = 'MULTIPLE_MAPPINGS'
    ORDER BY county_count DESC
    LIMIT 10
  `);
  console.log('  Top 10 ZIPs with most counties:');
  for (const row of multiMappingSamples) {
    const counties = row.counties ? row.counties.split('; ').slice(0, 3).join(', ') : 'N/A';
    const more = row.counties && row.counties.split('; ').length > 3 ? '...' : '';
    console.log(`    ${row.zip_code}: ${row.county_count} counties (${counties}${more})`);
  }

  // Check if ZIPs without mapping exist in safmr_data
  console.log('\n🔍 Checking ZIPs Without Mapping:');
  const safmrCheck = await query(`
    SELECT 
      COUNT(DISTINCT sd.zip_code) as total_safmr_zips,
      COUNT(DISTINCT zcm.zip_code) as total_mapped_zips,
      COUNT(DISTINCT sd.zip_code) FILTER (
        WHERE NOT EXISTS (
          SELECT 1 FROM zip_county_mapping zcm WHERE zcm.zip_code = sd.zip_code
        )
      ) as unmapped_safmr_zips
    FROM safmr_data sd
    LEFT JOIN zip_county_mapping zcm ON sd.zip_code = zcm.zip_code
    WHERE sd.year = 2026
  `);
  const safmr = safmrCheck[0];
  console.log(`  Total ZIPs in SAFMR data (2026): ${parseInt(safmr.total_safmr_zips).toLocaleString()}`);
  console.log(`  ZIPs with county mappings: ${parseInt(safmr.total_mapped_zips).toLocaleString()}`);
  console.log(`  ZIPs without county mappings: ${parseInt(safmr.unmapped_safmr_zips).toLocaleString()}`);

  // Check coverage of zip_county_mapping table
  console.log('\n📈 ZIP County Mapping Table Coverage:');
  const mappingStats = await query(`
    SELECT 
      COUNT(DISTINCT zip_code) as unique_zips,
      COUNT(*) as total_mappings,
      COUNT(DISTINCT county_name || ', ' || state_code) as unique_counties
    FROM zip_county_mapping
  `);
  const mapping = mappingStats[0];
  console.log(`  Unique ZIP codes in mapping table: ${parseInt(mapping.unique_zips).toLocaleString()}`);
  console.log(`  Total mappings (ZIP-County pairs): ${parseInt(mapping.total_mappings).toLocaleString()}`);
  console.log(`  Unique counties: ${parseInt(mapping.unique_counties).toLocaleString()}`);
  console.log(`  Average mappings per ZIP: ${(parseInt(mapping.total_mappings) / parseInt(mapping.unique_zips)).toFixed(2)}`);

  // State breakdown for unmapped ZIPs
  console.log('\n🗺️  State Analysis (ZIPs without mapping):');
  const stateBreakdown = await query(`
    WITH unmapped_zips AS (
      SELECT DISTINCT sd.zip_code
      FROM safmr_data sd
      WHERE sd.year = 2026
        AND NOT EXISTS (
          SELECT 1 FROM zip_county_mapping zcm WHERE zcm.zip_code = sd.zip_code
        )
    ),
    zip_to_state AS (
      SELECT DISTINCT
        uz.zip_code,
        CASE 
          WHEN uz.zip_code LIKE '0%' THEN 'MA, RI, NH, ME, VT, CT'
          WHEN uz.zip_code LIKE '1%' THEN 'NY, PA'
          WHEN uz.zip_code LIKE '2%' THEN 'VA, WV, KY, MD, NC, SC, TN, DE'
          WHEN uz.zip_code LIKE '3%' THEN 'FL, GA, AL, MS, LA, AR, TN'
          WHEN uz.zip_code LIKE '4%' THEN 'IN, KY, MI, OH'
          WHEN uz.zip_code LIKE '5%' THEN 'MN, IA, MO, ND, SD, WI, MT'
          WHEN uz.zip_code LIKE '6%' THEN 'IL, KS, MO, NE'
          WHEN uz.zip_code LIKE '7%' THEN 'TX, AR, LA, OK'
          WHEN uz.zip_code LIKE '8%' THEN 'CO, ID, UT, AZ, NM, NV, WY'
          WHEN uz.zip_code LIKE '9%' THEN 'CA, OR, WA, AK, HI'
          ELSE 'Unknown'
        END as likely_states
      FROM unmapped_zips uz
    )
    SELECT 
      likely_states,
      COUNT(*) as zip_count
    FROM zip_to_state
    GROUP BY likely_states
    ORDER BY zip_count DESC
    LIMIT 10
  `);
  console.log('  Top states/regions (estimated by ZIP prefix):');
  for (const row of stateBreakdown) {
    console.log(`    ${row.likely_states}: ${parseInt(row.zip_count).toLocaleString()} ZIPs`);
  }

  // Check for patterns in ZIP codes
  console.log('\n🔍 Pattern Analysis:');
  
  // Check if unmapped ZIPs are newer ZIP codes (higher numbers)
  const zipRangeAnalysis = await query(`
    SELECT 
      CASE 
        WHEN zip_code::integer < 10000 THEN '< 10000'
        WHEN zip_code::integer < 20000 THEN '10000-19999'
        WHEN zip_code::integer < 30000 THEN '20000-29999'
        WHEN zip_code::integer < 40000 THEN '30000-39999'
        WHEN zip_code::integer < 50000 THEN '40000-49999'
        WHEN zip_code::integer < 60000 THEN '50000-59999'
        WHEN zip_code::integer < 70000 THEN '60000-69999'
        WHEN zip_code::integer < 80000 THEN '70000-79999'
        WHEN zip_code::integer < 90000 THEN '80000-89999'
        ELSE '90000+'
      END as zip_range,
      COUNT(*) as count
    FROM zip_county_mapping_issues
    WHERE issue_type = 'NO_MAPPING'
    GROUP BY zip_range
    ORDER BY zip_range
  `);
  console.log('  ZIP ranges for unmapped ZIPs:');
  for (const row of zipRangeAnalysis) {
    console.log(`    ${row.zip_range}: ${parseInt(row.count).toLocaleString()} ZIPs`);
  }

  // Recommendations
  console.log('\n💡 Recommendations:');
  console.log('  1. Check if ZIP-county mapping data source is complete');
  console.log('  2. Verify if unmapped ZIPs are valid/active ZIP codes');
  console.log('  3. Consider if multiple mappings are expected (ZIPs can span counties)');
  console.log('  4. Review data source: ZIP_COUNTY_DATA_SOURCES.md');
  
  console.log('\n✅ Analysis complete!\n');
}

analyzeMappingIssues()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error analyzing mapping issues:', error);
    process.exit(1);
  });



