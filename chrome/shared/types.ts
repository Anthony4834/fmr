// Shared types for the extension
// These can reference types from the main app lib/types.ts

export interface ExtensionPreferences {
  // Auto-detection overrides (used if detection fails or user prefers manual)
  bedrooms: number | null;                    // Default: null (auto-detect), fallback: 3
  purchasePrice: number | null;               // Default: null (auto-detect)
  
  // Financial parameters (defaults used if auto-detected values not available)
  downPaymentPercent: number;                 // Default: 20
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
  
  // Display preferences
  showBadgeOnAllPages: boolean;               // Default: true
  badgePosition: 'near-address' | 'top-right' | 'bottom-right'; // Default: 'near-address'
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
  bedrooms: null,
  purchasePrice: null,
  downPaymentPercent: 20,
  insuranceMonthly: 100,
  hoaMonthly: 0,
  propertyManagementMode: 'percent',
  propertyManagementPercent: 10,
  propertyManagementAmount: 0,
  overrideTaxRate: false,
  overrideMortgageRate: false,
  propertyTaxRateAnnualPct: null,
  mortgageRateAnnualPct: null,
  showBadgeOnAllPages: true,
  badgePosition: 'near-address',
};
