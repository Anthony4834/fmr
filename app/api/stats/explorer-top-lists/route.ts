import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';
import { computeYieldMoversBaseData } from '@/lib/yield-movers';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const LIST_LIMIT = 20;
/** Align with insights-screener: same min ZHVI for FMR/YoY lists */
const MIN_ZHVI = 90_000;

export interface ExplorerTopListItem {
  rank: number;
  zipCode: string;
  cityName: string;
  countyName: string;
  stateCode: string;
  value: number;
  valueLabel: string;
  valueSub?: string;
}

export interface ExplorerTopListsResponse {
  fmrValue: { highest: ExplorerTopListItem[]; lowest: ExplorerTopListItem[] };
  fmrYoy: { increase: ExplorerTopListItem[]; decrease: ExplorerTopListItem[] };
  yieldYoy: { increase: ExplorerTopListItem[]; decrease: ExplorerTopListItem[] };
  /** Top 20 across all BR steps (1→2, 2→3, 3→4) by jump % */
  priceJump: ExplorerTopListItem[];
}

const STATE_EXCLUDE = ['PR', 'GU', 'VI', 'MP', 'AS'];

/** Plain integer, no commas (explorer cash flow style) */
function formatCurrency(value: number): string {
  return String(Math.round(value));
}

/** Map from insights_index / yield-movers row (fmr_curr = monthly) */
function mapFmrRowFromIndex(row: any, rank: number): ExplorerTopListItem {
  const monthlyFmr = row.fmr_curr != null ? Number(row.fmr_curr) : 0;
  return {
    rank,
    zipCode: String(row.zip_code || ''),
    cityName: String(row.city_name || ''),
    countyName: String(row.county_name || ''),
    stateCode: String(row.state_code || ''),
    value: monthlyFmr,
    valueLabel: `$${formatCurrency(monthlyFmr)}`,
  };
}

