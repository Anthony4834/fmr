import { config } from 'dotenv';
import { execute, query, configureDatabase } from '../lib/db';
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
  // Normalize punctuation/hyphens/commas so minor HUD naming differences still compare cleanly.
  return name
    .toLowerCase()
    .replace(/\s+hud metro fmr area\s*$/i, '')
    .replace(/\s+msa\s*$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractStateCodesFromRequiredArea(requiredArea: string): string[] {
  // Example: "Atlanta-..., GA HUD Metro FMR Area" -> ["GA"]
  // Example: "Augusta-..., GA-SC HUD Metro FMR Area" -> ["GA","SC"]
  const m = requiredArea.match(/,\s*([A-Z]{2}(?:-[A-Z]{2})*)\s/i);
  if (!m?.[1]) return [];
  return m[1]
    .toUpperCase()
    .split('-')
    .map(s => s.trim())
    .filter(Boolean);
}

function tokenizeMetroKey(normalized: string): string[] {
  // Only keep meaningful tokens; drop very short ones to reduce noise.
  return normalized
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length >= 4);
}

async function ensureSupportTables() {
  // required_safmr_zips
  await execute(`
    CREATE TABLE IF NOT EXISTS required_safmr_zips (
      zip_code VARCHAR(10) NOT NULL,
      year INTEGER NOT NULL DEFAULT 2026,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (zip_code, year)
    );
  `);
  await execute('CREATE INDEX IF NOT EXISTS idx_required_safmr_zip ON required_safmr_zips(zip_code);');
  await execute('CREATE INDEX IF NOT EXISTS idx_required_safmr_year ON required_safmr_zips(year);');
  await execute('CREATE INDEX IF NOT EXISTS idx_required_safmr_zip_year ON required_safmr_zips(zip_code, year);');

  // fmr_county_metro (populated during ingest-fmr)
  await execute(`
    CREATE TABLE IF NOT EXISTS fmr_county_metro (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      state_code VARCHAR(2) NOT NULL,
      county_name TEXT,
      county_fips VARCHAR(5),
      hud_area_code TEXT,
      hud_area_name TEXT,
      is_metro BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, state_code, county_fips, hud_area_code)
    );
  `);
  // Widen old schema if needed
  await execute(`ALTER TABLE fmr_county_metro ALTER COLUMN hud_area_code TYPE TEXT;`);

  // normalize_accents used by several scripts
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

export async function populateRequiredSAFMRZips(year: number = 2026) {
  console.log(`\n=== Populating Required SAFMR ZIPs for Year ${year} ===\n`);

  await ensureSupportTables();

  const requiredAreas = loadRequiredSAFMRAreas();
  console.log(`Loaded ${requiredAreas.length} required SAFMR areas from file`);

  const mappingCount = await query(
    `SELECT COUNT(*)::int as count FROM fmr_county_metro WHERE year = $1 AND is_metro = true AND hud_area_name IS NOT NULL`,
    [year]
  );

  if (!mappingCount[0]?.count || mappingCount[0].count === 0) {
    throw new Error(
      `fmr_county_metro is empty for year ${year}. ` +
        `Re-run FMR ingestion for that year (with --replace) to populate HUD metro names/codes (fmr_county_metro), then re-run populate:safmr-zips.`
    );
  }

  console.log(`Found ${mappingCount[0].count.toLocaleString()} county->metro mapping rows for ${year}`);

  // Build a normalized HUD metro name -> raw HUD metro name(s) map using JS normalization.
  // This avoids brittle regex normalization in SQL and makes matching reliable.
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

  // Also build state-filtered candidate sets for safe fuzzy matching.
  const hudMetroNamesByState = await query(
    `SELECT DISTINCT state_code, hud_area_name FROM fmr_county_metro WHERE year = $1 AND is_metro = true AND hud_area_name IS NOT NULL`,
    [year]
  );

  const rawHudNamesByState = new Map<string, Set<string>>();
  for (const row of hudMetroNamesByState) {
    const st = String(row.state_code || '').toUpperCase();
    const raw = String(row.hud_area_name || '').trim();
    if (!st || !raw) continue;
    const set = rawHudNamesByState.get(st) ?? new Set<string>();
    set.add(raw);
    rawHudNamesByState.set(st, set);
  }

  console.log(`Clearing existing required SAFMR ZIPs for year ${year}...`);
  await execute('DELETE FROM required_safmr_zips WHERE year = $1', [year]);
  console.log('✅ Cleared\n');

  let totalInserted = 0;
  const missingAreas: string[] = [];

  for (const requiredArea of requiredAreas) {
    const requiredKey = normalizeHudMetroName(requiredArea);

    let rawHudNames = hudByNormalized.get(requiredKey);

    // Fallback matcher: within the required state's HUD metros, pick best token overlap.
    if (!rawHudNames || rawHudNames.length === 0) {
      const stateCodes = extractStateCodesFromRequiredArea(requiredArea);
      const candidateRawNames = new Set<string>();

      if (stateCodes.length > 0) {
        for (const st of stateCodes) {
          const set = rawHudNamesByState.get(st);
          if (!set) continue;
          for (const raw of set) candidateRawNames.add(raw);
        }
      } else {
        // If we can't parse states, fall back to all HUD names (still token-based).
        for (const raw of hudMetroNames.map(r => String(r.hud_area_name || '').trim()).filter(Boolean)) {
          candidateRawNames.add(raw);
        }
      }

      const requiredTokens = tokenizeMetroKey(requiredKey);
      let bestNorm: string | null = null;
      let bestScore = 0;

      for (const raw of candidateRawNames) {
        const norm = normalizeHudMetroName(raw);
        const hay = ` ${norm} `;
        let score = 0;
        for (const t of requiredTokens) {
          if (hay.includes(` ${t} `)) score++;
        }
        if (score > bestScore) {
          bestScore = score;
          bestNorm = norm;
        }
      }

      if (bestNorm) {
        // Require a reasonable overlap to avoid false positives
        const minNeeded = Math.max(2, Math.ceil(requiredTokens.length * 0.6));
        if (bestScore >= minNeeded) {
          rawHudNames = hudByNormalized.get(bestNorm);
        }
      }
    }

    if (!rawHudNames || rawHudNames.length === 0) {
      missingAreas.push(requiredArea);
      continue;
    }

    // Find counties that belong to this HUD metro area.
    // IMPORTANT: we intentionally join ZIPs by (state_code + normalized county_name),
    // not by county_fips, because different sources store county FIPS differently.
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

    // Insert ZIPs in those counties that have SAFMR data
    const inserted = await query(
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
      ),
      zips AS (
        SELECT DISTINCT zcm.zip_code
        FROM zip_county_mapping zcm
        INNER JOIN metro_counties mc
          ON zcm.state_code = mc.state_code
         AND lower(
              regexp_replace(
                normalize_accents(zcm.county_name),
                '\\\\s+(county|parish|municipio|municipality|borough|census area)\\\\s*$',
                ''
              )
            ) = mc.county_key
        INNER JOIN safmr_data sd
          ON sd.zip_code = zcm.zip_code
         AND sd.year = $1
      )
      INSERT INTO required_safmr_zips (zip_code, year)
      SELECT zip_code, $1
      FROM zips
      ON CONFLICT (zip_code, year) DO NOTHING
      RETURNING zip_code
      `,
      [year, rawHudNames]
    );

    totalInserted += inserted.length;
  }

  const finalCount = await query('SELECT COUNT(*)::int as count FROM required_safmr_zips WHERE year = $1', [year]);
  console.log(`\n✅ required_safmr_zips populated for ${year}: ${finalCount[0]?.count ?? 0} ZIPs`);
  console.log(`(Inserted rows this run: ${totalInserted.toLocaleString()})`);

  if (missingAreas.length > 0) {
    console.log(`\n⚠️ No HUD-metro match found for ${missingAreas.length}/65 required areas:`);
    for (const a of missingAreas) console.log(`  - ${a}`);
    console.log(`\nThis usually means the HUD metro name in the FMR CSV (hud_area_name) differs from the text in required-safmr-areas.txt.`);
  }
}

if (import.meta.main) {
  const year = process.argv[2] ? parseInt(process.argv[2]) : 2026;
  populateRequiredSAFMRZips(year)
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error populating required SAFMR ZIPs:', error);
      process.exit(1);
    });
}

