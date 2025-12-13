export type DownPaymentInput =
  | { mode: 'percent'; percent: number }
  | { mode: 'amount'; amount: number };

export type IdealPurchasePriceInputs = {
  rentMonthly: number;
  bedrooms: number; // 0..8
  interestRateAnnualPct: number; // e.g. 6.5
  propertyTaxRateAnnualPct: number; // e.g. 1.2 (effective tax rate)
  insuranceMonthly: number;
  hoaMonthly: number;
  cashFlowMonthlyPct: number; // e.g. 10 means keep 10% of (rent - non-mortgage expenses) as monthly cash flow
  downPayment: DownPaymentInput;
  termMonths?: number; // default 360
};

export type IdealPurchasePriceResult = {
  purchasePrice: number;
  loanAmount: number;
  maxMortgagePayment: number;
  monthlyCashFlowRequired: number;
  notes: string[];
};

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
 * Closed-form solution for ideal purchase price given rent, expenses, and desired monthly cash flow margin.
 *
 * Returns null if the inputs imply no positive price is feasible (e.g. rent too low for expenses).
 */
export function computeIdealPurchasePrice(input: IdealPurchasePriceInputs): IdealPurchasePriceResult | null {
  const notes: string[] = [];

  const n = input.termMonths ?? 360;
  const bedrooms = clamp(Math.round(input.bedrooms), 0, 8);

  const R = Number(input.rentMonthly);
  const I = Number(input.insuranceMonthly);
  const H = Number(input.hoaMonthly);

  const taxAnnualPct = Number(input.propertyTaxRateAnnualPct);
  const rateAnnualPct = Number(input.interestRateAnnualPct);
  const cashFlowMonthlyPct = Number(input.cashFlowMonthlyPct);

  if (!Number.isFinite(R) || R <= 0) return null;
  if (!Number.isFinite(I) || I < 0) return null;
  if (!Number.isFinite(H) || H < 0) return null;
  if (!Number.isFinite(taxAnnualPct) || taxAnnualPct < 0) return null;
  if (!Number.isFinite(rateAnnualPct) || rateAnnualPct < 0) return null;
  if (!Number.isFinite(cashFlowMonthlyPct) || cashFlowMonthlyPct < 0) return null;

  const t = (taxAnnualPct / 100) / 12; // monthly tax per dollar of price
  const rm = monthlyRateFromAnnualPct(rateAnnualPct);
  const factor = paymentFactorPerDollarLoan(rm, n);
  if (!Number.isFinite(factor) || factor <= 0) return null;

  // Define cash flow as a margin of net (rent - non-mortgage expenses):
  // netBeforeDebt = R - I - H - t*P
  // requiredCashFlow = c * netBeforeDebt, where c = cashFlowMonthlyPct/100
  // Mortgage payment must fit the remainder: M = (1-c) * netBeforeDebt
  const c = clamp(cashFlowMonthlyPct / 100, 0, 0.99);
  const k = 1 - c;

  // Percent mode:
  // factor*(1-d)*P = k*(R - I - H - tP)
  // => [factor*(1-d) + k*t] * P = k*(R - I - H)
  // => P = k*(R - I - H) / [factor*(1-d) + k*t]
  if (input.downPayment.mode === 'percent') {
    const d = (Number(input.downPayment.percent) / 100);
    if (!Number.isFinite(d) || d <= 0 || d >= 1) return null;
    const denom = factor * (1 - d) + (k * t);
    const numer = k * (R - I - H);
    if (denom <= 0 || numer <= 0) return null;

    const P = numer / denom;
    if (!Number.isFinite(P) || P <= 0) return null;

    const L = (1 - d) * P;
    const maxM = factor * L;
    const netBeforeDebt = (R - I - H - (t * P));
    const cashFlowReq = c * netBeforeDebt;

    // sanity/diagnostic notes
    if (bedrooms > 4) notes.push('Using HUD 5+ bedroom rent scaling (+15% per bedroom above 4BR).');

    return {
      purchasePrice: P,
      loanAmount: L,
      maxMortgagePayment: maxM,
      monthlyCashFlowRequired: cashFlowReq,
      notes,
    };
  }

  // Amount mode:
  // factor*(P - D) = k*(R - I - H - tP)
  // => factor*P - factor*D = k*(R - I - H) - k*t*P
  // => [factor + k*t] * P = k*(R - I - H) + factor*D
  // => P = [k*(R - I - H) + factor*D] / [factor + k*t]
  const D = Number(input.downPayment.amount);
  if (!Number.isFinite(D) || D <= 0) return null;

  const numer = (k * (R - I - H)) + (factor * D);
  const denom = factor + (k * t);
  if (denom <= 0 || numer <= 0) return null;

  const P = numer / denom;
  if (!Number.isFinite(P) || P <= 0) return null;

  const L = P - D;
  if (L <= 0) return null;

  const maxM = factor * L;
  const netBeforeDebt = (R - I - H - (t * P));
  const cashFlowReq = c * netBeforeDebt;

  if (bedrooms > 4) notes.push('Using HUD 5+ bedroom rent scaling (+15% per bedroom above 4BR).');

  return {
    purchasePrice: P,
    loanAmount: L,
    maxMortgagePayment: maxM,
    monthlyCashFlowRequired: cashFlowReq,
    notes,
  };
}


