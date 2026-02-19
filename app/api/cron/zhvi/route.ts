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

function getZhviZipBedroomUrlCandidates(urlBase: string, bedroomCount: number) {
  const base = urlBase.replace(/\/+$/, '');
  return [
    `${base}/Zip_zhvi_bdrmcnt_${bedroomCount}_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
    `${base}/Zip_zhvi_bdrmcnt_${bedroomCount}.csv`,
  ];
}

async function upsertBatch(
  rows: Array<{
    zip_code: string;
    bedroom_count: number;
    month: string;
    zhvi: number;
    state_code: string | null;
    city_name: string | null;
    county_name: string | null;
  }>
) {
  if (rows.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const base = i * 7;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}::date, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, NOW())`
    );
    values.push(
      r.zip_code,
      r.bedroom_count,
      r.month,
      r.zhvi,
      r.state_code,
      r.city_name,
      r.county_name
    );
  }

  await sql.query(
    `
    INSERT INTO zhvi_zip_bedroom_monthly
      (zip_code, bedroom_count, month, zhvi, state_code, city_name, county_name, updated_at)
    VALUES
      ${placeholders.join(',\n      ')}
    ON CONFLICT (zip_code, bedroom_count, month)
    DO UPDATE SET
      zhvi = EXCLUDED.zhvi,
      state_code = EXCLUDED.state_code,
      city_name = EXCLUDED.city_name,
      county_name = EXCLUDED.county_name,
      updated_at = NOW()
    `,
    values
  );
}

async function refreshZipCityMapping() {
  await sql`TRUNCATE TABLE zip_city_mapping;`;
  await sql`
    INSERT INTO zip_city_mapping (zip_code, city_name, state_code)
    SELECT DISTINCT
      unnest(c.zip_codes)::text as zip_code,
      c.city_name,
      c.state_code
    FROM cities c
    WHERE c.zip_codes IS NOT NULL
      AND array_length(c.zip_codes, 1) > 0
      AND c.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
  `;
}

async function computeRollupsForMonth(month: string, bedroomCount: number) {
  const representativeZipCountyCte = `
    SELECT DISTINCT ON (zcm.zip_code)
      zcm.zip_code,
      zcm.state_code,
      zcm.county_name,
      zcm.county_fips
    FROM zip_county_mapping zcm
    WHERE zcm.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    ORDER BY zcm.zip_code, zcm.county_fips NULLS LAST, zcm.county_name
  `;

  // State rollups
  await sql.query(
    `
    WITH rep AS (${representativeZipCountyCte}),
    src AS (
      SELECT z.zip_code, rep.state_code, z.zhvi
      FROM zhvi_zip_bedroom_monthly z
      JOIN rep ON rep.zip_code = z.zip_code
      WHERE z.month = $1::date
        AND z.bedroom_count = $2
        AND z.zhvi IS NOT NULL
        AND z.zhvi > 0
        AND rep.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    )
    INSERT INTO zhvi_rollup_monthly (
      geo_type, geo_key, state_code, bedroom_count, month,
      zhvi_median, zhvi_p25, zhvi_p75, zip_count, computed_at
    )
    SELECT
      'state' as geo_type,
      s.state_code as geo_key,
      s.state_code,
      $2 as bedroom_count,
      $1::date as month,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_median,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p75,
      COUNT(DISTINCT s.zip_code) as zip_count,
      NOW() as computed_at
    FROM src s
    GROUP BY s.state_code
    ON CONFLICT (geo_type, geo_key, bedroom_count, month)
    DO UPDATE SET
      zhvi_median = EXCLUDED.zhvi_median,
      zhvi_p25 = EXCLUDED.zhvi_p25,
      zhvi_p75 = EXCLUDED.zhvi_p75,
      zip_count = EXCLUDED.zip_count,
      computed_at = NOW()
    `,
    [month, bedroomCount]
  );

  // County rollups
  await sql.query(
    `
    WITH rep AS (${representativeZipCountyCte}),
    src AS (
      SELECT z.zip_code, rep.state_code, rep.county_name, rep.county_fips, z.zhvi
      FROM zhvi_zip_bedroom_monthly z
      JOIN rep ON rep.zip_code = z.zip_code
      WHERE z.month = $1::date
        AND z.bedroom_count = $2
        AND z.zhvi IS NOT NULL
        AND z.zhvi > 0
        AND rep.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    )
    INSERT INTO zhvi_rollup_monthly (
      geo_type, geo_key, state_code, county_name, county_fips, bedroom_count, month,
      zhvi_median, zhvi_p25, zhvi_p75, zip_count, computed_at
    )
    SELECT
      'county' as geo_type,
      (COALESCE(s.county_fips, s.county_name) || '|' || s.state_code) as geo_key,
      s.state_code,
      s.county_name,
      s.county_fips,
      $2 as bedroom_count,
      $1::date as month,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_median,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p75,
      COUNT(DISTINCT s.zip_code) as zip_count,
      NOW() as computed_at
    FROM src s
    GROUP BY s.state_code, s.county_name, s.county_fips
    ON CONFLICT (geo_type, geo_key, bedroom_count, month)
    DO UPDATE SET
      zhvi_median = EXCLUDED.zhvi_median,
      zhvi_p25 = EXCLUDED.zhvi_p25,
      zhvi_p75 = EXCLUDED.zhvi_p75,
      zip_count = EXCLUDED.zip_count,
      computed_at = NOW()
    `,
    [month, bedroomCount]
  );

  // City rollups
  await sql.query(
    `
    WITH src AS (
      SELECT z.zip_code, z.zhvi, zcm.city_name, zcm.state_code
      FROM zhvi_zip_bedroom_monthly z
      JOIN zip_city_mapping zcm ON zcm.zip_code = z.zip_code
      WHERE z.month = $1::date
        AND z.bedroom_count = $2
        AND z.zhvi IS NOT NULL
        AND z.zhvi > 0
        AND zcm.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    )
    INSERT INTO zhvi_rollup_monthly (
      geo_type, geo_key, state_code, city_name, bedroom_count, month,
      zhvi_median, zhvi_p25, zhvi_p75, zip_count, computed_at
    )
    SELECT
      'city' as geo_type,
      (s.city_name || '|' || s.state_code) as geo_key,
      s.state_code,
      s.city_name,
      $2 as bedroom_count,
      $1::date as month,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_median,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY s.zhvi) as zhvi_p75,
      COUNT(DISTINCT s.zip_code) as zip_count,
      NOW() as computed_at
    FROM src s
    GROUP BY s.city_name, s.state_code
    ON CONFLICT (geo_type, geo_key, bedroom_count, month)
    DO UPDATE SET
      zhvi_median = EXCLUDED.zhvi_median,
      zhvi_p25 = EXCLUDED.zhvi_p25,
      zhvi_p75 = EXCLUDED.zhvi_p75,
      zip_count = EXCLUDED.zip_count,
      computed_at = NOW()
    `,
    [month, bedroomCount]
  );
}

