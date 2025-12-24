import { config } from 'dotenv';
import { query, execute, configureDatabase } from '../lib/db';
import { readFileSync } from 'fs';
import { join } from 'path';

config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is required');
}
configureDatabase({ connectionString: process.env.POSTGRES_URL });

function loadRequiredSAFMRAreas(): string[] {
  const filePath = join(process.cwd(), 'app', 'required-safmr-areas.txt');
  const content = readFileSync(filePath, 'utf-8');

  const lines = content.split('\n');
  const areas: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith('✅') ||
      trimmed.startsWith('📌') ||
      trimmed.startsWith('Here is') ||
      trimmed.startsWith('HUD User') ||
      trimmed.startsWith('These include') ||
      trimmed.startsWith('PHAs in') ||
      trimmed.startsWith('If you want')
    ) {
      continue;
    }

    if (trimmed.includes('MSA') || trimmed.includes('HUD Metro FMR Area')) {
      areas.push(trimmed);
    }
  }

  return areas;
}

function normalizeHudMetroName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s+hud metro fmr area\s*$/i, '')
    .replace(/\s+msa\s*$/i, '')
    .trim();
}

async function ensureNormalizeAccents() {
  await execute(`
    CREATE OR REPLACE FUNCTION normalize_accents(text)
    RETURNS text AS $$
    BEGIN
      RETURN translate(
        translate(
          translate(
            translate(
              translate($1, 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN'),
              'àèìòùÀÈÌÒÙ', 'aeiouAEIOU'
            ),
            'âêîôûÂÊÎÔÛ', 'aeiouAEIOU'
          ),
          'äëïöüÄËÏÖÜ', 'aeiouAEIOU'
        ),
        'ãõÃÕ', 'aoAO'
      );
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);
}

export async function verifyRequiredSAFMRZips(year: number = 2026) {
  console.log(`\n=== Verifying Required SAFMR ZIPs for Year ${year} ===\n`);

  await ensureNormalizeAccents();

  const requiredAreas = loadRequiredSAFMRAreas();
  console.log(`Loaded ${requiredAreas.length} required SAFMR areas from file\n`);

  const mappingCount = await query(
    `SELECT COUNT(*)::int as count FROM fmr_county_metro WHERE year = $1 AND is_metro = true AND hud_area_name IS NOT NULL`,
    [year]
  );

  if (!mappingCount[0]?.count || mappingCount[0].count === 0) {
    throw new Error(
      `fmr_county_metro is empty for year ${year}. Re-run ingest:fmr (with --replace) for ${year} first.`
    );
  }

  const hudMetroNames = await query(
    `SELECT DISTINCT hud_area_name FROM fmr_county_metro WHERE year = $1 AND is_metro = true AND hud_area_name IS NOT NULL`,
    [year]
  );

  const hudByNormalized = new Map<string, string[]>();
  for (const row of hudMetroNames) {
    const raw = String(row.hud_area_name || '').trim();
    if (!raw) continue;
    const key = normalizeHudMetroName(raw);
    const existing = hudByNormalized.get(key);
    if (existing) {
      if (!existing.includes(raw)) existing.push(raw);
    } else {
      hudByNormalized.set(key, [raw]);
    }
  }

  const tableCount = await query('SELECT COUNT(*)::int as count FROM required_safmr_zips WHERE year = $1', [year]);
  console.log(`required_safmr_zips currently has ${tableCount[0]?.count ?? 0} ZIPs for ${year}\n`);

  const missingAreas: string[] = [];
  const areasWithZeroZips: string[] = [];

  for (const requiredArea of requiredAreas) {
    const requiredKey = normalizeHudMetroName(requiredArea);

    const rawHudNames = hudByNormalized.get(requiredKey);
    if (!rawHudNames || rawHudNames.length === 0) {
      missingAreas.push(requiredArea);
      continue;
    }

    const counties = await query(
      `
      SELECT DISTINCT state_code, county_name
      FROM fmr_county_metro
      WHERE year = $1
        AND is_metro = true
        AND county_name IS NOT NULL
        AND hud_area_name = ANY($2::text[])
      `,
      [year, rawHudNames]
    );

    if (counties.length === 0) {
      missingAreas.push(requiredArea);
      continue;
    }

    const inTable = await query(
      `
      WITH metro_counties AS (
        SELECT DISTINCT
          state_code,
          lower(
            regexp_replace(
              normalize_accents(county_name),
              '\\\\s+(county|parish|municipio|municipality|borough|census area)\\\\s*$',
              ''
            )
          ) AS county_key
        FROM fmr_county_metro
        WHERE year = $1
          AND is_metro = true
          AND county_name IS NOT NULL
          AND hud_area_name = ANY($2::text[])
      )
      SELECT COUNT(DISTINCT rsz.zip_code)::int as count
      FROM required_safmr_zips rsz
      INNER JOIN zip_county_mapping zcm ON zcm.zip_code = rsz.zip_code
      INNER JOIN metro_counties mc
        ON zcm.state_code = mc.state_code
       AND lower(
            regexp_replace(
              normalize_accents(zcm.county_name),
              '\\\\s+(county|parish|municipio|municipality|borough|census area)\\\\s*$',
              ''
            )
          ) = mc.county_key
      WHERE rsz.year = $1
      `,
      [year, rawHudNames]
    );

    const c = inTable[0]?.count ?? 0;
    if (c === 0) areasWithZeroZips.push(requiredArea);
  }

  if (missingAreas.length > 0) {
    console.log(`⚠️ No HUD-metro match found for ${missingAreas.length}/65 required areas:`);
    for (const a of missingAreas) console.log(`  - ${a}`);
    console.log('');
  }

  if (areasWithZeroZips.length > 0) {
    console.log(`⚠️ Areas that matched HUD metro counties but have 0 ZIPs in required_safmr_zips:`);
    for (const a of areasWithZeroZips) console.log(`  - ${a}`);
    console.log('');
  }

  if (missingAreas.length === 0 && areasWithZeroZips.length === 0) {
    console.log('✅ All 65 required areas have counties mapped and at least 1 ZIP in required_safmr_zips.');
  }
}

if (import.meta.main) {
  const year = process.argv[2] ? parseInt(process.argv[2]) : 2026;
  verifyRequiredSAFMRZips(year)
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error verifying required SAFMR ZIPs:', error);
      process.exit(1);
    });
}





