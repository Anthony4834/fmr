import { sql } from '@vercel/postgres';
import type { FMRHistoryPoint, FMRResult, ZIPFMRData } from '@/lib/types';
import { formatCountyName, removeCountySuffix } from '@/lib/county-utils';

export interface AutocompleteResult {
  type: 'zip' | 'city' | 'county' | 'state';
  display: string;
  value: string;
  state?: string;
}

let cachedLatestFY: number | null = null;
let cachedLatestFYAtMs = 0;
const LATEST_FY_TTL_MS = 6 * 60 * 60 * 1000; // 6h

async function getLatestFYFromDb(): Promise<number> {
  // Use the max year across both datasets (covers SAFMR-only years and FMR-only years).
  const [fmr, safmr] = await Promise.all([
    sql`SELECT MAX(year) as max_year FROM fmr_data`,
    sql`SELECT MAX(year) as max_year FROM safmr_data`,
  ]);
  const fmrYear = fmr.rows?.[0]?.max_year ? Number(fmr.rows[0].max_year) : 0;
  const safmrYear = safmr.rows?.[0]?.max_year ? Number(safmr.rows[0].max_year) : 0;
  const latest = Math.max(fmrYear || 0, safmrYear || 0);
  // Fallback if tables are empty/unavailable.
  return latest > 0 ? latest : 2026;
}

