import { sql } from '@vercel/postgres';

export interface AutocompleteResult {
  type: 'zip' | 'city' | 'county';
  display: string;
  value: string;
  state?: string;
}

export interface ZIPFMRData {
  zipCode: string;
  bedroom0?: number;
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
}

export interface FMRResult {
  source: 'safmr' | 'fmr';
  zipCode?: string;
  zipCodes?: string[];
  zipFMRData?: ZIPFMRData[]; // For SAFMR: individual FMR data per ZIP
  areaName: string;
  stateCode: string;
  countyName?: string;
  year: number;
  bedroom0?: number; // For single ZIP or county FMR
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
  effectiveDate?: Date;
}

/**
 * Search for autocomplete suggestions using PostgreSQL trigram search
 */
export async function searchAutocomplete(query: string, type?: 'zip' | 'city' | 'county' | 'all'): Promise<AutocompleteResult[]> {
  let searchTerm = query.trim();
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

  // Parse "city, state" or "county, state" format
  let citySearchTerm = searchTerm;
  let stateFilter: string | null = null;
  const cityStateMatch = searchTerm.match(/^(.+?),\s*([A-Z]{2})$/i);
  if (cityStateMatch) {
    citySearchTerm = cityStateMatch[1].trim();
    stateFilter = cityStateMatch[2].trim().toUpperCase();
  }

  // Normalize county search term - remove "county" suffix for better matching
  // e.g., "whatcom county" -> "whatcom", but also search for "whatcom county"
  const normalizeCountySearch = (term: string) => {
    const normalized = term.trim();
    // Remove "county" suffix if present (case-insensitive)
    const lowerNormalized = normalized.toLowerCase();
    if (lowerNormalized.endsWith(' county')) {
      return normalized.slice(0, -7).trim();
    }
    return normalized;
  };
  const countySearchBase = normalizeCountySearch(citySearchTerm);
  // Also keep the original search term to match "Whatcom County" exactly
  const countySearchOriginal = citySearchTerm.trim();

  const results: AutocompleteResult[] = [];

  // Search ZIP codes (excluding PR)
  if (!type || type === 'zip' || type === 'all') {
    const zipResults = await sql`
      SELECT DISTINCT zip_code, state_code, county_name
      FROM zip_county_mapping
      WHERE zip_code LIKE ${searchTerm + '%'}
        AND state_code != 'PR'
      ORDER BY zip_code
      LIMIT 10
    `;
    zipResults.rows.forEach(row => {
      results.push({
        type: 'zip',
        display: `${row.zip_code} - ${row.county_name}, ${row.state_code}`,
        value: row.zip_code,
        state: row.state_code
      });
    });
  }

  // Search cities using trigram
  if (!type || type === 'city' || type === 'all') {
    let cityQuery;
    if (stateFilter) {
      // If state is specified, filter by both city name and state
      cityQuery = sql`
        SELECT 
          city_name, 
          state_code, 
          state_name,
          CASE WHEN city_name ILIKE ${citySearchTerm + '%'} THEN 1 ELSE 2 END as sort_order
        FROM cities
        WHERE city_name ILIKE ${'%' + citySearchTerm + '%'}
          AND state_code = ${stateFilter}
        ORDER BY sort_order, city_name
        LIMIT 10
      `;
    } else {
      // No state filter, search all cities
      cityQuery = sql`
        SELECT 
          city_name, 
          state_code, 
          state_name,
          CASE WHEN city_name ILIKE ${citySearchTerm + '%'} THEN 1 ELSE 2 END as sort_order
        FROM cities
        WHERE city_name ILIKE ${'%' + citySearchTerm + '%'}
          AND state_code != 'PR'
        ORDER BY sort_order, city_name
        LIMIT 10
      `;
    }
    const cityResults = await cityQuery;
    cityResults.rows.forEach(row => {
      results.push({
        type: 'city',
        display: `${row.city_name}, ${row.state_code}`,
        value: `${row.city_name}, ${row.state_code}`,
        state: row.state_code
      });
    });
  }

  // Search counties using trigram
  if (!type || type === 'county' || type === 'all') {
    let countyQuery;
    // Search for both the base name (without "county") and the original search term
    // This handles both "whatcom" -> "Whatcom County" and "whatcom county" -> "Whatcom County"
    // Use ILIKE for case-insensitive matching
    const countySearchPattern1 = `%${countySearchBase}%`;
    const countySearchPattern2 = `${countySearchBase}%`;
    const countySearchPattern3 = `%${countySearchOriginal}%`;
    
    if (stateFilter) {
      // If state is specified, filter by both county name and state
      countyQuery = sql`
        SELECT DISTINCT 
          county_name, 
          state_code, 
          state_name,
          CASE 
            WHEN county_name ILIKE ${countySearchPattern2} THEN 1
            WHEN county_name ILIKE ${countySearchPattern1} THEN 2
            WHEN county_name ILIKE ${countySearchPattern3} THEN 3
            ELSE 4
          END as sort_order
        FROM zip_county_mapping
        WHERE (
          county_name ILIKE ${countySearchPattern1}
          OR county_name ILIKE ${countySearchPattern2}
          OR county_name ILIKE ${countySearchPattern3}
        )
          AND state_code = ${stateFilter}
        ORDER BY sort_order, county_name
        LIMIT 10
      `;
    } else {
      // No state filter, search all counties (excluding PR)
      countyQuery = sql`
        SELECT DISTINCT 
          county_name, 
          state_code, 
          state_name,
          CASE 
            WHEN county_name ILIKE ${countySearchPattern2} THEN 1
            WHEN county_name ILIKE ${countySearchPattern1} THEN 2
            WHEN county_name ILIKE ${countySearchPattern3} THEN 3
            ELSE 4
          END as sort_order
        FROM zip_county_mapping
        WHERE (
          county_name ILIKE ${countySearchPattern1}
          OR county_name ILIKE ${countySearchPattern2}
          OR county_name ILIKE ${countySearchPattern3}
        )
          AND state_code != 'PR'
        ORDER BY sort_order, county_name
        LIMIT 10
      `;
    }
    const countyResults = await countyQuery;
    countyResults.rows.forEach(row => {
      // Ensure county name includes "County" if it's a county
      const countyDisplay = row.county_name.includes('County') 
        ? row.county_name 
        : `${row.county_name} County`;
      results.push({
        type: 'county',
        display: `${countyDisplay}, ${row.state_code}`,
        value: `${countyDisplay}, ${row.state_code}`,
        state: row.state_code
      });
    });
  }

  return results.slice(0, 20); // Limit total results
}

