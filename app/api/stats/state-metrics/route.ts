import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const ALLOWED_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]);

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const rawState = sp.get('state');
    const stateCode = rawState ? rawState.toUpperCase() : null;
    if (!stateCode || !ALLOWED_STATE_CODES.has(stateCode)) {
      return NextResponse.json({ error: 'Invalid state code' }, { status: 400 });
    }

    const year = await getLatestFMRYear();
    const prevYear = year - 1;
    const prev3Year = year - 3;

    // ZIP-level data: for each ZIP, choose SAFMR if required for that year, else county FMR via county_fips.
    // Then compute statewide distributions across ZIPs, by bedroom.
    const result = await sql.query(
      `
      WITH base AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          zcm.state_code,
          zcm.county_fips
        FROM zip_county_mapping zcm
        WHERE zcm.state_code = $1
        ORDER BY zcm.zip_code
      ),
      curr AS (
        SELECT
          b.zip_code,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_0 END, fd.bedroom_0) AS b0,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_1 END, fd.bedroom_1) AS b1,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_2 END, fd.bedroom_2) AS b2,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_3 END, fd.bedroom_3) AS b3,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_4 END, fd.bedroom_4) AS b4
        FROM base b
        LEFT JOIN required_safmr_zips rsz ON b.zip_code = rsz.zip_code AND rsz.year = $2
        LEFT JOIN safmr_data sd ON b.zip_code = sd.zip_code AND sd.year = $2
        LEFT JOIN fmr_data fd ON b.county_fips = fd.county_code AND b.state_code = fd.state_code AND fd.year = $2
      ),
      prev AS (
        SELECT
          b.zip_code,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_0 END, fd.bedroom_0) AS b0,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_1 END, fd.bedroom_1) AS b1,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_2 END, fd.bedroom_2) AS b2,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_3 END, fd.bedroom_3) AS b3,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_4 END, fd.bedroom_4) AS b4
        FROM base b
        LEFT JOIN required_safmr_zips rsz ON b.zip_code = rsz.zip_code AND rsz.year = $3
        LEFT JOIN safmr_data sd ON b.zip_code = sd.zip_code AND sd.year = $3
        LEFT JOIN fmr_data fd ON b.county_fips = fd.county_code AND b.state_code = fd.state_code AND fd.year = $3
      ),
      prev3 AS (
        SELECT
          b.zip_code,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_0 END, fd.bedroom_0) AS b0,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_1 END, fd.bedroom_1) AS b1,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_2 END, fd.bedroom_2) AS b2,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_3 END, fd.bedroom_3) AS b3,
          COALESCE(CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_4 END, fd.bedroom_4) AS b4
        FROM base b
        LEFT JOIN required_safmr_zips rsz ON b.zip_code = rsz.zip_code AND rsz.year = $4
        LEFT JOIN safmr_data sd ON b.zip_code = sd.zip_code AND sd.year = $4
        LEFT JOIN fmr_data fd ON b.county_fips = fd.county_code AND b.state_code = fd.state_code AND fd.year = $4
      ),
      joined AS (
        SELECT
          c.zip_code,
          c.b0 AS c0, c.b1 AS c1, c.b2 AS c2, c.b3 AS c3, c.b4 AS c4,
          p.b0 AS p0, p.b1 AS p1, p.b2 AS p2, p.b3 AS p3, p.b4 AS p4,
          p3.b0 AS p30, p3.b1 AS p31, p3.b2 AS p32, p3.b3 AS p33, p3.b4 AS p34
        FROM curr c
        LEFT JOIN prev p ON c.zip_code = p.zip_code
        LEFT JOIN prev3 p3 ON c.zip_code = p3.zip_code
      ),
      metrics AS (
        SELECT
          -- current medians
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c0) FILTER (WHERE c0 IS NOT NULL AND c0 > 0) AS median_fmr_0,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c1) FILTER (WHERE c1 IS NOT NULL AND c1 > 0) AS median_fmr_1,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c2) FILTER (WHERE c2 IS NOT NULL AND c2 > 0) AS median_fmr_2,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c3) FILTER (WHERE c3 IS NOT NULL AND c3 > 0) AS median_fmr_3,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c4) FILTER (WHERE c4 IS NOT NULL AND c4 > 0) AS median_fmr_4,

          -- current min/max
          MIN(c0) FILTER (WHERE c0 IS NOT NULL AND c0 > 0) AS min_fmr_0,
          MAX(c0) FILTER (WHERE c0 IS NOT NULL AND c0 > 0) AS max_fmr_0,
          MIN(c1) FILTER (WHERE c1 IS NOT NULL AND c1 > 0) AS min_fmr_1,
          MAX(c1) FILTER (WHERE c1 IS NOT NULL AND c1 > 0) AS max_fmr_1,
          MIN(c2) FILTER (WHERE c2 IS NOT NULL AND c2 > 0) AS min_fmr_2,
          MAX(c2) FILTER (WHERE c2 IS NOT NULL AND c2 > 0) AS max_fmr_2,
          MIN(c3) FILTER (WHERE c3 IS NOT NULL AND c3 > 0) AS min_fmr_3,
          MAX(c3) FILTER (WHERE c3 IS NOT NULL AND c3 > 0) AS max_fmr_3,
          MIN(c4) FILTER (WHERE c4 IS NOT NULL AND c4 > 0) AS min_fmr_4,
          MAX(c4) FILTER (WHERE c4 IS NOT NULL AND c4 > 0) AS max_fmr_4,

          -- rent curve (median of per-ZIP deltas / ratios)
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (c2 - c1)) FILTER (WHERE c1 IS NOT NULL AND c2 IS NOT NULL AND c1 > 0 AND c2 > 0) AS median_inc_1_to_2,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (c3 - c2)) FILTER (WHERE c2 IS NOT NULL AND c3 IS NOT NULL AND c2 > 0 AND c3 > 0) AS median_inc_2_to_3,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (c4 - c3)) FILTER (WHERE c3 IS NOT NULL AND c4 IS NOT NULL AND c3 > 0 AND c4 > 0) AS median_inc_3_to_4,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (c4 / NULLIF(c1, 0))) FILTER (WHERE c1 IS NOT NULL AND c4 IS NOT NULL AND c1 > 0 AND c4 > 0) AS median_compression_4_over_1,

          -- YoY distributions (percent)
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((c0 - p0) / NULLIF(p0, 0) * 100)) FILTER (WHERE c0 IS NOT NULL AND p0 IS NOT NULL AND c0 > 0 AND p0 > 0) AS median_yoy_0,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((c1 - p1) / NULLIF(p1, 0) * 100)) FILTER (WHERE c1 IS NOT NULL AND p1 IS NOT NULL AND c1 > 0 AND p1 > 0) AS median_yoy_1,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((c2 - p2) / NULLIF(p2, 0) * 100)) FILTER (WHERE c2 IS NOT NULL AND p2 IS NOT NULL AND c2 > 0 AND p2 > 0) AS median_yoy_2,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((c3 - p3) / NULLIF(p3, 0) * 100)) FILTER (WHERE c3 IS NOT NULL AND p3 IS NOT NULL AND c3 > 0 AND p3 > 0) AS median_yoy_3,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((c4 - p4) / NULLIF(p4, 0) * 100)) FILTER (WHERE c4 IS NOT NULL AND p4 IS NOT NULL AND c4 > 0 AND p4 > 0) AS median_yoy_4,

          -- YoY quartiles for dispersion
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ((c2 - p2) / NULLIF(p2, 0) * 100)) FILTER (WHERE c2 IS NOT NULL AND p2 IS NOT NULL AND c2 > 0 AND p2 > 0) AS yoy_p25_2,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ((c2 - p2) / NULLIF(p2, 0) * 100)) FILTER (WHERE c2 IS NOT NULL AND p2 IS NOT NULL AND c2 > 0 AND p2 > 0) AS yoy_p75_2,

          -- % positive YoY (by bedroom)
          AVG(CASE WHEN ((c0 - p0) / NULLIF(p0, 0) * 100) > 0 THEN 1 ELSE 0 END) FILTER (WHERE c0 IS NOT NULL AND p0 IS NOT NULL AND c0 > 0 AND p0 > 0) * 100 AS pct_pos_yoy_0,
          AVG(CASE WHEN ((c1 - p1) / NULLIF(p1, 0) * 100) > 0 THEN 1 ELSE 0 END) FILTER (WHERE c1 IS NOT NULL AND p1 IS NOT NULL AND c1 > 0 AND p1 > 0) * 100 AS pct_pos_yoy_1,
          AVG(CASE WHEN ((c2 - p2) / NULLIF(p2, 0) * 100) > 0 THEN 1 ELSE 0 END) FILTER (WHERE c2 IS NOT NULL AND p2 IS NOT NULL AND c2 > 0 AND p2 > 0) * 100 AS pct_pos_yoy_2,
          AVG(CASE WHEN ((c3 - p3) / NULLIF(p3, 0) * 100) > 0 THEN 1 ELSE 0 END) FILTER (WHERE c3 IS NOT NULL AND p3 IS NOT NULL AND c3 > 0 AND p3 > 0) * 100 AS pct_pos_yoy_3,
          AVG(CASE WHEN ((c4 - p4) / NULLIF(p4, 0) * 100) > 0 THEN 1 ELSE 0 END) FILTER (WHERE c4 IS NOT NULL AND p4 IS NOT NULL AND c4 > 0 AND p4 > 0) * 100 AS pct_pos_yoy_4,

          -- Counts with YoY > 5% / 10% (2BR as canonical)
          COUNT(*) FILTER (WHERE c2 IS NOT NULL AND p2 IS NOT NULL AND c2 > 0 AND p2 > 0) AS yoy_n_2,
          COUNT(*) FILTER (WHERE c2 IS NOT NULL AND p2 IS NOT NULL AND c2 > 0 AND p2 > 0 AND ((c2 - p2) / NULLIF(p2, 0) * 100) >= 5) AS yoy_ge_5_2,
          COUNT(*) FILTER (WHERE c2 IS NOT NULL AND p2 IS NOT NULL AND c2 > 0 AND p2 > 0 AND ((c2 - p2) / NULLIF(p2, 0) * 100) >= 10) AS yoy_ge_10_2,

          -- 3-year CAGR medians (percent)
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((POWER((c0 / NULLIF(p30, 0)), 1.0/3.0) - 1) * 100)) FILTER (WHERE c0 IS NOT NULL AND p30 IS NOT NULL AND c0 > 0 AND p30 > 0) AS median_cagr3_0,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((POWER((c1 / NULLIF(p31, 0)), 1.0/3.0) - 1) * 100)) FILTER (WHERE c1 IS NOT NULL AND p31 IS NOT NULL AND c1 > 0 AND p31 > 0) AS median_cagr3_1,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((POWER((c2 / NULLIF(p32, 0)), 1.0/3.0) - 1) * 100)) FILTER (WHERE c2 IS NOT NULL AND p32 IS NOT NULL AND c2 > 0 AND p32 > 0) AS median_cagr3_2,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((POWER((c3 / NULLIF(p33, 0)), 1.0/3.0) - 1) * 100)) FILTER (WHERE c3 IS NOT NULL AND p33 IS NOT NULL AND c3 > 0 AND p33 > 0) AS median_cagr3_3,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ((POWER((c4 / NULLIF(p34, 0)), 1.0/3.0) - 1) * 100)) FILTER (WHERE c4 IS NOT NULL AND p34 IS NOT NULL AND c4 > 0 AND p34 > 0) AS median_cagr3_4
        FROM joined
      )
      SELECT * FROM metrics
      `,
      [stateCode, year, prevYear, prev3Year]
    );

    const row = (result.rows?.[0] || {}) as any;
    const toNum = (v: any) => (v === null || v === undefined ? null : Number(v));

    const byBedroom = [0, 1, 2, 3, 4].map((br) => ({
      br,
      medianFMR: toNum(row[`median_fmr_${br}`]),
      minFMR: toNum(row[`min_fmr_${br}`]),
      maxFMR: toNum(row[`max_fmr_${br}`]),
      medianYoY: toNum(row[`median_yoy_${br}`]),
      medianCAGR3: toNum(row[`median_cagr3_${br}`]),
      pctPositiveYoY: toNum(row[`pct_pos_yoy_${br}`]),
    }));

    const rentCurve = {
      // Median of per-ZIP deltas / ratios (not a ratio-of-medians).
      inc1to2: toNum(row.median_inc_1_to_2),
      inc2to3: toNum(row.median_inc_2_to_3),
      inc3to4: toNum(row.median_inc_3_to_4),
      compression4Over1: toNum(row.median_compression_4_over_1),
    };

    const dispersion2BR = {
      p25YoY: toNum(row.yoy_p25_2),
      p75YoY: toNum(row.yoy_p75_2),
      spread: (toNum(row.yoy_p75_2) !== null && toNum(row.yoy_p25_2) !== null)
        ? (toNum(row.yoy_p75_2)! - toNum(row.yoy_p25_2)!)
        : null,
      n: toNum(row.yoy_n_2),
      nGe5: toNum(row.yoy_ge_5_2),
      nGe10: toNum(row.yoy_ge_10_2),
    };

    return NextResponse.json({
      stateCode,
      year,
      prevYear,
      prev3Year,
      byBedroom,
      rentCurve,
      dispersion2BR,
    });
  } catch (e) {
    console.error('Error fetching state metrics:', e);
    return NextResponse.json({ error: 'Failed to fetch state metrics' }, { status: 500 });
  }
}


