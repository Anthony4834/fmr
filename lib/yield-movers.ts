/**
 * Yield Movers: rent vs price divergence metrics.
 * Computes FMR YoY, ZHVI YoY, yield delta, and divergence for ZIP/city/county.
 * Used by /api/stats/insights-yield-movers and /api/stats/insights-screener.
 */

import { sql } from '@vercel/postgres';

export type YieldMoversGeoType = 'zip' | 'city' | 'county';

export interface YieldMoversFilters {
  stateCode?: string | null;
  bedroomSize: number; // 1-4 for Yield Movers (0BR disallowed in v1; maps to ZHVI 1)
}

export interface YieldMoverBaseRow {
  geoKey: string;
  zipCode?: string;
  cityName?: string;
  areaName?: string;
  stateCode: string;
  countyName?: string;
  fmrCurr: number;
  fmrPrev: number;
  fmrYoy: number;
  zhviCurr: number;
  zhviPrev: number;
  zhviYoy: number;
  zhviBedroomUsed: number;
  annualRentCurr: number;
  annualRentPrev: number;
  yieldCurr: number;
  yieldPrior: number;
  yieldDeltaPp: number;
  divergencePp: number;
  zipCount?: number;
}

export interface DataCoverage {
  totalGeos: number;
  geosWithFmr: number;
  geosWithZhviCurrPrev: number;
  geosUsed: number;
}

export interface ComputeYieldMoversBaseDataResult {
  rows: YieldMoverBaseRow[];
  zhviAsOfMonth: string;
  dataCoverage: DataCoverage;
}

/** FMR bedroom 0-4 -> ZHVI bedroom 1-5. 0BR and 1BR both use ZHVI 1. */
function fmrToZhviBedroom(fmrBr: number): number {
  if (fmrBr <= 1) return 1;
  return Math.min(fmrBr, 5);
}

