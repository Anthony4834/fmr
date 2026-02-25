/** Per-bedroom market rent (0-4 BR) from RentCast/rentcast_market_rents. */
export interface MarketRentByBR {
  bedroom0?: number | null;
  bedroom1?: number | null;
  bedroom2?: number | null;
  bedroom3?: number | null;
  bedroom4?: number | null;
}

/** Effective rent = min(HUD FMR, market rent) per BR. 5-8 BR derived from 4BR on client. */
export interface EffectiveRentByBR {
  bedroom0?: number | null;
  bedroom1?: number | null;
  bedroom2?: number | null;
  bedroom3?: number | null;
  bedroom4?: number | null;
}

/** Flags when HUD FMR exceeds market rent or market rent is missing. */
export interface RentConstraint {
  /** True when HUD FMR > market rent for the primary BR (e.g. 3BR). */
  isConstrained?: boolean;
  /** True when market rent data is missing for this location (effective rent = FMR). */
  missingMarketRent?: boolean;
  /** Dollar gap FMR - market rent (primary BR). */
  gapAmount?: number | null;
  /** Percent gap (FMR - market) / market (primary BR). */
  gapPct?: number | null;
}

export interface ZIPFMRData {
  zipCode: string;
  bedroom0?: number;
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
  marketRent?: MarketRentByBR;
  effectiveRent?: EffectiveRentByBR;
  rentConstraint?: RentConstraint;
  amrDataAsOf?: string | null;
}

export interface FMRHistoryPoint {
  year: number;
  source: 'safmr' | 'fmr';
  bedroom0?: number;
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
  effectiveDate?: Date | string;
}

export interface FMRResult {
  source: 'safmr' | 'fmr';
  zipCode?: string;
  zipCodes?: string[];
  zipFMRData?: ZIPFMRData[];
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
  effectiveDate?: Date | string;
  queriedLocation?: string;
  queriedType?: 'zip' | 'city' | 'county' | 'address';
  history?: FMRHistoryPoint[];
  /** Top-level market rent (when single ZIP or representative). */
  marketRent?: MarketRentByBR;
  /** Top-level effective rent (when single ZIP or representative). */
  effectiveRent?: EffectiveRentByBR;
  /** Constraint flags when FMR > market or market rent missing. */
  rentConstraint?: RentConstraint;
  /** When AMR data is from (e.g. RentCast scraped_at). ISO string. */
  amrDataAsOf?: string | null;
}




