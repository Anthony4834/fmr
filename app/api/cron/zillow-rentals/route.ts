import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { parse } from 'csv-parse';
import { Readable } from 'node:stream';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 300;

function normalizeZip(zip: unknown): string {
  const raw = String(zip ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 5) return digits;
  if (digits.length < 5) return digits.padStart(5, '0');
  return digits.slice(0, 5);
}

function toMonthStart(yyyyMmDd: string): string {
  return `${yyyyMmDd.slice(0, 7)}-01`;
}

function pickLatestDateColumn(columns: string[]) {
  const dateCols = columns
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return dateCols.length > 0 ? dateCols[dateCols.length - 1] : null;
}

function isAuthorized(req: NextRequest) {
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron === '1') return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() === secret;
  }
  return false;
}

const ZORI_URL_ALLOWLIST = 'https://files.zillowstatic.com/research/public_csvs/zori';
const ZORDI_URL_ALLOWLIST = 'https://files.zillowstatic.com/research/public_csvs/zordi';

function isAllowedZillowUrl(url: string, allowlist: string): boolean {
  const normalized = url.trim().replace(/\/+$/, '');
  return normalized === allowlist || normalized.startsWith(allowlist + '/');
}

// ============================================================================
// ZORI (ZIP-level rent index) ingestion
// ============================================================================

function getZoriUrlCandidates(urlBase: string) {
  const base = urlBase.replace(/\/+$/, '');
  return [
    `${base}/Zip_zori_uc_sfrcondomfr_sm_sa_month.csv`,
    `${base}/Zip_ZORI_AllHomesPlusMultifamily_Smoothed.csv`,
    `${base}/Zip_zori_sm_month.csv`,
  ];
}

async function upsertZoriBatch(
  rows: Array<{
    zip_code: string;
    month: string;
    zori: number;
    state_code: string | null;
    city_name: string | null;
    county_name: string | null;
    metro_name: string | null;
  }>
) {
  if (rows.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const base = i * 7;
    placeholders.push(
      `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, NOW())`
    );
    values.push(r.zip_code, r.month, r.zori, r.state_code, r.city_name, r.county_name, r.metro_name);
  }

  await sql.query(
    `
    INSERT INTO zillow_zori_zip_monthly
      (zip_code, month, zori, state_code, city_name, county_name, metro_name, updated_at)
    VALUES
      ${placeholders.join(',\n      ')}
    ON CONFLICT (zip_code, month)
    DO UPDATE SET
      zori = EXCLUDED.zori,
      state_code = EXCLUDED.state_code,
      city_name = EXCLUDED.city_name,
      county_name = EXCLUDED.county_name,
      metro_name = EXCLUDED.metro_name,
      updated_at = NOW()
    `,
    values
  );
}

async function ingestZori(urlBase: string) {
  const candidates = getZoriUrlCandidates(urlBase);
  let res: Response | null = null;
  let lastErr: string | null = null;

  for (const u of candidates) {
    const r = await fetch(u, { headers: { Accept: 'text/csv,*/*', 'User-Agent': 'fmr-search (cron zillow-rentals)' } });
    if (r.ok) {
      res = r;
      break;
    }
    const body = await r.text().catch(() => '');
    lastErr = `HTTP ${r.status} ${r.statusText} (${body.slice(0, 200)})`;
  }

  if (!res || !res.body) {
    return { success: false, error: lastErr || 'Failed to fetch ZORI CSV' };
  }

  const parser = parse({
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  });

  const nodeStream = Readable.fromWeb(res.body as any);
  nodeStream.pipe(parser);

  let latestDateCol: string | null = null;
  let monthStart: string | null = null;
  let totalUpserted = 0;
  const batch: Array<{
    zip_code: string;
    month: string;
    zori: number;
    state_code: string | null;
    city_name: string | null;
    county_name: string | null;
    metro_name: string | null;
  }> = [];

  for await (const record of parser) {
    const row = record as Record<string, string>;

    if (!latestDateCol) {
      latestDateCol = pickLatestDateColumn(Object.keys(row));
      if (!latestDateCol) {
        return { success: false, error: 'No date columns found in ZORI CSV' };
      }
      monthStart = toMonthStart(latestDateCol);
    }

    const zip = normalizeZip(row.RegionName);
    if (!zip || zip.length !== 5) continue;

    const regionType = row.RegionType?.toLowerCase();
    if (regionType && regionType !== 'zip') continue;

    const rawVal = row[latestDateCol];
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
    const zori = Number(String(rawVal).trim());
    if (!Number.isFinite(zori) || zori <= 0) continue;

    batch.push({
      zip_code: zip,
      month: monthStart!,
      zori,
      state_code: row.State ? String(row.State).trim().toUpperCase() : null,
      city_name: row.City ? String(row.City).trim() : null,
      county_name: row.CountyName ? String(row.CountyName).trim() : null,
      metro_name: row.Metro ? String(row.Metro).trim() : null,
    });

    if (batch.length >= 1000) {
      const flushed = batch.splice(0, batch.length);
      await upsertZoriBatch(flushed);
      totalUpserted += flushed.length;
    }
  }

  if (batch.length > 0) {
    await upsertZoriBatch(batch);
    totalUpserted += batch.length;
  }

  return { success: true, month: monthStart, upserted: totalUpserted };
}

