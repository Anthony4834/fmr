import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const pageParam = searchParams.get('page');
    const searchParam = searchParams.get('search')?.trim() || '';
    const stateParam = searchParams.get('state')?.trim().toUpperCase() || '';

    const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
    const offset = (page - 1) * PAGE_SIZE;

    // Get the latest month for ZHVI data
    const latestMonthRes = await sql`
      SELECT MAX(month) as latest_month
      FROM zhvi_zip_bedroom_monthly
      LIMIT 1
    `;
    const latestMonth = latestMonthRes.rows[0]?.latest_month || null;

    // Build parameters array
    const params: any[] = [];
    let paramIndex = 1;

    // Build the base CTE query
    let baseCte = `
      WITH latest_zhvi AS (
        SELECT DISTINCT ON (zip_code, bedroom_count)
          zip_code,
          bedroom_count,
          zhvi,
          state_code,
          city_name,
          county_name
        FROM zhvi_zip_bedroom_monthly
    `;
    
    if (latestMonth) {
      baseCte += ` WHERE month = $${paramIndex}`;
      params.push(latestMonth);
      paramIndex++;
    }
    
    baseCte += `
        ORDER BY zip_code, bedroom_count, month DESC
      ),
      zhvi_pivot AS (
        SELECT 
          zip_code,
          MAX(CASE WHEN bedroom_count = 1 THEN zhvi END) as zhvi_1br,
          MAX(CASE WHEN bedroom_count = 2 THEN zhvi END) as zhvi_2br,
          MAX(CASE WHEN bedroom_count = 3 THEN zhvi END) as zhvi_3br,
          MAX(CASE WHEN bedroom_count = 4 THEN zhvi END) as zhvi_4br,
          MAX(state_code) as state_code,
          MAX(city_name) as city_name,
          MAX(county_name) as county_name
        FROM latest_zhvi
        GROUP BY zip_code
      )
    `;

    // Build WHERE clause for filters
    const filterConditions: string[] = [];
    if (searchParam) {
      filterConditions.push(`z.zip_code LIKE $${paramIndex}`);
      params.push(`%${searchParam}%`);
      paramIndex++;
    }
    if (stateParam) {
      filterConditions.push(`z.state_code = $${paramIndex}`);
      params.push(stateParam);
      paramIndex++;
    }

    const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      ${baseCte}
      SELECT COUNT(*) as total
      FROM zhvi_pivot z
      LEFT JOIN acs_tax_zcta_latest tax ON tax.zcta = z.zip_code
      ${whereClause}
    `;
    const countRes = await sql.query(countQuery, params);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    // Get latest FMR year for investment scores
    const fmrYearRes = await sql`
      SELECT MAX(year) as latest_year FROM fmr_data
    `;
    const fmrYear = fmrYearRes.rows[0]?.latest_year || 2026;

    // Get paginated data with investment scores
    const dataQuery = `
      ${baseCte}
      SELECT 
        z.zip_code,
        z.state_code,
        z.city_name,
        z.county_name,
        z.zhvi_1br,
        z.zhvi_2br,
        z.zhvi_3br,
        z.zhvi_4br,
        tax.effective_tax_rate,
        tax.median_home_value,
        tax.median_real_estate_taxes_paid,
        tax.acs_vintage,
        inv.score as investment_score,
        inv.property_value as normalized_property_value,
        inv.annual_rent as normalized_annual_rent,
        inv.net_yield as net_yield,
        inv.rent_to_price_ratio as normalized_rent_to_price_ratio,
        inv.raw_zhvi,
        inv.county_zhvi_median,
        inv.blended_zhvi,
        inv.price_floor_applied,
        inv.rent_cap_applied,
        inv.county_blending_applied,
        inv.raw_rent_to_price_ratio,
        inv.bedroom_count as score_bedroom_count
      FROM zhvi_pivot z
      LEFT JOIN acs_tax_zcta_latest tax ON tax.zcta = z.zip_code
      LEFT JOIN investment_score inv ON inv.zip_code = z.zip_code 
        AND inv.fmr_year = $${paramIndex + 2}
        AND inv.geo_type = 'zip'
      ${whereClause}
      ORDER BY z.zip_code
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(PAGE_SIZE, offset, fmrYear);
    const dataRes = await sql.query(dataQuery, params);

    const rows = dataRes.rows.map((row: any) => ({
      zipCode: row.zip_code,
      stateCode: row.state_code || null,
      cityName: row.city_name || null,
      countyName: row.county_name || null,
      zhvi1BR: row.zhvi_1br !== null ? Number(row.zhvi_1br) : null,
      zhvi2BR: row.zhvi_2br !== null ? Number(row.zhvi_2br) : null,
      zhvi3BR: row.zhvi_3br !== null ? Number(row.zhvi_3br) : null,
      zhvi4BR: row.zhvi_4br !== null ? Number(row.zhvi_4br) : null,
      effectiveTaxRate: row.effective_tax_rate !== null ? Number(row.effective_tax_rate) : null,
      effectiveTaxRatePct: row.effective_tax_rate !== null ? Number(row.effective_tax_rate) * 100 : null,
      medianHomeValue: row.median_home_value !== null ? Number(row.median_home_value) : null,
      medianRealEstateTaxesPaid: row.median_real_estate_taxes_paid !== null ? Number(row.median_real_estate_taxes_paid) : null,
      acsVintage: row.acs_vintage !== null ? Number(row.acs_vintage) : null,
      // Investment score data
      investmentScore: row.investment_score !== null ? Number(row.investment_score) : null,
      normalizedPropertyValue: row.normalized_property_value !== null ? Number(row.normalized_property_value) : null,
      normalizedAnnualRent: row.normalized_annual_rent !== null ? Number(row.normalized_annual_rent) : null,
      netYield: row.net_yield !== null ? Number(row.net_yield) : null,
      netYieldPct: row.net_yield !== null ? Number(row.net_yield) * 100 : null,
      normalizedRentToPriceRatio: row.normalized_rent_to_price_ratio !== null ? Number(row.normalized_rent_to_price_ratio) : null,
      normalizedRentToPriceRatioPct: row.normalized_rent_to_price_ratio !== null ? Number(row.normalized_rent_to_price_ratio) * 100 : null,
      rawZhvi: row.raw_zhvi !== null ? Number(row.raw_zhvi) : null,
      countyZhviMedian: row.county_zhvi_median !== null ? Number(row.county_zhvi_median) : null,
      blendedZhvi: row.blended_zhvi !== null ? Number(row.blended_zhvi) : null,
      priceFloorApplied: row.price_floor_applied || false,
      rentCapApplied: row.rent_cap_applied || false,
      countyBlendingApplied: row.county_blending_applied || false,
      rawRentToPriceRatio: row.raw_rent_to_price_ratio !== null ? Number(row.raw_rent_to_price_ratio) : null,
      rawRentToPriceRatioPct: row.raw_rent_to_price_ratio !== null ? Number(row.raw_rent_to_price_ratio) * 100 : null,
      scoreBedroomCount: row.score_bedroom_count !== null ? Number(row.score_bedroom_count) : null,
    }));

    return NextResponse.json({
      rows,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
      latestMonth: latestMonth || null,
    });
  } catch (e: any) {
    console.error('Zip property data error:', e);
    return NextResponse.json({ error: 'Failed to fetch zip property data' }, { status: 500 });
  }
}
