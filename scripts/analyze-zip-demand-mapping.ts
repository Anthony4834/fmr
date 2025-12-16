#!/usr/bin/env bun

/**
 * Analyze ZIP codes without demand data to find mapping opportunities
 * 
 * This script checks for easy ways to map more ZIPs to Zillow demand data:
 * 1. ZIPs with ZORI data but no metro_name - can we map via county/CBSA?
 * 2. ZIPs in counties where other ZIPs have metro mappings
 * 3. ZIPs that can be mapped via CBSA codes
 * 
 * Usage:
 *   bun scripts/analyze-zip-demand-mapping.ts --file zips-without-demand-2026-1765851975147.csv
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

config();

interface ZipRecord {
  zip_code: string;
  state_code: string;
  county_name: string;
  county_fips: string;
  has_zori_data: boolean;
  zori_metro_name: string;
  zordi_metro_match: boolean;
  zordi_metro_name: string;
  has_zordi_data: boolean;
  reason: string;
}

async function analyzeMappingOpportunities(filePath: string) {
  console.log(`\n=== Analyzing ZIP Demand Mapping Opportunities ===\n`);
  console.log(`Reading: ${filePath}\n`);

  const content = readFileSync(filePath, 'utf-8');
  const records: ZipRecord[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    cast: (value, context) => {
      if (context.column === 'has_zori_data' || context.column === 'zordi_metro_match' || context.column === 'has_zordi_data') {
        return value === 'true';
      }
      return value;
    }
  });

  console.log(`Total ZIPs without demand data: ${records.length}\n`);

  // 1. ZIPs with ZORI data but no metro_name
  const zoriNoMetro = records.filter(r => r.has_zori_data && !r.zori_metro_name);
  console.log(`1. ZIPs with ZORI data but no metro_name: ${zoriNoMetro.length}`);

  // 2. Check if these ZIPs have CBSA mappings
  const cbsaMap = new Map<string, { code: string; name: string }>();
  if (zoriNoMetro.length > 0) {
    const zipsToCheck = zoriNoMetro.map(r => r.zip_code);
    const cbsaMappings = await sql`
      SELECT DISTINCT zip_code, cbsa_code, cbsa_name
      FROM cbsa_zip_mapping
      WHERE zip_code = ANY(${zipsToCheck})
    `;
    
    for (const row of cbsaMappings.rows) {
      cbsaMap.set(row.zip_code, { code: row.cbsa_code, name: row.cbsa_name });
    }

    const withCbsa = zoriNoMetro.filter(r => cbsaMap.has(r.zip_code));
    console.log(`   - ZIPs with CBSA mapping: ${withCbsa.length}`);
    
    if (withCbsa.length > 0) {
      console.log(`   - Sample ZIPs with CBSA:`);
      for (const zip of withCbsa.slice(0, 5)) {
        const cbsa = cbsaMap.get(zip.zip_code)!;
        console.log(`     ${zip.zip_code} (${zip.county_name}, ${zip.state_code}) -> ${cbsa.name}`);
      }
    }
  }

  // 3. Check if ZIPs in same county have metro mappings
  console.log(`\n2. Checking for county-level mapping opportunities...`);
  
  // Get all counties from missing ZIPs
  const counties = new Map<string, ZipRecord[]>();
  for (const record of records) {
    const key = `${record.county_fips}-${record.state_code}`;
    if (!counties.has(key)) {
      counties.set(key, []);
    }
    counties.get(key)!.push(record);
  }

  // Check if other ZIPs in same county have metro mappings
  let countyMappingOpportunities = 0;
  const countyMappingDetails: Array<{ county: string; state: string; missingZips: number; mappedZips: number; metro: string }> = [];

  for (const [key, countyZips] of counties) {
    if (countyZips.length === 0) continue;
    
    const sampleZip = countyZips[0];
    const countyZipsList = countyZips.map(z => z.zip_code);
    
    // Check if any ZIP in this county has a metro mapping (via ZORI or CBSA)
    const metroCheck = await sql`
      SELECT DISTINCT 
        COALESCE(z.metro_name, cbsa.cbsa_name) as metro_name,
        COUNT(DISTINCT COALESCE(z.zip_code, cbsa.zip_code)) as zip_count
      FROM zip_county_mapping zcm
      LEFT JOIN zillow_zori_zip_monthly z ON z.zip_code = zcm.zip_code AND z.metro_name IS NOT NULL
      LEFT JOIN cbsa_zip_mapping cbsa ON cbsa.zip_code = zcm.zip_code
      WHERE zcm.county_fips = ${sampleZip.county_fips}
        AND zcm.state_code = ${sampleZip.state_code}
        AND (z.metro_name IS NOT NULL OR cbsa.cbsa_name IS NOT NULL)
      GROUP BY COALESCE(z.metro_name, cbsa.cbsa_name)
      ORDER BY zip_count DESC
      LIMIT 1
    `;

    if (metroCheck.rows.length > 0 && metroCheck.rows[0].metro_name) {
      const metro = metroCheck.rows[0].metro_name;
      const mappedCount = parseInt(metroCheck.rows[0].zip_count) || 0;
      
      if (mappedCount > 0) {
        countyMappingOpportunities += countyZips.length;
        countyMappingDetails.push({
          county: sampleZip.county_name,
          state: sampleZip.state_code,
          missingZips: countyZips.length,
          mappedZips: mappedCount,
          metro
        });
      }
    }
  }

  console.log(`   - Counties where other ZIPs have metro mappings: ${countyMappingDetails.length}`);
  console.log(`   - Total ZIPs that could be mapped via county: ${countyMappingOpportunities}`);
  
  if (countyMappingDetails.length > 0) {
    console.log(`   - Top 10 county mapping opportunities:`);
    countyMappingDetails
      .sort((a, b) => b.missingZips - a.missingZips)
      .slice(0, 10)
      .forEach(d => {
        console.log(`     ${d.county}, ${d.state}: ${d.missingZips} missing ZIPs -> ${d.metro} (${d.mappedZips} ZIPs already mapped)`);
      });
  }

  // 4. Check CBSA mapping opportunities for all missing ZIPs
  console.log(`\n3. Checking CBSA mapping opportunities...`);
  
  const allMissingZips = records.map(r => r.zip_code);
  const cbsaForMissing = await sql`
    SELECT DISTINCT cbsa.zip_code, cbsa.cbsa_code, cbsa.cbsa_name
    FROM cbsa_zip_mapping cbsa
    WHERE cbsa.zip_code = ANY(${allMissingZips})
  `;

  const cbsaOpportunities = cbsaForMissing.rows.length;
  console.log(`   - ZIPs with CBSA mappings: ${cbsaOpportunities}`);
  
  // Check if these CBSAs have ZORDI data
  if (cbsaForMissing.rows.length > 0) {
    const cbsaCodes = [...new Set(cbsaForMissing.rows.map(r => r.cbsa_code))];
    const zordiCheck = await sql`
      SELECT DISTINCT cbsa_code, region_name
      FROM zillow_zordi_metro_monthly
      WHERE cbsa_code = ANY(${cbsaCodes})
    `;

    const cbsaWithZordi = new Set(zordiCheck.rows.map(r => r.cbsa_code));
    const zipsWithCbsaAndZordi = cbsaForMissing.rows.filter(r => cbsaWithZordi.has(r.cbsa_code));
    
    console.log(`   - ZIPs with CBSA that has ZORDI data: ${zipsWithCbsaAndZordi.length}`);
    
    if (zipsWithCbsaAndZordi.length > 0) {
      console.log(`   - Sample ZIPs with CBSA + ZORDI:`);
      const sample = zipsWithCbsaAndZordi.slice(0, 5);
      for (const row of sample) {
        const record = records.find(r => r.zip_code === row.zip_code);
        console.log(`     ${row.zip_code} (${record?.county_name}, ${record?.state_code}) -> CBSA ${row.cbsa_code}: ${row.cbsa_name}`);
      }
    }
  }

  // 5. Summary and recommendations
  console.log(`\n=== Summary & Recommendations ===\n`);
  
  const zoriWithCbsa = zoriNoMetro.filter(r => cbsaMap.has(r.zip_code)).length;
  const totalOpportunities = 
    zoriWithCbsa +
    countyMappingOpportunities +
    cbsaOpportunities;

  console.log(`Total mapping opportunities identified: ${totalOpportunities}`);
  console.log(`\nRecommended actions:`);
  console.log(`1. Map ${zoriWithCbsa} ZIPs with ZORI but no metro via CBSA`);
  console.log(`2. Map ${countyMappingOpportunities} ZIPs via county-level metro assignments`);
  console.log(`3. Map ${cbsaOpportunities} ZIPs directly via CBSA codes`);
  console.log(`\nNext steps:`);
  console.log(`- Update compute-investment-scores.ts to use CBSA as fallback for metro mapping`);
  console.log(`- Add county-level metro assignment for ZIPs in counties with existing metro mappings`);
  console.log(`- Verify CBSA mappings are up to date: bun scripts/ingest-cbsa-mapping.ts`);
}

// CLI
const args = process.argv.slice(2);
let filePath: string | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && args[i + 1]) {
    filePath = args[i + 1];
    i++;
  }
}

if (!filePath) {
  console.error('Usage: bun scripts/analyze-zip-demand-mapping.ts --file <csv-file>');
  process.exit(1);
}

analyzeMappingOpportunities(filePath)
  .then(() => {
    console.log('\n✅ Analysis complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