// ============================================================================
// ZORDI (Metro-level demand index) ingestion
// ============================================================================

function getZordiUrlCandidates(urlBase: string) {
  const base = urlBase.replace(/\/+$/, '');
  return [
    `${base}/Metro_zordi_uc_sfrcondomfr_month.csv`,
    `${base}/Metro_ZORDI_AllHomesPlusMultifamily.csv`,
    `${base}/Msa_zordi_month.csv`,
  ];
}

async function upsertZordiBatch(
  rows: Array<{
    region_name: string;
    region_type: string;
    cbsa_code: string | null;
    month: string;
    zordi: number;
  }>
) {
  if (rows.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const base = i * 5;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::date, $${base + 5}, NOW())`);
    values.push(r.region_name, r.region_type, r.cbsa_code, r.month, r.zordi);
  }

  await sql.query(
    `
    INSERT INTO zillow_zordi_metro_monthly
      (region_name, region_type, cbsa_code, month, zordi, updated_at)
    VALUES
      ${placeholders.join(',\n      ')}
    ON CONFLICT (region_name, region_type, month)
    DO UPDATE SET
      zordi = EXCLUDED.zordi,
      cbsa_code = COALESCE(EXCLUDED.cbsa_code, zillow_zordi_metro_monthly.cbsa_code),
      updated_at = NOW()
    `,
    values
  );
}

async function ingestZordi(urlBase: string) {
  const candidates = getZordiUrlCandidates(urlBase);
  let res: Response | null = null;
  let lastErr: string | null = null;

  for (const u of candidates) {
    const r = await fetch(u, { headers: { Accept: 'text/csv,*/*', 'User-Agent': 'fmr-search (cron zillow-rentals)' } });
    if (r.ok) {
      res = r;
      break;
    }
    const body = await r.text().catch(() => '');
    lastErr = `HTTP ${r.status} ${r.statusText} (${body.slice(0, 200)})`;
  }

  if (!res || !res.body) {
    return { success: false, error: lastErr || 'Failed to fetch ZORDI CSV' };
  }

  const parser = parse({
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  });

  const nodeStream = Readable.fromWeb(res.body as any);
  nodeStream.pipe(parser);

  let latestDateCol: string | null = null;
  let monthStart: string | null = null;
  let totalUpserted = 0;
  const batch: Array<{
    region_name: string;
    region_type: string;
    cbsa_code: string | null;
    month: string;
    zordi: number;
  }> = [];

  for await (const record of parser) {
    const row = record as Record<string, string>;

    if (!latestDateCol) {
      latestDateCol = pickLatestDateColumn(Object.keys(row));
      if (!latestDateCol) {
        return { success: false, error: 'No date columns found in ZORDI CSV' };
      }
      monthStart = toMonthStart(latestDateCol);
    }

    const regionName = row.RegionName ? String(row.RegionName).trim() : null;
    if (!regionName) continue;

    const regionType = row.RegionType ? String(row.RegionType).trim().toLowerCase() : 'msa';

    let cbsaCode: string | null = null;
    if (row.RegionID) {
      const id = String(row.RegionID).trim();
      if (/^\d{5}$/.test(id)) {
        cbsaCode = id;
      }
    }

    const rawVal = row[latestDateCol];
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
    const zordi = Number(String(rawVal).trim());
    if (!Number.isFinite(zordi)) continue;

    batch.push({
      region_name: regionName,
      region_type: regionType,
      cbsa_code: cbsaCode,
      month: monthStart!,
      zordi,
    });

    if (batch.length >= 500) {
      const flushed = batch.splice(0, batch.length);
      await upsertZordiBatch(flushed);
      totalUpserted += flushed.length;
    }
  }

  if (batch.length > 0) {
    await upsertZordiBatch(batch);
    totalUpserted += batch.length;
  }

  return { success: true, month: monthStart, upserted: totalUpserted };
}

// ============================================================================
// CBSA mapping (ZIP to Metro)
// ============================================================================

async function updateCbsaMapping() {
  // Build CBSA mapping from existing FMR county-metro data
  const yearResult = await sql`SELECT MAX(year) as latest_year FROM fmr_county_metro`;
  const year = yearResult.rows[0]?.latest_year || new Date().getFullYear();

  const result = await sql`
    WITH metro_counties AS (
      SELECT DISTINCT
        fcm.county_fips,
        fcm.state_code,
        fcm.hud_area_code,
        fcm.hud_area_name,
        CASE
          WHEN fcm.hud_area_code LIKE 'METRO%' THEN
            REGEXP_REPLACE(fcm.hud_area_code, '^METRO(\\d+).*', '\\1')
          ELSE NULL
        END as cbsa_code
      FROM fmr_county_metro fcm
      WHERE fcm.year = ${year}
        AND fcm.is_metro = true
        AND fcm.hud_area_code IS NOT NULL
    )
    SELECT DISTINCT
      zcm.zip_code,
      mc.cbsa_code,
      mc.hud_area_name as cbsa_name,
      zcm.state_code
    FROM zip_county_mapping zcm
    JOIN metro_counties mc ON
      mc.county_fips = zcm.county_fips
      AND mc.state_code = zcm.state_code
    WHERE mc.cbsa_code IS NOT NULL
      AND LENGTH(mc.cbsa_code) >= 4
  `;

  if (result.rows.length === 0) {
    return { success: true, message: 'No new CBSA mappings to add', updated: 0 };
  }

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < result.rows.length; i++) {
    const r = result.rows[i]!;
    const base = i * 4;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, NOW())`);
    values.push(
      normalizeZip(r.zip_code),
      String(r.cbsa_code).trim(),
      String(r.cbsa_name).trim(),
      r.state_code || null
    );

    // Batch insert every 1000 rows
    if (placeholders.length >= 1000) {
      await sql.query(
        `
        INSERT INTO cbsa_zip_mapping (zip_code, cbsa_code, cbsa_name, state_code, created_at)
        VALUES ${placeholders.join(',\n')}
        ON CONFLICT (zip_code, cbsa_code) DO UPDATE SET
          cbsa_name = EXCLUDED.cbsa_name,
          state_code = EXCLUDED.state_code
        `,
        values
      );
      placeholders.length = 0;
      values.length = 0;
    }
  }

  // Insert remaining rows
  if (placeholders.length > 0) {
    await sql.query(
      `
      INSERT INTO cbsa_zip_mapping (zip_code, cbsa_code, cbsa_name, state_code, created_at)
      VALUES ${placeholders.join(',\n')}
      ON CONFLICT (zip_code, cbsa_code) DO UPDATE SET
        cbsa_name = EXCLUDED.cbsa_name,
        state_code = EXCLUDED.state_code
      `,
      values
    );
  }

  return { success: true, updated: result.rows.length };
}

