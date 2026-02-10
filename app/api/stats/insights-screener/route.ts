import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import {
  computeYieldMoversBaseData,
  type YieldMoversGeoType,
  type YieldMoverBaseRow,
} from '@/lib/yield-movers';
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

const MIN_PROPERTY_VALUE = 90_000;

type PriceDir = 'up' | 'flat' | 'down' | 'any';
type FmrDir = 'up' | 'flat' | 'down';
type YieldDir = 'up' | 'flat' | 'down' | 'any';
type SortField = 'match' | 'zhvi_yoy' | 'yield_delta_pp' | 'fmr_yoy' | 'zhvi_curr' | 'fmr_curr' | 'yield_curr';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeMatchScore(row: YieldMoverBaseRow): number {
  const zhviClamped = clamp(Math.abs(row.zhviYoy), 0, 50);
  const yieldClamped = clamp(Math.abs(row.yieldDeltaPp), 0, 10);
  return zhviClamped + yieldClamped;
}

function toResponseItem(row: YieldMoverBaseRow, whyMatched?: string) {
  return {
    geoKey: row.geoKey,
    zipCode: row.zipCode,
    cityName: row.cityName,
    areaName: row.areaName,
    stateCode: row.stateCode,
    countyName: row.countyName,
    fmrCurr: row.fmrCurr,
    fmrYoy: row.fmrYoy,
    zhviCurr: row.zhviCurr,
    zhviYoy: row.zhviYoy,
    divergencePp: row.divergencePp,
    yieldDeltaPp: row.yieldDeltaPp,
    yieldCurr: row.yieldCurr,
    zipCount: row.zipCount,
    whyMatched,
  };
}

