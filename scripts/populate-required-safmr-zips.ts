import { config } from 'dotenv';
import { execute, query, configureDatabase } from '../lib/db';
import { readFileSync } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';

config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is required');
}
configureDatabase({ connectionString: process.env.POSTGRES_URL });

function getRequiredAreasFilePath(year: number): string {
  // FY2023/FY2024 used the original (pre-expansion) mandatory SAFMR list (24 areas).
  // FY2025+ uses the expanded list (65 areas) in app/required-safmr-areas.txt.
  if (year <= 2024) {
    return join(process.cwd(), 'data', 'mandatory-safmr-zips-2023.txt');
  }
  return join(process.cwd(), 'app', 'required-safmr-areas.txt');
}

function loadRequiredSAFMRAreas(year: number): { areas: string[]; filePath: string } {
  const filePath = getRequiredAreasFilePath(year);
  if (!existsSync(filePath)) {
    throw new Error(`Required SAFMR areas file not found for year ${year}: ${filePath}`);
  }
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

    // Accept common HUD naming variants across years/files
    if (
      trimmed.includes('MSA') ||
      trimmed.includes('HUD Metro FMR Area') ||
      trimmed.includes('Metro Division')
    ) {
      areas.push(trimmed);
    }
  }

  return { areas, filePath };
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

function normalizeCountyKeyJs(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+(county|parish|municipio|municipality|borough|census area)\s*$/i, '')
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

  // One canonical county-key normalization function, so joins behave consistently.
  await execute(`
    CREATE OR REPLACE FUNCTION normalize_county_key(name text)
    RETURNS text AS $$
    BEGIN
      IF name IS NULL THEN
        RETURN NULL;
      END IF;
      RETURN lower(
        regexp_replace(
          normalize_accents(lower(name)),
          '\\s+(county|parish|municipio|municipality|borough|census area)\\s*$',
          '',
          'i'
        )
      );
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);
}

export async function populateRequiredSAFMRZips(year: number = 2026) {
  console.log(`\n=== Populating Required SAFMR ZIPs for Year ${year} ===\n`);

  await ensureSupportTables();

  const { areas: requiredAreas, filePath } = loadRequiredSAFMRAreas(year);
  console.log(`Loaded ${requiredAreas.length} required SAFMR areas from file: ${filePath}`);

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

  const missingAreas: string[] = [];
  const matchedHudNames = new Set<string>();

  for (const requiredArea of requiredAreas) {
    const requiredKey = normalizeHudMetroName(requiredArea);
    let rawHudNames = hudByNormalized.get(requiredKey);

    // Fuzzy matcher: within the required state's HUD metros, pick best token overlap.
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
        for (const raw of hudMetroNames.map(r => String(r.hud_area_name || '').trim()).filter(Boolean)) {
          candidateRawNames.add(raw);
        }
      }

      const requiredTokens = tokenizeMetroKey(requiredKey);
      const primaryToken = requiredTokens.length > 0 ? requiredTokens[0] : null;

      let bestRaw: string | null = null;
      let bestNorm: string | null = null;
      let bestScore = -1;

      for (const raw of candidateRawNames) {
        const norm = normalizeHudMetroName(raw);
        const hay = ` ${norm} `;
        let score = 0;
        for (const t of requiredTokens) {
          if (hay.includes(` ${t} `)) score++;
        }

        // Bias toward matching the primary token (usually main city)
        const hasPrimary = primaryToken ? hay.includes(` ${primaryToken} `) : false;
        const effectiveScore = hasPrimary ? score + 0.25 : score;

        if (effectiveScore > bestScore) {
          bestScore = effectiveScore;
          bestRaw = raw;
          bestNorm = norm;
        }
      }

      if (bestRaw && bestNorm) {
        rawHudNames = hudByNormalized.get(bestNorm) ?? [bestRaw];
      }
    }

    if (!rawHudNames || rawHudNames.length === 0) {
      missingAreas.push(requiredArea);
      continue;
    }

    for (const n of rawHudNames) matchedHudNames.add(n);
  }

  if (missingAreas.length > 0) {
    console.log(`\n⚠️ No HUD-metro match found for ${missingAreas.length}/${requiredAreas.length} required areas:`);
    for (const a of missingAreas) console.log(`  - ${a}`);
    console.log(
      `\nThis usually means the HUD metro name in the FMR CSV (hud_area_name) differs from the text in required-safmr-areas.txt.`
    );
  }

  const hudNamesList = Array.from(matchedHudNames).sort();
  if (hudNamesList.length === 0) {
    console.log(`\n✅ required_safmr_zips populated for ${year}: 0 ZIPs`);
    return;
  }

  // Single deterministic insert for all matched metros (more reliable than per-area looping).
  const hudPlaceholders = hudNamesList.map((_, i) => `$${i + 2}`).join(', ');
  const inserted = await query(
    `
    WITH metro_counties AS (
      SELECT DISTINCT
        state_code,
        normalize_county_key(county_name) AS county_key
      FROM fmr_county_metro
      WHERE year = $1
        AND is_metro = true
        AND county_name IS NOT NULL
        AND hud_area_name IN (${hudPlaceholders})
    ),
    zips AS (
      SELECT DISTINCT zcm.zip_code
      FROM zip_county_mapping zcm
      INNER JOIN metro_counties mc
        ON zcm.state_code = mc.state_code
       AND normalize_county_key(zcm.county_name) = mc.county_key
      WHERE zcm.state_code != 'PR'
    )
    INSERT INTO required_safmr_zips (zip_code, year)
    SELECT zip_code, $1
    FROM zips
    ON CONFLICT (zip_code, year) DO NOTHING
    RETURNING zip_code
    `,
    [year, ...hudNamesList]
  );

  const finalCount = await query('SELECT COUNT(*)::int as count FROM required_safmr_zips WHERE year = $1', [year]);
  console.log(`\n✅ required_safmr_zips populated for ${year}: ${finalCount[0]?.count ?? 0} ZIPs`);
  console.log(`(Inserted rows this run: ${inserted.length.toLocaleString()})`);
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



