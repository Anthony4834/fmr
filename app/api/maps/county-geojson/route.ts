import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

// US Census Bureau TIGER/Line GeoJSON for counties
// Using a public CDN source for county boundaries
const GEOJSON_CDN_BASE = 'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const stateCode = searchParams.get('state')?.toUpperCase();

    if (!stateCode || stateCode.length !== 2) {
      return NextResponse.json(
        { error: 'Invalid state code' },
        { status: 400 }
      );
    }

    // Fetch the full US counties GeoJSON
    const response = await fetch(GEOJSON_CDN_BASE);
    if (!response.ok) {
      throw new Error('Failed to fetch GeoJSON data');
    }

    const geojson = await response.json();

    // Filter to only counties in the requested state
    // FIPS codes: first 2 digits are state, last 3 are county
    const stateFipsPrefix = getStateFIPSCode(stateCode);
    if (!stateFipsPrefix) {
      return NextResponse.json(
        { error: 'State code not found' },
        { status: 400 }
      );
    }

    const filteredFeatures = geojson.features.filter((feature: any) => {
      const fips = feature.id || feature.properties?.FIPS || feature.properties?.fips;
      if (!fips) return false;
      const fipsStr = String(fips).padStart(5, '0');
      return fipsStr.startsWith(stateFipsPrefix);
    });

    return NextResponse.json({
      type: 'FeatureCollection',
      features: filteredFeatures,
    });
  } catch (error) {
    console.error('Error fetching county GeoJSON:', error);
    return NextResponse.json(
      { error: 'Failed to fetch county GeoJSON' },
      { status: 500 }
    );
  }
}

// Map state codes to FIPS codes (first 2 digits)
function getStateFIPSCode(stateCode: string): string | null {
  const stateFipsMap: Record<string, string> = {
    'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
    'CO': '08', 'CT': '09', 'DE': '10', 'FL': '12', 'GA': '13',
    'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19',
    'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23', 'MD': '24',
    'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28', 'MO': '29',
    'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34',
    'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39',
    'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45',
    'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50',
    'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55', 'WY': '56',
    'DC': '11',
  };
  return stateFipsMap[stateCode] || null;
}

