import { sql } from '@vercel/postgres';

export interface GeocodeResult {
  zipCode: string;
  county?: string;
  state: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  cached: boolean;
}

/**
 * Normalize address for caching
 */
function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '');
}

/**
 * Geocode an address using US Census Geocoding API
 */
async function geocodeWithCensus(address: string): Promise<GeocodeResult | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/address?street=${encodedAddress}&city=&state=&zip=&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    
    if (data.result?.addressMatches && data.result.addressMatches.length > 0) {
      const match = data.result.addressMatches[0];
      const coordinates = match.coordinates;
      const addressComponents = match.addressComponents;
      
      return {
        zipCode: addressComponents?.zip || '',
        county: match.geographies?.['Counties']?.[0]?.NAME,
        state: addressComponents?.state || '',
        city: addressComponents?.city || '',
        latitude: coordinates?.y,
        longitude: coordinates?.x,
        cached: false
      };
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }

  return null;
}

/**
 * Geocode an address (checks cache first, then external API)
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const normalized = normalizeAddress(address);

  // Check cache first
  const cached = await sql`
    SELECT zip_code, county_name, state_code, city_name, latitude, longitude
    FROM geocoded_addresses
    WHERE normalized_address = ${normalized}
    LIMIT 1
  `;

  if (cached.rows.length > 0) {
    const row = cached.rows[0];
    return {
      zipCode: row.zip_code || '',
      county: row.county_name,
      state: row.state_code || '',
      city: row.city_name,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      cached: true
    };
  }

  // Geocode externally
  const result = await geocodeWithCensus(address);
  
  if (result) {
    // Cache the result
    await sql`
      INSERT INTO geocoded_addresses (
        normalized_address, original_address, zip_code, county_name, 
        state_code, city_name, latitude, longitude, source
      )
      VALUES (
        ${normalized}, ${address}, ${result.zipCode}, ${result.county || null},
        ${result.state}, ${result.city || null}, ${result.latitude || null}, 
        ${result.longitude || null}, 'census'
      )
      ON CONFLICT (normalized_address) DO NOTHING
    `;
  }

  return result;
}


