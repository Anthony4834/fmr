import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 300;

function isAuthorized(req: NextRequest) {
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron === '1') return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() === secret;
  }
  const q = req.nextUrl.searchParams.get('secret');
  return q === secret;
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS acs_tax_zcta_latest (
      id SERIAL PRIMARY KEY,
      acs_vintage INTEGER NOT NULL,
      zcta VARCHAR(5) NOT NULL,
      median_home_value NUMERIC(14, 2),
      median_real_estate_taxes_paid NUMERIC(14, 2),
      effective_tax_rate NUMERIC(10, 6),
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(acs_vintage, zcta)
    );
  `;
}

async function upsertBatch(
  vintage: number,
  rows: Array<{
    zcta: string;
    median_home_value: number | null;
    median_real_estate_taxes_paid: number | null;
    effective_tax_rate: number | null;
  }>
) {
  if (rows.length === 0) return;
  const values: any[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const base = i * 5;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, NOW())`);
    values.push(vintage, r.zcta, r.median_home_value, r.median_real_estate_taxes_paid, r.effective_tax_rate);
  }

  await sql.query(
    `
    INSERT INTO acs_tax_zcta_latest
      (acs_vintage, zcta, median_home_value, median_real_estate_taxes_paid, effective_tax_rate, computed_at)
    VALUES
      ${placeholders.join(',\n      ')}
    ON CONFLICT (acs_vintage, zcta)
    DO UPDATE SET
      median_home_value = EXCLUDED.median_home_value,
      median_real_estate_taxes_paid = EXCLUDED.median_real_estate_taxes_paid,
      effective_tax_rate = EXCLUDED.effective_tax_rate,
      computed_at = NOW()
    `,
    values
  );
}

async function censusDatasetExists(vintage: number): Promise<boolean> {
  // Tiny probe; pick a well-known ZCTA.
  const url = `https://api.census.gov/data/${vintage}/acs/acs5?get=NAME&for=zip%20code%20tabulation%20area:90210`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  return res.ok;
}

async function pickLatestVintage(explicit?: number | null) {
  if (explicit && Number.isFinite(explicit)) return explicit;
  const now = new Date();
  const candidates = [now.getUTCFullYear() - 1, now.getUTCFullYear() - 2, now.getUTCFullYear() - 3, 2023, 2022];
  for (const y of candidates) {
    try {
      if (await censusDatasetExists(y)) return y;
    } catch {
      // ignore
    }
  }
  return 2023;
}

async function fetchAcsRows(vintage: number, stateFips?: string) {
  const base = `https://api.census.gov/data/${vintage}/acs/acs5`;
  const vars = ['NAME', 'B25077_001E', 'B25103_001E'];
  const params = new URLSearchParams();
  params.set('get', vars.join(','));
  params.set('for', 'zip code tabulation area:*');
  if (stateFips) params.set('in', `state:${stateFips}`);
  const url = `${base}?${params.toString()}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ACS API failed: HTTP ${res.status} ${res.statusText} (${body.slice(0, 200)})`);
  }
  return (await res.json()) as string[][];
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTable();

    const vintageParam = req.nextUrl.searchParams.get('vintage');
    const explicitVintage = vintageParam ? parseInt(vintageParam, 10) : null;
    const vintage = await pickLatestVintage(explicitVintage);

    const statesParam = req.nextUrl.searchParams.get('states');
    const stateParam = req.nextUrl.searchParams.get('state');
    const states = (statesParam || stateParam || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => /^\d{2}$/.test(s));

    const ingestOne = async (stateFips?: string) => {
      const json = await fetchAcsRows(vintage, stateFips);
      if (!Array.isArray(json) || json.length < 2) return 0;
      const header = json[0]!;
      const idxZcta = header.indexOf('zip code tabulation area');
      const idxHome = header.indexOf('B25077_001E');
      const idxTax = header.indexOf('B25103_001E');
      if (idxZcta === -1 || idxHome === -1 || idxTax === -1) {
        throw new Error(`Unexpected ACS header; missing required columns. header=${JSON.stringify(header)}`);
      }

      let written = 0;
      const batch: Array<{
        zcta: string;
        median_home_value: number | null;
        median_real_estate_taxes_paid: number | null;
        effective_tax_rate: number | null;
      }> = [];

      for (let i = 1; i < json.length; i++) {
        const row = json[i]!;
        const zcta = String(row[idxZcta] || '').trim();
        if (!/^\d{5}$/.test(zcta)) continue;
        const homeVal = row[idxHome] ? Number(row[idxHome]) : NaN;
        const taxVal = row[idxTax] ? Number(row[idxTax]) : NaN;

        const median_home_value = Number.isFinite(homeVal) && homeVal > 0 ? homeVal : null;
        const median_real_estate_taxes_paid = Number.isFinite(taxVal) && taxVal > 0 ? taxVal : null;
        const effective_tax_rate =
          median_home_value !== null && median_real_estate_taxes_paid !== null
            ? median_real_estate_taxes_paid / median_home_value
            : null;

        batch.push({ zcta, median_home_value, median_real_estate_taxes_paid, effective_tax_rate });
        if (batch.length >= 1000) {
          const flushed = batch.splice(0, batch.length);
          await upsertBatch(vintage, flushed);
          written += flushed.length;
        }
      }

      if (batch.length > 0) {
        await upsertBatch(vintage, batch);
        written += batch.length;
      }
      return written;
    };

    let total = 0;
    if (states.length === 0) {
      total = await ingestOne();
    } else {
      for (const st of states) {
        total += await ingestOne(st);
      }
    }

    return NextResponse.json({
      ok: true,
      vintage,
      upserted: total,
      scope: states.length > 0 ? { states } : { states: 'all' },
    });
  } catch (e: any) {
    console.error('ACS tax cron error:', e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}




