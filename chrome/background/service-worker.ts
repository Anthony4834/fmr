// Background service worker for the extension

// Service worker initialized
console.log('[FMR Background] Service worker started');

// Inject auth-bridge script into auth pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this is an auth page (fmr.fyi)
    const url = new URL(tab.url);
    const isAuthPage = 
      url.hostname === 'fmr.fyi' &&
      url.pathname.startsWith('/auth/extension');
    
    if (isAuthPage) {
      console.log('[FMR Background] Injecting auth-bridge into:', tab.url);
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/auth-bridge.js']
      }).then(() => {
        console.log('[FMR Background] Auth-bridge injected successfully');
      }).catch((error) => {
        console.error('[FMR Background] Failed to inject auth-bridge:', error);
      });
    }
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default preferences on first install
    chrome.storage.sync.set({
      mode: 'cashFlow',
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
      enabledSites: {
        redfin: true,
        zillow: true,
      },
    });
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[FMR Background] Received message:', message.type, 'from tab:', sender.tab?.id);
  
  // Handle auth success from auth-bridge content script
  if (message.type === 'EXTENSION_AUTH_SUCCESS') {
    console.log('[FMR Background] Auth success received, storing tokens');
    import('../shared/auth').then(async (authModule) => {
      try {
        // Store tokens using the auth module's internal storage
        await chrome.storage.sync.set({ 'fmr_extension_auth': message.tokens });
        console.log('[FMR Background] Tokens stored successfully');
        
        // Close the auth tab
        if (sender.tab?.id) {
          chrome.tabs.remove(sender.tab.id).catch(() => {
            console.log('[FMR Background] Tab already closed');
          });
        }
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('[FMR Background] Failed to store tokens:', error);
        sendResponse({ success: false, error: String(error) });
      }
    });
    return true; // Keep channel open for async response
  }
  
  // Handle auth error from auth-bridge content script
  if (message.type === 'EXTENSION_AUTH_ERROR') {
    console.log('[FMR Background] Auth error received:', message.error);
    // Close the auth tab
    if (sender.tab?.id) {
      chrome.tabs.remove(sender.tab.id).catch(() => {});
    }
    sendResponse({ success: false, error: message.error });
    return true;
  }
  
  // Handle auth-related messages
  if (message.type === 'AUTH_STATE_CHANGED') {
    // Notify all tabs about auth state change
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'AUTH_STATE_CHANGED',
            isLoggedIn: message.isLoggedIn,
          }).catch(() => {
            // Ignore errors (tab might not have content script)
          });
        }
      });
    });
  }

  // Handle token refresh requests
  if (message.type === 'REFRESH_TOKEN') {
    import('../shared/auth').then((authModule) => {
      authModule.refreshTokenIfNeeded()
        .then((tokens) => {
          sendResponse({ success: true, tokens });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
    });
    return true; // Keep message channel open for async response
  }

  // Handle login tab opening requests from content scripts
  if (message.type === 'OPEN_LOGIN_TAB') {
    chrome.tabs.create({
      url: message.url,
      active: true,
    }, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.id) {
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Failed to open auth page' });
        return;
      }
      sendResponse({ success: true });
    });
    return true; // Keep message channel open for async response
  }

  return true; // Keep message channel open for async responses
});

// Listen for storage changes (e.g., token updates)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.fmr_extension_auth) {
    // Auth tokens changed - notify all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'AUTH_STATE_CHANGED',
            isLoggedIn: !!changes.fmr_extension_auth.newValue,
          }).catch(() => {
            // Ignore errors (tab might not have content script)
          });
        }
      });
    });
  }
});

