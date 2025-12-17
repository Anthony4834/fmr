// Main content script for address detection and badge injection

import { extractAddress, extractZipFromAddress } from './address-detector';
import { extractPropertyData } from './property-detector';
import { fetchFMRData, fetchMarketParams } from '../shared/api-client';
import { computeCashFlow, getRentForBedrooms } from '../shared/cashflow';
import { DEFAULT_PREFERENCES, ExtensionPreferences } from '../shared/types';
import { createBadgeElement } from './badge';
import { createMiniViewElement } from './mini-view';

// Cache to avoid re-processing the same page
let processedAddresses = new Set<string>();
let badgeElement: HTMLElement | null = null;
let miniViewContainer: HTMLElement | null = null;

/**
 * Get user preferences from Chrome storage
 */
async function getPreferences(): Promise<ExtensionPreferences> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_PREFERENCES, (items) => {
      resolve(items as ExtensionPreferences);
    });
  });
}

/**
 * Calculate cash flow for detected property
 */
async function calculateCashFlow(
  address: string,
  detectedBedrooms: number | null,
  detectedPrice: number | null,
  preferences: ExtensionPreferences
): Promise<number | null> {
  try {
    // Extract ZIP code from address first
    const zipCode = extractZipFromAddress(address);
    if (!zipCode) {
      console.log('[FMR Extension] No ZIP code found in address:', address);
      return null;
    }

    // Fetch FMR data using ZIP code
    const fmrResponse = await fetchFMRData(zipCode);
    if (fmrResponse.error || !fmrResponse.data) {
      console.log('[FMR Extension] FMR data fetch failed:', fmrResponse.error);
      return null;
    }

    const fmrData = fmrResponse.data;
    
    // Use detected bedrooms or preference/default
    const bedrooms = detectedBedrooms ?? preferences.bedrooms ?? 3;
    if (bedrooms === null) {
      return null;
    }
    
    // Get rent for bedrooms
    const rentMonthly = getRentForBedrooms(fmrData, bedrooms);
    if (rentMonthly === null) {
      return null;
    }
    
    // Use detected price or preference (if price is null, can't calculate)
    const purchasePrice = detectedPrice ?? preferences.purchasePrice;
    if (purchasePrice === null || purchasePrice <= 0) {
      return null;
    }
    
    // Fetch market params (tax rate and mortgage rate)
    const marketResponse = await fetchMarketParams(zipCode);
    if (marketResponse.error) {
      return null;
    }
    
    const taxRate = preferences.overrideTaxRate && preferences.propertyTaxRateAnnualPct !== null
      ? preferences.propertyTaxRateAnnualPct
      : marketResponse.data.propertyTaxRateAnnualPct;
      
    const mortgageRate = preferences.overrideMortgageRate && preferences.mortgageRateAnnualPct !== null
      ? preferences.mortgageRateAnnualPct
      : marketResponse.data.mortgageRateAnnualPct;
    
    if (taxRate === null || mortgageRate === null) {
      return null;
    }
    
    // Calculate property management cost
    let propertyManagementMonthly = 0;
    if (preferences.propertyManagementMode === 'percent') {
      propertyManagementMonthly = rentMonthly * (preferences.propertyManagementPercent / 100);
    } else {
      propertyManagementMonthly = preferences.propertyManagementAmount;
    }
    
    // Calculate cash flow
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
      customLineItems: preferences.customLineItems || [],
    });
    
    return result?.monthlyCashFlow ?? null;
  } catch (error) {
    console.error('Error calculating cash flow:', error);
    return null;
  }
}

/**
 * Inject badge near address element
 */
async function injectBadge(addressElement: HTMLElement, cashFlow: number | null, address: string) {
  // Remove existing badge if any
  const existingBadge = document.querySelector('.fmr-badge');
  if (existingBadge) {
    existingBadge.remove();
  }
  
  // Create and inject badge
  badgeElement = createBadgeElement({
    cashFlow,
    onClick: () => {
      // Open mini view
      const zipCode = extractZipFromAddress(address);
      if (zipCode) {
        openMiniView(address, zipCode);
      }
    },
  });
  
  // Inject near the address
  addressElement.parentElement?.insertBefore(badgeElement, addressElement.nextSibling);
}

/**
 * Main function to detect addresses and inject badges
 */
async function processPage() {
  console.log('[FMR Extension] Processing page...', window.location.href);
  
  // Wait a bit for page to load (especially for SPAs like Redfin)
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const address = extractAddress();
  console.log('[FMR Extension] Extracted address:', address);
  
  if (!address) {
    console.log('[FMR Extension] No address found, skipping');
    return;
  }
  
  // Skip if already processed
  const addressKey = `${window.location.href}-${address}`;
  if (processedAddresses.has(addressKey)) {
    console.log('[FMR Extension] Already processed, skipping');
    return;
  }
  
  processedAddresses.add(addressKey);
  
  try {
    // Get user preferences
    const preferences = await getPreferences();
    console.log('[FMR Extension] Preferences loaded');
    
    // Extract property data
    const propertyData = extractPropertyData();
    console.log('[FMR Extension] Property data:', propertyData);
    
    // Calculate cash flow
    const cashFlow = await calculateCashFlow(
      address,
      propertyData.bedrooms,
      propertyData.price,
      preferences
    );
    console.log('[FMR Extension] Calculated cash flow:', cashFlow);
    
    // Find address element and inject badge
    const site = window.location.hostname.toLowerCase();
    let addressElement: HTMLElement | null = null;
    
    if (site.includes('zillow.com')) {
      addressElement = document.querySelector('h1[data-testid="address"]') as HTMLElement;
    } else if (site.includes('redfin.com')) {
      // Try multiple selectors for Redfin
      addressElement = document.querySelector('[data-testid="AddressDisplay"]') as HTMLElement ||
                       document.querySelector('.AddressDisplay') as HTMLElement ||
                       document.querySelector('.dp-address-block') as HTMLElement ||
                       document.querySelector('h1[class*="address"]') as HTMLElement ||
                       document.querySelector('.addressHeader') as HTMLElement;
    } else if (site.includes('realtor.com')) {
      addressElement = document.querySelector('[data-label="property-address"]') as HTMLElement;
    } else if (site.includes('homes.com')) {
      addressElement = document.querySelector('.property-header-address') as HTMLElement;
    }
    
    console.log('[FMR Extension] Address element found:', !!addressElement);
    
    if (addressElement) {
      await injectBadge(addressElement, cashFlow, address);
      console.log('[FMR Extension] Badge injected');
    } else {
      console.log('[FMR Extension] Address element not found, cannot inject badge');
    }
  } catch (error) {
    console.error('[FMR Extension] Error processing page:', error);
  }
}