// ============================================================================
// Main handler
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const zoriBaseParam = req.nextUrl.searchParams.get('zoriBase')?.trim()?.replace(/\/+$/, '') || ZORI_URL_ALLOWLIST;
    const zordiBaseParam = req.nextUrl.searchParams.get('zordiBase')?.trim()?.replace(/\/+$/, '') || ZORDI_URL_ALLOWLIST;
    if (!isAllowedZillowUrl(zoriBaseParam, ZORI_URL_ALLOWLIST)) {
      return NextResponse.json({ error: 'Invalid zoriBase parameter' }, { status: 400 });
    }
    if (!isAllowedZillowUrl(zordiBaseParam, ZORDI_URL_ALLOWLIST)) {
      return NextResponse.json({ error: 'Invalid zordiBase parameter' }, { status: 400 });
    }
    const zoriBase = zoriBaseParam;
    const zordiBase = zordiBaseParam;
    const skipZori = req.nextUrl.searchParams.get('skipZori') === '1';
    const skipZordi = req.nextUrl.searchParams.get('skipZordi') === '1';
    const skipCbsa = req.nextUrl.searchParams.get('skipCbsa') === '1';

    const results: any = {
      zori: null,
      zordi: null,
      cbsaMapping: null,
    };

    // 1. Ingest ZORI (ZIP-level rent data)
    if (!skipZori) {
      try {
        results.zori = await ingestZori(zoriBase);
      } catch (e: any) {
        results.zori = { success: false, error: e.message };
      }
    }

    // 2. Ingest ZORDI (Metro-level demand data)
    if (!skipZordi) {
      try {
        results.zordi = await ingestZordi(zordiBase);
      } catch (e: any) {
        results.zordi = { success: false, error: e.message };
      }
    }

    // 3. Update CBSA mapping
    if (!skipCbsa) {
      try {
        results.cbsaMapping = await updateCbsaMapping();
      } catch (e: any) {
        results.cbsaMapping = { success: false, error: e.message };
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
