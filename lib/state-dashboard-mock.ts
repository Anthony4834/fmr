import type { StateCode } from '@/lib/states';

export type StateDashboardGranularity = 'county' | 'city' | 'zip';

export type RankedRow = {
  id: string;
  label: string;
  sublabel?: string | null;
  stateCode: StateCode;
  fmr: number; // primary displayed rent (selected BR)
  avgFmr?: number; // optional
  yoyPercent?: number; // optional
  jumpPercent?: number; // optional
};

export type StateDashboardKpis = {
  median: number;
  p25: number;
  p75: number;
  topBottomRatio: number;
  yoyHeadline: number; // a single headline YoY (e.g. median of rows' yoy)
  count: number;
};

export type StateDashboardData = {
  stateCode: StateCode;
  year: number;
  bedroom: 0 | 1 | 2 | 3 | 4;
  granularity: StateDashboardGranularity;
  kpis: StateDashboardKpis;
  top: RankedRow[];
  bottom: RankedRow[];
  rising: RankedRow[];
  falling: RankedRow[];
  jumps: RankedRow[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hashStringToUint32(input: string): number {
  // FNV-1a-ish
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const v = [...values].sort((a, b) => a - b);
  const pos = (v.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (v[base + 1] === undefined) return v[base];
  return v[base] + rest * (v[base + 1] - v[base]);
}

function median(values: number[]): number {
  return quantile(values, 0.5);
}

function formatZip(rand: () => number) {
  // Not geographically correct, just stable/deterministic.
  const n = Math.floor(rand() * 99999);
  return String(n).padStart(5, '0');
}

const COUNTY_WORDS_A = [
  'Pine', 'Cedar', 'Maple', 'Oak', 'River', 'Lake', 'Valley', 'Canyon', 'Prairie', 'Redwood',
  'Summit', 'Silver', 'Golden', 'Eagle', 'Bear', 'Fox', 'Granite', 'Juniper', 'Aspen', 'Willow',
];
const COUNTY_WORDS_B = [
  'Hills', 'Ridge', 'Falls', 'Harbor', 'Plains', 'Heights', 'Meadow', 'Grove', 'Springs', 'Creek',
  'View', 'Crossing', 'Bend', 'Point', 'Field', 'Garden', 'Landing', 'Park', 'Cove', 'Bluff',
];

function makeLabels(granularity: StateDashboardGranularity, count: number, rand: () => number): { id: string; label: string; sublabel?: string | null }[] {
  const out: { id: string; label: string; sublabel?: string | null }[] = [];
  for (let i = 0; i < count; i++) {
    if (granularity === 'zip') {
      const zip = formatZip(rand);
      out.push({ id: `zip:${zip}`, label: zip, sublabel: null });
      continue;
    }
    const a = COUNTY_WORDS_A[Math.floor(rand() * COUNTY_WORDS_A.length)];
    const b = COUNTY_WORDS_B[Math.floor(rand() * COUNTY_WORDS_B.length)];
    if (granularity === 'city') {
      out.push({ id: `city:${a}${b}:${i}`, label: `${a} ${b}`, sublabel: null });
    } else {
      out.push({ id: `county:${a}${b}:${i}`, label: `${a} ${b} County`, sublabel: null });
    }
  }
  return out;
}

function generateRows(opts: {
  stateCode: StateCode;
  year: number;
  bedroom: 0 | 1 | 2 | 3 | 4;
  granularity: StateDashboardGranularity;
}): RankedRow[] {
  const seed = hashStringToUint32(`${opts.stateCode}|${opts.year}|${opts.bedroom}|${opts.granularity}`);
  const rand = mulberry32(seed);

  const baseLevelByBr = [900, 1100, 1400, 1750, 2100][opts.bedroom];
  // Give each state a deterministic “market level” multiplier
  const stateMultiplier = 0.85 + rand() * 0.7; // ~0.85–1.55
  const level = baseLevelByBr * stateMultiplier;

  const count = opts.granularity === 'zip' ? 80 : opts.granularity === 'city' ? 50 : 45;
  const labels = makeLabels(opts.granularity, count, rand);

  const rows: RankedRow[] = labels.map((l, idx) => {
    // Skewed distribution: most clustered, a few high outliers
    const u = rand();
    const skew = u < 0.8 ? (rand() * 0.25) : (0.25 + rand() * 0.9);
    const fmr = Math.round(level * (0.85 + skew));

    // YoY centered around a small positive drift, with tails
    const yoy = (rand() - 0.45) * 18; // approx -8%..+10% typical
    // Jump percent (bedroom step) as another “anomaly” measure
    const jump = 10 + rand() * 55; // 10%..65%

    return {
      id: l.id,
      label: l.label,
      sublabel: l.sublabel,
      stateCode: opts.stateCode,
      fmr,
      avgFmr: Math.round(fmr * (0.92 + rand() * 0.16)),
      yoyPercent: Number(yoy.toFixed(1)),
      jumpPercent: Number(jump.toFixed(1)),
    };
  });

  // Add deterministic “big metro” entries so the list feels realistic
  if (opts.granularity !== 'zip') {
    const boosters = [
      { label: 'Central', bump: 1.55 },
      { label: 'North', bump: 1.25 },
      { label: 'South', bump: 1.18 },
    ];
    boosters.forEach((b, i) => {
      rows[i] = {
        ...rows[i],
        label: opts.granularity === 'county' ? `${b.label} County` : `${b.label} City`,
        id: `${opts.granularity}:${b.label.toLowerCase()}:${opts.stateCode}`,
        fmr: Math.round(rows[i].fmr * b.bump),
        avgFmr: Math.round((rows[i].avgFmr || rows[i].fmr) * (b.bump * 0.98)),
        yoyPercent: Number(clamp((rows[i].yoyPercent || 0) + (i === 0 ? 4 : 1.5), -25, 40).toFixed(1)),
        jumpPercent: Number(clamp((rows[i].jumpPercent || 0) + (i === 0 ? 10 : 4), 5, 120).toFixed(1)),
      };
    });
  }

  return rows;
}

function computeKpis(rows: RankedRow[]): StateDashboardKpis {
  const fmrs = rows.map((r) => r.fmr).filter((n) => Number.isFinite(n));
  const yoy = rows.map((r) => r.yoyPercent ?? 0).filter((n) => Number.isFinite(n));
  const med = Math.round(median(fmrs));
  const p25 = Math.round(quantile(fmrs, 0.25));
  const p75 = Math.round(quantile(fmrs, 0.75));
  const top = Math.max(...fmrs);
  const bottom = Math.max(1, Math.min(...fmrs));
  const topBottomRatio = Number((top / bottom).toFixed(2));
  const yoyHeadline = Number(median(yoy).toFixed(1));
  return { median: med, p25, p75, topBottomRatio, yoyHeadline, count: rows.length };
}

export function getMockStateDashboard(opts: {
  stateCode: StateCode;
  year?: number;
  bedroom?: 0 | 1 | 2 | 3 | 4;
  granularity?: StateDashboardGranularity;
}): StateDashboardData {
  const year = opts.year ?? 2026;
  const bedroom = opts.bedroom ?? 2;
  const granularity = opts.granularity ?? 'county';

  const rows = generateRows({ stateCode: opts.stateCode, year, bedroom, granularity });
  const kpis = computeKpis(rows);

  const top = [...rows].sort((a, b) => b.fmr - a.fmr).slice(0, 50);
  const bottom = [...rows].sort((a, b) => a.fmr - b.fmr).slice(0, 50);
  const rising = [...rows].sort((a, b) => (b.yoyPercent ?? 0) - (a.yoyPercent ?? 0)).slice(0, 50);
  const falling = [...rows].sort((a, b) => (a.yoyPercent ?? 0) - (b.yoyPercent ?? 0)).slice(0, 50);
  const jumps = [...rows].sort((a, b) => (b.jumpPercent ?? 0) - (a.jumpPercent ?? 0)).slice(0, 50);

  return {
    stateCode: opts.stateCode,
    year,
    bedroom,
    granularity,
    kpis,
    top,
    bottom,
    rising,
    falling,
    jumps,
  };
}


