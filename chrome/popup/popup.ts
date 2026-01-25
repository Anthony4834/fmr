// Popup UI logic

import { getPreferences, savePreferences, resetPreferences } from './settings';
import { ExtensionPreferences, DEFAULT_PREFERENCES } from '../shared/types';
import { login, logout, getCurrentUser, isLoggedIn } from '../shared/auth';
import { getApiBaseUrl, setApiBaseUrl } from '../shared/config';

// Initialize popup
async function init() {
  // Initialize account section
  await initAccountSection();
  // Initialize API config (only for admin users)
  await initApiConfig();
  
  // Listen for storage changes to refresh account section when auth state changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.fmr_extension_auth) {
      // Auth state changed, refresh account section and API config after a small delay
      setTimeout(async () => {
        await initAccountSection();
        await loadApiBaseUrl();
      }, 100);
    }
  });
  // Load current preferences
  const prefs = await getPreferences();
  
  // Populate form fields
  (document.getElementById('display-mode') as HTMLSelectElement).value = 
    prefs.mode || 'cashFlow';
  (document.getElementById('down-payment-percent') as HTMLInputElement).value = 
    String(prefs.downPaymentPercent);
  (document.getElementById('insurance-monthly') as HTMLInputElement).value = 
    String(prefs.insuranceMonthly);
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
  
  // Load API base URL (only show for admin users)
  await loadApiBaseUrl();
  
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
  
  // Handle display mode change
  const displayMode = document.getElementById('display-mode') as HTMLSelectElement;
  displayMode.addEventListener('change', updateConditionalFields);
  
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
  const displayMode = (document.getElementById('display-mode') as HTMLSelectElement).value;
  const isFmrMode = displayMode === 'fmr';
  
  // Show/hide cash flow related sections based on mode
  const financialSection = document.getElementById('financial-params-section') as HTMLElement;
  const propertyMgmtSection = document.getElementById('property-management-section') as HTMLElement;
  const customExpensesSection = document.getElementById('custom-expenses-section') as HTMLElement;
  const rateOverridesSection = document.getElementById('rate-overrides-section') as HTMLElement;
  
  if (financialSection) {
    financialSection.style.display = isFmrMode ? 'none' : 'block';
    financialSection.style.opacity = isFmrMode ? '0' : '1';
    financialSection.style.transition = 'opacity 0.2s ease, display 0.2s ease';
  }
  if (propertyMgmtSection) {
    propertyMgmtSection.style.display = isFmrMode ? 'none' : 'block';
    propertyMgmtSection.style.opacity = isFmrMode ? '0' : '1';
    propertyMgmtSection.style.transition = 'opacity 0.2s ease, display 0.2s ease';
  }
  if (customExpensesSection) {
    customExpensesSection.style.display = isFmrMode ? 'none' : 'block';
    customExpensesSection.style.opacity = isFmrMode ? '0' : '1';
    customExpensesSection.style.transition = 'opacity 0.2s ease, display 0.2s ease';
  }
  if (rateOverridesSection) {
    rateOverridesSection.style.display = isFmrMode ? 'none' : 'block';
    rateOverridesSection.style.opacity = isFmrMode ? '0' : '1';
    rateOverridesSection.style.transition = 'opacity 0.2s ease, display 0.2s ease';
  }
  
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
    mode: (document.getElementById('display-mode') as HTMLSelectElement).value as 'cashFlow' | 'fmr',
    downPaymentPercent: parseFloat((document.getElementById('down-payment-percent') as HTMLInputElement).value) || DEFAULT_PREFERENCES.downPaymentPercent,
    insuranceMonthly: parseFloat((document.getElementById('insurance-monthly') as HTMLInputElement).value) || DEFAULT_PREFERENCES.insuranceMonthly,
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

async function loadApiBaseUrl() {
  // Find the API Configuration section (it contains the api-base-url input)
  const apiBaseUrlInput = document.getElementById('api-base-url') as HTMLInputElement;
  if (!apiBaseUrlInput) return;
  
  const apiConfigSection = apiBaseUrlInput.closest('.section.card') as HTMLElement;
  if (!apiConfigSection) return;
  
  const user = await getCurrentUser();
  const isAdmin = user?.role === 'admin';
  
  if (!isAdmin) {
    // Hide API config section for non-admin users
    apiConfigSection.style.display = 'none';
    return;
  }
  
  // Show API config section for admin users
  apiConfigSection.style.display = 'block';
  const apiBaseUrl = await getApiBaseUrl();
  apiBaseUrlInput.value = apiBaseUrl;
}

