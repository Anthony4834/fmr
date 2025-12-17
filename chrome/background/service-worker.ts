// Background service worker for the extension

// Service worker initialized

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default preferences on first install
    chrome.storage.sync.set({
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

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle any messages if needed in the future
  return true; // Keep message channel open for async responses
});