function mapYoyRow(row: any, rank: number, valueKey: 'fmr_yoy' | 'yield_delta_pp'): ExplorerTopListItem {
  const val = valueKey === 'fmr_yoy' ? Number(row.fmr_yoy) : Number(row.yield_delta_pp);
  const isPct = valueKey === 'fmr_yoy';
  return {
    rank,
    zipCode: String(row.zip_code || ''),
    cityName: String(row.city_name || ''),
    countyName: String(row.county_name || ''),
    stateCode: String(row.state_code || ''),
    value: val,
    valueLabel: isPct ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`,
  };
}

function mapPriceJumpRow(row: any, rank: number, stepLabel?: string): ExplorerTopListItem {
  const pct = Number(row.jump_pct);
  const amount = row.jump_amount != null ? Number(row.jump_amount) : null;
  let valueSub: string | undefined;
  if (amount != null && !isNaN(amount)) {
    valueSub = `$${formatCurrency(amount)}`;
    if (stepLabel) valueSub += ` · ${stepLabel}`;
  } else if (stepLabel) {
    valueSub = stepLabel;
  }
  return {
    rank,
    zipCode: String(row.zip_code || ''),
    cityName: String(row.city_name || ''),
    countyName: String(row.county_name || ''),
    stateCode: String(row.state_code || ''),
    value: pct,
    valueLabel: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    valueSub,
  };
}

export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();
    const stateParam = req.nextUrl.searchParams.get('state')?.trim().toUpperCase() || null;
    const stateFilter =
      stateParam && stateParam.length === 2 && !STATE_EXCLUDE.includes(stateParam) ? stateParam : null;

    const minPriceParam = req.nextUrl.searchParams.get('min_price');
    const maxPriceParam = req.nextUrl.searchParams.get('max_price');
    const minYieldParam = req.nextUrl.searchParams.get('min_yield');
    const minPrice = minPriceParam != null && minPriceParam !== '' ? parseFloat(minPriceParam) : NaN;
    const maxPrice = maxPriceParam != null && maxPriceParam !== '' ? parseFloat(maxPriceParam) : NaN;
    const minYieldPct = minYieldParam != null && minYieldParam !== '' ? parseFloat(minYieldParam) : NaN;

    type IndexRow = {
      zip_code: string | null;
      state_code: string;
      city_name: string | null;
      county_name: string | null;
      fmr_curr: number;
      fmr_yoy: number;
      zhvi_curr: number;
      yield_curr: number;
      yield_delta_pp: number;
    };

    let rows: IndexRow[] = [];

    try {
      const hasIndex = await sql`SELECT 1 FROM insights_index WHERE geo_type = 'zip' LIMIT 1`;
      if (hasIndex.rows.length > 0) {
        const indexQuery = stateFilter
          ? sql`
              SELECT zip_code, state_code, city_name, county_name,
                     fmr_curr, fmr_yoy, zhvi_curr, yield_curr, yield_delta_pp
              FROM insights_index
              WHERE geo_type = 'zip' AND zhvi_curr >= ${MIN_ZHVI} AND state_code = ${stateFilter} AND fmr_year = ${year}
            `
          : sql`
              SELECT zip_code, state_code, city_name, county_name,
                     fmr_curr, fmr_yoy, zhvi_curr, yield_curr, yield_delta_pp
              FROM insights_index
              WHERE geo_type = 'zip' AND zhvi_curr >= ${MIN_ZHVI} AND fmr_year = ${year}
                AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            `;
        const indexResult = await indexQuery;
        rows = (indexResult.rows || []) as IndexRow[];
      }

      if (rows.length === 0) {
        const ym = await computeYieldMoversBaseData({
          year,
          type: 'zip',
          filters: { stateCode: stateFilter || null, bedroomSize: 3 },
        });
        rows = ym.rows
          .filter((r) => r.zhviCurr >= MIN_ZHVI)
          .map((r) => ({
            zip_code: r.zipCode ?? null,
            state_code: r.stateCode,
            city_name: r.cityName ?? null,
            county_name: r.countyName ?? null,
            fmr_curr: r.fmrCurr,
            fmr_yoy: r.fmrYoy,
            zhvi_curr: r.zhviCurr,
            yield_curr: r.yieldCurr,
            yield_delta_pp: r.yieldDeltaPp,
          }));
      }

      if (rows.length > 0) {
        let valueFiltered = rows;
        if (!Number.isNaN(minPrice) && minPrice >= 0) {
          valueFiltered = valueFiltered.filter((r) => Number(r.zhvi_curr) >= minPrice);
        }
        if (!Number.isNaN(maxPrice) && maxPrice >= 0) {
          valueFiltered = valueFiltered.filter((r) => Number(r.zhvi_curr) <= maxPrice);
        }
        if (!Number.isNaN(minYieldPct) && minYieldPct >= 0) {
          valueFiltered = valueFiltered.filter((r) => Number(r.yield_curr) * 100 >= minYieldPct);
        }
        rows = valueFiltered;
      }
    } catch (_) {
      // leave rows empty
    }

    const byFmrDesc = [...rows].sort((a, b) => (Number(b.fmr_curr) || 0) - (Number(a.fmr_curr) || 0));
    const byFmrAsc = [...rows].sort((a, b) => (Number(a.fmr_curr) || 0) - (Number(b.fmr_curr) || 0));
    const fmrValue = {
      highest: byFmrDesc.slice(0, LIST_LIMIT).map((r, i) => mapFmrRowFromIndex(r, i + 1)),
      lowest: byFmrAsc.slice(0, LIST_LIMIT).map((r, i) => mapFmrRowFromIndex(r, i + 1)),
    };

    const byFmrYoyDesc = [...rows].sort((a, b) => (Number(b.fmr_yoy) || 0) - (Number(a.fmr_yoy) || 0));
    const byFmrYoyAsc = [...rows].sort((a, b) => (Number(a.fmr_yoy) || 0) - (Number(b.fmr_yoy) || 0));
    const fmrYoy = {
      increase: byFmrYoyDesc.slice(0, LIST_LIMIT).map((r, i) => mapYoyRow(r, i + 1, 'fmr_yoy')),
      decrease: byFmrYoyAsc.slice(0, LIST_LIMIT).map((r, i) => mapYoyRow(r, i + 1, 'fmr_yoy')),
    };

    const byYieldDesc = [...rows].sort((a, b) => (Number(b.yield_delta_pp) || 0) - (Number(a.yield_delta_pp) || 0));
    const byYieldAsc = [...rows].sort((a, b) => (Number(a.yield_delta_pp) || 0) - (Number(b.yield_delta_pp) || 0));
    const yieldYoy = {
      increase: byYieldDesc.slice(0, LIST_LIMIT).map((r, i) => mapYoyRow(r, i + 1, 'yield_delta_pp')),
      decrease: byYieldAsc.slice(0, LIST_LIMIT).map((r, i) => mapYoyRow(r, i + 1, 'yield_delta_pp')),
    };

    // 4. Per-bedroom FMR step: top 20 across all BR steps (1→2, 2→3, 3→4) by jump %
    let priceJump: ExplorerTopListItem[] = [];

    const fmrJumpParams: (string | number)[] = [year, MIN_ZHVI];
    if (stateFilter) fmrJumpParams.push(stateFilter);

    const fmrJumpQuery = `
      WITH latest_versions AS (
        SELECT MAX(zhvi_month) as latest_zhvi_month, MAX(acs_vintage) as latest_acs_vintage
        FROM investment_score WHERE fmr_year = $1 AND data_sufficient = true
      ),
      base_zip_3br AS (
        SELECT isc.zip_code, isc.city_name, isc.county_name, isc.state_code
        FROM investment_score isc
        CROSS JOIN latest_versions lv
        WHERE isc.fmr_year = $1 AND isc.data_sufficient = true AND isc.geo_type = 'zip'
          AND isc.zip_code IS NOT NULL AND isc.state_code IS NOT NULL AND isc.bedroom_count = 3
          AND isc.property_value >= $2
          AND ( (lv.latest_zhvi_month IS NULL AND isc.zhvi_month IS NULL) OR (lv.latest_zhvi_month IS NOT NULL AND isc.zhvi_month = lv.latest_zhvi_month) )
          AND ( (lv.latest_acs_vintage IS NULL AND isc.acs_vintage IS NULL) OR (lv.latest_acs_vintage IS NOT NULL AND isc.acs_vintage = lv.latest_acs_vintage) )
          ${stateFilter ? ' AND isc.state_code = $3' : " AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')"}
      ),
      zip_fmr_data AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          zcm.state_code,
          zcm.county_name,
          CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1 ELSE fd.bedroom_1 END as bedroom_1,
          CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2 ELSE fd.bedroom_2 END as bedroom_2,
          CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3 ELSE fd.bedroom_3 END as bedroom_3,
          CASE WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4 ELSE fd.bedroom_4 END as bedroom_4
        FROM zip_county_mapping zcm
        LEFT JOIN required_safmr_zips rsz ON zcm.zip_code = rsz.zip_code AND rsz.year = $1
        LEFT JOIN safmr_data sd ON zcm.zip_code = sd.zip_code AND sd.year = $1
        LEFT JOIN fmr_data fd ON zcm.county_fips = fd.county_code AND zcm.state_code = fd.state_code AND fd.year = $1
        WHERE ${stateFilter ? ' zcm.state_code = $3' : " zcm.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')"}
        ORDER BY zcm.zip_code, zcm.county_name
      ),
      jumps AS (
        SELECT
          b.zip_code,
          b.state_code,
          b.city_name,
          b.county_name,
          zfd.bedroom_2 - zfd.bedroom_1 as jump_1_2,
          CASE WHEN zfd.bedroom_1 IS NOT NULL AND zfd.bedroom_1 > 0 THEN (zfd.bedroom_2 - zfd.bedroom_1) / zfd.bedroom_1 * 100 ELSE NULL END as jump_1_2_pct,
          zfd.bedroom_3 - zfd.bedroom_2 as jump_2_3,
          CASE WHEN zfd.bedroom_2 IS NOT NULL AND zfd.bedroom_2 > 0 THEN (zfd.bedroom_3 - zfd.bedroom_2) / zfd.bedroom_2 * 100 ELSE NULL END as jump_2_3_pct,
          zfd.bedroom_4 - zfd.bedroom_3 as jump_3_4,
          CASE WHEN zfd.bedroom_3 IS NOT NULL AND zfd.bedroom_3 > 0 THEN (zfd.bedroom_4 - zfd.bedroom_3) / zfd.bedroom_3 * 100 ELSE NULL END as jump_3_4_pct
        FROM zip_fmr_data zfd
        INNER JOIN base_zip_3br b ON b.zip_code = zfd.zip_code AND b.state_code = zfd.state_code
        WHERE zfd.bedroom_1 IS NOT NULL AND zfd.bedroom_2 IS NOT NULL AND zfd.bedroom_3 IS NOT NULL AND zfd.bedroom_4 IS NOT NULL
      )
      SELECT * FROM jumps
    `;

    try {
      const jumpRes = await sql.query(fmrJumpQuery, fmrJumpParams);
      const jumpRows = (jumpRes.rows || []) as any[];

      const withStep = (
        rows: any[],
        pctKey: string,
        amountKey: string,
        stepLabel: string
      ): ExplorerTopListItem[] =>
        rows
          .filter((r) => r[pctKey] != null && !isNaN(r[pctKey]))
          .sort((a, b) => (Number(b[pctKey]) || 0) - (Number(a[pctKey]) || 0))
          .map((r, i) =>
            mapPriceJumpRow(
              {
                zip_code: r.zip_code,
                state_code: r.state_code,
                city_name: r.city_name,
                county_name: r.county_name,
                jump_pct: r[pctKey],
                jump_amount: r[amountKey],
              },
              i + 1,
              stepLabel
            )
          );

      const step1 = withStep(jumpRows, 'jump_1_2_pct', 'jump_1_2', '1→2');
      const step2 = withStep(jumpRows, 'jump_2_3_pct', 'jump_2_3', '2→3');
      const step3 = withStep(jumpRows, 'jump_3_4_pct', 'jump_3_4', '3→4');

      const combined = [...step1, ...step2, ...step3]
        .sort((a, b) => b.value - a.value)
        .slice(0, LIST_LIMIT)
        .map((item, i) => ({ ...item, rank: i + 1 }));
      priceJump = combined;
    } catch (_) {
      // leave priceJump empty on error
    }

    return NextResponse.json({
      fmrValue,
      fmrYoy,
      yieldYoy,
      priceJump,
    } as ExplorerTopListsResponse);
  } catch (error: any) {
    console.error('Explorer top lists API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch explorer top lists', details: error?.message },
      { status: 500 }
    );
  }
}