type InsightsIndexRow = {
  geo_type: string;
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
    const rawStateCode = searchParams.get('state');
    const stateCode = rawStateCode && ALLOWED_STATE_CODES.has(rawStateCode.toUpperCase())
      ? rawStateCode.toUpperCase()
      : null;
    const bedroomParam = searchParams.get('bedroom');
    const bedroomSize = bedroomParam !== null && bedroomParam !== ''
      ? Math.max(1, Math.min(4, parseInt(bedroomParam, 10) || 3))
      : 3;

    const priceDir = (searchParams.get('price_dir') || 'any') as PriceDir;
    const fmrDir = (searchParams.get('fmr_dir') || 'any') as FmrDir | 'any';
    const yieldDir = (searchParams.get('yield_dir') || 'any') as YieldDir;
    // flat_band as percentage (e.g. 3 = ±3%). Price/FMR YoY are stored as % (e.g. 3); yield_delta_pp is in pp.
    const flatBandPct = Math.min(10, Math.max(0.5, parseFloat(searchParams.get('flat_band') || '3') || 3));
    const sort = (searchParams.get('sort') || 'match') as SortField;
    const sortDir = (searchParams.get('sort_dir') || 'desc') as 'asc' | 'desc';
    const limit = Math.min(200, Math.max(20, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    const minPriceParam = searchParams.get('min_price');
    const maxPriceParam = searchParams.get('max_price');
    const minYieldParam = searchParams.get('min_yield');
    const minPrice = minPriceParam != null && minPriceParam !== '' ? parseFloat(minPriceParam) : NaN;
    const maxPrice = maxPriceParam != null && maxPriceParam !== '' ? parseFloat(maxPriceParam) : NaN;
    const minYieldPct = minYieldParam != null && minYieldParam !== '' ? parseFloat(minYieldParam) : NaN;

    const qRaw = searchParams.get('q');
    const qTrim = typeof qRaw === 'string' ? qRaw.trim() : '';
    const hasSearch = qTrim.length > 0;

    const type: YieldMoversGeoType =
      rawType === 'city' || rawType === 'county' ? rawType : 'zip';

    let rows: YieldMoverBaseRow[];
    let zhviAsOfMonth: string;
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
            SELECT geo_type, geo_key, state_code, zip_code, city_name, area_name, county_name,
              fmr_curr, fmr_yoy, zhvi_curr, zhvi_yoy, yield_curr, yield_delta_pp, divergence_pp,
              zip_count, zhvi_as_of_month
            FROM insights_index
            WHERE geo_type = ${type} AND zhvi_curr >= ${MIN_PROPERTY_VALUE} AND state_code = ${stateCode}
          `
        : sql`
            SELECT geo_type, geo_key, state_code, zip_code, city_name, area_name, county_name,
              fmr_curr, fmr_yoy, zhvi_curr, zhvi_yoy, yield_curr, yield_delta_pp, divergence_pp,
              zip_count, zhvi_as_of_month
            FROM insights_index
            WHERE geo_type = ${type} AND zhvi_curr >= ${MIN_PROPERTY_VALUE}
          `;
      const indexResult = await indexQuery;
      const indexRows = indexResult.rows as InsightsIndexRow[];
      zhviAsOfMonth = indexRows[0]?.zhvi_as_of_month ?? '';
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
      zhviAsOfMonth = result.zhviAsOfMonth;
      dataCoverage = result.dataCoverage;
    }

    if (hasSearch) {
      const qLower = qTrim.toLowerCase();
      rows = rows.filter((r) => {
        const city = (r.cityName ?? '').toLowerCase();
        const area = (r.areaName ?? '').toLowerCase();
        const county = (r.countyName ?? '').toLowerCase();
        const zip = (r.zipCode ?? '').toLowerCase();
        const state = (r.stateCode ?? '').toLowerCase();
        return city.includes(qLower) || area.includes(qLower) || county.includes(qLower) || zip.includes(qLower) || state.includes(qLower);
      });
    }

    const rowsAboveMin = rows.filter((r) => r.zhviCurr >= MIN_PROPERTY_VALUE);

    const filterByPrice = (r: YieldMoverBaseRow): boolean => {
      if (priceDir === 'any') return true;
      if (priceDir === 'up') return r.zhviYoy > flatBandPct;
      if (priceDir === 'flat') return Math.abs(r.zhviYoy) <= flatBandPct;
      if (priceDir === 'down') return r.zhviYoy < -flatBandPct;
      return true;
    };

    const filterByFmr = (r: YieldMoverBaseRow): boolean => {
      if (fmrDir === 'any') return true;
      if (fmrDir === 'up') return r.fmrYoy > flatBandPct;
      if (fmrDir === 'flat') return Math.abs(r.fmrYoy) <= flatBandPct;
      if (fmrDir === 'down') return r.fmrYoy < -flatBandPct;
      return true;
    };

    const filterByYield = (r: YieldMoverBaseRow): boolean => {
      if (yieldDir === 'any') return true;
      if (yieldDir === 'up') return r.yieldDeltaPp > flatBandPct;
      if (yieldDir === 'flat') return Math.abs(r.yieldDeltaPp) <= flatBandPct;
      if (yieldDir === 'down') return r.yieldDeltaPp < -flatBandPct;
      return true;
    };

    const filtered = rowsAboveMin.filter((r) =>
      filterByPrice(r) && filterByFmr(r) && filterByYield(r)
    );

    const MAX_PRICE = 500_000;

    // Range is always from the full dataset (rowsAboveMin), not from trend- or value-filtered subsets,
    // so slider bounds stay stable when the user changes price/yield filters or trend filters.
    // Price max is capped at MAX_PRICE (section 8–relevant range).
    const range =
      rowsAboveMin.length === 0
        ? { priceMin: 0, priceMax: MAX_PRICE, yieldMax: 15 }
        : {
            priceMin: Math.min(...rowsAboveMin.map((r) => r.zhviCurr)),
            priceMax: Math.min(MAX_PRICE, Math.max(...rowsAboveMin.map((r) => r.zhviCurr))),
            yieldMax: Math.min(20, Math.max(15, Math.max(...rowsAboveMin.map((r) => r.yieldCurr * 100)) + 0.5)),
          };

    let valueFiltered = filtered;
    if (!Number.isNaN(minPrice) && minPrice >= 0) {
      valueFiltered = valueFiltered.filter((r) => r.zhviCurr >= minPrice);
    }
    if (!Number.isNaN(maxPrice) && maxPrice >= 0) {
      valueFiltered = valueFiltered.filter((r) => r.zhviCurr <= maxPrice);
    }
    if (!Number.isNaN(minYieldPct) && minYieldPct >= 0) {
      valueFiltered = valueFiltered.filter((r) => r.yieldCurr * 100 >= minYieldPct);
    }

    const buildWhyMatched = (r: YieldMoverBaseRow): string => {
      const parts: string[] = [];
      if (priceDir !== 'any') {
        if (priceDir === 'up') parts.push('ZHVI ↑');
        else if (priceDir === 'flat') parts.push('ZHVI →');
        else parts.push('ZHVI ↓');
      }
      if (fmrDir !== 'any') {
        if (fmrDir === 'up') parts.push('FMR ↑');
        else if (fmrDir === 'flat') parts.push('FMR →');
        else parts.push('FMR ↓');
      }
      if (yieldDir === 'up') parts.push('Yield ↑');
      else if (yieldDir === 'flat') parts.push('Yield →');
      else if (yieldDir === 'down') parts.push('Yield ↓');
      return parts.join(' + ');
    };

    const sign = sortDir === 'asc' ? -1 : 1;
    const sortFn = (a: YieldMoverBaseRow, b: YieldMoverBaseRow): number => {
      if (sort === 'match') return (computeMatchScore(b) - computeMatchScore(a)) * sign;
      if (sort === 'zhvi_yoy') return (b.zhviYoy - a.zhviYoy) * sign;
      if (sort === 'yield_delta_pp') return (b.yieldDeltaPp - a.yieldDeltaPp) * sign;
      if (sort === 'fmr_yoy') return (b.fmrYoy - a.fmrYoy) * sign;
      if (sort === 'zhvi_curr') return (b.zhviCurr - a.zhviCurr) * sign;
      if (sort === 'fmr_curr') return (b.fmrCurr - a.fmrCurr) * sign;
      if (sort === 'yield_curr') return (b.yieldCurr - a.yieldCurr) * sign;
      return (computeMatchScore(b) - computeMatchScore(a)) * sign;
    };

    const sorted = [...valueFiltered].sort(sortFn);
    const totalMatched = valueFiltered.length;
    const items = sorted.slice(offset, offset + limit).map((r) => toResponseItem(r, buildWhyMatched(r)));
    const hasMore = offset + items.length < totalMatched;

    return NextResponse.json({
      items,
      totalMatched,
      hasMore,
      dataCoverage,
      zhviAsof: zhviAsOfMonth,
      range,
    });
  } catch (error) {
    console.error('Error fetching screener:', error);
    return NextResponse.json(
      { error: 'Failed to fetch screener results' },
      { status: 500 }
    );
  }
}
