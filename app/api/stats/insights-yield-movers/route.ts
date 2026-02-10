import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import {
  computeYieldMoversBaseData,
  type YieldMoversGeoType,
  type YieldMoverBaseRow,
} from '@/lib/yield-movers';
import { getLatestFMRYear, getLatestZhviMonth } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const YIELD_MOVERS_CACHE_VERSION = 1;

const ALLOWED_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]);

function toResponseItem(row: YieldMoverBaseRow) {
  return {
    geoKey: row.geoKey,
    zipCode: row.zipCode,
    cityName: row.cityName,
    areaName: row.areaName,
    stateCode: row.stateCode,
    countyName: row.countyName,
    fmrYoy: row.fmrYoy,
    zhviYoy: row.zhviYoy,
    divergencePp: row.divergencePp,
    yieldDeltaPp: row.yieldDeltaPp,
    yieldCurr: row.yieldCurr,
    zipCount: row.zipCount,
  };
}

type InsightsIndexRow = {
  geo_key: string;
  state_code: string;
  zip_code: string | null;
  city_name: string | null;
  area_name: string | null;
  county_name: string | null;
  fmr_curr: number;
  fmr_yoy: number;
  zhvi_curr: number;
  zhvi_yoy: number;
  yield_curr: number;
  yield_delta_pp: number;
  divergence_pp: number;
  zip_count: number | null;
  zhvi_as_of_month: string;
};

