import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 60;

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
    CREATE TABLE IF NOT EXISTS mortgage_rates (
      id SERIAL PRIMARY KEY,
      rate_type VARCHAR(50) NOT NULL DEFAULT '30_year_fixed',
      rate_annual_pct NUMERIC(10, 6) NOT NULL,
      source VARCHAR(100) NOT NULL DEFAULT 'API Ninjas',
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  // Ensure indexes exist
  await sql`CREATE INDEX IF NOT EXISTS idx_mortgage_rates_fetched_at ON mortgage_rates(fetched_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mortgage_rates_type_fetched ON mortgage_rates(rate_type, fetched_at DESC);`;
}

function firstNumber(obj: any, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (v === null || v === undefined) continue;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pick30YearFixedMortgageRateAnnualPct(payload: any): number | null {
  // API Ninjas mortgagerate typically returns an array of products; we look for 30-year fixed / FRM.
  const arr = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : null;

  const normalize = (s: any) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Common API Ninjas shape:
  // [
  //   { week: "current", data: { frm_30: "6.22", frm_15: "5.54", week: "YYYY-MM-DD" } }
  // ]
  if (Array.isArray(arr) && arr.length > 0) {
    for (const row of arr) {
      const r = row?.data?.frm_30 ?? row?.data?.FRM_30 ?? row?.frm_30 ?? row?.FRM_30;
      const n = typeof r === 'number' ? r : Number(String(r ?? '').replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
  }

  // Some variants return an object keyed by product (e.g. "30_year_fixed": 6.7).
  if (!arr && payload && typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload)) {
      const kk = normalize(k);
      if (!/(30|thirty)/.test(kk)) continue;
      if (!/(fixed|frm)/.test(kk)) continue;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
    // Also check nested objects one level deep.
    for (const [, v] of Object.entries(payload)) {
      if (!v || typeof v !== 'object') continue;
      for (const [k2, v2] of Object.entries(v as any)) {
        const kk2 = normalize(k2);
        if (!/(30|thirty)/.test(kk2)) continue;
        if (!/(fixed|frm)/.test(kk2)) continue;
        const n2 = typeof v2 === 'number' ? v2 : Number(String(v2).replace(/[^0-9.\-]/g, ''));
        if (Number.isFinite(n2)) return n2;
      }
    }
    return null;
  }

  if (!arr || arr.length === 0) return null;

  const scored = arr
    .map((row: any) => {
      const name = normalize(row.mortgage_type ?? row.type ?? row.name ?? row.product ?? '');
      const term = normalize(row.term ?? row.term_years ?? row.duration ?? '');
      const rate = firstNumber(row, ['rate', 'interest_rate', 'apr', 'value']);
      const hay = `${name} ${term}`;
      let score = 0;
      if (hay.includes('30')) score += 3;
      if (hay.includes('fixed') || hay.includes('frm') || hay.includes('30-year fixed')) score += 4;
      if (hay.includes('arm')) score -= 5;
      return { row, rate, score };
    })
    .filter((x: { row: any; rate: number | null; score: number }) => x.rate !== null);

  if (scored.length === 0) return null;
  scored.sort(
    (a: { row: any; rate: number | null; score: number }, b: { row: any; rate: number | null; score: number }) =>
      b.score - a.score
  );
  return scored[0]!.rate!;
}

async function fetchMortgageRateFromApiNinjas(): Promise<number | null> {
  const key = process.env.API_NINJAS_KEY || process.env.API_NINJAS_API_KEY;
  if (!key) {
    throw new Error('Missing API_NINJAS_KEY (or API_NINJAS_API_KEY)');
  }

  const url = 'https://api.api-ninjas.com/v1/mortgagerate';
  const res = await fetch(url, {
    headers: {
      'X-Api-Key': key,
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = (json && (json.error || json.message)) ? String(json.error || json.message) : text || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return pick30YearFixedMortgageRateAnnualPct(json);
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureTable();

    // Fetch the latest mortgage rate from API Ninjas
    const rate = await fetchMortgageRateFromApiNinjas();

    if (rate === null) {
      return NextResponse.json(
        { error: 'Failed to parse mortgage rate from API Ninjas' },
        { status: 502 }
      );
    }

    // Insert the new rate into the database
    await sql`
      INSERT INTO mortgage_rates (rate_type, rate_annual_pct, source, fetched_at, created_at)
      VALUES ('30_year_fixed', ${rate}, 'API Ninjas', NOW(), NOW())
    `;

    return NextResponse.json({
      ok: true,
      rate_annual_pct: rate,
      rate_type: '30_year_fixed',
      source: 'API Ninjas',
      fetched_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('Mortgage rate cron error:', e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
