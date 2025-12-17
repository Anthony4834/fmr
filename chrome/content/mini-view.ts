// Mini results view component showing FMR data, investment score, and cash flow calculator
// Note: This is not a React component, it creates DOM elements directly

import { fetchFMRData, fetchMarketParams, fetchInvestmentScore, FMRDataResponse } from '../shared/api-client';
import { computeCashFlow, getRentForBedrooms } from '../shared/cashflow';
import { ExtensionPreferences, DEFAULT_PREFERENCES } from '../shared/types';

export interface MiniViewProps {
  address: string;
  zipCode: string;
  onClose: () => void;
}

export function createMiniViewElement(props: MiniViewProps): HTMLElement {
  const container = document.createElement('div');
  container.className = 'fmr-mini-view';
  container.innerHTML = `
    <div class="fmr-mini-view-header">
      <div class="fmr-mini-view-title">Property Analysis</div>
      <button class="fmr-mini-view-close" aria-label="Close">×</button>
    </div>
    <div class="fmr-mini-view-content">
      <div id="fmr-mini-view-loading">Loading...</div>
    </div>
  `;
  
  const closeBtn = container.querySelector('.fmr-mini-view-close');
  closeBtn?.addEventListener('click', () => {
    props.onClose();
  });
  
  // Load data and render
  loadAndRenderMiniView(container, props.address, props.zipCode);
  
  return container;
}

async function loadAndRenderMiniView(
  container: HTMLElement,
  address: string,
  zipCode: string
) {
  const contentDiv = container.querySelector('.fmr-mini-view-content') as HTMLElement;
  if (!contentDiv) return;
  
  try {
    // Fetch data in parallel
    const [fmrResponse, marketResponse, scoreResponse, preferences] = await Promise.all([
      fetchFMRData(address),
      fetchMarketParams(zipCode),
      fetchInvestmentScore(zipCode),
      getPreferences(),
    ]);
    
    if (fmrResponse.error || !fmrResponse.data) {
      contentDiv.innerHTML = `<div style="color: #dc2626;">Error: ${fmrResponse.error || 'Failed to load FMR data'}</div>`;
      return;
    }
    
    const fmrData = fmrResponse.data;
    const marketData = marketResponse.data;
    const score = scoreResponse.found ? (scoreResponse.score ?? null) : null;
    
    // Render the mini view content
    contentDiv.innerHTML = renderMiniViewContent(
      address,
      zipCode,
      fmrData,
      marketData,
      score,
      preferences
    );
    
    // Attach event listeners for calculator
    attachCalculatorListeners(contentDiv, fmrData, marketData, preferences);
    
  } catch (error) {
    contentDiv.innerHTML = `<div style="color: #dc2626;">Error: ${error instanceof Error ? error.message : 'Unknown error'}</div>`;
  }
}

function getPreferences(): Promise<ExtensionPreferences> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_PREFERENCES, (items) => {
      resolve(items as ExtensionPreferences);
    });
  });
}

