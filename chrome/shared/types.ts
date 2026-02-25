// Shared types for the extension
// These can reference types from the main app lib/types.ts

export interface CustomLineItem {
  id: string;
  label: string;
  method: 'percent' | 'amount';
  percentOf?: 'purchasePrice' | 'rent' | 'downPayment'; // Only used if method is 'percent'
  value: number;
}

export interface ExtensionPreferences {
  // Display mode for the on-page badge
  // - cashFlow: existing behavior (shows monthly cash flow)
  // - fmr: show FMR rent only (no cash flow calculation)
  mode: 'cashFlow' | 'fmr';

  // Rent source for badge and calculator: effective = min(FMR, market), fmr = HUD FMR only
  rentSource: 'effective' | 'fmr';

  // Auto-detection overrides (used if detection fails or user prefers manual)
  bedrooms: number | null;                    // Default: null (auto-detect), fallback: 3
  purchasePrice: number | null;               // Default: null (auto-detect)

  // Financial parameters (defaults used if auto-detected values not available)
  downPaymentMode: 'percent' | 'amount';
  downPaymentPercent: number;                 // Default: 20
  downPaymentAmount: number;                  // Default: 0
  insuranceMonthly: number;                   // Default: 100
  hoaMonthly: number;                         // Default: 0

  // Property management
  propertyManagementMode: 'percent' | 'amount';
  propertyManagementPercent: number;          // Default: 10
  propertyManagementAmount: number;           // Default: 0

  // Rate overrides (if true, use manual values instead of API-fetched)
  overrideTaxRate: boolean;                   // Default: false
  overrideMortgageRate: boolean;              // Default: false
  propertyTaxRateAnnualPct: number | null;    // Used if overrideTaxRate is true
  mortgageRateAnnualPct: number | null;       // Used if overrideMortgageRate is true

  // Custom line items for additional expenses
  customLineItems: CustomLineItem[];          // Default: []

  // Website selection
  enabledSites: {
    redfin: boolean;                          // Default: true
    zillow: boolean;                         // Default: true
  };
}

export interface DetectedProperty {
  address: string;
  bedrooms: number | null;
  price: number | null;
  zipCode: string | null;
}

export interface MarketParams {
  propertyTaxRateAnnualPct: number | null;
  mortgageRateAnnualPct: number | null;
}

export const DEFAULT_PREFERENCES: ExtensionPreferences = {
  mode: 'cashFlow',
  rentSource: 'effective',
  bedrooms: null,
  purchasePrice: null,
  downPaymentMode: 'percent',
  downPaymentPercent: 20,
  downPaymentAmount: 0,
  insuranceMonthly: 100,
  hoaMonthly: 0,
  propertyManagementMode: 'percent',
  propertyManagementPercent: 10,
  propertyManagementAmount: 0,
  overrideTaxRate: false,
  overrideMortgageRate: false,
  propertyTaxRateAnnualPct: null,
  mortgageRateAnnualPct: null,
  customLineItems: [],
  enabledSites: {
    redfin: true,
    zillow: true,
  },
};

