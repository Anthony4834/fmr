import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const zipCode = searchParams.get('zip_code') || '';
    const missingField = searchParams.get('missing_field') || '';
    const source = searchParams.get('source') || '';

    // Build WHERE clause dynamically
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (zipCode) {
      paramCount++;
      conditions.push(`zip_code = $${paramCount}`);
      values.push(zipCode);
    }

    if (missingField) {
      paramCount++;
      conditions.push(`$${paramCount} = ANY(missing_fields)`);
      values.push(missingField);
    }

    if (source) {
      paramCount++;
      conditions.push(`source = $${paramCount}`);
      values.push(source);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count of unique groups
    const countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT DISTINCT
          zip_code,
          address,
          bedrooms,
          price,
          missing_fields,
          source
        FROM missing_data_events
        ${whereClause}
      ) AS unique_groups
    `;
    const countResult = await sql.query(countQuery, values);
    const total = parseInt(countResult.rows[0]?.total || '0');

    // Get paginated deduplicated data with counts
    const dataQuery = `
      SELECT
        MIN(id) as id,
        zip_code,
        address,
        bedrooms,
        price,
        missing_fields,
        source,
        COUNT(*) as occurrence_count,
        MAX(created_at) as last_seen,
        MIN(created_at) as first_seen
      FROM missing_data_events
      ${whereClause}
      GROUP BY zip_code, address, bedrooms, price, missing_fields, source
      ORDER BY occurrence_count DESC, last_seen DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    const dataResult = await sql.query(dataQuery, [...values, limit, offset]);

    // Get summary stats
    const summaryQuery = `
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT zip_code) as unique_zips,
        COUNT(DISTINCT source) as unique_sources,
        COUNT(CASE WHEN 'property_tax_rate' = ANY(missing_fields) THEN 1 END) as missing_tax_rate,
        COUNT(CASE WHEN 'mortgage_rate' = ANY(missing_fields) THEN 1 END) as missing_mortgage_rate,
        COUNT(CASE WHEN 'fmr_data' = ANY(missing_fields) THEN 1 END) as missing_fmr_data,
        COUNT(CASE WHEN 'fmr_bedroom' = ANY(missing_fields) THEN 1 END) as missing_fmr_bedroom,
        COUNT(CASE WHEN 'zip_code' = ANY(missing_fields) THEN 1 END) as missing_zip_code,
        COUNT(CASE WHEN 'bedrooms' = ANY(missing_fields) THEN 1 END) as missing_bedrooms,
        COUNT(CASE WHEN 'price' = ANY(missing_fields) THEN 1 END) as missing_price,
        COUNT(CASE WHEN 'address' = ANY(missing_fields) THEN 1 END) as missing_address
      FROM missing_data_events
      ${whereClause}
    `;

    const summaryResult = await sql.query(summaryQuery, values);
    const summary = summaryResult.rows[0];

    // Get unique combinations count
    const uniqueCombinationsQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT DISTINCT zip_code, address, bedrooms, price, missing_fields, source
        FROM missing_data_events
        ${whereClause}
      ) AS unique_combos
    `;
    const uniqueCombinationsResult = await sql.query(uniqueCombinationsQuery, values);
    const uniqueCombinations = parseInt(uniqueCombinationsResult.rows[0]?.total || '0');

    return NextResponse.json({
      success: true,
      data: dataResult.rows,
      total,
      summary: {
        totalEvents: parseInt(summary?.total_events || '0'),
        uniqueCombinations,
        uniqueZips: parseInt(summary?.unique_zips || '0'),
        uniqueSources: parseInt(summary?.unique_sources || '0'),
        missingTaxRate: parseInt(summary?.missing_tax_rate || '0'),
        missingMortgageRate: parseInt(summary?.missing_mortgage_rate || '0'),
        missingFmrData: parseInt(summary?.missing_fmr_data || '0'),
        missingFmrBedroom: parseInt(summary?.missing_fmr_bedroom || '0'),
        missingZipCode: parseInt(summary?.missing_zip_code || '0'),
        missingBedrooms: parseInt(summary?.missing_bedrooms || '0'),
        missingPrice: parseInt(summary?.missing_price || '0'),
        missingAddress: parseInt(summary?.missing_address || '0'),
      },
    });
  } catch (error) {
    console.error('Error fetching missing data events:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch missing data events',
      },
      { status: 500 }
    );
  }
}
