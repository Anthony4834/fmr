import { Metadata } from 'next';
import MarketRentsAdminClient from './MarketRentsAdminClient';
import { sql } from '@vercel/postgres';

export const metadata: Metadata = {
  title: 'Market Rents Admin | fmr.fyi',
  description: 'Admin view for scraped market rent data',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MarketRentsAdminPage({
  searchParams,
}: {
  searchParams: { page?: string; sort?: string; order?: string; search?: string; bedroom?: string };
}) {
  // Fetch initial data
  const page = parseInt(searchParams.page || '1', 10);
  const sort = searchParams.sort || 'estimated_monthly_rent';
  const order = searchParams.order || 'desc';
  const search = searchParams.search || '';
  const bedroom = searchParams.bedroom ? parseInt(searchParams.bedroom, 10) : null;

  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  let query = `
    SELECT 
      r.zip_code,
      r.bedroom_count,
      r.estimated_monthly_rent,
      r.rent_per_sqft,
      r.rent_per_bedroom,
      r.low_estimate,
      r.high_estimate,
      r.data_status,
      r.scraped_at,
      r.updated_at,
      zc.city_name,
      COALESCE(zc.state_code, zco.state_code) as state_code,
      zco.county_name
    FROM rentcast_market_rents r
    LEFT JOIN zip_city_mapping zc ON r.zip_code = zc.zip_code
    LEFT JOIN zip_county_mapping zco ON r.zip_code = zco.zip_code
    WHERE 1=1
  `;
  
  const params: any[] = [];
  let paramIndex = 1;

  if (search) {
    query += ` AND (r.zip_code LIKE $${paramIndex} OR zc.city_name ILIKE $${paramIndex} OR COALESCE(zc.state_code, zco.state_code) ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (bedroom !== null) {
    query += ` AND r.bedroom_count = $${paramIndex}`;
    params.push(bedroom);
    paramIndex++;
  }

  // Validate sort column
  const allowedSorts = [
    'estimated_monthly_rent',
    'rent_per_sqft',
    'rent_per_bedroom',
    'scraped_at',
    'zip_code',
    'bedroom_count',
  ];
  const sortColumn = allowedSorts.includes(sort) ? sort : 'estimated_monthly_rent';
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  query += ` ORDER BY r.${sortColumn} ${sortOrder} NULLS LAST`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(pageSize, offset);

  const result = await sql.query(query, params);

  // Get total count
  let countQuery = `
    SELECT COUNT(*) as total
    FROM rentcast_market_rents r
    LEFT JOIN zip_city_mapping zc ON r.zip_code = zc.zip_code
    LEFT JOIN zip_county_mapping zco ON r.zip_code = zco.zip_code
    WHERE 1=1
  `;
  const countParams: any[] = [];
  let countParamIndex = 1;

  if (search) {
    countQuery += ` AND (r.zip_code LIKE $${countParamIndex} OR zc.city_name ILIKE $${countParamIndex} OR COALESCE(zc.state_code, zco.state_code) ILIKE $${countParamIndex})`;
    countParams.push(`%${search}%`);
    countParamIndex++;
  }

  if (bedroom !== null) {
    countQuery += ` AND r.bedroom_count = $${countParamIndex}`;
    countParams.push(bedroom);
    countParamIndex++;
  }

  const countResult = await sql.query(countQuery, countParams);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);
  const totalPages = Math.ceil(total / pageSize);

  const rows = result.rows.map((row: any) => ({
    zipCode: row.zip_code,
    bedroomCount: row.bedroom_count,
    estimatedMonthlyRent: row.estimated_monthly_rent !== null ? Number(row.estimated_monthly_rent) : null,
    rentPerSqft: row.rent_per_sqft !== null ? Number(row.rent_per_sqft) : null,
    rentPerBedroom: row.rent_per_bedroom !== null ? Number(row.rent_per_bedroom) : null,
    lowEstimate: row.low_estimate !== null ? Number(row.low_estimate) : null,
    highEstimate: row.high_estimate !== null ? Number(row.high_estimate) : null,
    dataStatus: row.data_status,
    scrapedAt: row.scraped_at,
    updatedAt: row.updated_at,
    cityName: row.city_name,
    stateCode: row.state_code,
    countyName: row.county_name,
  }));

  return (
    <MarketRentsAdminClient
      initialData={rows}
      initialPage={page}
      initialTotal={total}
      initialTotalPages={totalPages}
      initialSort={sortColumn}
      initialOrder={order}
      initialSearch={search}
      initialBedroom={bedroom}
    />
  );
}
