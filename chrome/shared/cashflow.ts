// Cash flow calculation logic (replicated from lib/investment.ts)

import { CustomLineItem } from './types';

export interface DownPaymentInput {
  mode: 'percent' | 'amount';
  percent?: number;
  amount?: number;
}

export interface CashFlowInputs {
  purchasePrice: number;
  rentMonthly: number;
  bedrooms: number; // 0..8
  interestRateAnnualPct: number; // e.g. 6.5
  propertyTaxRateAnnualPct: number; // e.g. 1.2 (effective tax rate)
  insuranceMonthly: number;
  hoaMonthly: number;
  propertyManagementMonthly?: number; // Property management fee
  downPayment: DownPaymentInput;
  termMonths?: number; // default 360
  customLineItems?: CustomLineItem[]; // Additional custom expenses
}

export interface CashFlowResult {
  monthlyCashFlow: number;
  loanAmount: number;
  monthlyMortgagePayment: number;
  monthlyTaxes: number;
  monthlyExpenses: number; // insurance + HOA + taxes + property management
  netBeforeDebt: number; // rent - expenses (before mortgage)
  notes: string[];
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function monthlyRateFromAnnualPct(annualPct: number) {
  return (annualPct / 100) / 12;
}

function paymentFactorPerDollarLoan(rm: number, n: number) {
  // payment = L * factor
  if (n <= 0) return NaN;
  if (Math.abs(rm) < 1e-12) return 1 / n;
  const pow = Math.pow(1 + rm, n);
  return (rm * pow) / (pow - 1);
}

/**
 * Calculate monthly cash flow given a purchase price and all other parameters.
 * 
 * Cash flow = Rent - (Mortgage Payment + Taxes + Insurance + HOA)
 * 
 * Returns null if the inputs are invalid.
 */
export function computeCashFlow(input: CashFlowInputs): CashFlowResult | null {
  const notes: string[] = [];
  
  const P = Number(input.purchasePrice);
  const R = Number(input.rentMonthly);
  const I = Number(input.insuranceMonthly);
  const H = Number(input.hoaMonthly);
  const PM = Number(input.propertyManagementMonthly ?? 0);
  const taxAnnualPct = Number(input.propertyTaxRateAnnualPct);
  const rateAnnualPct = Number(input.interestRateAnnualPct);
  const bedrooms = clamp(Math.round(input.bedrooms), 0, 8);
  
  if (!Number.isFinite(P) || P <= 0) return null;
  if (!Number.isFinite(R) || R <= 0) return null;
  if (!Number.isFinite(I) || I < 0) return null;
  if (!Number.isFinite(H) || H < 0) return null;
  if (!Number.isFinite(PM) || PM < 0) return null;
  if (!Number.isFinite(taxAnnualPct) || taxAnnualPct < 0) return null;
  if (!Number.isFinite(rateAnnualPct) || rateAnnualPct < 0) return null;
  
  const n = input.termMonths ?? 360;
  const t = (taxAnnualPct / 100) / 12; // monthly tax per dollar of price
  const rm = monthlyRateFromAnnualPct(rateAnnualPct);
  const factor = paymentFactorPerDollarLoan(rm, n);
  if (!Number.isFinite(factor) || factor <= 0) return null;
  
  // Calculate loan amount based on down payment
  let L: number;
  if (input.downPayment.mode === 'percent') {
    const d = Number(input.downPayment.percent) / 100;
    if (!Number.isFinite(d) || d <= 0 || d >= 1) return null;
    L = (1 - d) * P;
  } else {
    const D = Number(input.downPayment.amount);
    if (!Number.isFinite(D) || D <= 0 || D >= P) return null;
    L = P - D;
  }
  
  if (L <= 0) return null;
  
  // Calculate monthly payments
  const monthlyMortgagePayment = factor * L;
  const monthlyTaxes = t * P;
  const monthlyExpenses = I + H + monthlyTaxes + PM;
  const netBeforeDebt = R - monthlyExpenses;

  // Calculate custom line items
  let customExpensesMonthly = 0;
  if (input.customLineItems && input.customLineItems.length > 0) {
    for (const item of input.customLineItems) {
      if (item.method === 'amount') {
        customExpensesMonthly += item.value;
      } else if (item.method === 'percent' && item.percentOf) {
        const baseValue =
          item.percentOf === 'purchasePrice' ? P :
          item.percentOf === 'rent' ? R :
          item.percentOf === 'downPayment' ? (P - L) :
          0;
        customExpensesMonthly += baseValue * (item.value / 100);
      }
    }
  }

  const monthlyCashFlow = netBeforeDebt - monthlyMortgagePayment - customExpensesMonthly;

  if (bedrooms > 4) notes.push('Using HUD 5+ bedroom rent scaling (+15% per bedroom above 4BR).');

  return {
    monthlyCashFlow,
    loanAmount: L,
    monthlyMortgagePayment,
    monthlyTaxes,
    monthlyExpenses,
    netBeforeDebt,
    notes,
  };
}

/**
 * Get rent for a specific number of bedrooms from FMR data
 */
export function getRentForBedrooms(
  data: {
    bedroom0?: number;
    bedroom1?: number;
    bedroom2?: number;
    bedroom3?: number;
    bedroom4?: number;
    zipFMRData?: Array<{
      bedroom0?: number;
      bedroom1?: number;
      bedroom2?: number;
      bedroom3?: number;
      bedroom4?: number;
    }>;
  },
  bedrooms: number
): number | null {
  const b = Math.max(0, Math.min(8, Math.round(bedrooms)));
  
  // If SAFMR with exactly one ZIP in zipFMRData, use that ZIP's values
  if (data.zipFMRData && data.zipFMRData.length === 1) {
    const zipData = data.zipFMRData[0];
    
    // For 5+ bedrooms, use bedroom4 as base and scale
    if (b > 4) {
      const base = zipData.bedroom4;
      if (base !== null && base !== undefined) {
        return Math.round(base * Math.pow(1.15, b - 4));
      }
      return null;
    }
    
    // For 0-4 bedrooms, get exact match
    const base =
      b === 0 ? zipData.bedroom0 :
      b === 1 ? zipData.bedroom1 :
      b === 2 ? zipData.bedroom2 :
      b === 3 ? zipData.bedroom3 :
      b === 4 ? zipData.bedroom4 :
      null;
    
    if (base !== null && base !== undefined) {
      return base;
    }
  }
  
  // Otherwise use the main data
  // For 5+ bedrooms, use bedroom4 as base and scale
  if (b > 4) {
    const base = data.bedroom4;
    if (base !== null && base !== undefined) {
      return Math.round(base * Math.pow(1.15, b - 4));
    }
    return null;
  }
  
  // For 0-4 bedrooms, get exact match
  const base =
    b === 0 ? data.bedroom0 :
    b === 1 ? data.bedroom1 :
    b === 2 ? data.bedroom2 :
    b === 3 ? data.bedroom3 :
    b === 4 ? data.bedroom4 :
    null;
  
  if (base === null || base === undefined) return null;
  
  return base;
}

