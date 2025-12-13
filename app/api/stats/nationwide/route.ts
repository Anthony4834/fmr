import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    // Get FMR statistics (excluding PR)
    const fmrStats = await sql`
      SELECT 
        COUNT(DISTINCT area_name) as total_areas,
        COUNT(DISTINCT state_code) as total_states,
        AVG(bedroom_1) as avg_1br,
        AVG(bedroom_2) as avg_2br,
        AVG(bedroom_3) as avg_3br,
        AVG(bedroom_4) as avg_4br,
        MIN(bedroom_2) as min_2br,
        MAX(bedroom_2) as max_2br,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bedroom_2) as median_2br
      FROM fmr_data
      WHERE year = ${year} 
        AND state_code != 'PR'
        AND bedroom_1 IS NOT NULL 
        AND bedroom_2 IS NOT NULL
    `;

    // Get SAFMR statistics (excluding PR)
    const safmrStats = await sql`
      SELECT 
        COUNT(DISTINCT sd.zip_code) as total_zips
      FROM safmr_data sd
      INNER JOIN zip_county_mapping zcm ON sd.zip_code = zcm.zip_code
      WHERE sd.year = ${year}
        AND zcm.state_code != 'PR'
    `;

    const fmr = fmrStats.rows[0];
    const safmr = safmrStats.rows[0];

    return NextResponse.json({
      totalAreas: parseInt(fmr.total_areas) || 0,
      totalStates: parseInt(fmr.total_states) || 0,
      totalZips: parseInt(safmr.total_zips) || 0,
      avg1BR: parseFloat(fmr.avg_1br) || 0,
      avg2BR: parseFloat(fmr.avg_2br) || 0,
      avg3BR: parseFloat(fmr.avg_3br) || 0,
      avg4BR: parseFloat(fmr.avg_4br) || 0,
      min2BR: parseFloat(fmr.min_2br) || 0,
      max2BR: parseFloat(fmr.max_2br) || 0,
      median2BR: parseFloat(fmr.median_2br) || 0,
    });
  } catch (error) {
    console.error('Error fetching nationwide stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch nationwide statistics' },
      { status: 500 }
    );
  }
}





