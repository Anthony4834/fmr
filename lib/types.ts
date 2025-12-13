export interface ZIPFMRData {
  zipCode: string;
  bedroom0?: number;
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
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
}