async function initApiConfig() {
  const apiBaseUrlInput = document.getElementById('api-base-url') as HTMLInputElement;
  if (!apiBaseUrlInput) return;

  // Check if user is admin before allowing API config
  const user = await getCurrentUser();
  const isAdmin = user?.role === 'admin';
  
  if (!isAdmin) {
    return;
  }

  // Save API base URL on blur
  apiBaseUrlInput.addEventListener('blur', async () => {
    const url = apiBaseUrlInput.value.trim();
    if (url) {
      try {
        await setApiBaseUrl(url);
        showMessage('API URL updated!');
      } catch (error) {
        console.error('Error saving API URL:', error);
        showMessage('Failed to save API URL');
      }
    }
  });
}

async function initAccountSection() {
  const loggedOutDiv = document.getElementById('account-logged-out');
  const loggedInDiv = document.getElementById('account-logged-in');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userEmail = document.getElementById('user-email');
  const userTier = document.getElementById('user-tier');
  const accountAvatar = document.getElementById('account-avatar');

  if (!loggedOutDiv || !loggedInDiv || !loginBtn || !logoutBtn || !userEmail || !userTier) {
    console.error('[FMR Extension] Account section elements not found', {
      loggedOutDiv: !!loggedOutDiv,
      loggedInDiv: !!loggedInDiv,
      loginBtn: !!loginBtn,
      logoutBtn: !!logoutBtn,
      userEmail: !!userEmail,
      userTier: !!userTier,
    });
    // Show logged out state by default if elements missing
    if (loggedOutDiv) loggedOutDiv.style.display = 'block';
    return;
  }

  try {
    // Check login status
    const isLoggedInStatus = await isLoggedIn();
    const user = await getCurrentUser();

    if (isLoggedInStatus && user) {
      // Show logged in state
      loggedOutDiv.style.display = 'none';
      loggedInDiv.style.display = 'block';
      userEmail.textContent = user.email;
      const tierCapitalized = user.tier.charAt(0).toUpperCase() + user.tier.slice(1);
      userTier.textContent = `${tierCapitalized}${user.role === 'admin' ? ' • Admin' : ''}`;
      
      // Set avatar initials
      if (accountAvatar) {
        const initials = user.email.charAt(0).toUpperCase();
        accountAvatar.textContent = initials;
      }
    } else {
      // Show logged out state
      loggedOutDiv.style.display = 'block';
      loggedInDiv.style.display = 'none';
      
      // Clear avatar
      if (accountAvatar) {
        accountAvatar.textContent = '';
      }
    }
  } catch (error) {
    console.error('[FMR Extension] Error checking login status:', error);
    // Show logged out state on error
    loggedOutDiv.style.display = 'block';
    loggedInDiv.style.display = 'none';
    
    // Clear avatar on error
    if (accountAvatar) {
      accountAvatar.textContent = '';
    }
  }

  // Handle login button (check if already has listener)
  if (!(loginBtn as any).__fmrLoginListenerAttached) {
    (loginBtn as any).__fmrLoginListenerAttached = true;
    loginBtn.addEventListener('click', async () => {
      try {
        loginBtn.textContent = 'Signing in...';
        loginBtn.setAttribute('disabled', 'true');
        await login();
        // Small delay to ensure storage is written
        await new Promise(resolve => setTimeout(resolve, 100));
        // Reload account section
        await initAccountSection();
        showMessage('Successfully signed in!');
      } catch (error) {
        console.error('Login error:', error);
        showMessage('Login failed. Please try again.');
      } finally {
        loginBtn.textContent = 'Sign In';
        loginBtn.removeAttribute('disabled');
      }
    });
  }

  // Handle logout button (check if already has listener)
  if (!(logoutBtn as any).__fmrLogoutListenerAttached) {
    (logoutBtn as any).__fmrLogoutListenerAttached = true;
    logoutBtn.addEventListener('click', async () => {
      try {
        logoutBtn.textContent = 'Logging out...';
        logoutBtn.setAttribute('disabled', 'true');
        await logout();
        // Reload account section
        await initAccountSection();
        showMessage('Logged out successfully');
      } catch (error) {
        console.error('Logout error:', error);
        showMessage('Logout failed. Please try again.');
      } finally {
        logoutBtn.textContent = 'Logout';
        logoutBtn.removeAttribute('disabled');
      }
    });
  }
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

