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

export type MaxPriceInputs = {
  rentMonthly: number;
  bedrooms: number; // 0..8
  interestRateAnnualPct: number; // e.g. 6.5
  propertyTaxRateAnnualPct: number; // e.g. 1.2 (effective tax rate)
  insuranceMonthly: number;
  hoaMonthly: number;
  desiredCashFlowMonthly: number; // Desired monthly cash flow in dollars
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

export type CashFlowInputs = {
  purchasePrice: number;
  rentMonthly: number;
  bedrooms: number; // 0..8
  interestRateAnnualPct: number; // e.g. 6.5
  propertyTaxRateAnnualPct: number; // e.g. 1.2 (effective tax rate)
  insuranceMonthly: number;
  hoaMonthly: number;
  downPayment: DownPaymentInput;
  termMonths?: number; // default 360
};

export type CashFlowResult = {
  monthlyCashFlow: number;
  loanAmount: number;
  monthlyMortgagePayment: number;
  monthlyTaxes: number;
  monthlyExpenses: number; // insurance + HOA + taxes
  netBeforeDebt: number; // rent - expenses (before mortgage)
  notes: string[];
};

export type InvestmentScorePriceInputs = {
  rentMonthly: number;
  propertyTaxRateAnnualPct: number; // e.g. 1.2 (effective tax rate)
  targetScore: number; // e.g. 95 for "good", 130 for "great"
  medianYield?: number; // If not provided, uses default of 0.05 (5%)
};

export type InvestmentScorePriceResult = {
  maxPurchasePrice: number;
  annualRent: number;
  annualTaxes: number;
  netYield: number;
  expectedScore: number;
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
  const taxAnnualPct = Number(input.propertyTaxRateAnnualPct);
  const rateAnnualPct = Number(input.interestRateAnnualPct);
  const bedrooms = clamp(Math.round(input.bedrooms), 0, 8);
  
  if (!Number.isFinite(P) || P <= 0) return null;
  if (!Number.isFinite(R) || R <= 0) return null;
  if (!Number.isFinite(I) || I < 0) return null;
  if (!Number.isFinite(H) || H < 0) return null;
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
  const monthlyExpenses = I + H + monthlyTaxes;
  const netBeforeDebt = R - monthlyExpenses;
  const monthlyCashFlow = netBeforeDebt - monthlyMortgagePayment;
  
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
 * Calculate maximum purchase price given a desired monthly cash flow.
 * 
 * Cash flow = Rent - (Mortgage + Taxes + Insurance + HOA)
 * Solving for P: P = (R - I - H - CashFlow) / (factor*(1-d) + t) for percent down
 * 
 * Returns null if the inputs are invalid or no positive price is feasible.
 */
export function computeMaxPriceForCashFlow(input: MaxPriceInputs): IdealPurchasePriceResult | null {
  const notes: string[] = [];
  
  const R = Number(input.rentMonthly);
  const I = Number(input.insuranceMonthly);
  const H = Number(input.hoaMonthly);
  const taxAnnualPct = Number(input.propertyTaxRateAnnualPct);
  const rateAnnualPct = Number(input.interestRateAnnualPct);
  const desiredCashFlow = Number(input.desiredCashFlowMonthly);
  const bedrooms = clamp(Math.round(input.bedrooms), 0, 8);
  
  if (!Number.isFinite(R) || R <= 0) return null;
  if (!Number.isFinite(I) || I < 0) return null;
  if (!Number.isFinite(H) || H < 0) return null;
  if (!Number.isFinite(taxAnnualPct) || taxAnnualPct < 0) return null;
  if (!Number.isFinite(rateAnnualPct) || rateAnnualPct < 0) return null;
  if (!Number.isFinite(desiredCashFlow)) return null;
  
  const n = input.termMonths ?? 360;
  const t = (taxAnnualPct / 100) / 12; // monthly tax per dollar of price
  const rm = monthlyRateFromAnnualPct(rateAnnualPct);
  const factor = paymentFactorPerDollarLoan(rm, n);
  if (!Number.isFinite(factor) || factor <= 0) return null;
  
  // Cash flow = R - (Mortgage + Taxes + Insurance + HOA)
  // Cash flow = R - (factor*L + t*P + I + H)
  
  let P: number;
  let L: number;
  
  if (input.downPayment.mode === 'percent') {
    const d = Number(input.downPayment.percent) / 100;
    if (!Number.isFinite(d) || d <= 0 || d >= 1) return null;
    
    // L = (1-d)*P
    // Cash flow = R - (factor*(1-d)*P + t*P + I + H)
    // Cash flow = R - P*(factor*(1-d) + t) - I - H
    // P*(factor*(1-d) + t) = R - I - H - Cash flow
    // P = (R - I - H - Cash flow) / (factor*(1-d) + t)
    const denom = factor * (1 - d) + t;
    const numer = R - I - H - desiredCashFlow;
    
    if (denom <= 0 || numer <= 0) return null;
    
    P = numer / denom;
    if (!Number.isFinite(P) || P <= 0) return null;
    
    L = (1 - d) * P;
  } else {
    const D = Number(input.downPayment.amount);
    if (!Number.isFinite(D) || D <= 0) return null;
    
    // L = P - D
    // Cash flow = R - (factor*(P-D) + t*P + I + H)
    // Cash flow = R - factor*P + factor*D - t*P - I - H
    // Cash flow = R - P*(factor + t) + factor*D - I - H
    // P*(factor + t) = R + factor*D - I - H - Cash flow
    // P = (R + factor*D - I - H - Cash flow) / (factor + t)
    const denom = factor + t;
    const numer = R + (factor * D) - I - H - desiredCashFlow;
    
    if (denom <= 0 || numer <= 0) return null;
    
    P = numer / denom;
    if (!Number.isFinite(P) || P <= 0) return null;
    
    L = P - D;
    if (L <= 0) return null;
  }
  
  const maxM = factor * L;
  const netBeforeDebt = (R - I - H - (t * P));
  const actualCashFlow = netBeforeDebt - maxM;
  
  if (bedrooms > 4) notes.push('Using HUD 5+ bedroom rent scaling (+15% per bedroom above 4BR).');
  
  return {
    purchasePrice: P,
    loanAmount: L,
    maxMortgagePayment: maxM,
    monthlyCashFlowRequired: actualCashFlow,
    notes,
  };
}

/**
 * Compute maximum purchase price to achieve a target investment score.
 * 
 * Investment score formula:
 * - Net Yield = (Annual Rent - Annual Taxes) / Property Value
 * - Score = (netYield / medianYield) * 100
 * 
 * To reverse-engineer for target score:
 * - Target Net Yield = (targetScore / 100) * medianYield
 * - Net Yield = (Annual Rent - Property Value * Tax Rate) / Property Value
 * - Solving for Property Value: P = Annual Rent / (targetNetYield + Tax Rate)
 * 
 * Returns null if the inputs imply no positive price is feasible.
 */
export function computeMaxPriceForInvestmentScore(input: InvestmentScorePriceInputs): InvestmentScorePriceResult | null {
  const notes: string[] = [];
  
  const R = Number(input.rentMonthly);
  const taxAnnualPct = Number(input.propertyTaxRateAnnualPct);
  const targetScore = Number(input.targetScore);
  const medianYield = input.medianYield ?? 0.05; // Default to 5% if not provided
  
  if (!Number.isFinite(R) || R <= 0) return null;
  if (!Number.isFinite(taxAnnualPct) || taxAnnualPct < 0) return null;
  if (!Number.isFinite(targetScore) || targetScore <= 0) return null;
  if (!Number.isFinite(medianYield) || medianYield <= 0) return null;
  
  // Convert tax rate from percent to decimal
  const taxRate = taxAnnualPct / 100;
  
  // Calculate target net yield based on target score
  // Score = (netYield / medianYield) * 100
  // So: netYield = (targetScore / 100) * medianYield
  const targetNetYield = (targetScore / 100) * medianYield;
  
  // Net Yield = (Annual Rent - Annual Taxes) / Property Value
  // Annual Taxes = Property Value * Tax Rate
  // So: netYield = (Annual Rent - P * Tax Rate) / P
  // netYield * P = Annual Rent - P * Tax Rate
  // netYield * P + P * Tax Rate = Annual Rent
  // P * (netYield + Tax Rate) = Annual Rent
  // P = Annual Rent / (netYield + Tax Rate)
  const annualRent = R * 12;
  const denominator = targetNetYield + taxRate;
  
  if (denominator <= 0) return null;
  
  const maxPurchasePrice = annualRent / denominator;
  
  if (!Number.isFinite(maxPurchasePrice) || maxPurchasePrice <= 0) return null;
  
  // Calculate actual values for verification
  const annualTaxes = maxPurchasePrice * taxRate;
  const actualNetYield = (annualRent - annualTaxes) / maxPurchasePrice;
  const expectedScore = (actualNetYield / medianYield) * 100;
  
  if (input.medianYield === undefined) {
    notes.push(`Using default median yield of ${(medianYield * 100).toFixed(2)}% for score calculation.`);
  }
  
  return {
    maxPurchasePrice,
    annualRent,
    annualTaxes,
    netYield: actualNetYield,
    expectedScore,
    notes,
  };
}