function indexRowToBaseRow(r: InsightsIndexRow): YieldMoverBaseRow {
  return {
    geoKey: r.geo_key,
    zipCode: r.zip_code ?? undefined,
    cityName: r.city_name ?? undefined,
    areaName: r.area_name ?? undefined,
    stateCode: r.state_code,
    countyName: r.county_name ?? undefined,
    fmrCurr: Number(r.fmr_curr),
    fmrPrev: 0,
    fmrYoy: Number(r.fmr_yoy),
    zhviCurr: Number(r.zhvi_curr),
    zhviPrev: 0,
    zhviYoy: Number(r.zhvi_yoy),
    zhviBedroomUsed: 3,
    annualRentCurr: 0,
    annualRentPrev: 0,
    yieldCurr: Number(r.yield_curr),
    yieldPrior: 0,
    yieldDeltaPp: Number(r.yield_delta_pp),
    divergencePp: Number(r.divergence_pp),
    zipCount: r.zip_count ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawType = (searchParams.get('type') || 'zip') as YieldMoversGeoType;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();
    const refresh = searchParams.get('refresh') === 'true';
    const rawStateCode = searchParams.get('state');
    const stateCode = rawStateCode && ALLOWED_STATE_CODES.has(rawStateCode.toUpperCase())
      ? rawStateCode.toUpperCase()
      : null;
    const bedroomParam = searchParams.get('bedroom');
    const bedroomSize = bedroomParam !== null && bedroomParam !== ''
      ? Math.max(1, Math.min(4, parseInt(bedroomParam, 10) || 2))
      : 2;

    const type: YieldMoversGeoType =
      rawType === 'city' || rawType === 'county' ? rawType : 'zip';

    const zhviAsOfMonth = await getLatestZhviMonth(bedroomSize);
    const cacheKey = `ym:${year}:${type}:${stateCode || 'all'}:${bedroomSize}:${zhviAsOfMonth}`;

    await sql`
      CREATE TABLE IF NOT EXISTS dashboard_insights_cache_v2 (
        cache_key VARCHAR(255) NOT NULL,
        year INTEGER NOT NULL,
        type VARCHAR(10) NOT NULL CHECK (type IN ('zip', 'city', 'county')),
        state_code VARCHAR(2),
        bedroom_size INTEGER,
        payload JSONB NOT NULL,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (cache_key)
      )
    `;

    if (!refresh && zhviAsOfMonth) {
      const cached = await sql.query(
        `SELECT payload FROM dashboard_insights_cache_v2 WHERE cache_key = $1`,
        [cacheKey]
      );
      const cachedPayload = cached.rows[0]?.payload as any;
      if (cachedPayload?.cacheVersion === YIELD_MOVERS_CACHE_VERSION) {
        return NextResponse.json(cachedPayload);
      }
    }

    let rows: YieldMoverBaseRow[];
    let zhviAsof: string;
    let dataCoverage: { totalGeos: number; geosWithFmr: number; geosWithZhviCurrPrev: number; geosUsed: number };

    let useIndex = false;
    try {
      const hasIndex = await sql`
        SELECT 1 FROM insights_index WHERE geo_type = ${type} LIMIT 1
      `;
      useIndex = hasIndex.rows.length > 0;
    } catch {
      // Table may not exist before first cron run; fall back to live computation
    }
    if (useIndex) {
      const indexQuery = stateCode
        ? sql`
            SELECT geo_key, state_code, zip_code, city_name, area_name, county_name,
              fmr_curr, fmr_yoy, zhvi_curr, zhvi_yoy, yield_curr, yield_delta_pp, divergence_pp,
              zip_count, zhvi_as_of_month
            FROM insights_index
            WHERE geo_type = ${type} AND state_code = ${stateCode}
          `
        : sql`
            SELECT geo_key, state_code, zip_code, city_name, area_name, county_name,
              fmr_curr, fmr_yoy, zhvi_curr, zhvi_yoy, yield_curr, yield_delta_pp, divergence_pp,
              zip_count, zhvi_as_of_month
            FROM insights_index
            WHERE geo_type = ${type}
          `;
      const indexResult = await indexQuery;
      const indexRows = indexResult.rows as InsightsIndexRow[];
      zhviAsof = indexRows[0]?.zhvi_as_of_month ?? zhviAsOfMonth;
      rows = indexRows.map(indexRowToBaseRow);
      dataCoverage = {
        totalGeos: rows.length,
        geosWithFmr: rows.length,
        geosWithZhviCurrPrev: rows.length,
        geosUsed: rows.length,
      };
    } else {
      const result = await computeYieldMoversBaseData({
        year,
        type,
        filters: { stateCode, bedroomSize },
      });
      rows = result.rows;
      zhviAsof = result.zhviAsOfMonth || zhviAsOfMonth;
      dataCoverage = result.dataCoverage;
    }

    if (rows.length === 0) {
      return NextResponse.json({
        improving: [],
        compressing: [],
        divergence: [],
        zhviAsof,
        dataCoverage,
        cacheVersion: YIELD_MOVERS_CACHE_VERSION,
      });
    }

    const improving = [...rows]
      .sort((a, b) => b.yieldDeltaPp - a.yieldDeltaPp)
      .slice(0, 20)
      .map(toResponseItem);

    const compressing = [...rows]
      .sort((a, b) => a.yieldDeltaPp - b.yieldDeltaPp)
      .slice(0, 20)
      .map(toResponseItem);

    const divergence = [...rows]
      .sort((a, b) => b.divergencePp - a.divergencePp)
      .slice(0, 20)
      .map(toResponseItem);

    const payload = {
      improving,
      compressing,
      divergence,
      zhviAsof,
      dataCoverage,
      cacheVersion: YIELD_MOVERS_CACHE_VERSION,
    };

    const finalCacheKey = `ym:${year}:${type}:${stateCode || 'all'}:${bedroomSize}:${zhviAsof}`;
    await sql.query(
      `
      INSERT INTO dashboard_insights_cache_v2 (cache_key, year, type, state_code, bedroom_size, payload, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      ON CONFLICT (cache_key)
      DO UPDATE SET payload = EXCLUDED.payload, computed_at = EXCLUDED.computed_at
      `,
      [finalCacheKey, year, type, stateCode, bedroomSize, JSON.stringify(payload)]
    );

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching yield movers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch yield movers' },
      { status: 500 }
    );
  }
}
