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

export async function countZIPsInRequiredAreas(year: number = 2026) {
  console.log(`\n=== Counting ZIPs in Required SAFMR Areas for Year ${year} ===\n`);

  // This script is intended to report what's currently in the lookup table.
  // Ensure you've run `bun run populate:safmr-zips -- <year>` first.
  const requiredCount = await query(
    `SELECT COUNT(DISTINCT zip_code)::int as count FROM required_safmr_zips WHERE year = $1`,
    [year]
  );
  const totalRequired = requiredCount[0]?.count ?? 0;

  if (totalRequired === 0) {
    console.log(`required_safmr_zips has 0 ZIPs for ${year}. Run: bun run populate:safmr-zips -- ${year}`);
    return;
  }

  const withSafmrCount = await query(
    `
    SELECT COUNT(DISTINCT rsz.zip_code)::int as count
    FROM required_safmr_zips rsz
    INNER JOIN safmr_data sd
      ON sd.zip_code = rsz.zip_code
     AND sd.year = rsz.year
    WHERE rsz.year = $1
    `,
    [year]
  );
  const totalWithSafmr = withSafmrCount[0]?.count ?? 0;

  console.log(`📊 Summary:`);
  console.log(`  Total unique ZIPs across all required SAFMR areas: ${totalRequired.toLocaleString()}`);
  console.log(`  Total unique ZIPs in required areas that have SAFMR data: ${totalWithSafmr.toLocaleString()}`);
}

if (import.meta.main) {
  const year = process.argv[2] ? parseInt(process.argv[2]) : 2026;
  countZIPsInRequiredAreas(year)
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error counting ZIPs:', error);
      process.exit(1);
    });
}