/**
 * Get FMR data by ZIP code (checks SAFMR first, falls back to county FMR)
 */
export async function getFMRByZip(zipCode: string, year?: number): Promise<FMRResult | null> {
  // Default to 2026 (current FMR year) instead of current calendar year
  const targetYear = year || 2026;
  
  // Try SAFMR first
  const safmrResult = await sql`
    SELECT year, zip_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
    FROM safmr_data
    WHERE zip_code = ${zipCode} AND year = ${targetYear}
    LIMIT 1
  `;

  if (safmrResult.rows.length > 0) {
    const row = safmrResult.rows[0];
    // Get county info (excluding PR)
    const countyInfo = await sql`
      SELECT county_name, state_code, state_name
      FROM zip_county_mapping
      WHERE zip_code = ${zipCode}
        AND state_code != 'PR'
      LIMIT 1
    `;
    
    // If ZIP is in PR, return null
    if (countyInfo.rows.length === 0) {
      return null;
    }
    
    return {
      source: 'safmr',
      zipCode: row.zip_code,
      areaName: countyInfo.rows[0]?.county_name || zipCode,
      stateCode: countyInfo.rows[0]?.state_code || '',
      countyName: countyInfo.rows[0]?.county_name,
      year: row.year,
      bedroom0: row.bedroom_0 ? parseFloat(row.bedroom_0) : undefined,
      bedroom1: row.bedroom_1 ? parseFloat(row.bedroom_1) : undefined,
      bedroom2: row.bedroom_2 ? parseFloat(row.bedroom_2) : undefined,
      bedroom3: row.bedroom_3 ? parseFloat(row.bedroom_3) : undefined,
      bedroom4: row.bedroom_4 ? parseFloat(row.bedroom_4) : undefined,
      effectiveDate: row.effective_date
    };
  }

  // Fallback to county FMR (excluding PR)
  const countyInfo = await sql`
    SELECT county_name, state_code, state_name
    FROM zip_county_mapping
    WHERE zip_code = ${zipCode}
      AND state_code != 'PR'
    LIMIT 1
  `;

  if (countyInfo.rows.length === 0) {
    return null;
  }

  const county = countyInfo.rows[0];
  // Normalize county name for matching
  const normalizedCounty = county.county_name.replace(/\s+County\s*$/i, '').trim();
  
  const fmrResult = await sql`
    SELECT year, area_name, state_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
    FROM fmr_data
    WHERE (area_name ILIKE ${'%' + normalizedCounty + '%'} 
           OR area_name ILIKE ${normalizedCounty + ' County%'})
      AND state_code = ${county.state_code}
      AND year = ${targetYear}
    ORDER BY 
      CASE WHEN area_name ILIKE ${normalizedCounty + ' County%'} THEN 1 ELSE 2 END
    LIMIT 1
  `;

  if (fmrResult.rows.length > 0) {
    const row = fmrResult.rows[0];
    return {
      source: 'fmr',
      zipCode,
      areaName: row.area_name,
      stateCode: row.state_code,
      countyName: county.county_name,
      year: row.year,
      bedroom0: row.bedroom_0 ? parseFloat(row.bedroom_0) : undefined,
      bedroom1: row.bedroom_1 ? parseFloat(row.bedroom_1) : undefined,
      bedroom2: row.bedroom_2 ? parseFloat(row.bedroom_2) : undefined,
      bedroom3: row.bedroom_3 ? parseFloat(row.bedroom_3) : undefined,
      bedroom4: row.bedroom_4 ? parseFloat(row.bedroom_4) : undefined,
      effectiveDate: row.effective_date
    };
  }

  return null;
}

