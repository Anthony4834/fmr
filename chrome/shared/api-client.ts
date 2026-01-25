// API client for making requests to the main app API

import { getApiBaseUrl } from './config';

// Import auth functions (dynamic import to avoid circular dependencies)
let getAuthHeaders: (() => Promise<Record<string, string>>) | null = null;

// Lazy load auth module
async function loadAuthHeaders(): Promise<Record<string, string>> {
  if (!getAuthHeaders) {
    const authModule = await import('./auth');
    getAuthHeaders = authModule.getAuthHeaders;
  }
  return getAuthHeaders();
}

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
  rateLimited?: boolean;
}

export interface MarketParamsResponse {
  data: {
    propertyTaxRateAnnualPct: number | null;
    mortgageRateAnnualPct: number | null;
  };
  error?: string;
  rateLimited?: boolean;
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
    const API_BASE_URL = await getApiBaseUrl();
    const url = `${API_BASE_URL}/api/search/fmr?zip=${encodeURIComponent(zipCode)}`;
    const authHeaders = await loadAuthHeaders();
    const response = await fetch(url, {
      headers: {
        ...authHeaders,
      },
    });
    const data = await response.json();

    if (response.status === 429) {
      return { data: data as any, error: data.error || 'Rate limit exceeded', rateLimited: true };
    }

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
    const API_BASE_URL = await getApiBaseUrl();
    const url = `${API_BASE_URL}/api/investment/market-params?zip=${encodeURIComponent(zip)}`;
    const authHeaders = await loadAuthHeaders();
    const response = await fetch(url, {
      headers: {
        ...authHeaders,
      },
    });
    const data = await response.json();
    
    if (response.status === 429) {
      return {
        data: { propertyTaxRateAnnualPct: null, mortgageRateAnnualPct: null },
        error: data.error || 'Rate limit exceeded',
        rateLimited: true,
      };
    }
    
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
    const API_BASE_URL = await getApiBaseUrl();
    const url = `${API_BASE_URL}/api/investment/score?zip=${encodeURIComponent(zip)}`;
    const authHeaders = await loadAuthHeaders();
    const response = await fetch(url, {
      headers: {
        ...authHeaders,
      },
    });
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
export async function trackMissingData(params: TrackMissingDataParams): Promise<void> {
  if (params.missingFields.length === 0) return;

  const API_BASE_URL = await getApiBaseUrl();
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
  const authHeaders = await loadAuthHeaders();
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body,
  }).catch(() => {
    // Silently ignore errors - this is best-effort tracking
  });
}
