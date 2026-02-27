// Popup UI logic

import { getPreferences, savePreferences, resetPreferences } from './settings';

// Custom line items state (used by modal and saveFormData)
let customLineItemsState: CustomLineItem[] = [];
let currentEditingItemId: string | null = null;
import { ExtensionPreferences, DEFAULT_PREFERENCES, CustomLineItem } from '../shared/types';
import { login, logout, getCurrentUser, isLoggedIn } from '../shared/auth';
import { getApiBaseUrl, setApiBaseUrl } from '../shared/config';

/**
 * Attach all button and form listeners synchronously, before any async work.
 * This ensures buttons work even when the extension runs in strict environments
 * (e.g. Chrome Web Store) where storage or timing might fail during init.
 * Uses try/catch per attachment so one failure does not block the rest.
 */
function attachAllListeners() {
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const form = document.getElementById('settings-form') as HTMLFormElement;
  const resetBtn = document.getElementById('reset-btn');
  const displayMode = document.getElementById('display-mode') as HTMLSelectElement;
  const pmMode = document.getElementById('pm-mode') as HTMLSelectElement;
  const overrideTax = document.getElementById('override-tax-rate') as HTMLInputElement;
  const overrideMortgage = document.getElementById('override-mortgage-rate') as HTMLInputElement;

  if (!loginBtn && !form) {
    console.warn('[FMR Extension] Popup DOM not ready: login-btn and settings-form not found. Will retry.');
    setTimeout(attachAllListeners, 50);
    return;
  }

  try {
  if (loginBtn && !(loginBtn as any).__fmrLoginListenerAttached) {
    (loginBtn as any).__fmrLoginListenerAttached = true;
    loginBtn.addEventListener('click', async () => {
      try {
        loginBtn.textContent = 'Signing in...';
        loginBtn.setAttribute('disabled', 'true');
        await login();
        await new Promise((r) => setTimeout(r, 100));
        await refreshAccountSection();
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

  if (logoutBtn && !(logoutBtn as any).__fmrLogoutListenerAttached) {
    (logoutBtn as any).__fmrLogoutListenerAttached = true;
    logoutBtn.addEventListener('click', async () => {
      try {
        logoutBtn.textContent = 'Logging out...';
        logoutBtn.setAttribute('disabled', 'true');
        await logout();
        await refreshAccountSection();
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

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await saveFormData();
        showMessage('Settings saved!');
      } catch (err) {
        showMessage('Failed to save settings');
      }
    });
  }

  resetBtn?.addEventListener('click', async () => {
    if (confirm('Reset all settings to defaults?')) {
      try {
        await resetPreferences();
        location.reload();
      } catch {
        showMessage('Failed to reset');
      }
    }
  });

  displayMode?.addEventListener('change', updateConditionalFields);
  pmMode?.addEventListener('change', updateConditionalFields);
  overrideTax?.addEventListener('change', updateConditionalFields);
  overrideMortgage?.addEventListener('change', updateConditionalFields);

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.fmr_extension_auth) {
        setTimeout(() => {
          refreshAccountSection().catch(() => {});
          loadApiBaseUrl().catch(() => {});
        }, 100);
      }
    });
  } catch (e) {
    console.warn('[FMR Extension] storage.onChanged listener:', e);
  }

  try {
    initCustomItems([]);
  } catch (e) {
    console.warn('[FMR Extension] initCustomItems:', e);
  }
  } catch (err) {
    console.error('[FMR Extension] attachAllListeners error:', err);
  }
}

/** Refresh account UI and API config visibility (async). */
async function refreshAccountSection() {
  await updateAccountSectionUI();
  await loadApiBaseUrl();
}