/**
 * Open mini view modal
 */
async function openMiniView(address: string, zipCode: string) {
  // Remove existing mini view if any
  const existingOverlay = document.querySelector('.fmr-mini-view-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Get user preferences to pass to the main app
  const preferences = await getPreferences();

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'fmr-mini-view-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
  `;

  // Create mini view
  miniViewContainer = createMiniViewElement({
    address,
    zipCode,
    preferences,
    onClose: () => {
      overlay.remove();
      miniViewContainer = null;
    },
  });

  // Append to overlay
  overlay.appendChild(miniViewContainer);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      miniViewContainer = null;
    }
  });

  // Append to document
  document.body.appendChild(overlay);
}

/**
 * Initialize content script
 */
function init() {
  console.log('[FMR Extension] init() function called');
  console.log('[FMR Extension] Document ready state:', document.readyState);
  console.log('[FMR Extension] Current URL:', window.location.href);
  
  // Process page when DOM is ready
  if (document.readyState === 'loading') {
    console.log('[FMR Extension] Document still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[FMR Extension] DOMContentLoaded event fired, processing...');
      setTimeout(() => processPage(), 500); // Small delay to ensure page is fully rendered
    });
  } else {
    console.log('[FMR Extension] DOM already ready, processing after delay...');
    setTimeout(() => processPage(), 500);
  }
  
  // Watch for navigation changes (SPA) - improved for Redfin
  let lastUrl = location.href;
  const urlCheckInterval = setInterval(() => {
    const url = location.href;
    if (url !== lastUrl) {
      console.log('[FMR Extension] URL changed, processing new page...');
      lastUrl = url;
      processedAddresses.clear();
      setTimeout(processPage, 1500); // Wait longer for SPAs
    }
  }, 500);
  
  // Also watch for DOM changes that might indicate new content loaded
  // Wait for body to exist before observing
  if (document.body) {
    new MutationObserver(() => {
      // Throttle DOM observations
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        processedAddresses.clear();
        setTimeout(processPage, 1500);
      }
    }).observe(document.body, { subtree: true, childList: true });
  } else {
    // Wait for body to exist
    const bodyObserver = new MutationObserver(() => {
      if (document.body) {
        bodyObserver.disconnect();
        new MutationObserver(() => {
          const url = location.href;
          if (url !== lastUrl) {
            lastUrl = url;
            processedAddresses.clear();
            setTimeout(processPage, 1500);
          }
        }).observe(document.body, { subtree: true, childList: true });
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true });
  }
}

// Global error handler to catch any errors preventing script execution
window.addEventListener('error', (e) => {
  console.error('[FMR Extension] Global error caught:', e.error, e.message, e.filename, e.lineno);
});

// Immediate test to see if script loads - MUST execute immediately at top level
console.log('[FMR Extension] TOP LEVEL - Script file loaded!', new Date().toISOString());

(function immediateTest() {
  // Try multiple ways to ensure we see output
  try {
    console.log('[FMR Extension] IIFE - Script file loaded!', new Date().toISOString());
    console.error('[FMR Extension] Test error log');
    console.warn('[FMR Extension] Test warning log');
    
    // Try to show alert if console doesn't work
    if (typeof alert !== 'undefined') {
      // Don't actually alert, but this would work
    }
    
    // Add visible element when DOM is ready
    function addTestIndicator() {
      try {
        const testDiv = document.createElement('div');
        testDiv.id = 'fmr-extension-test';
        testDiv.textContent = 'FMR Extension Loaded ✓';
        testDiv.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #0a0a0a; color: white; padding: 8px 12px; z-index: 999999; font-size: 12px; font-family: monospace; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
        if (document.body) {
          document.body.appendChild(testDiv);
          setTimeout(() => testDiv.remove(), 5000);
        } else {
          document.addEventListener('DOMContentLoaded', () => {
            document.body.appendChild(testDiv);
            setTimeout(() => testDiv.remove(), 5000);
          });
        }
      } catch (e) {
        console.error('[FMR Extension] Error adding test indicator:', e);
      }
    }
    
    // Try immediately, then on DOM ready
    addTestIndicator();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addTestIndicator);
    }
  } catch (e) {
    // Last resort - throw to see error
    console.error('[FMR Extension] Error in immediate test:', e);
  }
})();

// Start the content script
try {
  console.log('[FMR Extension] Calling init()...');
  init();
  console.log('[FMR Extension] init() called successfully');
} catch (error) {
  console.error('[FMR Extension] Error in init():', error);
}
