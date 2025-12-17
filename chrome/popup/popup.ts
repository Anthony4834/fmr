// Popup UI logic

import { getPreferences, savePreferences, resetPreferences } from './settings';
import { ExtensionPreferences, DEFAULT_PREFERENCES } from '../shared/types';

// Initialize popup
async function init() {
  // Load current preferences
  const prefs = await getPreferences();
  
  // Populate form fields
  (document.getElementById('down-payment-percent') as HTMLInputElement).value = 
    String(prefs.downPaymentPercent);
  (document.getElementById('insurance-monthly') as HTMLInputElement).value = 
    String(prefs.insuranceMonthly);
  (document.getElementById('hoa-monthly') as HTMLInputElement).value = 
    String(prefs.hoaMonthly);
  (document.getElementById('pm-mode') as HTMLSelectElement).value = 
    prefs.propertyManagementMode;
  (document.getElementById('pm-percent') as HTMLInputElement).value = 
    String(prefs.propertyManagementPercent);
  (document.getElementById('pm-amount') as HTMLInputElement).value = 
    String(prefs.propertyManagementAmount);
  (document.getElementById('override-tax-rate') as HTMLInputElement).checked = 
    prefs.overrideTaxRate;
  (document.getElementById('override-mortgage-rate') as HTMLInputElement).checked = 
    prefs.overrideMortgageRate;
  (document.getElementById('tax-rate') as HTMLInputElement).value = 
    prefs.propertyTaxRateAnnualPct !== null ? String(prefs.propertyTaxRateAnnualPct) : '';
  (document.getElementById('mortgage-rate') as HTMLInputElement).value = 
    prefs.mortgageRateAnnualPct !== null ? String(prefs.mortgageRateAnnualPct) : '';
  (document.getElementById('enable-redfin') as HTMLInputElement).checked = 
    prefs.enabledSites?.redfin !== false;
  (document.getElementById('enable-zillow') as HTMLInputElement).checked = 
    prefs.enabledSites?.zillow !== false;
  
  // Show/hide conditional fields
  updateConditionalFields();
  
  // Handle form submission
  const form = document.getElementById('settings-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveFormData();
    showMessage('Settings saved!');
  });
  
  // Handle reset button
  const resetBtn = document.getElementById('reset-btn');
  resetBtn?.addEventListener('click', async () => {
    if (confirm('Reset all settings to defaults?')) {
      await resetPreferences();
      location.reload(); // Reload to show defaults
    }
  });
  
  // Handle property management mode change
  const pmMode = document.getElementById('pm-mode') as HTMLSelectElement;
  pmMode.addEventListener('change', updateConditionalFields);
  
  // Handle override checkboxes
  const overrideTax = document.getElementById('override-tax-rate') as HTMLInputElement;
  const overrideMortgage = document.getElementById('override-mortgage-rate') as HTMLInputElement;
  overrideTax.addEventListener('change', updateConditionalFields);
  overrideMortgage.addEventListener('change', updateConditionalFields);
}

function updateConditionalFields() {
  const pmMode = (document.getElementById('pm-mode') as HTMLSelectElement).value;
  const pmPercentGroup = document.getElementById('pm-percent-group') as HTMLElement;
  const pmAmountGroup = document.getElementById('pm-amount-group') as HTMLElement;
  
  if (pmMode === 'percent') {
    pmPercentGroup.style.display = 'block';
    pmAmountGroup.style.display = 'none';
  } else {
    pmPercentGroup.style.display = 'none';
    pmAmountGroup.style.display = 'block';
  }
  
  const overrideTax = (document.getElementById('override-tax-rate') as HTMLInputElement).checked;
  const overrideMortgage = (document.getElementById('override-mortgage-rate') as HTMLInputElement).checked;
  const taxRateGroup = document.getElementById('tax-rate-group') as HTMLElement;
  const mortgageRateGroup = document.getElementById('mortgage-rate-group') as HTMLElement;
  
  taxRateGroup.style.display = overrideTax ? 'block' : 'none';
  mortgageRateGroup.style.display = overrideMortgage ? 'block' : 'none';
}

async function saveFormData() {
  const prefs: Partial<ExtensionPreferences> = {
    downPaymentPercent: parseFloat((document.getElementById('down-payment-percent') as HTMLInputElement).value) || DEFAULT_PREFERENCES.downPaymentPercent,
    insuranceMonthly: parseFloat((document.getElementById('insurance-monthly') as HTMLInputElement).value) || DEFAULT_PREFERENCES.insuranceMonthly,
    hoaMonthly: parseFloat((document.getElementById('hoa-monthly') as HTMLInputElement).value) || DEFAULT_PREFERENCES.hoaMonthly,
    propertyManagementMode: (document.getElementById('pm-mode') as HTMLSelectElement).value as 'percent' | 'amount',
    propertyManagementPercent: parseFloat((document.getElementById('pm-percent') as HTMLInputElement).value) || DEFAULT_PREFERENCES.propertyManagementPercent,
    propertyManagementAmount: parseFloat((document.getElementById('pm-amount') as HTMLInputElement).value) || DEFAULT_PREFERENCES.propertyManagementAmount,
    overrideTaxRate: (document.getElementById('override-tax-rate') as HTMLInputElement).checked,
    overrideMortgageRate: (document.getElementById('override-mortgage-rate') as HTMLInputElement).checked,
    propertyTaxRateAnnualPct: (document.getElementById('override-tax-rate') as HTMLInputElement).checked
      ? parseFloat((document.getElementById('tax-rate') as HTMLInputElement).value) || null
      : null,
    mortgageRateAnnualPct: (document.getElementById('override-mortgage-rate') as HTMLInputElement).checked
      ? parseFloat((document.getElementById('mortgage-rate') as HTMLInputElement).value) || null
      : null,
    enabledSites: {
      redfin: (document.getElementById('enable-redfin') as HTMLInputElement).checked,
      zillow: (document.getElementById('enable-zillow') as HTMLInputElement).checked,
    },
  };
  
  await savePreferences(prefs);
}

function showMessage(message: string) {
  const msg = document.createElement('div');
  msg.textContent = message;
  msg.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    background: #0a0a0a;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 10000;
  `;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 2000);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

