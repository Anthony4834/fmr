import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type MarketParamsResponse = {
  propertyTaxRateAnnualPct: number | null;
  propertyTaxSource: string;
  mortgageRateAnnualPct: number | null;
  mortgageRateSource: string;
  fetchedAt: string;
};

type CacheEntry = { expiresAt: number; value: MarketParamsResponse };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key: string, value: MarketParamsResponse) {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
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

function pickMedianTaxRateAnnualPct(payload: any): number | null {
  // API Ninjas propertytax docs: returns percentiles (25/50/75). Field names vary in the wild.
  // We accept several likely shapes and prefer the median / 50th percentile.
  const arr = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : payload && typeof payload === 'object'
        ? [payload]
        : null;
  if (!arr || arr.length === 0) return null;
  const row = arr[0] ?? null;
  if (!row || typeof row !== 'object') return null;

  // Prefer median-ish fields
  const median =
    firstNumber(row, [
      'median',
      'p50',
      'percentile_50',
      'percentile50',
      'p_50',
      'property_tax_median',
      'effective_tax_rate_median',
      'tax_rate_median',
      'rate_median',
      'median_rate',
    ]) ??
    firstNumber(row, [
      'effective_property_tax_rate',
      'effective_taxrate',
      'property_tax',
      'effective_tax_rate',
      'tax_rate',
      'rate',
    ]);

  // If field names are unknown, attempt a best-effort scan for keys that look like a median.
  const scanned =
    median ??
    (() => {
      for (const [k, v] of Object.entries(row)) {
        if (!/median|p50|50|percentile/i.test(k)) continue;
        const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.\-]/g, ''));
        if (Number.isFinite(n)) return n;
      }
      return null;
    })();

  if (scanned === null) return null;

  // Heuristic: some APIs might return decimals (0.012) vs percent (1.2).
  // If it looks like a decimal rate (<= 0.2), convert to percent.
  if (scanned > 0 && scanned <= 0.2) return scanned * 100;
  return scanned;
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

async function ninjasFetchJson(url: string) {
  const key = process.env.API_NINJAS_KEY || process.env.API_NINJAS_API_KEY;
  if (!key) {
    throw new Error('Missing API_NINJAS_KEY (or API_NINJAS_API_KEY)');
  }
  const res = await fetch(url, {
    headers: {
      'X-Api-Key': key,
      'Accept': 'application/json',
    },
    // Do not cache at fetch layer; we do our own in-memory TTL cache.
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
  return json;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const zip = sp.get('zip')?.trim() || '';
    const county = sp.get('county')?.trim() || '';
    const state = sp.get('state')?.trim().toUpperCase() || '';

    if (!zip && !(county && state)) {
      return NextResponse.json({ error: 'Provide either zip or county+state' }, { status: 400 });
    }
    if (zip && !/^\d{5}$/.test(zip)) {
      return NextResponse.json({ error: 'Invalid zip' }, { status: 400 });
    }
    if (state && !/^[A-Z]{2}$/.test(state)) {
      return NextResponse.json({ error: 'Invalid state' }, { status: 400 });
    }

    const key = zip ? `zip:${zip}` : `county:${county.toLowerCase()}|state:${state}`;
    const cached = cacheGet(key);
    if (cached) return NextResponse.json({ data: cached });

    const taxUrl = zip
      ? `https://api.api-ninjas.com/v1/propertytax?zip=${encodeURIComponent(zip)}`
      : `https://api.api-ninjas.com/v1/propertytax?county=${encodeURIComponent(county)}&state=${encodeURIComponent(state)}`;

    const rateUrl = `https://api.api-ninjas.com/v1/mortgagerate`;

    const [taxJson, rateJson] = await Promise.all([ninjasFetchJson(taxUrl), ninjasFetchJson(rateUrl)]);

    const propertyTaxRateAnnualPct = pickMedianTaxRateAnnualPct(taxJson);
    const mortgageRateAnnualPct = pick30YearFixedMortgageRateAnnualPct(rateJson);

    const out: MarketParamsResponse = {
      propertyTaxRateAnnualPct,
      propertyTaxSource: zip ? `API Ninjas propertytax (zip ${zip}, median)` : `API Ninjas propertytax (county ${county}, ${state}, median)`,
      mortgageRateAnnualPct,
      mortgageRateSource: 'API Ninjas mortgagerate (30-year fixed)',
      fetchedAt: new Date().toISOString(),
    };

    cacheSet(key, out);
    return NextResponse.json({ data: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch market params';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}


