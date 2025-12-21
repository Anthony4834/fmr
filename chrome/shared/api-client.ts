// API client for making requests to the main app API
// In production, this would point to https://fmr.fyi
// In development, could point to localhost

// Use a constant for Chrome extension context (process.env not available in browser)
const API_BASE_URL = 'https://fmr.fyi';

export interface FMRDataResponse {
  data: {
    source: 'safmr' | 'fmr';
    zipCode?: string;
    zipCodes?: string[];
    areaName: string;
    stateCode: string;
    countyName?: string;
    cityName?: string;
    year: number;
    bedroom0?: number;
    bedroom1?: number;
    bedroom2?: number;
    bedroom3?: number;
    bedroom4?: number;
    queriedLocation?: string;
    queriedType?: 'zip' | 'city' | 'county' | 'address';
  };
  error?: string;
}

export interface MarketParamsResponse {
  data: {
    propertyTaxRateAnnualPct: number | null;
    mortgageRateAnnualPct: number | null;
  };
  error?: string;
}

export interface InvestmentScoreResponse {
  found: boolean;
  score?: number;
  medianScore?: number;
  error?: string;
}

/**
 * Fetch FMR data for a ZIP code
 */
export async function fetchFMRData(zipCode: string): Promise<FMRDataResponse> {
  try {
    const url = `${API_BASE_URL}/api/search/fmr?zip=${encodeURIComponent(zipCode)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return { data: data as any, error: data.error || 'Failed to fetch FMR data' };
    }

    return { data: data.data };
  } catch (error) {
    return {
      data: {} as any,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Fetch market parameters (tax rate, mortgage rate) for a zip code
 */
export async function fetchMarketParams(zip: string): Promise<MarketParamsResponse> {
  try {
    const url = `${API_BASE_URL}/api/investment/market-params?zip=${encodeURIComponent(zip)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      return {
        data: { propertyTaxRateAnnualPct: null, mortgageRateAnnualPct: null },
        error: data.error || 'Failed to fetch market params',
      };
    }
    
    return {
      data: {
        propertyTaxRateAnnualPct: data.data?.propertyTaxRateAnnualPct ?? null,
        mortgageRateAnnualPct: data.data?.mortgageRateAnnualPct ?? null,
      },
    };
  } catch (error) {
    return {
      data: { propertyTaxRateAnnualPct: null, mortgageRateAnnualPct: null },
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Fetch investment score for a zip code
 */
export async function fetchInvestmentScore(zip: string): Promise<InvestmentScoreResponse> {
  try {
    const url = `${API_BASE_URL}/api/investment/score?zip=${encodeURIComponent(zip)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return { found: false, error: data.error || 'Failed to fetch investment score' };
    }

    return {
      found: data.found ?? false,
      score: data.score,
      medianScore: data.medianScore,
    };
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export type MissingDataField =
  | 'property_tax_rate'
  | 'mortgage_rate'
  | 'fmr_data'
  | 'fmr_bedroom'
  | 'price'
  | 'bedrooms'
  | 'address'
  | 'zip_code';

export interface TrackMissingDataParams {
  zipCode?: string | null;
  address?: string | null;
  bedrooms?: number | null;
  price?: number | null;
  missingFields: MissingDataField[];
  source?: string;
}

/**
 * Fire-and-forget logging of missing data events.
 * Never throws or blocks - used for debugging data gaps.
 */
export function trackMissingData(params: TrackMissingDataParams): void {
  if (params.missingFields.length === 0) return;

  const url = `${API_BASE_URL}/api/track/missing-data`;
  const body = JSON.stringify({
    zipCode: params.zipCode,
    address: params.address,
    bedrooms: params.bedrooms,
    price: params.price,
    missingFields: params.missingFields,
    source: params.source || 'chrome-extension',
  });

  // Fire-and-forget: don't await, don't care about response
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {
    // Silently ignore errors - this is best-effort tracking
  });
}
