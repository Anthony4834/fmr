#!/usr/bin/env bun

/**
 * Find all counties with "city" in the name, analyze which are supposed to have it
 * (US independent cities + Virginia counties like Charles City / James City),
 * and optionally normalize "X city county" -> "X county" or remove " city" from others.
 *
 * Examples:
 * - "Baltimore city county" -> "Baltimore county" (remove word "city")
 * - "Someplace city" that is NOT an independent city -> "Someplace" (remove " city")
 *
 * Usage:
 *   bun scripts/fix-county-names-with-city.ts [--dry-run] [--apply]
 *   --dry-run: only report, no DB changes (default)
 *   --apply: run UPDATEs on zip_county_mapping
 */

import { config } from 'dotenv';
import { configureDatabase, query, execute } from '../lib/db';

config();

// Independent cities and VA counties that correctly have "city" in the name.
// Census/HUD use "Baltimore city", "St. Louis city", "Carson City", "Alexandria city", etc.
// Virginia also has Charles City County and James City County (counties, not cities).
const ALLOWLIST: Array<{ name: string; state: string }> = [
  { name: 'Baltimore city', state: 'MD' },
  { name: 'St. Louis city', state: 'MO' },
  { name: 'St. Louis City', state: 'MO' },
  { name: 'Carson City', state: 'NV' },
  { name: 'Carson city', state: 'NV' },
  // Virginia independent cities (38)
  { name: 'Alexandria city', state: 'VA' },
  { name: 'Bristol city', state: 'VA' },
  { name: 'Buena Vista city', state: 'VA' },
  { name: 'Charlottesville city', state: 'VA' },
  { name: 'Chesapeake city', state: 'VA' },
  { name: 'Colonial Heights city', state: 'VA' },
  { name: 'Covington city', state: 'VA' },
  { name: 'Danville city', state: 'VA' },
  { name: 'Emporia city', state: 'VA' },
  { name: 'Fairfax city', state: 'VA' },
  { name: 'Falls Church city', state: 'VA' },
  { name: 'Franklin city', state: 'VA' },
  { name: 'Fredericksburg city', state: 'VA' },
  { name: 'Galax city', state: 'VA' },
  { name: 'Hampton city', state: 'VA' },
  { name: 'Harrisonburg city', state: 'VA' },
  { name: 'Hopewell city', state: 'VA' },
  { name: 'Lexington city', state: 'VA' },
  { name: 'Lynchburg city', state: 'VA' },
  { name: 'Manassas city', state: 'VA' },
  { name: 'Manassas Park city', state: 'VA' },
  { name: 'Martinsville city', state: 'VA' },
  { name: 'Newport News city', state: 'VA' },
  { name: 'Norfolk city', state: 'VA' },
  { name: 'Norton city', state: 'VA' },
  { name: 'Petersburg city', state: 'VA' },
  { name: 'Poquoson city', state: 'VA' },
  { name: 'Portsmouth city', state: 'VA' },
  { name: 'Radford city', state: 'VA' },
  { name: 'Richmond city', state: 'VA' },
  { name: 'Roanoke city', state: 'VA' },
  { name: 'Salem city', state: 'VA' },
  { name: 'Staunton city', state: 'VA' },
  { name: 'Suffolk city', state: 'VA' },
  { name: 'Virginia Beach city', state: 'VA' },
  { name: 'Waynesboro city', state: 'VA' },
  { name: 'Williamsburg city', state: 'VA' },
  { name: 'Winchester city', state: 'VA' },
  // Virginia counties whose name includes "City" (they are counties)
  { name: 'Charles City', state: 'VA' },
  { name: 'James City', state: 'VA' },
  { name: 'Charles City County', state: 'VA' },
  { name: 'James City County', state: 'VA' },
  // Alaska consolidated city-boroughs (correct names)
  { name: 'Juneau City and Borough', state: 'AK' },
  { name: 'Sitka City and Borough', state: 'AK' },
  { name: 'Wrangell City and Borough', state: 'AK' },
  { name: 'Yakutat City and Borough', state: 'AK' },
];