export async function getLatestFMRYear(): Promise<number> {
  const now = Date.now();
  if (cachedLatestFY && now - cachedLatestFYAtMs < LATEST_FY_TTL_MS) {
    return cachedLatestFY;
  }
  const latest = await getLatestFYFromDb();
  cachedLatestFY = latest;
  cachedLatestFYAtMs = now;
  return latest;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function aggregateResultToHistoryPoint(result: FMRResult): FMRHistoryPoint {
  // For SAFMR results with many ZIPs, aggregate to a single representative value per bedroom (median).
  if (result.zipFMRData && result.zipFMRData.length > 0) {
    const b0 = result.zipFMRData.map(z => z.bedroom0).filter(v => v !== undefined) as number[];
    const b1 = result.zipFMRData.map(z => z.bedroom1).filter(v => v !== undefined) as number[];
    const b2 = result.zipFMRData.map(z => z.bedroom2).filter(v => v !== undefined) as number[];
    const b3 = result.zipFMRData.map(z => z.bedroom3).filter(v => v !== undefined) as number[];
    const b4 = result.zipFMRData.map(z => z.bedroom4).filter(v => v !== undefined) as number[];

    return {
      year: result.year,
      source: result.source,
      bedroom0: median(b0),
      bedroom1: median(b1),
      bedroom2: median(b2),
      bedroom3: median(b3),
      bedroom4: median(b4),
      effectiveDate: result.effectiveDate
    };
  }

  return {
    year: result.year,
    source: result.source,
    bedroom0: result.bedroom0,
    bedroom1: result.bedroom1,
    bedroom2: result.bedroom2,
    bedroom3: result.bedroom3,
    bedroom4: result.bedroom4,
    effectiveDate: result.effectiveDate
  };
}

/**
 * Search for autocomplete suggestions using PostgreSQL trigram search
 */
export async function searchAutocomplete(
  query: string,
  type?: 'zip' | 'city' | 'county' | 'state' | 'all'
): Promise<AutocompleteResult[]> {
  let searchTerm = query.trim();
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

  // Parse "city, state" or "county, state" format
  // Also handle the common partial input "city, " (trailing comma while user is about to type state)
  let citySearchTerm = searchTerm;
  let stateFilter: string | null = null;
  const cityStateMatch = searchTerm.match(/^(.+?),\s*([A-Z]{2})$/i);
  if (cityStateMatch) {
    citySearchTerm = cityStateMatch[1].trim();
    stateFilter = cityStateMatch[2].trim().toUpperCase();
  } else {
    const trailingCommaMatch = searchTerm.match(/^(.+?),\s*$/);
    if (trailingCommaMatch) {
      citySearchTerm = trailingCommaMatch[1].trim();
    }
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

  // Search states (pure in-memory match; no DB required)
  if (!type || type === 'state' || type === 'all') {
    const { findStateMatches } = await import('@/lib/states');
    const matches = findStateMatches(searchTerm, 8);
    matches.forEach((st) => {
      results.push({
        type: 'state',
        display: `${st.name} (${st.code})`,
        value: st.code,
        state: st.code,
      });
    });
  }

  // Search ZIP codes (excluding PR)
  if (!type || type === 'zip' || type === 'all') {
    // If the user typed a trailing comma (e.g. "98101, "), don't let it break ZIP prefix search
    const zipSearchTerm = searchTerm.replace(/,\s*$/, '').trim();
    const zipResults = await sql`
      SELECT DISTINCT zip_code, state_code, county_name
      FROM zip_county_mapping
      WHERE zip_code LIKE ${zipSearchTerm + '%'}
        AND state_code != 'PR'
      ORDER BY zip_code
      LIMIT 10
    `;
    zipResults.rows.forEach(row => {
      const countyDisplay = formatCountyName(row.county_name || '', row.state_code);
      results.push({
        type: 'zip',
        display: `${row.zip_code} - ${countyDisplay}, ${row.state_code}`,
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
      // Format county name with appropriate suffix (County or Parish for LA)
      const countyDisplay = formatCountyName(row.county_name, row.state_code);
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
 * Get FMR data by ZIP code (checks SAFMR only if ZIP is in required SAFMR area, otherwise uses county FMR)
 */
export async function getFMRByZip(zipCode: string, year?: number): Promise<FMRResult | null> {
  // Default to latest available FY unless explicitly provided
  const targetYear = year ?? (await getLatestFMRYear());
  
  // Get county info first (excluding PR)
  const countyInfo = await sql`
    SELECT county_name, state_code, state_name, county_fips
    FROM zip_county_mapping
    WHERE zip_code = ${zipCode}
      AND state_code != 'PR'
    LIMIT 1
  `;
  
  // If ZIP is in PR, return null
  if (countyInfo.rows.length === 0) {
    return null;
  }

  // Best-effort city lookup for breadcrumbs (ZIP -> city).
  // Some ZIPs map to multiple cities; pick a stable representative (alphabetical).
  const cityLookup = await sql`
    SELECT city_name
    FROM cities
    WHERE state_code = ${countyInfo.rows[0]?.state_code || ''}
      AND ${zipCode} = ANY(zip_codes)
    ORDER BY city_name
    LIMIT 1
  `;
  const cityName = cityLookup.rows?.[0]?.city_name || undefined;
  
  // Check if this ZIP is in a required SAFMR area (simple lookup)
  const requiredSAFMRCheck = await sql`
    SELECT 1
    FROM required_safmr_zips
    WHERE zip_code = ${zipCode} AND year = ${targetYear}
    LIMIT 1
  `;
  
  // Only use SAFMR if ZIP is in a required SAFMR area
  if (requiredSAFMRCheck.rows.length > 0) {
    const safmrResult = await sql`
      SELECT year, zip_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
      FROM safmr_data
      WHERE zip_code = ${zipCode} AND year = ${targetYear}
      LIMIT 1
    `;

    if (safmrResult.rows.length > 0) {
      const row = safmrResult.rows[0];
      
      return {
        source: 'safmr',
        zipCode: row.zip_code,
        areaName: countyInfo.rows[0]?.county_name || zipCode,
        stateCode: countyInfo.rows[0]?.state_code || '',
        countyName: countyInfo.rows[0]?.county_name,
        cityName,
        year: row.year,
        bedroom0: row.bedroom_0 ? parseFloat(row.bedroom_0) : undefined,
        bedroom1: row.bedroom_1 ? parseFloat(row.bedroom_1) : undefined,
        bedroom2: row.bedroom_2 ? parseFloat(row.bedroom_2) : undefined,
        bedroom3: row.bedroom_3 ? parseFloat(row.bedroom_3) : undefined,
        bedroom4: row.bedroom_4 ? parseFloat(row.bedroom_4) : undefined,
        effectiveDate: row.effective_date
      };
    }
  }

  // Fallback to county FMR
  const county = countyInfo.rows[0];
  // Prefer an exact county FIPS join when available. This is more reliable than name matching
  // (fixes cases like "LaSalle" vs "La Salle", "Borough", etc).
  let fmrResult;
  if (county.county_fips) {
    // Special case: some DC ZIPs are mapped to neighboring MD/VA counties in zip_county_mapping,
    // but keep state_code = 'DC'. In that case, allow the county_fips to match in MD/VA.
    if (county.state_code === 'DC') {
      fmrResult = await sql`
        SELECT year, area_name, state_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
        FROM fmr_data
        WHERE county_code = ${county.county_fips}
          AND state_code IN ('MD', 'VA')
          AND year = ${targetYear}
        LIMIT 1
      `;
    } else {
      fmrResult = await sql`
        SELECT year, area_name, state_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
        FROM fmr_data
        WHERE county_code = ${county.county_fips}
          AND state_code = ${county.state_code}
          AND year = ${targetYear}
        LIMIT 1
      `;
    }
  } else {
    fmrResult = { rows: [] as any[] };
  }

  // If no FIPS match (or no FIPS), fallback to county-name matching
  if (fmrResult.rows.length === 0) {
    // Normalize county name for matching
    const normalizedCounty = county.county_name.replace(/\s+County\s*$/i, '').trim();
    fmrResult = await sql`
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
  }

  if (fmrResult.rows.length > 0) {
    const row = fmrResult.rows[0];
    return {
      source: 'fmr',
      zipCode,
      areaName: row.area_name,
      stateCode: row.state_code,
      countyName: county.county_name,
      cityName,
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
 * Get historical (FY2022–FY2026) FMR/SAFMR data by ZIP code.
 * Returns an aggregated series (median for SAFMR multi-ZIP results).
 */
export async function getFMRHistoryByZip(zipCode: string): Promise<FMRHistoryPoint[]> {
  const latest = await getLatestFMRYear();
  const years = Array.from({ length: 5 }, (_, i) => latest - 4 + i);
  const results = await Promise.all(
    years.map(async (y) => {
      const r = await getFMRByZip(zipCode, y);
      return r ? aggregateResultToHistoryPoint(r) : null;
    })
  );
  return results.filter(Boolean) as FMRHistoryPoint[];
}

/**
 * Get FMR data by county name and state
 */
export async function getFMRByCounty(countyName: string, stateCode: string, year?: number): Promise<FMRResult | null> {
  // Default to latest available FY unless explicitly provided
  const targetYear = year ?? (await getLatestFMRYear());
  
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

  // Check if any ZIP codes in this county are in required SAFMR areas
  const row = result.rows[0];
  
  if (zipCodes.length > 0) {
    // Use parameterized query to safely pass arrays (keeps TypeScript happy too)
    const requiredSAFMRCheck = await sql.query(
      `SELECT zip_code
       FROM required_safmr_zips
       WHERE zip_code = ANY($1)
         AND year = $2
       LIMIT 1`,
      [zipCodes, targetYear]
    );

    // Only use SAFMR if ZIPs are in required SAFMR areas
    if (requiredSAFMRCheck.rows.length > 0) {
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
  }

  // Fallback to county FMR
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
 * Get historical (FY2022–FY2026) FMR/SAFMR data by county + state.
 * Returns an aggregated series (median for SAFMR multi-ZIP results).
 */
export async function getFMRHistoryByCounty(countyName: string, stateCode: string): Promise<FMRHistoryPoint[]> {
  const latest = await getLatestFMRYear();
  const years = Array.from({ length: 5 }, (_, i) => latest - 4 + i);
  const results = await Promise.all(
    years.map(async (y) => {
      const r = await getFMRByCounty(countyName, stateCode, y);
      return r ? aggregateResultToHistoryPoint(r) : null;
    })
  );
  return results.filter(Boolean) as FMRHistoryPoint[];
}

/**
 * Get FMR data by city name and state
 */
export async function getFMRByCity(cityName: string, stateCode: string, year?: number): Promise<FMRResult | null> {
  // Default to latest available FY unless explicitly provided
  const targetYear = year ?? (await getLatestFMRYear());
  
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

  // Get county info from first ZIP to check if area is required SAFMR
  const countyInfo = await sql`
    SELECT county_name, state_code, state_name
    FROM zip_county_mapping
    WHERE zip_code = ${zipCodes[0]}
    LIMIT 1
  `;

  // Check if any ZIP codes in this city are in required SAFMR areas
  const requiredSAFMRCheck = await sql`
    SELECT zip_code
    FROM required_safmr_zips
    WHERE zip_code = ANY(${zipCodes})
      AND year = ${targetYear}
    LIMIT 1
  `;

  // Only use SAFMR if ZIPs are in required SAFMR areas
  if (requiredSAFMRCheck.rows.length > 0) {
    const safmrResults = await sql`
      SELECT zip_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
      FROM safmr_data
      WHERE zip_code = ANY(${zipCodes})
        AND year = ${targetYear}
      ORDER BY zip_code
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
        cityName: cityInfo.rows[0]?.city_name || cityName,
        year: targetYear,
        effectiveDate: safmrResults.rows[0]?.effective_date
      };
    }
  }

  // Fallback to county FMR if no SAFMR data
  const result = await getFMRByZip(zipCodes[0], targetYear);
  if (result) {
    result.zipCodes = zipCodes;
    // Preserve the searched city for breadcrumbs, even if the ZIP->city lookup differs.
    result.cityName = cityInfo.rows[0]?.city_name || cityName;
    return result;
  }
  return null;
}

/**
 * Get historical (FY2022–FY2026) FMR/SAFMR data by city + state.
 * Returns an aggregated series (median for SAFMR multi-ZIP results).
 */
export async function getFMRHistoryByCity(cityName: string, stateCode: string): Promise<FMRHistoryPoint[]> {
  const latest = await getLatestFMRYear();
  const years = Array.from({ length: 5 }, (_, i) => latest - 4 + i);
  const results = await Promise.all(
    years.map(async (y) => {
      const r = await getFMRByCity(cityName, stateCode, y);
      return r ? aggregateResultToHistoryPoint(r) : null;
    })
  );
  return results.filter(Boolean) as FMRHistoryPoint[];
}

/**
 * Investment score data for a city (used when FMR data is not available)
 */
export interface CityInvestmentScore {
  cityName: string;
  stateCode: string;
  countyName?: string;
  year: number;
  zipCount: number;
  medianScore: number | null;
  avgScore: number | null;
  avgYield: number | null;
  avgPropertyValue: number | null;
  avgTaxRate: number | null;
  avgAnnualRent: number | null;
}

/**
 * Get investment score data for a city directly from investment_score table.
 * This is used as a fallback when FMR data is not available.
 */
export async function getCityInvestmentScore(cityName: string, stateCode: string, year?: number): Promise<CityInvestmentScore | null> {
  const targetYear = year ?? (await getLatestFMRYear());

  if (stateCode.toUpperCase() === 'PR') {
    return null;
  }

  const result = await sql`
    WITH city_data AS (
      SELECT
        city_name,
        state_code,
        county_name,
        COALESCE(score_with_demand, score) as score,
        net_yield,
        property_value,
        tax_rate,
        annual_rent,
        zhvi_month,
        acs_vintage
      FROM investment_score
      WHERE city_name ILIKE ${cityName}
        AND state_code = ${stateCode.toUpperCase()}
        AND fmr_year = ${targetYear}
        AND data_sufficient = true
    ),
    latest_versions AS (
      SELECT
        MAX(zhvi_month) as latest_zhvi_month,
        MAX(acs_vintage) as latest_acs_vintage
      FROM city_data
    ),
    filtered_data AS (
      SELECT *
      FROM city_data cd
      CROSS JOIN latest_versions lv
      WHERE (
        (lv.latest_zhvi_month IS NULL AND cd.zhvi_month IS NULL) OR
        (lv.latest_zhvi_month IS NOT NULL AND cd.zhvi_month = lv.latest_zhvi_month)
      )
      AND (
        (lv.latest_acs_vintage IS NULL AND cd.acs_vintage IS NULL) OR
        (lv.latest_acs_vintage IS NOT NULL AND cd.acs_vintage = lv.latest_acs_vintage)
      )
    )
    SELECT
      city_name,
      state_code,
      (SELECT county_name FROM filtered_data LIMIT 1) as county_name,
      COUNT(*) as zip_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
      AVG(score) as avg_score,
      AVG(net_yield) as avg_yield,
      AVG(property_value) as avg_property_value,
      AVG(tax_rate) as avg_tax_rate,
      AVG(annual_rent) as avg_annual_rent
    FROM filtered_data
    GROUP BY city_name, state_code
  `;

  if (result.rows.length === 0 || Number(result.rows[0]?.zip_count) === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    cityName: row.city_name,
    stateCode: row.state_code,
    countyName: row.county_name || undefined,
    year: targetYear,
    zipCount: Number(row.zip_count),
    medianScore: row.median_score ? Number(row.median_score) : null,
    avgScore: row.avg_score ? Number(row.avg_score) : null,
    avgYield: row.avg_yield ? Number(row.avg_yield) : null,
    avgPropertyValue: row.avg_property_value ? Number(row.avg_property_value) : null,
    avgTaxRate: row.avg_tax_rate ? Number(row.avg_tax_rate) : null,
    avgAnnualRent: row.avg_annual_rent ? Number(row.avg_annual_rent) : null,
  };
}

/**
 * Investment score data for a county (used when FMR data is not available)
 */
export interface CountyInvestmentScore {
  countyName: string;
  stateCode: string;
  year: number;
  zipCount: number;
  medianScore: number | null;
  avgScore: number | null;
  avgYield: number | null;
  avgPropertyValue: number | null;
  avgTaxRate: number | null;
  avgAnnualRent: number | null;
}

/**
 * Get investment score data for a county directly from investment_score table.
 * This is used as a fallback when FMR data is not available.
 */
export async function getCountyInvestmentScore(countyName: string, stateCode: string, year?: number): Promise<CountyInvestmentScore | null> {
  const targetYear = year ?? (await getLatestFMRYear());

  if (stateCode.toUpperCase() === 'PR') {
    return null;
  }

  // Normalize county name (remove "County" suffix if present)
  const normalizedCounty = countyName.replace(/\s+County\s*$/i, '').trim();

  const result = await sql`
    WITH county_data AS (
      SELECT
        county_name,
        state_code,
        COALESCE(score_with_demand, score) as score,
        net_yield,
        property_value,
        tax_rate,
        annual_rent,
        zhvi_month,
        acs_vintage
      FROM investment_score
      WHERE (
        county_name ILIKE ${normalizedCounty}
        OR county_name ILIKE ${normalizedCounty + ' County'}
      )
        AND state_code = ${stateCode.toUpperCase()}
        AND fmr_year = ${targetYear}
        AND data_sufficient = true
        AND county_name IS NOT NULL
    ),
    latest_versions AS (
      SELECT
        MAX(zhvi_month) as latest_zhvi_month,
        MAX(acs_vintage) as latest_acs_vintage
      FROM county_data
    ),
    filtered_data AS (
      SELECT *
      FROM county_data cd
      CROSS JOIN latest_versions lv
      WHERE (
        (lv.latest_zhvi_month IS NULL AND cd.zhvi_month IS NULL) OR
        (lv.latest_zhvi_month IS NOT NULL AND cd.zhvi_month = lv.latest_zhvi_month)
      )
      AND (
        (lv.latest_acs_vintage IS NULL AND cd.acs_vintage IS NULL) OR
        (lv.latest_acs_vintage IS NOT NULL AND cd.acs_vintage = lv.latest_acs_vintage)
      )
    )
    SELECT
      (SELECT county_name FROM filtered_data LIMIT 1) as county_name,
      state_code,
      COUNT(*) as zip_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
      AVG(score) as avg_score,
      AVG(net_yield) as avg_yield,
      AVG(property_value) as avg_property_value,
      AVG(tax_rate) as avg_tax_rate,
      AVG(annual_rent) as avg_annual_rent
    FROM filtered_data
    GROUP BY state_code
  `;

  if (result.rows.length === 0 || Number(result.rows[0]?.zip_count) === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    countyName: row.county_name || normalizedCounty,
    stateCode: row.state_code,
    year: targetYear,
    zipCount: Number(row.zip_count),
    medianScore: row.median_score ? Number(row.median_score) : null,
    avgScore: row.avg_score ? Number(row.avg_score) : null,
    avgYield: row.avg_yield ? Number(row.avg_yield) : null,
    avgPropertyValue: row.avg_property_value ? Number(row.avg_property_value) : null,
    avgTaxRate: row.avg_tax_rate ? Number(row.avg_tax_rate) : null,
    avgAnnualRent: row.avg_annual_rent ? Number(row.avg_annual_rent) : null,
  };
}