// Initialize popup
async function init() {
  // Attach all listeners first so buttons work even if async init fails (e.g. store install)
  attachAllListeners();

  try {
    await updateAccountSectionUI();
    await initApiConfig();
    const prefs = await getPreferences();

    (document.getElementById('display-mode') as HTMLSelectElement).value =
      prefs.mode || 'cashFlow';
    (document.getElementById('rent-source') as HTMLSelectElement).value =
      prefs.rentSource || 'effective';
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

    await loadApiBaseUrl();
    updateConditionalFields();

    customLineItemsState = prefs.customLineItems || [];
    renderCustomItems();
  } catch (error) {
    console.error('[FMR Extension] Init error:', error);
    showMessage('Settings loading failed. Buttons should still work.');
  }
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
    rentSource: (document.getElementById('rent-source') as HTMLSelectElement).value as 'effective' | 'fmr',
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
    customLineItems: customLineItemsState,
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

/** Update account section UI only (login state, email, tier). Listeners are attached in attachAllListeners(). */
async function updateAccountSectionUI() {
  const loggedOutDiv = document.getElementById('account-logged-out');
  const loggedInDiv = document.getElementById('account-logged-in');
  const userEmail = document.getElementById('user-email');
  const userTier = document.getElementById('user-tier');
  const accountAvatar = document.getElementById('account-avatar');

  if (!loggedOutDiv || !loggedInDiv || !userEmail || !userTier) {
    if (loggedOutDiv) loggedOutDiv.style.display = 'block';
    return;
  }

  try {
    const isLoggedInStatus = await isLoggedIn();
    const user = await getCurrentUser();

    if (isLoggedInStatus && user) {
      loggedOutDiv.style.display = 'none';
      loggedInDiv.style.display = 'block';
      userEmail.textContent = user.email;
      const tierDisplay = user.tier
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      userTier.textContent = `${tierDisplay}${user.role === 'admin' ? ' • Admin' : ''}`;
      if (accountAvatar) accountAvatar.textContent = user.email.charAt(0).toUpperCase();
    } else {
      loggedOutDiv.style.display = 'block';
      loggedInDiv.style.display = 'none';
      if (accountAvatar) accountAvatar.textContent = '';
    }
  } catch (error) {
    console.error('[FMR Extension] Error checking login status:', error);
    loggedOutDiv.style.display = 'block';
    loggedInDiv.style.display = 'none';
    if (accountAvatar) accountAvatar.textContent = '';
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

// --- Custom Line Items ---

function renderCustomItems() {
  const container = document.getElementById('custom-items-list');
  if (!container) return;

  if (customLineItemsState.length === 0) {
    container.innerHTML = '<p style="font-size: 12px; color: #737373; text-align: center; padding: 12px 0;">No custom expenses added yet</p>';
    return;
  }

  container.innerHTML = customLineItemsState.map((item) => {
    let details = '';
    if (item.method === 'amount') {
      details = `$${item.value.toFixed(2)}/month`;
    } else {
      const percentOfLabel =
        item.percentOf === 'purchasePrice' ? 'Purchase Price' :
        item.percentOf === 'rent' ? 'Monthly Rent' :
        item.percentOf === 'downPayment' ? 'Down Payment' : '';
      details = `${item.value}% of ${percentOfLabel}`;
    }
    return `
      <div class="custom-item">
        <div class="custom-item-info">
          <div class="custom-item-label">${escapeHtml(item.label)}</div>
          <div class="custom-item-details">${escapeHtml(details)}</div>
        </div>
        <div class="custom-item-actions">
          <button type="button" class="icon-btn edit" data-id="${escapeHtml(item.id)}">Edit</button>
          <button type="button" class="icon-btn delete" data-id="${escapeHtml(item.id)}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.edit').forEach((btn) => {
    btn.addEventListener('click', () => editCustomItem((btn as HTMLElement).dataset.id ?? ''));
  });
  container.querySelectorAll('.delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteCustomItem((btn as HTMLElement).dataset.id ?? ''));
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openCustomItemModal(itemId: string | null = null) {
  const modal = document.getElementById('custom-item-modal') as HTMLElement;
  const form = document.getElementById('custom-item-form') as HTMLFormElement;
  const titleEl = document.getElementById('modal-title') as HTMLElement;
  if (!modal || !form || !titleEl) return;

  currentEditingItemId = itemId;

  if (itemId) {
    titleEl.textContent = 'Edit Custom Expense';
    const item = customLineItemsState.find((i) => i.id === itemId);
    if (item) {
      (document.getElementById('custom-item-label') as HTMLInputElement).value = item.label;
      (document.getElementById('custom-item-method') as HTMLSelectElement).value = item.method;
      (document.getElementById('custom-item-value') as HTMLInputElement).value = String(item.value);
      if (item.method === 'percent') {
        (document.getElementById('custom-item-percent-of') as HTMLSelectElement).value = item.percentOf || 'purchasePrice';
      }
      updateCustomItemMethodUI();
    }
  } else {
    titleEl.textContent = 'Add Custom Expense';
    form.reset();
    updateCustomItemMethodUI();
  }

  modal.style.display = 'flex';
}

function closeCustomItemModal() {
  const modal = document.getElementById('custom-item-modal') as HTMLElement;
  const form = document.getElementById('custom-item-form') as HTMLFormElement;
  if (modal) modal.style.display = 'none';
  if (form) form.reset();
  currentEditingItemId = null;
}

function updateCustomItemMethodUI() {
  const methodEl = document.getElementById('custom-item-method') as HTMLSelectElement;
  const percentOfGroup = document.getElementById('custom-item-percent-of-group') as HTMLElement;
  const valueLabel = document.getElementById('custom-item-value-label') as HTMLElement;
  if (!methodEl || !percentOfGroup || !valueLabel) return;

  const method = methodEl.value;
  if (method === 'percent') {
    percentOfGroup.style.display = 'block';
    valueLabel.textContent = 'Percentage (%)';
  } else {
    percentOfGroup.style.display = 'none';
    valueLabel.textContent = 'Amount ($)';
  }
}

function saveCustomItem(e: Event) {
  e.preventDefault();

  const labelEl = document.getElementById('custom-item-label') as HTMLInputElement;
  const methodEl = document.getElementById('custom-item-method') as HTMLSelectElement;
  const valueEl = document.getElementById('custom-item-value') as HTMLInputElement;
  const percentOfEl = document.getElementById('custom-item-percent-of') as HTMLSelectElement;
  if (!labelEl || !methodEl || !valueEl) return;

  const label = labelEl.value;
  const method = methodEl.value as 'percent' | 'amount';
  const value = parseFloat(valueEl.value);
  const percentOf = method === 'percent' ? (percentOfEl?.value as 'purchasePrice' | 'rent' | 'downPayment') : undefined;

  const newItem: CustomLineItem = {
    id: currentEditingItemId || Date.now().toString(),
    label,
    method,
    value,
    percentOf,
  };

  if (currentEditingItemId) {
    const index = customLineItemsState.findIndex((i) => i.id === currentEditingItemId);
    if (index !== -1) customLineItemsState[index] = newItem;
  } else {
    customLineItemsState.push(newItem);
  }

  chrome.storage.sync.set({ customLineItems: customLineItemsState }, () => {
    renderCustomItems();
    closeCustomItemModal();
    showMessage('Custom expense saved');
  });
}

function editCustomItem(itemId: string) {
  openCustomItemModal(itemId);
}

function deleteCustomItem(itemId: string) {
  if (!confirm('Are you sure you want to delete this custom expense?')) return;
  customLineItemsState = customLineItemsState.filter((i) => i.id !== itemId);
  chrome.storage.sync.set({ customLineItems: customLineItemsState }, () => {
    renderCustomItems();
    showMessage('Custom expense deleted');
  });
}

function initCustomItems(initialItems: CustomLineItem[]) {
  customLineItemsState = initialItems;
  renderCustomItems();

  const addBtn = document.getElementById('add-custom-item-btn');
  if (!(addBtn as any)?.__fmrCustomItemsAttached) {
    (addBtn as any).__fmrCustomItemsAttached = true;
    addBtn?.addEventListener('click', () => openCustomItemModal(null));
  }

  const modalClose = document.getElementById('modal-close-btn');
  const modalCancel = document.getElementById('modal-cancel-btn');
  const customForm = document.getElementById('custom-item-form');
  const customMethod = document.getElementById('custom-item-method');
  if (!(modalClose as any)?.__fmrCustomItemsModalAttached) {
    (modalClose as any).__fmrCustomItemsModalAttached = true;
    modalClose?.addEventListener('click', closeCustomItemModal);
    modalCancel?.addEventListener('click', closeCustomItemModal);
    customForm?.addEventListener('submit', (e) => saveCustomItem(e));
    customMethod?.addEventListener('change', updateCustomItemMethodUI);
  }
}

/**
 * Run init only after the popup DOM is ready.
 * Extension popups can run the script before elements exist; waiting ensures getElementById finds them.
 */
function runWhenReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => safeInit());
  } else {
    // Already loaded: defer one tick so the popup document is fully ready
    setTimeout(safeInit, 0);
  }
}

function safeInit() {
  try {
    init();
  } catch (err) {
    console.error('[FMR Extension] Popup init error:', err);
    showMessage('Something went wrong. Try opening the popup again.');
  }
}

runWhenReady();