function renderMiniViewContent(
  address: string,
  zipCode: string,
  fmrData: FMRDataResponse['data'],
  marketData: { propertyTaxRateAnnualPct: number | null; mortgageRateAnnualPct: number | null },
  score: number | null,
  preferences: ExtensionPreferences
): string {
  const bedrooms = [0, 1, 2, 3, 4];
  
  return `
    <div style="margin-bottom: 16px;">
      <div style="font-size: 14px; font-weight: 600; color: #0a0a0a; margin-bottom: 4px;">${address}</div>
      <div style="font-size: 12px; color: #737373;">${fmrData.countyName || ''}${fmrData.countyName && fmrData.stateCode ? ', ' : ''}${fmrData.stateCode || ''}</div>
    </div>
    
    ${score !== null ? `
      <div style="margin-bottom: 16px; padding: 12px; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 6px;">
        <div style="font-size: 12px; color: #737373; margin-bottom: 4px;">Investment Score</div>
        <div style="font-size: 24px; font-weight: 600; color: #0a0a0a;">${Math.round(score)}</div>
      </div>
    ` : ''}
    
    <div style="margin-bottom: 16px;">
      <div style="font-size: 14px; font-weight: 600; color: #0a0a0a; margin-bottom: 8px;">FMR Rent (FY ${fmrData.year})</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="border-bottom: 1px solid #e5e5e5;">
            <th style="text-align: left; padding: 8px; font-weight: 600; color: #737373;">BR</th>
            <th style="text-align: right; padding: 8px; font-weight: 600; color: #737373;">Rent</th>
          </tr>
        </thead>
        <tbody>
          ${bedrooms.map(br => {
            const rent = getRentForBedrooms(fmrData, br);
            return `
              <tr style="border-bottom: 1px solid #e5e5e5;">
                <td style="padding: 8px; color: #0a0a0a;">${br}</td>
                <td style="text-align: right; padding: 8px; color: #0a0a0a; font-weight: 500;">
                  ${rent ? formatCurrency(rent) : 'N/A'}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    <div style="margin-bottom: 16px; padding: 12px; background: #fafafa; border: 1px solid #e5e5e5; border-radius: 6px;">
      <div style="font-size: 14px; font-weight: 600; color: #0a0a0a; margin-bottom: 8px;">Cash Flow Calculator</div>
      <div style="margin-bottom: 8px;">
        <label style="display: block; font-size: 12px; color: #737373; margin-bottom: 4px;">Purchase Price</label>
        <input type="text" id="calc-purchase-price" value="${preferences.purchasePrice || ''}" 
          style="width: 100%; padding: 6px; border: 1px solid #e5e5e5; border-radius: 4px; font-size: 14px;" 
          placeholder="Enter purchase price" />
      </div>
      <div style="margin-bottom: 8px;">
        <label style="display: block; font-size: 12px; color: #737373; margin-bottom: 4px;">Bedrooms</label>
        <select id="calc-bedrooms" 
          style="width: 100%; padding: 6px; border: 1px solid #e5e5e5; border-radius: 4px; font-size: 14px;">
          ${bedrooms.map(br => `<option value="${br}">${br}</option>`).join('')}
        </select>
      </div>
      <div id="calc-result" style="margin-top: 12px; padding: 12px; background: white; border: 1px solid #e5e5e5; border-radius: 4px;">
        <div style="font-size: 12px; color: #737373; margin-bottom: 4px;">Monthly Cash Flow</div>
        <div id="calc-cashflow" style="font-size: 20px; font-weight: 600; color: #0a0a0a;">—</div>
      </div>
    </div>
    
    <div style="text-align: center;">
      <a href="https://fmr.fyi/zip/${zipCode}" target="_blank" 
        style="display: inline-block; padding: 8px 16px; background: white; border: 1px solid #e5e5e5; border-radius: 4px; 
        color: #0a0a0a; text-decoration: none; font-size: 12px; font-weight: 500;">
        View Full Page on fmr.fyi
      </a>
    </div>
  `;
}

function attachCalculatorListeners(
  container: HTMLElement,
  fmrData: FMRDataResponse['data'],
  marketData: { propertyTaxRateAnnualPct: number | null; mortgageRateAnnualPct: number | null },
  preferences: ExtensionPreferences
) {
  const priceInput = container.querySelector('#calc-purchase-price') as HTMLInputElement;
  const bedroomsSelect = container.querySelector('#calc-bedrooms') as HTMLSelectElement;
  const resultDiv = container.querySelector('#calc-cashflow') as HTMLElement;
  
  if (!priceInput || !bedroomsSelect || !resultDiv) return;
  
  const updateCalculator = () => {
    const purchasePrice = parseFloat(priceInput.value.replace(/[^0-9.]/g, ''));
    const bedrooms = parseInt(bedroomsSelect.value, 10);
    
    if (isNaN(purchasePrice) || purchasePrice <= 0) {
      resultDiv.textContent = '—';
      return;
    }
    
    const rentMonthly = getRentForBedrooms(fmrData, bedrooms);
    if (rentMonthly === null) {
      resultDiv.textContent = 'N/A';
      return;
    }
    
    const taxRate = preferences.overrideTaxRate && preferences.propertyTaxRateAnnualPct !== null
      ? preferences.propertyTaxRateAnnualPct
      : marketData.propertyTaxRateAnnualPct;
      
    const mortgageRate = preferences.overrideMortgageRate && preferences.mortgageRateAnnualPct !== null
      ? preferences.mortgageRateAnnualPct
      : marketData.mortgageRateAnnualPct;
    
    if (taxRate === null || mortgageRate === null) {
      resultDiv.textContent = 'N/A';
      return;
    }
    
    let propertyManagementMonthly = 0;
    if (preferences.propertyManagementMode === 'percent') {
      propertyManagementMonthly = rentMonthly * (preferences.propertyManagementPercent / 100);
    } else {
      propertyManagementMonthly = preferences.propertyManagementAmount;
    }
    
    const result = computeCashFlow({
      purchasePrice,
      rentMonthly,
      bedrooms,
      interestRateAnnualPct: mortgageRate,
      propertyTaxRateAnnualPct: taxRate,
      insuranceMonthly: preferences.insuranceMonthly,
      hoaMonthly: preferences.hoaMonthly,
      propertyManagementMonthly,
      downPayment: {
        mode: 'percent',
        percent: preferences.downPaymentPercent,
      },
      termMonths: 360,
    });
    
    if (result) {
      const cashFlow = result.monthlyCashFlow;
      const color = cashFlow >= 0 ? '#16a34a' : '#dc2626';
      const sign = cashFlow >= 0 ? '+' : '';
      resultDiv.innerHTML = `<span style="color: ${color};">${sign}${formatCurrency(cashFlow)}/mo</span>`;
    } else {
      resultDiv.textContent = '—';
    }
  };
  
  priceInput.addEventListener('input', updateCalculator);
  bedroomsSelect.addEventListener('change', updateCalculator);
  
  // Initial calculation
  updateCalculator();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