/**
 * Get FMR data by county name and state
 */
export async function getFMRByCounty(countyName: string, stateCode: string, year?: number): Promise<FMRResult | null> {
  // Default to 2026 (current FMR year) instead of current calendar year
  const targetYear = year || 2026;
  
  // Exclude PR
  if (stateCode.toUpperCase() === 'PR') {
    return null;
  }
  
  // Normalize county name - remove "County" suffix if present, then search with or without it
  const normalizedCounty = countyName.replace(/\s+County\s*$/i, '').trim();
  
  const result = await sql`
    SELECT year, area_name, state_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
    FROM fmr_data
    WHERE (area_name ILIKE ${'%' + normalizedCounty + '%'} 
           OR area_name ILIKE ${normalizedCounty + ' County%'})
      AND state_code = ${stateCode.toUpperCase()}
      AND state_code != 'PR'
      AND year = ${targetYear}
    ORDER BY 
      CASE WHEN area_name ILIKE ${normalizedCounty + ' County%'} THEN 1 ELSE 2 END
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return null;
  }

  // Get all ZIP codes for this county
  const zipCodesResult = await sql`
    SELECT DISTINCT zip_code
    FROM zip_county_mapping
    WHERE county_name ILIKE ${normalizedCounty + '%'}
      AND state_code = ${stateCode.toUpperCase()}
    ORDER BY zip_code
  `;

  const zipCodes = zipCodesResult.rows.map(row => row.zip_code);

  // Check if we have SAFMR data for any of these ZIP codes
  if (zipCodes.length > 0) {
    const zipPlaceholders = zipCodes.map((_, i) => `$${i + 1}`).join(', ');
    const safmrResults = await sql.query(
      `SELECT zip_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
       FROM safmr_data
       WHERE zip_code IN (${zipPlaceholders})
         AND year = $${zipCodes.length + 1}
       ORDER BY zip_code`,
      [...zipCodes, targetYear]
    );

    if (safmrResults.rows.length > 0) {
      // We have SAFMR data - return all ZIP codes with their individual FMR values
      const zipFMRData: ZIPFMRData[] = safmrResults.rows.map(row => ({
        zipCode: row.zip_code,
        bedroom0: row.bedroom_0 ? parseFloat(row.bedroom_0) : undefined,
        bedroom1: row.bedroom_1 ? parseFloat(row.bedroom_1) : undefined,
        bedroom2: row.bedroom_2 ? parseFloat(row.bedroom_2) : undefined,
        bedroom3: row.bedroom_3 ? parseFloat(row.bedroom_3) : undefined,
        bedroom4: row.bedroom_4 ? parseFloat(row.bedroom_4) : undefined,
      }));

      const row = result.rows[0];
      return {
        source: 'safmr',
        zipCodes: zipCodes,
        zipFMRData,
        areaName: row.area_name,
        stateCode: row.state_code,
        countyName,
        year: row.year,
        effectiveDate: safmrResults.rows[0]?.effective_date
      };
    }
  }

  // Fallback to county FMR
  const row = result.rows[0];
  return {
    source: 'fmr',
    areaName: row.area_name,
    stateCode: row.state_code,
    countyName,
    zipCodes: zipCodes.length > 0 ? zipCodes : undefined,
    year: row.year,
    bedroom0: row.bedroom_0 ? parseFloat(row.bedroom_0) : undefined,
    bedroom1: row.bedroom_1 ? parseFloat(row.bedroom_1) : undefined,
    bedroom2: row.bedroom_2 ? parseFloat(row.bedroom_2) : undefined,
    bedroom3: row.bedroom_3 ? parseFloat(row.bedroom_3) : undefined,
    bedroom4: row.bedroom_4 ? parseFloat(row.bedroom_4) : undefined,
    effectiveDate: row.effective_date
  };
}

/**
 * Get FMR data by city name and state
 */
export async function getFMRByCity(cityName: string, stateCode: string, year?: number): Promise<FMRResult | null> {
  // Default to 2026 (current FMR year) instead of current calendar year
  const targetYear = year || 2026;
  
  // Exclude PR
  if (stateCode.toUpperCase() === 'PR') {
    return null;
  }
  
  // Get ZIP codes for this city (excluding PR)
  const cityInfo = await sql`
    SELECT zip_codes, state_code, city_name
    FROM cities
    WHERE city_name ILIKE ${cityName}
      AND state_code = ${stateCode.toUpperCase()}
      AND state_code != 'PR'
    LIMIT 1
  `;

  if (cityInfo.rows.length === 0) {
    return null;
  }

  const zipCodes = cityInfo.rows[0].zip_codes;
  if (!zipCodes || zipCodes.length === 0) {
    return null;
  }

  // Get SAFMR data for all ZIP codes in this city
  const safmrResults = await sql`
    SELECT zip_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
    FROM safmr_data
    WHERE zip_code = ANY(${zipCodes})
      AND year = ${targetYear}
    ORDER BY zip_code
  `;

  // Get county info from first ZIP
  const countyInfo = await sql`
    SELECT county_name, state_code, state_name
    FROM zip_county_mapping
    WHERE zip_code = ${zipCodes[0]}
    LIMIT 1
  `;

  if (safmrResults.rows.length > 0) {
    // We have SAFMR data - return all ZIP codes with their individual FMR values
    const zipFMRData: ZIPFMRData[] = safmrResults.rows.map(row => ({
      zipCode: row.zip_code,
      bedroom0: row.bedroom_0 ? parseFloat(row.bedroom_0) : undefined,
      bedroom1: row.bedroom_1 ? parseFloat(row.bedroom_1) : undefined,
      bedroom2: row.bedroom_2 ? parseFloat(row.bedroom_2) : undefined,
      bedroom3: row.bedroom_3 ? parseFloat(row.bedroom_3) : undefined,
      bedroom4: row.bedroom_4 ? parseFloat(row.bedroom_4) : undefined,
    }));

    return {
      source: 'safmr',
      zipCodes: zipCodes,
      zipFMRData,
      areaName: countyInfo.rows[0]?.county_name || cityInfo.rows[0].city_name,
      stateCode: stateCode.toUpperCase(),
      countyName: countyInfo.rows[0]?.county_name,
      year: targetYear,
      effectiveDate: safmrResults.rows[0]?.effective_date
    };
  }

  // Fallback to county FMR if no SAFMR data
  const result = await getFMRByZip(zipCodes[0], targetYear);
  if (result) {
    result.zipCodes = zipCodes;
    return result;
  }
  return null;
}