function normalizeForCompare(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isAllowlisted(countyName: string, stateCode: string): boolean {
  const n = normalizeForCompare(countyName);
  const state = stateCode.trim().toUpperCase();
  return ALLOWLIST.some(
    (a) => a.state.toUpperCase() === state && normalizeForCompare(a.name) === n
  );
}

/** "X city county" -> "X county" (remove the word "city") */
function normalizeCityCounty(name: string): string | null {
  const trimmed = name.trim();
  if (!/\s+city\s+county\s*$/i.test(trimmed)) return null;
  return trimmed.replace(/\s+city\s+county\s*$/i, ' county').trim();
}

/** Remove " city" from the end or " city " from the middle (one occurrence). */
function removeCityWord(name: string): string {
  let out = name.trim();
  if (/\s+city\s*$/i.test(out)) {
    out = out.replace(/\s+city\s*$/i, '').trim();
    return out;
  }
  if (/\s+city\s+/i.test(out)) {
    out = out.replace(/\s+city\s+/i, ' ').trim();
    return out;
  }
  return out;
}

interface Row {
  county_name: string;
  state_code: string;
  row_count: number;
}

type Action = 'keep' | 'normalize_city_county' | 'remove_city';

interface Decision {
  county_name: string;
  state_code: string;
  row_count: number;
  action: Action;
  new_name: string | null;
  reason: string;
}

function decide(row: Row): Decision {
  const { county_name, state_code, row_count } = row;
  // "X city county" -> "X county" (remove word "city")
  const toCounty = normalizeCityCounty(county_name);
  if (toCounty != null) {
    return {
      county_name,
      state_code,
      row_count,
      action: 'normalize_city_county',
      new_name: toCounty,
      reason: `"X city county" -> "X county": "${county_name}" -> "${toCounty}"`,
    };
  }
  if (isAllowlisted(county_name, state_code)) {
    return {
      county_name,
      state_code,
      row_count,
      action: 'keep',
      new_name: null,
      reason: 'Correct: independent city or VA county with "City" in name',
    };
  }
  if (!/\bcity\b/i.test(county_name)) {
    return {
      county_name,
      state_code,
      row_count,
      action: 'keep',
      new_name: null,
      reason: 'No "city" in name (should not appear in query)',
    };
  }
  const removed = removeCityWord(county_name);
  if (removed === county_name) {
    return {
      county_name,
      state_code,
      row_count,
      action: 'keep',
      new_name: null,
      reason: 'Contains "city" but no change applied (manual review)',
    };
  }
  return {
    county_name,
    state_code,
    row_count,
    action: 'remove_city',
    new_name: removed,
    reason: `Not an independent city -> remove " city" -> "${removed}"`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('\n=== Counties with "city" in the name ===\n');

  const rows = await query<Row>(
    `SELECT county_name, state_code, COUNT(*)::int AS row_count
     FROM zip_county_mapping
     WHERE county_name ILIKE '%city%'
     GROUP BY county_name, state_code
     ORDER BY state_code, county_name`
  );

  if (rows.length === 0) {
    console.log('No counties with "city" in the name found.\n');
    return;
  }

  const decisions = rows.map(decide);
  const toKeep = decisions.filter((d) => d.action === 'keep');
  const toNormalize = decisions.filter((d) => d.action === 'normalize_city_county');
  const toRemoveCity = decisions.filter((d) => d.action === 'remove_city');

  console.log(`Total distinct (county_name, state) with "city": ${rows.length}`);
  console.log(`  Keep (correct): ${toKeep.length}`);
  console.log(`  Normalize "X city county" -> "X county": ${toNormalize.length}`);
  console.log(`  Remove " city" (not independent city): ${toRemoveCity.length}\n`);

  if (toKeep.length) {
    console.log('--- KEEP (supposed to have "city") ---');
    toKeep.forEach((d) => {
      console.log(`  ${d.county_name}, ${d.state_code} (${d.row_count} rows) - ${d.reason}`);
    });
    console.log('');
  }

  if (toNormalize.length) {
    console.log('--- NORMALIZE "X city county" -> "X county" ---');
    toNormalize.forEach((d) => {
      console.log(`  "${d.county_name}" -> "${d.new_name}" (${d.state_code}, ${d.row_count} rows)`);
    });
    console.log('');
  }

  if (toRemoveCity.length) {
    console.log('--- REMOVE " city" (not in allowlist) ---');
    toRemoveCity.forEach((d) => {
      console.log(`  "${d.county_name}" -> "${d.new_name}" (${d.state_code}, ${d.row_count} rows)`);
    });
    console.log('');
  }

  if (dryRun) {
    console.log('⚠️  DRY RUN: No changes applied. Use --apply to update zip_county_mapping.\n');
    return;
  }

  let updated = 0;
  for (const d of [...toNormalize, ...toRemoveCity]) {
    if (d.new_name == null) continue;
    await execute(
      `UPDATE zip_county_mapping
       SET county_name = $1
       WHERE county_name = $2 AND state_code = $3`,
      [d.new_name, d.county_name, d.state_code]
    );
    updated += d.row_count;
  }
  console.log(`✅ Updated ${updated} rows in zip_county_mapping.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
