#!/usr/bin/env bun

/**
 * Cleanup Invalid County Entries in zip_county_mapping
 * 
 * Cleans entries from zip_county_mapping that are clearly invalid.
 *
 * What it does:
 * - Deletes rows with invalid `state_code`
 * - Fixes rows where `state_name` is just the 2-letter code (e.g. "IL" -> "Illinois")
 * - Deletes rows where `state_name` is not a known US state/territory name (strong signal of foreign data)
 * - Deletes rows where `county_name` looks like a 2-3 letter code (e.g. "BW", "BY") (strong signal of foreign data)
 * 
 * Usage:
 *   bun run scripts/cleanup-invalid-counties.ts [--dry-run]
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';

config();

async function cleanupInvalidCounties(dryRun: boolean = false): Promise<void> {
  console.log('\n=== Cleaning Up Invalid County Entries ===\n');
  
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }

  // Valid US state codes (50 states + DC + US territories)
  const validUSStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
    'PR', 'VI', 'GU', 'MP', 'AS' // US territories
  ];

  // Canonical state/territory names for state_code
  const expectedStateNames: Record<string, string> = {
    AL: 'Alabama',
    AK: 'Alaska',
    AZ: 'Arizona',
    AR: 'Arkansas',
    CA: 'California',
    CO: 'Colorado',
    CT: 'Connecticut',
    DE: 'Delaware',
    FL: 'Florida',
    GA: 'Georgia',
    HI: 'Hawaii',
    ID: 'Idaho',
    IL: 'Illinois',
    IN: 'Indiana',
    IA: 'Iowa',
    KS: 'Kansas',
    KY: 'Kentucky',
    LA: 'Louisiana',
    ME: 'Maine',
    MD: 'Maryland',
    MA: 'Massachusetts',
    MI: 'Michigan',
    MN: 'Minnesota',
    MS: 'Mississippi',
    MO: 'Missouri',
    MT: 'Montana',
    NE: 'Nebraska',
    NV: 'Nevada',
    NH: 'New Hampshire',
    NJ: 'New Jersey',
    NM: 'New Mexico',
    NY: 'New York',
    NC: 'North Carolina',
    ND: 'North Dakota',
    OH: 'Ohio',
    OK: 'Oklahoma',
    OR: 'Oregon',
    PA: 'Pennsylvania',
    RI: 'Rhode Island',
    SC: 'South Carolina',
    SD: 'South Dakota',
    TN: 'Tennessee',
    TX: 'Texas',
    UT: 'Utah',
    VT: 'Vermont',
    VA: 'Virginia',
    WA: 'Washington',
    WV: 'West Virginia',
    WI: 'Wisconsin',
    WY: 'Wyoming',
    DC: 'District of Columbia',
    PR: 'Puerto Rico',
    VI: 'U.S. Virgin Islands',
    GU: 'Guam',
    MP: 'Northern Mariana Islands',
    AS: 'American Samoa',
  };

  const expectedNamesList = Object.values(expectedStateNames);

  // 1) Count invalid state_code entries
  const invalidStateCodeCountResult = await sql.query(
    `SELECT COUNT(*) as count
     FROM zip_county_mapping
     WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})`,
    validUSStates
  );
  const invalidStateCodeCount = parseInt(invalidStateCodeCountResult.rows[0].count);
  console.log(`Found ${invalidStateCodeCount.toLocaleString()} entries with invalid state codes`);

  // 2) Count rows where state_name is just the abbreviation (e.g. "IL")
  const stateNameAbbrevCountResult = await sql.query(
    `SELECT COUNT(*) as count
     FROM zip_county_mapping
     WHERE state_code IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
       AND state_name = state_code`,
    validUSStates
  );
  const stateNameAbbrevCount = parseInt(stateNameAbbrevCountResult.rows[0].count);
  console.log(`Found ${stateNameAbbrevCount.toLocaleString()} entries where state_name == state_code (will normalize)`);

  // 3) Count rows where state_name is not a known US state/territory name and not a 2-letter code
  //    This strongly indicates foreign/garbage data.
  const foreignStateNameCountResult = await sql.query(
    `SELECT COUNT(*) as count
     FROM zip_county_mapping
     WHERE state_code IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
       AND state_name NOT IN (${expectedNamesList.map((_, i) => `$${validUSStates.length + i + 1}`).join(', ')})
       AND state_name NOT IN (${validUSStates.map((_, i) => `$${validUSStates.length + expectedNamesList.length + i + 1}`).join(', ')})`,
    [...validUSStates, ...expectedNamesList, ...validUSStates]
  );
  const foreignStateNameCount = parseInt(foreignStateNameCountResult.rows[0].count);
  console.log(`Found ${foreignStateNameCount.toLocaleString()} entries with non-US state_name values (will delete)`);

  // 4) Count rows where county_name looks like a 2-3 letter code (e.g. "BW", "BY")
  const suspiciousCountyCodeCountResult = await sql.query(
    `SELECT COUNT(*) as count
     FROM zip_county_mapping
     WHERE county_name ~ '^[A-Z]{2,3}$'`
  );
  const suspiciousCountyCodeCount = parseInt(suspiciousCountyCodeCountResult.rows[0].count);
  console.log(`Found ${suspiciousCountyCodeCount.toLocaleString()} entries with suspicious county_name codes (will delete)`);

  const totalPlannedChanges =
    invalidStateCodeCount +
    foreignStateNameCount +
    suspiciousCountyCodeCount +
    stateNameAbbrevCount;

  if (totalPlannedChanges === 0) {
    console.log('✅ No cleanup needed. Database is clean!\n');
    return;
  }

  // Show a small sample of each category for transparency
  if (invalidStateCodeCount > 0) {
    const sampleInvalidStateCodes = await sql.query(
      `SELECT zip_code, county_name, state_code, state_name
       FROM zip_county_mapping
       WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
       ORDER BY state_code, county_name
       LIMIT 10`,
      validUSStates
    );
    console.log('\nSample: invalid state_code rows:');
    sampleInvalidStateCodes.rows.forEach(row => {
      console.log(`  ZIP: ${row.zip_code}, County: ${row.county_name}, State: ${row.state_code}, StateName: ${row.state_name}`);
    });
  }

  if (foreignStateNameCount > 0) {
    const sampleForeignStateNames = await sql.query(
      `SELECT zip_code, county_name, state_code, state_name
       FROM zip_county_mapping
       WHERE state_code IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
         AND state_name NOT IN (${expectedNamesList.map((_, i) => `$${validUSStates.length + i + 1}`).join(', ')})
         AND state_name NOT IN (${validUSStates.map((_, i) => `$${validUSStates.length + expectedNamesList.length + i + 1}`).join(', ')})
       ORDER BY state_code, state_name, county_name
       LIMIT 10`,
      [...validUSStates, ...expectedNamesList, ...validUSStates]
    );
    console.log('\nSample: foreign/invalid state_name rows:');
    sampleForeignStateNames.rows.forEach(row => {
      console.log(`  ZIP: ${row.zip_code}, County: ${row.county_name}, State: ${row.state_code}, StateName: ${row.state_name}`);
    });
  }

  if (suspiciousCountyCodeCount > 0) {
    const sampleSuspiciousCountyCodes = await sql.query(
      `SELECT zip_code, county_name, state_code, state_name
       FROM zip_county_mapping
       WHERE county_name ~ '^[A-Z]{2,3}$'
       ORDER BY county_name, state_code, zip_code
       LIMIT 10`
    );
    console.log('\nSample: suspicious county_name code rows:');
    sampleSuspiciousCountyCodes.rows.forEach(row => {
      console.log(`  ZIP: ${row.zip_code}, County: ${row.county_name}, State: ${row.state_code}, StateName: ${row.state_name}`);
    });
  }

  if (dryRun) {
    console.log('\n⚠️  DRY RUN: Planned changes:');
    console.log(`  - Delete invalid state_code rows: ${invalidStateCodeCount.toLocaleString()}`);
    console.log(`  - Delete foreign/invalid state_name rows: ${foreignStateNameCount.toLocaleString()}`);
    console.log(`  - Delete suspicious county_name code rows: ${suspiciousCountyCodeCount.toLocaleString()}`);
    console.log(`  - Update state_name abbreviations: ${stateNameAbbrevCount.toLocaleString()}`);
    console.log('\nRun without --dry-run to apply.\n');
    return;
  }

  // 1) Delete invalid state_code rows
  if (invalidStateCodeCount > 0) {
    console.log(`\n⚠️  Deleting ${invalidStateCodeCount.toLocaleString()} invalid state_code rows...`);
    await sql.query(
      `DELETE FROM zip_county_mapping
       WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})`,
      validUSStates
    );
    console.log('✅ Deleted invalid state_code rows');
  }

  // 2) Fix abbreviated state_name rows (e.g. "IL" -> "Illinois")
  if (stateNameAbbrevCount > 0) {
    console.log(`\n⚠️  Normalizing ${stateNameAbbrevCount.toLocaleString()} abbreviated state_name rows...`);
    const cases = Object.entries(expectedStateNames)
      .map(([code, name]) => `WHEN '${code}' THEN '${name.replace(/'/g, "''")}'`)
      .join('\n');
    await sql.query(
      `UPDATE zip_county_mapping
       SET state_name = CASE state_code
         ${cases}
         ELSE state_name
       END
       WHERE state_code IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
         AND state_name = state_code`,
      validUSStates
    );
    console.log('✅ Normalized abbreviated state_name rows');
  }

  // 3) Delete foreign/invalid state_name rows
  if (foreignStateNameCount > 0) {
    console.log(`\n⚠️  Deleting ${foreignStateNameCount.toLocaleString()} foreign/invalid state_name rows...`);
    await sql.query(
      `DELETE FROM zip_county_mapping
       WHERE state_code IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
         AND state_name NOT IN (${expectedNamesList.map((_, i) => `$${validUSStates.length + i + 1}`).join(', ')})
         AND state_name NOT IN (${validUSStates.map((_, i) => `$${validUSStates.length + expectedNamesList.length + i + 1}`).join(', ')})`,
      [...validUSStates, ...expectedNamesList, ...validUSStates]
    );
    console.log('✅ Deleted foreign/invalid state_name rows');
  }

  // 4) Delete suspicious county_name code rows
  if (suspiciousCountyCodeCount > 0) {
    console.log(`\n⚠️  Deleting ${suspiciousCountyCodeCount.toLocaleString()} suspicious county_name code rows...`);
    await sql.query(
      `DELETE FROM zip_county_mapping
       WHERE county_name ~ '^[A-Z]{2,3}$'`
    );
    console.log('✅ Deleted suspicious county_name code rows');
  }

  // Verify cleanup
  const remainingInvalidStateCode = await sql.query(
    `SELECT COUNT(*) as count
     FROM zip_county_mapping
     WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})`,
    validUSStates
  );
  const remainingInvalidStateName = await sql.query(
    `SELECT COUNT(*) as count
     FROM zip_county_mapping
     WHERE state_code IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
       AND state_name NOT IN (${expectedNamesList.map((_, i) => `$${validUSStates.length + i + 1}`).join(', ')})
       AND state_name NOT IN (${validUSStates.map((_, i) => `$${validUSStates.length + expectedNamesList.length + i + 1}`).join(', ')})`,
    [...validUSStates, ...expectedNamesList, ...validUSStates]
  );
  const remainingSuspiciousCountyCodes = await sql.query(
    `SELECT COUNT(*) as count
     FROM zip_county_mapping
     WHERE county_name ~ '^[A-Z]{2,3}$'`
  );

  const remainingInvalid =
    parseInt(remainingInvalidStateCode.rows[0].count) +
    parseInt(remainingInvalidStateName.rows[0].count) +
    parseInt(remainingSuspiciousCountyCodes.rows[0].count);

  if (remainingInvalid === 0) {
    console.log('\n✅ Cleanup checks passed (no remaining obvious invalid entries)\n');
  } else {
    console.log('\n⚠️  Warning: Some suspicious entries still remain:');
    console.log(`  - invalid state_code: ${parseInt(remainingInvalidStateCode.rows[0].count).toLocaleString()}`);
    console.log(`  - foreign/invalid state_name: ${parseInt(remainingInvalidStateName.rows[0].count).toLocaleString()}`);
    console.log(`  - suspicious county_name codes: ${parseInt(remainingSuspiciousCountyCodes.rows[0].count).toLocaleString()}`);
    console.log('');
  }

  // Show final count
  const finalCount = await sql.query(`SELECT COUNT(*) as count FROM zip_county_mapping`);
  console.log(`Total ZIP-County mappings remaining: ${parseInt(finalCount.rows[0].count).toLocaleString()}\n`);
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-d');

  cleanupInvalidCounties(dryRun)
    .then(() => {
      console.log('Cleanup complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Cleanup failed:', error);
      process.exit(1);
    });
}

export { cleanupInvalidCounties };