function isAuthorized(req: NextRequest) {
  // Vercel Cron adds `x-vercel-cron: 1`. We accept that as an internal scheduler signal.
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

const ZHVI_URL_ALLOWLIST = 'https://files.zillowstatic.com/research/public_csvs/zhvi';

function isAllowedZhviUrl(url: string): boolean {
  const normalized = url.trim().replace(/\/+$/, '');
  return normalized === ZHVI_URL_ALLOWLIST || normalized.startsWith(ZHVI_URL_ALLOWLIST + '/');
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const bedroom = Math.max(1, Math.min(5, parseInt(req.nextUrl.searchParams.get('bedroom') || '1', 10) || 1));
    const urlBaseParam = req.nextUrl.searchParams.get('urlBase')?.trim()?.replace(/\/+$/, '') || ZHVI_URL_ALLOWLIST;
    if (!isAllowedZhviUrl(urlBaseParam)) {
      return NextResponse.json({ error: 'Invalid urlBase parameter' }, { status: 400 });
    }
    const urlBase = urlBaseParam;
    const urlCandidates = getZhviZipBedroomUrlCandidates(urlBase, bedroom);

    // Fetch (try candidates)
    let res: Response | null = null;
    let lastErr: string | null = null;
    for (const u of urlCandidates) {
      const r = await fetch(u, { headers: { Accept: 'text/csv,*/*', 'User-Agent': 'fmr-search (cron zhvi)' } });
      if (r.ok) {
        res = r;
        break;
      }
      const body = await r.text().catch(() => '');
      lastErr = `HTTP ${r.status} ${r.statusText} (${body.slice(0, 200)})`;
    }
    if (!res || !res.body) {
      return NextResponse.json(
        { error: 'Failed to fetch ZHVI CSV', bedroom, urlBase, lastErr },
        { status: 502 }
      );
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
      bedroom_count: number;
      month: string;
      zhvi: number;
      state_code: string | null;
      city_name: string | null;
      county_name: string | null;
    }> = [];

    for await (const record of parser) {
      const row = record as Record<string, string>;
      if (!latestDateCol) {
        latestDateCol = pickLatestDateColumn(Object.keys(row));
        if (!latestDateCol) {
          return NextResponse.json({ error: 'No date columns found in ZHVI CSV' }, { status: 500 });
        }
        monthStart = toMonthStart(latestDateCol);
      }

      const zip = normalizeZip(row.RegionName);
      if (!zip) continue;

      const rawVal = row[latestDateCol];
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
      const zhvi = Number(String(rawVal).trim());
      if (!Number.isFinite(zhvi) || zhvi <= 0) continue;

      const stateCode = row.State ? String(row.State).trim().toUpperCase() : null;
      const cityName = row.City ? String(row.City).trim() : null;
      const countyName = row.CountyName ? String(row.CountyName).trim() : null;

      batch.push({
        zip_code: zip,
        bedroom_count: bedroom,
        month: monthStart!,
        zhvi,
        state_code: stateCode,
        city_name: cityName,
        county_name: countyName,
      });

      if (batch.length >= 1000) {
        const flushed = batch.splice(0, batch.length);
        await upsertBatch(flushed);
        totalUpserted += flushed.length;
      }
    }

    if (batch.length > 0) {
      await upsertBatch(batch);
      totalUpserted += batch.length;
    }

    // Rollups for this month + bedroom
    await refreshZipCityMapping();
    await computeRollupsForMonth(monthStart!, bedroom);

    return NextResponse.json({
      ok: true,
      bedroom,
      month: monthStart,
      upserted: totalUpserted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}