/** Format date to YYYY-MM-DD */
function formatMonth(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Subtract 12 months from a date string YYYY-MM-DD */
function subtract12Months(monthStr: string): string {
  const d = new Date(monthStr);
  d.setUTCMonth(d.getUTCMonth() - 12);
  return formatMonth(d);
}

const VALID_US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

/**
 * Compute base data for Yield Movers: per-geo FMR YoY, ZHVI YoY, yield delta, divergence.
 * FMR is monthly; annualRent = fmr * 12. yieldCurr/yieldPrior are fractions (0.072).
 * yieldDeltaPp and divergencePp are in percentage points.
 */
export async function computeYieldMoversBaseData(opts: {
  year: number;
  type: YieldMoversGeoType;
  filters: YieldMoversFilters;
}): Promise<ComputeYieldMoversBaseDataResult> {
  const { year, type, filters } = opts;
  const { stateCode = null, bedroomSize } = filters;

  // v1: disallow 0BR for Yield Movers to avoid 0BR/1BR similarity (both use ZHVI 1)
  const br = Math.max(1, Math.min(4, Math.floor(bedroomSize)));
  const zhviBr = fmrToZhviBedroom(br);
  const prevYear = year - 1;

  // 1. Get zhviAsOfMonth (one per request, reused for all geos)
  const asOfResult = await sql`
    SELECT MAX(month) as max_month
    FROM zhvi_zip_bedroom_monthly
    WHERE bedroom_count = ${zhviBr}
      AND zhvi IS NOT NULL
      AND zhvi > 0
  `;
  const asOfRaw = asOfResult.rows[0]?.max_month;
  if (!asOfRaw) {
    return {
      rows: [],
      zhviAsOfMonth: '',
      dataCoverage: { totalGeos: 0, geosWithFmr: 0, geosWithZhviCurrPrev: 0, geosUsed: 0 },
    };
  }
  const zhviAsOfMonth = formatMonth(new Date(asOfRaw));
  const zhviAsOfPrevMonth = subtract12Months(zhviAsOfMonth);

  const stateFilterClause =
    stateCode && VALID_US_STATES.includes(stateCode.toUpperCase())
      ? 'AND zcm.state_code = $6'
      : "AND zcm.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')";

  if (type === 'zip') {
    return computeZipBaseData({
      year,
      prevYear,
      br,
      zhviBr,
      zhviAsOfMonth,
      zhviAsOfPrevMonth,
      stateCode,
      stateFilterClause,
    });
  }

  if (type === 'city') {
    return computeCityBaseData({
      year,
      prevYear,
      br,
      zhviBr,
      zhviAsOfMonth,
      zhviAsOfPrevMonth,
      stateCode,
    });
  }

  return computeCountyBaseData({
    year,
    prevYear,
    br,
    zhviBr,
    zhviAsOfMonth,
    zhviAsOfPrevMonth,
    stateCode,
  });
}

async function computeZipBaseData(opts: {
  year: number;
  prevYear: number;
  br: number;
  zhviBr: number;
  zhviAsOfMonth: string;
  zhviAsOfPrevMonth: string;
  stateCode: string | null;
  stateFilterClause: string;
}): Promise<ComputeYieldMoversBaseDataResult> {
  const { year, prevYear, br, zhviBr, zhviAsOfMonth, zhviAsOfPrevMonth, stateCode, stateFilterClause } = opts;

  const zipQuery = `
    WITH zip_fmr_curr AS (
      SELECT DISTINCT ON (zcm.zip_code)
        zcm.zip_code,
        zcm.county_name,
        zcm.state_code,
        c.city_name,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0 ELSE fd.bedroom_0 END as bedroom_0,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1 ELSE fd.bedroom_1 END as bedroom_1,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2 ELSE fd.bedroom_2 END as bedroom_2,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3 ELSE fd.bedroom_3 END as bedroom_3,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4 ELSE fd.bedroom_4 END as bedroom_4
      FROM zip_county_mapping zcm
      LEFT JOIN required_safmr_zips rsz ON zcm.zip_code = rsz.zip_code AND rsz.year = $1
      LEFT JOIN safmr_data sd ON zcm.zip_code = sd.zip_code AND sd.year = $1
      LEFT JOIN fmr_data fd ON zcm.county_fips = fd.county_code AND zcm.state_code = fd.state_code AND fd.year = $1
      LEFT JOIN cities c ON zcm.zip_code = ANY(c.zip_codes) AND zcm.state_code = c.state_code
      WHERE 1=1 ${stateFilterClause}
      ORDER BY zcm.zip_code, zcm.county_name
    ),
    zip_fmr_prev AS (
      SELECT DISTINCT ON (zcm.zip_code)
        zcm.zip_code,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0 ELSE fd.bedroom_0 END as prev_0,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1 ELSE fd.bedroom_1 END as prev_1,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2 ELSE fd.bedroom_2 END as prev_2,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3 ELSE fd.bedroom_3 END as prev_3,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4 ELSE fd.bedroom_4 END as prev_4
      FROM zip_county_mapping zcm
      LEFT JOIN required_safmr_zips rsz ON zcm.zip_code = rsz.zip_code AND rsz.year = $2
      LEFT JOIN safmr_data sd ON zcm.zip_code = sd.zip_code AND sd.year = $2
      LEFT JOIN fmr_data fd ON zcm.county_fips = fd.county_code AND zcm.state_code = fd.state_code AND fd.year = $2
      WHERE 1=1 ${stateFilterClause}
      ORDER BY zcm.zip_code, zcm.county_name
    ),
    zhvi_curr AS (
      SELECT zip_code, zhvi FROM zhvi_zip_bedroom_monthly
      WHERE month = $3::date AND bedroom_count = $4 AND zhvi IS NOT NULL AND zhvi > 0
    ),
    zhvi_prev AS (
      SELECT zip_code, zhvi FROM zhvi_zip_bedroom_monthly
      WHERE month = $5::date AND bedroom_count = $4 AND zhvi IS NOT NULL AND zhvi > 0
    ),
    combined AS (
      SELECT curr.zip_code, curr.county_name, curr.state_code, curr.city_name,
        curr.bedroom_0, curr.bedroom_1, curr.bedroom_2, curr.bedroom_3, curr.bedroom_4,
        prev.prev_0, prev.prev_1, prev.prev_2, prev.prev_3, prev.prev_4,
        zc.zhvi as zhvi_curr, zp.zhvi as zhvi_prev
      FROM zip_fmr_curr curr
      INNER JOIN zip_fmr_prev prev ON curr.zip_code = prev.zip_code
      INNER JOIN zhvi_curr zc ON curr.zip_code = zc.zip_code
      INNER JOIN zhvi_prev zp ON curr.zip_code = zp.zip_code
    )
    SELECT zip_code as geo_key, county_name, state_code, city_name,
      bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
      prev_0, prev_1, prev_2, prev_3, prev_4, zhvi_curr, zhvi_prev
    FROM combined
  `;
  const zipParams = stateCode
    ? [year, prevYear, zhviAsOfMonth, zhviBr, zhviAsOfPrevMonth, stateCode]
    : [year, prevYear, zhviAsOfMonth, zhviBr, zhviAsOfPrevMonth];
  const rows = await sql.query(zipQuery, zipParams);

  const brIdx = br as 0 | 1 | 2 | 3 | 4;
  const currCol = `bedroom_${brIdx}` as keyof (typeof rows.rows)[0];
  const prevCol = `prev_${brIdx}` as keyof (typeof rows.rows)[0];

  const allRows = (rows.rows as any[]).map((r) => {
    const fmrCurr = parseFloat(r[currCol]) || 0;
    const fmrPrev = parseFloat(r[prevCol]) || 0;
    const zhviCurr = parseFloat(r.zhvi_curr) || 0;
    const zhviPrev = parseFloat(r.zhvi_prev) || 0;
    if (fmrCurr <= 0 || fmrPrev <= 0 || zhviCurr <= 0 || zhviPrev <= 0) return null;

    const fmrYoy = ((fmrCurr - fmrPrev) / fmrPrev) * 100;
    const zhviYoy = ((zhviCurr - zhviPrev) / zhviPrev) * 100;
    const annualRentCurr = fmrCurr * 12;
    const annualRentPrev = fmrPrev * 12;
    const yieldCurr = annualRentCurr / zhviCurr;
    const yieldPrior = annualRentPrev / zhviPrev;
    const yieldDeltaPp = (yieldCurr - yieldPrior) * 100;
    const divergencePp = fmrYoy - zhviYoy;

    return {
      geoKey: String(r.geo_key),
      zipCode: String(r.geo_key),
      cityName: r.city_name ? String(r.city_name) : undefined,
      areaName: undefined,
      stateCode: String(r.state_code),
      countyName: r.county_name ? String(r.county_name) : undefined,
      fmrCurr,
      fmrPrev,
      fmrYoy,
      zhviCurr,
      zhviPrev,
      zhviYoy,
      zhviBedroomUsed: zhviBr,
      annualRentCurr,
      annualRentPrev,
      yieldCurr,
      yieldPrior,
      yieldDeltaPp,
      divergencePp,
    } as YieldMoverBaseRow;
  });

  const validRows = allRows.filter((r): r is YieldMoverBaseRow => r !== null);

  const geosWithFmrQuery = stateCode
    ? `SELECT COUNT(DISTINCT zcm.zip_code) as cnt FROM zip_county_mapping zcm
       WHERE zcm.state_code = $3 AND (EXISTS (SELECT 1 FROM required_safmr_zips rsz WHERE rsz.zip_code = zcm.zip_code AND rsz.year IN ($1, $2))
         OR EXISTS (SELECT 1 FROM safmr_data sd WHERE sd.zip_code = zcm.zip_code AND sd.year IN ($1, $2))
         OR EXISTS (SELECT 1 FROM fmr_data fd WHERE fd.county_code = zcm.county_fips AND fd.state_code = zcm.state_code AND fd.year IN ($1, $2)))`
    : `SELECT COUNT(DISTINCT zcm.zip_code) as cnt FROM zip_county_mapping zcm
       WHERE zcm.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS') AND (EXISTS (SELECT 1 FROM required_safmr_zips rsz WHERE rsz.zip_code = zcm.zip_code AND rsz.year IN ($1, $2))
         OR EXISTS (SELECT 1 FROM safmr_data sd WHERE sd.zip_code = zcm.zip_code AND sd.year IN ($1, $2))
         OR EXISTS (SELECT 1 FROM fmr_data fd WHERE fd.county_code = zcm.county_fips AND fd.state_code = zcm.state_code AND fd.year IN ($1, $2)))`;
  const geosWithFmrParams = stateCode ? [year, prevYear, stateCode] : [year, prevYear];
  const geosWithFmrResult = await sql.query(geosWithFmrQuery, geosWithFmrParams);
  const geosWithFmr = Number(geosWithFmrResult.rows[0]?.cnt) || 0;

  const geosWithZhviQuery = stateCode
    ? `SELECT COUNT(DISTINCT z.zip_code) as cnt FROM zhvi_zip_bedroom_monthly z
       WHERE z.bedroom_count = $1 AND z.zhvi IS NOT NULL AND z.zhvi > 0
       AND z.month IN ($2::date, $3::date) AND z.state_code = $4`
    : `SELECT COUNT(DISTINCT z.zip_code) as cnt FROM zhvi_zip_bedroom_monthly z
       WHERE z.bedroom_count = $1 AND z.zhvi IS NOT NULL AND z.zhvi > 0
       AND z.month IN ($2::date, $3::date) AND z.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')`;
  const geosWithZhviParams = stateCode
    ? [zhviBr, zhviAsOfMonth, zhviAsOfPrevMonth, stateCode]
    : [zhviBr, zhviAsOfMonth, zhviAsOfPrevMonth];
  const geosWithZhviResult = await sql.query(geosWithZhviQuery, geosWithZhviParams);
  const geosWithZhviCurrPrev = Number(geosWithZhviResult.rows[0]?.cnt) || 0;

  const totalGeosQuery = stateCode
    ? `SELECT COUNT(DISTINCT zip_code) as cnt FROM zip_county_mapping WHERE state_code = $1`
    : `SELECT COUNT(DISTINCT zip_code) as cnt FROM zip_county_mapping WHERE state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')`;
  const totalGeosParams = stateCode ? [stateCode] : [];
  const totalGeosResult = await sql.query(totalGeosQuery, totalGeosParams);
  const totalGeos = Number(totalGeosResult.rows[0]?.cnt) || 0;

  return {
    rows: validRows,
    zhviAsOfMonth,
    dataCoverage: {
      totalGeos,
      geosWithFmr,
      geosWithZhviCurrPrev,
      geosUsed: validRows.length,
    },
  };
}

async function computeCityBaseData(opts: {
  year: number;
  prevYear: number;
  br: number;
  zhviBr: number;
  zhviAsOfMonth: string;
  zhviAsOfPrevMonth: string;
  stateCode: string | null;
}): Promise<ComputeYieldMoversBaseDataResult> {
  const { year, prevYear, br, zhviBr, zhviAsOfMonth, zhviAsOfPrevMonth, stateCode } = opts;

  const effectiveStates = stateCode ? [stateCode] : VALID_US_STATES;
  // Inline state list as literals to avoid 51 params (Neon 42P18 with many params). Safe: VALID_US_STATES are fixed 2-letter codes.
  const stateList = effectiveStates.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');

  // Aggregate FMR and ZHVI at city level (median for ZHVI, consistent with Explorer)
  // Params: $1=year, $2=prevYear, $3=zhviAsOfMonth, $4=zhviBr, $5=zhviAsOfPrevMonth. Cast for Neon 42P18.
  const rows = await sql.query(
    `
    WITH zip_fmr_curr AS (
      SELECT DISTINCT ON (zcm.zip_code)
        zcm.zip_code,
        zcm.state_code,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0 ELSE fd.bedroom_0 END as bedroom_0,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1 ELSE fd.bedroom_1 END as bedroom_1,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2 ELSE fd.bedroom_2 END as bedroom_2,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3 ELSE fd.bedroom_3 END as bedroom_3,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4 ELSE fd.bedroom_4 END as bedroom_4
      FROM zip_county_mapping zcm
      LEFT JOIN required_safmr_zips rsz ON zcm.zip_code = rsz.zip_code AND rsz.year = CAST($1 AS integer)
      LEFT JOIN safmr_data sd ON zcm.zip_code = sd.zip_code AND sd.year = CAST($1 AS integer)
      LEFT JOIN fmr_data fd ON zcm.county_fips = fd.county_code AND zcm.state_code = fd.state_code AND fd.year = CAST($1 AS integer)
      WHERE zcm.state_code IN (${stateList})
      ORDER BY zcm.zip_code, zcm.county_name
    ),
    zip_fmr_prev AS (
      SELECT DISTINCT ON (zcm.zip_code)
        zcm.zip_code,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0 ELSE fd.bedroom_0 END as prev_0,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1 ELSE fd.bedroom_1 END as prev_1,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2 ELSE fd.bedroom_2 END as prev_2,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3 ELSE fd.bedroom_3 END as prev_3,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4 ELSE fd.bedroom_4 END as prev_4
      FROM zip_county_mapping zcm
      LEFT JOIN required_safmr_zips rsz ON zcm.zip_code = rsz.zip_code AND rsz.year = CAST($2 AS integer)
      LEFT JOIN safmr_data sd ON zcm.zip_code = sd.zip_code AND sd.year = CAST($2 AS integer)
      LEFT JOIN fmr_data fd ON zcm.county_fips = fd.county_code AND zcm.state_code = fd.state_code AND fd.year = CAST($2 AS integer)
      WHERE zcm.state_code IN (${stateList})
      ORDER BY zcm.zip_code, zcm.county_name
    ),
    city_fmr_curr AS (
      SELECT 
        zcm.city_name,
        zcm.state_code,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_0) as bedroom_0,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_1) as bedroom_1,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_2) as bedroom_2,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_3) as bedroom_3,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_4) as bedroom_4,
        COUNT(DISTINCT zcm.zip_code) as zip_count
      FROM zip_city_mapping zcm
      JOIN zip_fmr_curr zfd ON zfd.zip_code = zcm.zip_code
      WHERE zcm.state_code IN (${stateList})
        AND zcm.city_name NOT ILIKE '% County' AND zcm.city_name NOT ILIKE '% Parish' AND zcm.city_name NOT ILIKE '% Borough'
      GROUP BY zcm.city_name, zcm.state_code
    ),
    city_fmr_prev AS (
      SELECT 
        zcm.city_name,
        zcm.state_code,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_0) as prev_0,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_1) as prev_1,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_2) as prev_2,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_3) as prev_3,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_4) as prev_4
      FROM zip_city_mapping zcm
      JOIN zip_fmr_prev zfd ON zfd.zip_code = zcm.zip_code
      WHERE zcm.state_code IN (${stateList})
        AND zcm.city_name NOT ILIKE '% County' AND zcm.city_name NOT ILIKE '% Parish' AND zcm.city_name NOT ILIKE '% Borough'
      GROUP BY zcm.city_name, zcm.state_code
    ),
    city_zhvi_curr AS (
      SELECT 
        zcm.city_name,
        zcm.state_code,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY z.zhvi) as zhvi_median
      FROM zhvi_zip_bedroom_monthly z
      JOIN zip_city_mapping zcm ON zcm.zip_code = z.zip_code
      WHERE z.month = CAST($3 AS date) AND z.bedroom_count = CAST($4 AS integer) AND z.zhvi IS NOT NULL AND z.zhvi > 0
        AND zcm.state_code IN (${stateList})
      GROUP BY zcm.city_name, zcm.state_code
    ),
    city_zhvi_prev AS (
      SELECT 
        zcm.city_name,
        zcm.state_code,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY z.zhvi) as zhvi_median
      FROM zhvi_zip_bedroom_monthly z
      JOIN zip_city_mapping zcm ON zcm.zip_code = z.zip_code
      WHERE z.month = CAST($5 AS date) AND z.bedroom_count = CAST($4 AS integer) AND z.zhvi IS NOT NULL AND z.zhvi > 0
        AND zcm.state_code IN (${stateList})
      GROUP BY zcm.city_name, zcm.state_code
    ),
    combined AS (
      SELECT 
        c.city_name,
        c.state_code,
        c.zip_count,
        c.bedroom_0, c.bedroom_1, c.bedroom_2, c.bedroom_3, c.bedroom_4,
        p.prev_0, p.prev_1, p.prev_2, p.prev_3, p.prev_4,
        zc.zhvi_median as zhvi_curr,
        zp.zhvi_median as zhvi_prev
      FROM city_fmr_curr c
      INNER JOIN city_fmr_prev p ON c.city_name = p.city_name AND c.state_code = p.state_code
      INNER JOIN city_zhvi_curr zc ON c.city_name = zc.city_name AND c.state_code = zc.state_code
      INNER JOIN city_zhvi_prev zp ON c.city_name = zp.city_name AND c.state_code = zp.state_code
    )
    SELECT 
      (city_name || '|' || state_code) as geo_key,
      city_name,
      state_code,
      zip_count,
      bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
      prev_0, prev_1, prev_2, prev_3, prev_4,
      zhvi_curr,
      zhvi_prev
    FROM combined
  `,
    [year, prevYear, zhviAsOfMonth, zhviBr, zhviAsOfPrevMonth]
  );

  const brIdx = br as 0 | 1 | 2 | 3 | 4;
  const currCol = `bedroom_${brIdx}`;
  const prevCol = `prev_${brIdx}`;

  const validRows = (rows.rows as any[])
    .map((r) => {
      const fmrCurr = parseFloat(r[currCol]) || 0;
      const fmrPrev = parseFloat(r[prevCol]) || 0;
      const zhviCurr = parseFloat(r.zhvi_curr) || 0;
      const zhviPrev = parseFloat(r.zhvi_prev) || 0;
      if (fmrCurr <= 0 || fmrPrev <= 0 || zhviCurr <= 0 || zhviPrev <= 0) return null;

      const fmrYoy = ((fmrCurr - fmrPrev) / fmrPrev) * 100;
      const zhviYoy = ((zhviCurr - zhviPrev) / zhviPrev) * 100;
      const annualRentCurr = fmrCurr * 12;
      const annualRentPrev = fmrPrev * 12;
      const yieldCurr = annualRentCurr / zhviCurr;
      const yieldPrior = annualRentPrev / zhviPrev;
      const yieldDeltaPp = (yieldCurr - yieldPrior) * 100;
      const divergencePp = fmrYoy - zhviYoy;

      return {
        geoKey: String(r.geo_key),
        cityName: String(r.city_name),
        stateCode: String(r.state_code),
        zhviBedroomUsed: zhviBr,
        fmrCurr,
        fmrPrev,
        fmrYoy,
        zhviCurr,
        zhviPrev,
        zhviYoy,
        annualRentCurr,
        annualRentPrev,
        yieldCurr,
        yieldPrior,
        yieldDeltaPp,
        divergencePp,
        zipCount: parseInt(r.zip_count) || 0,
      } as YieldMoverBaseRow;
    })
    .filter((r): r is YieldMoverBaseRow => r !== null);

  const totalCities = await sql.query(
    `SELECT COUNT(DISTINCT (city_name, state_code)) as cnt FROM zip_city_mapping WHERE state_code IN (${stateList})`,
    []
  );
  const geosWithFmr = await sql.query(
    `SELECT COUNT(DISTINCT (zcm.city_name, zcm.state_code)) as cnt
     FROM zip_city_mapping zcm
     JOIN zip_county_mapping zcc ON zcc.zip_code = zcm.zip_code AND zcc.state_code = zcm.state_code
     WHERE zcm.state_code IN (${stateList})
       AND (EXISTS (SELECT 1 FROM safmr_data sd WHERE sd.zip_code = zcm.zip_code AND sd.year IN (CAST($1 AS integer), CAST($2 AS integer)))
            OR EXISTS (SELECT 1 FROM fmr_data fd WHERE fd.county_code = zcc.county_fips AND fd.state_code = zcc.state_code AND fd.year IN (CAST($1 AS integer), CAST($2 AS integer))))`,
    [year, prevYear]
  );

  return {
    rows: validRows,
    zhviAsOfMonth,
    dataCoverage: {
      totalGeos: Number(totalCities.rows[0]?.cnt) || 0,
      geosWithFmr: Number(geosWithFmr.rows[0]?.cnt) || 0,
      geosWithZhviCurrPrev: validRows.length,
      geosUsed: validRows.length,
    },
  };
}

async function computeCountyBaseData(opts: {
  year: number;
  prevYear: number;
  br: number;
  zhviBr: number;
  zhviAsOfMonth: string;
  zhviAsOfPrevMonth: string;
  stateCode: string | null;
}): Promise<ComputeYieldMoversBaseDataResult> {
  const { year, prevYear, br, zhviBr, zhviAsOfMonth, zhviAsOfPrevMonth, stateCode } = opts;

  const stateWhereClause =
    stateCode && VALID_US_STATES.includes(stateCode)
      ? `AND zcm.state_code = $6`
      : `AND zcm.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')`;

  // County list from ZIPs: FMR aggregated from constituent ZIPs (safmr or fmr_data by county_fips), ZHVI median from ZIPs
  const countyQuery = `
    WITH zip_fmr_curr AS (
      SELECT DISTINCT ON (zcm.zip_code)
        zcm.zip_code,
        zcm.county_name,
        zcm.state_code,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0 ELSE fd.bedroom_0 END as bedroom_0,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1 ELSE fd.bedroom_1 END as bedroom_1,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2 ELSE fd.bedroom_2 END as bedroom_2,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3 ELSE fd.bedroom_3 END as bedroom_3,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4 ELSE fd.bedroom_4 END as bedroom_4
      FROM zip_county_mapping zcm
      LEFT JOIN required_safmr_zips rsz ON zcm.zip_code = rsz.zip_code AND rsz.year = $1
      LEFT JOIN safmr_data sd ON zcm.zip_code = sd.zip_code AND sd.year = $1
      LEFT JOIN fmr_data fd ON zcm.county_fips = fd.county_code AND zcm.state_code = fd.state_code AND fd.year = $1
      WHERE 1=1 ${stateWhereClause}
      ORDER BY zcm.zip_code, zcm.county_name
    ),
    zip_fmr_prev AS (
      SELECT DISTINCT ON (zcm.zip_code)
        zcm.zip_code,
        zcm.county_name,
        zcm.state_code,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0 ELSE fd.bedroom_0 END as prev_0,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1 ELSE fd.bedroom_1 END as prev_1,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2 ELSE fd.bedroom_2 END as prev_2,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3 ELSE fd.bedroom_3 END as prev_3,
        CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4 ELSE fd.bedroom_4 END as prev_4
      FROM zip_county_mapping zcm
      LEFT JOIN required_safmr_zips rsz ON zcm.zip_code = rsz.zip_code AND rsz.year = $2
      LEFT JOIN safmr_data sd ON zcm.zip_code = sd.zip_code AND sd.year = $2
      LEFT JOIN fmr_data fd ON zcm.county_fips = fd.county_code AND zcm.state_code = fd.state_code AND fd.year = $2
      WHERE 1=1 ${stateWhereClause}
      ORDER BY zcm.zip_code, zcm.county_name
    ),
    county_fmr_curr AS (
      SELECT
        zfd.county_name,
        zfd.state_code,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_0) as bedroom_0,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_1) as bedroom_1,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_2) as bedroom_2,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_3) as bedroom_3,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.bedroom_4) as bedroom_4,
        COUNT(DISTINCT zfd.zip_code)::integer as zip_count
      FROM zip_fmr_curr zfd
      WHERE zfd.bedroom_0 IS NOT NULL OR zfd.bedroom_1 IS NOT NULL OR zfd.bedroom_2 IS NOT NULL OR zfd.bedroom_3 IS NOT NULL OR zfd.bedroom_4 IS NOT NULL
      GROUP BY zfd.county_name, zfd.state_code
    ),
    county_fmr_prev AS (
      SELECT
        zfd.county_name,
        zfd.state_code,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_0) as prev_0,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_1) as prev_1,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_2) as prev_2,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_3) as prev_3,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY zfd.prev_4) as prev_4
      FROM zip_fmr_prev zfd
      WHERE zfd.prev_0 IS NOT NULL OR zfd.prev_1 IS NOT NULL OR zfd.prev_2 IS NOT NULL OR zfd.prev_3 IS NOT NULL OR zfd.prev_4 IS NOT NULL
      GROUP BY zfd.county_name, zfd.state_code
    ),
    rep AS (
      SELECT DISTINCT ON (zcm.zip_code) zcm.zip_code, zcm.county_name, zcm.county_fips, zcm.state_code
      FROM zip_county_mapping zcm
      WHERE 1=1 ${stateWhereClause}
      ORDER BY zcm.zip_code, zcm.county_fips NULLS LAST, zcm.county_name
    ),
    county_zhvi_curr AS (
      SELECT rep.county_name, rep.county_fips, rep.state_code,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY z.zhvi) as zhvi_median
      FROM rep
      JOIN zhvi_zip_bedroom_monthly z ON z.zip_code = rep.zip_code
      WHERE z.month = $3::date AND z.bedroom_count = $4 AND z.zhvi IS NOT NULL AND z.zhvi > 0
      GROUP BY rep.county_name, rep.county_fips, rep.state_code
    ),
    county_zhvi_prev AS (
      SELECT rep.county_name, rep.county_fips, rep.state_code,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY z.zhvi) as zhvi_median
      FROM rep
      JOIN zhvi_zip_bedroom_monthly z ON z.zip_code = rep.zip_code
      WHERE z.month = $5::date AND z.bedroom_count = $4 AND z.zhvi IS NOT NULL AND z.zhvi > 0
      GROUP BY rep.county_name, rep.county_fips, rep.state_code
    ),
    combined AS (
      SELECT
        c.county_name,
        c.state_code,
        c.zip_count,
        c.bedroom_0, c.bedroom_1, c.bedroom_2, c.bedroom_3, c.bedroom_4,
        p.prev_0, p.prev_1, p.prev_2, p.prev_3, p.prev_4,
        zc.zhvi_median as zhvi_curr,
        zp.zhvi_median as zhvi_prev
      FROM county_fmr_curr c
      INNER JOIN county_fmr_prev p ON c.county_name = p.county_name AND c.state_code = p.state_code
      INNER JOIN county_zhvi_curr zc ON c.county_name = zc.county_name AND c.state_code = zc.state_code
      INNER JOIN county_zhvi_prev zp ON c.county_name = zp.county_name AND c.state_code = zp.state_code
    )
    SELECT
      (county_name || '|' || state_code) as geo_key,
      county_name as area_name,
      state_code,
      zip_count,
      bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
      prev_0, prev_1, prev_2, prev_3, prev_4,
      zhvi_curr,
      zhvi_prev
    FROM combined
  `;

  const countyParams =
    stateCode && VALID_US_STATES.includes(stateCode)
      ? [year, prevYear, zhviAsOfMonth, zhviBr, zhviAsOfPrevMonth, stateCode]
      : [year, prevYear, zhviAsOfMonth, zhviBr, zhviAsOfPrevMonth];

  const rows = await sql.query(countyQuery, countyParams);

  const brIdx = br as 0 | 1 | 2 | 3 | 4;
  const currCol = `bedroom_${brIdx}`;
  const prevCol = `prev_${brIdx}`;

  const validRows = (rows.rows as any[])
    .map((r) => {
      const fmrCurr = parseFloat(r[currCol]) || 0;
      const fmrPrev = parseFloat(r[prevCol]) || 0;
      const zhviCurr = parseFloat(r.zhvi_curr) || 0;
      const zhviPrev = parseFloat(r.zhvi_prev) || 0;
      if (fmrCurr <= 0 || fmrPrev <= 0 || zhviCurr <= 0 || zhviPrev <= 0) return null;

      const fmrYoy = ((fmrCurr - fmrPrev) / fmrPrev) * 100;
      const zhviYoy = ((zhviCurr - zhviPrev) / zhviPrev) * 100;
      const annualRentCurr = fmrCurr * 12;
      const annualRentPrev = fmrPrev * 12;
      const yieldCurr = annualRentCurr / zhviCurr;
      const yieldPrior = annualRentPrev / zhviPrev;
      const yieldDeltaPp = (yieldCurr - yieldPrior) * 100;
      const divergencePp = fmrYoy - zhviYoy;

      return {
        geoKey: String(r.geo_key),
        areaName: String(r.area_name),
        countyName: String(r.area_name),
        stateCode: String(r.state_code),
        zhviBedroomUsed: zhviBr,
        fmrCurr,
        fmrPrev,
        fmrYoy,
        zhviCurr,
        zhviPrev,
        zhviYoy,
        annualRentCurr,
        annualRentPrev,
        yieldCurr,
        yieldPrior,
        yieldDeltaPp,
        divergencePp,
        zipCount: r.zip_count != null ? Number(r.zip_count) : undefined,
      } as YieldMoverBaseRow;
    })
    .filter((r): r is YieldMoverBaseRow => r !== null);

  const totalGeosQuery =
    stateCode && VALID_US_STATES.includes(stateCode)
      ? `SELECT COUNT(DISTINCT (county_name, state_code)) as cnt FROM zip_county_mapping WHERE state_code = $1`
      : `SELECT COUNT(DISTINCT (county_name, state_code)) as cnt FROM zip_county_mapping WHERE state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')`;
  const totalGeosParams = stateCode ? [stateCode] : [];
  const totalGeosResult = await sql.query(totalGeosQuery, totalGeosParams);
  const totalGeos = Number(totalGeosResult.rows[0]?.cnt) || 0;

  const geosWithFmrQuery =
    stateCode && VALID_US_STATES.includes(stateCode)
      ? `SELECT COUNT(DISTINCT (zcm.county_name, zcm.state_code)) as cnt
         FROM zip_county_mapping zcm
         WHERE zcm.state_code = $1
           AND (EXISTS (SELECT 1 FROM required_safmr_zips rsz WHERE rsz.zip_code = zcm.zip_code AND rsz.year IN ($2, $3))
             OR EXISTS (SELECT 1 FROM safmr_data sd WHERE sd.zip_code = zcm.zip_code AND sd.year IN ($2, $3))
             OR EXISTS (SELECT 1 FROM fmr_data fd WHERE fd.county_code = zcm.county_fips AND fd.state_code = zcm.state_code AND fd.year IN ($2, $3)))`
      : `SELECT COUNT(DISTINCT (zcm.county_name, zcm.state_code)) as cnt
         FROM zip_county_mapping zcm
         WHERE zcm.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
           AND (EXISTS (SELECT 1 FROM required_safmr_zips rsz WHERE rsz.zip_code = zcm.zip_code AND rsz.year IN ($1, $2))
             OR EXISTS (SELECT 1 FROM safmr_data sd WHERE sd.zip_code = zcm.zip_code AND sd.year IN ($1, $2))
             OR EXISTS (SELECT 1 FROM fmr_data fd WHERE fd.county_code = zcm.county_fips AND fd.state_code = zcm.state_code AND fd.year IN ($1, $2)))`;
  const geosWithFmrParams = stateCode ? [stateCode, year, prevYear] : [year, prevYear];
  const geosWithFmrResult = await sql.query(geosWithFmrQuery, geosWithFmrParams);
  const geosWithFmr = Number(geosWithFmrResult.rows[0]?.cnt) || 0;

  return {
    rows: validRows,
    zhviAsOfMonth,
    dataCoverage: {
      totalGeos,
      geosWithFmr,
      geosWithZhviCurrPrev: validRows.length,
      geosUsed: validRows.length,
    },
  };
}
