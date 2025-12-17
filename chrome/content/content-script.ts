// Main content script for address detection and badge injection

import { extractAddress, extractZipFromAddress } from './address-detector';
import { extractPropertyData, extractPropertyDataFromCard, extractPropertyDataFromZillowCard, extractPropertyDataFromZillowExpanded } from './property-detector';
import { fetchFMRData, fetchMarketParams } from '../shared/api-client';
import { computeCashFlow, getRentForBedrooms } from '../shared/cashflow';
import { DEFAULT_PREFERENCES, ExtensionPreferences } from '../shared/types';
import { createBadgeElement } from './badge';
import { createMiniViewElement } from './mini-view';

// Cache to avoid re-processing the same page
let processedAddresses = new Set<string>();
let badgeElement: HTMLElement | null = null;
let miniViewContainer: HTMLElement | null = null;

// Track badges by card element for cleanup
const cardBadges = new Map<HTMLElement, HTMLElement>();

// Cache for API responses by ZIP code (shared across all views)
interface ZipCodeCacheEntry {
  fmrData: any; // FMRDataResponse['data']
  marketParams: {
    propertyTaxRateAnnualPct: number | null;
    mortgageRateAnnualPct: number | null;
  };
  timestamp: number;
}

// LRU-like cache with max 100 entries (using Map with insertion order)
const zipCodeCache = new Map<string, ZipCodeCacheEntry>();
const MAX_CACHE_SIZE = 100;

/**
 * Get cached data for a ZIP code
 */
function getCachedZipData(zipCode: string): ZipCodeCacheEntry | null {
  const entry = zipCodeCache.get(zipCode);
  if (entry) {
    // Move to end (most recently used) for LRU behavior
    zipCodeCache.delete(zipCode);
    zipCodeCache.set(zipCode, entry);
    return entry;
  }
  return null;
}

/**
 * Set cached data for a ZIP code
 */
function setCachedZipData(
  zipCode: string,
  fmrData: any,
  marketParams: { propertyTaxRateAnnualPct: number | null; mortgageRateAnnualPct: number | null }
): void {
  // Remove oldest entry if cache is full
  if (zipCodeCache.size >= MAX_CACHE_SIZE) {
    const firstKey = zipCodeCache.keys().next().value;
    if (firstKey) {
      zipCodeCache.delete(firstKey);
    }
  }
  
  // Add new entry (or update existing)
  zipCodeCache.set(zipCode, {
    fmrData,
    marketParams,
    timestamp: Date.now(),
  });
}

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
        return null;
    }

    // Check cache first
    let fmrData: any;
    let marketParams: { propertyTaxRateAnnualPct: number | null; mortgageRateAnnualPct: number | null };
    
    const cachedData = getCachedZipData(zipCode);
    if (cachedData) {
      fmrData = cachedData.fmrData;
      marketParams = cachedData.marketParams;
    } else {
      // Fetch FMR data using ZIP code
      const fmrResponse = await fetchFMRData(zipCode);
      if (fmrResponse.error || !fmrResponse.data) {
        return null;
      }

      fmrData = fmrResponse.data;
      
      // Fetch market params (tax rate and mortgage rate)
      const marketResponse = await fetchMarketParams(zipCode);
      if (marketResponse.error) {
        return null;
      }
      
      marketParams = {
        propertyTaxRateAnnualPct: marketResponse.data.propertyTaxRateAnnualPct,
        mortgageRateAnnualPct: marketResponse.data.mortgageRateAnnualPct,
      };
      
      // Store in cache
      setCachedZipData(zipCode, fmrData, marketParams);
    }
    
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
    
    const taxRate = preferences.overrideTaxRate && preferences.propertyTaxRateAnnualPct !== null
      ? preferences.propertyTaxRateAnnualPct
      : marketParams.propertyTaxRateAnnualPct;
      
    const mortgageRate = preferences.overrideMortgageRate && preferences.mortgageRateAnnualPct !== null
      ? preferences.mortgageRateAnnualPct
      : marketParams.mortgageRateAnnualPct;
    
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
        mode: preferences.downPaymentMode || 'percent',
        percent: preferences.downPaymentPercent,
        amount: preferences.downPaymentAmount,
      },
      termMonths: 360,
      customLineItems: preferences.customLineItems || [],
    });
    
    return result?.monthlyCashFlow ?? null;
  } catch (error) {
    console.error('[FMR Extension] Error calculating cash flow:', error);
    return null;
  }
}

/**
 * Inject badge near address element
 */
async function injectBadge(
  addressElement: HTMLElement, 
  cashFlow: number | null, 
  address: string, 
  isLoading: boolean = false,
  cardElement?: HTMLElement,
  propertyData?: { price: number | null; bedrooms: number | null },
  insufficientInfo: boolean = false,
  nonInteractive: boolean = false
) {
  // Remove existing badge for this card if any
  if (cardElement) {
    const existingBadge = cardElement.querySelector('.fmr-badge');
    if (existingBadge) {
      existingBadge.remove();
    }
    // Also remove from our tracking
    const trackedBadge = cardBadges.get(cardElement);
    if (trackedBadge && trackedBadge.parentElement) {
      trackedBadge.remove();
    }
    cardBadges.delete(cardElement);
  } else {
    // For detail pages, remove any existing badges (check multiple locations)
    const existingBadges = document.querySelectorAll('.fmr-badge');
    existingBadges.forEach(badge => badge.remove());
    // Also clear the badgeElement reference
    if (badgeElement && badgeElement.parentElement) {
      badgeElement.remove();
    }
    badgeElement = null;
  }
  
  // Create and inject badge
  const badge = createBadgeElement({
    cashFlow,
    isLoading,
    insufficientInfo,
    nonInteractive,
    onClick: () => {
      // Open mini view
      const zipCode = extractZipFromAddress(address);
      if (zipCode) {
        // Use provided property data or extract it
        const data = propertyData || extractPropertyData();
        openMiniView(address, zipCode, data.price, data.bedrooms);
      }
    },
  });
  
  // Track badge for this card
  if (cardElement) {
    cardBadges.set(cardElement, badge);
    badgeElement = badge; // Keep for detail pages
  } else {
    badgeElement = badge;
  }
  
  // Inject near the address
  // For Zillow cards, the address is inside a link, so we need to inject after the link
  if (cardElement && cardElement.getAttribute('data-testid') === 'property-card-data') {
    // Zillow card: inject after the address link
    const addressLink = addressElement.closest('a');
    if (addressLink && addressLink.parentElement) {
      // Insert after the link
      if (addressLink.nextSibling) {
        addressLink.parentElement.insertBefore(badge, addressLink.nextSibling);
      } else {
        addressLink.parentElement.appendChild(badge);
      }
    } else {
      // Fallback: inject after address element
      const fallbackParent1 = addressElement.parentElement;
      if (fallbackParent1) {
        if (addressElement.nextSibling) {
          fallbackParent1.insertBefore(badge, addressElement.nextSibling);
        } else {
          fallbackParent1.appendChild(badge);
        }
      }
    }
  } else if (cardElement && cardElement.getAttribute('data-testid') === 'fs-chip-container') {
    // Zillow expanded view: inject after the address wrapper or h1
    const addressWrapper = addressElement.closest('[class*="AddressWrapper"]') as HTMLElement | null;
    const targetParent: HTMLElement | null = addressWrapper || addressElement.parentElement;
    if (targetParent) {
      if (addressElement.nextSibling) {
        targetParent.insertBefore(badge, addressElement.nextSibling);
      } else {
        targetParent.appendChild(badge);
      }
    } else {
      // Fallback: inject after address element
      const fallbackParent = addressElement.parentElement as HTMLElement | null;
      if (fallbackParent) {
        if (addressElement.nextSibling) {
          fallbackParent.insertBefore(badge, addressElement.nextSibling);
        } else {
          fallbackParent.appendChild(badge);
        }
      }
    }
  } else {
    // Redfin or other: inject after address element
    const fallbackParent2 = addressElement.parentElement;
    if (fallbackParent2) {
      if (addressElement.nextSibling) {
        fallbackParent2.insertBefore(badge, addressElement.nextSibling);
      } else {
        fallbackParent2.appendChild(badge);
      }
    }
  }
}

/**
 * Check if we have sufficient data to calculate cash flow
 */
function hasSufficientData(address: string | null, bedrooms: number | null, price: number | null): boolean {
  if (!address) return false;
  
  // Check if ZIP code can be extracted
  const zipCode = extractZipFromAddress(address);
  if (!zipCode) return false;
  
  // Check if price is valid
  if (price === null || price === undefined || isNaN(price) || price <= 0) return false;
  
  // Check if bedrooms is valid (can be 0, but not null/NaN)
  if (bedrooms === null || bedrooms === undefined || isNaN(bedrooms)) return false;
  
  return true;
}

/**
 * Check if a badge already has valid data (not loading, not insufficient info, has cash flow)
 */
function badgeHasValidData(badge: HTMLElement): boolean {
  if (!badge) return false;
  
  // Check if badge is in loading state (has shimmer animation)
  const hasShimmer = badge.querySelector('[style*="shimmer"]') || 
                     badge.querySelector('[style*="animation"]');
  if (hasShimmer) {
    return false; // Still loading
  }
  
  // Check if badge shows "Insufficient info"
  const badgeText = badge.textContent || '';
  if (badgeText.includes('Insufficient info')) {
    return false; // Invalid data
  }
  
  // Check if badge shows "N/A"
  if (badgeText.includes('Cash Flow:') && badgeText.includes('N/A')) {
    return false; // No data available
  }
  
  // Check if badge has a cash flow value (contains $ sign and number)
  const hasCashFlow = /Cash Flow:.*[\+\-]\$[\d,]+/.test(badgeText);
  if (hasCashFlow) {
    return true; // Has valid cash flow data
  }
  
  return false;
}

/**
 * Process a single card element (Redfin or Zillow)
 */
async function processCard(cardElement: HTMLElement, viewType: 'list' | 'map', site: 'redfin' | 'zillow') {
  // Extract data from card based on site
  let cardData: { address: string | null; bedrooms: number | null; price: number | null };
  let addressElement: HTMLElement | null = null;
  
  if (site === 'redfin') {
    cardData = extractPropertyDataFromCard(cardElement);
    addressElement = cardElement.querySelector('.bp-Homecard__Address') as HTMLElement;
  } else {
    // Zillow - check if it's an expanded view or regular card
    if (cardElement.getAttribute('data-testid') === 'fs-chip-container') {
      // Expanded view
      cardData = extractPropertyDataFromZillowExpanded(cardElement);
      const addressWrapper = cardElement.querySelector('.styles__AddressWrapper-fshdp-8-112-0__sc-13x5vko-0');
      addressElement = addressWrapper?.querySelector('h1') as HTMLElement;
    } else {
      // Regular card
      cardData = extractPropertyDataFromZillowCard(cardElement);
      // Address element is the <address> tag inside .property-card-link
      const addressLink = cardElement.querySelector('.property-card-link') || cardElement.querySelector('a[data-test="property-card-link"]');
      addressElement = addressLink?.querySelector('address') as HTMLElement;
    }
  }
  
  if (!cardData.address || !addressElement) {
    return;
  }
  
  // Check if badge already exists in this card
  const existingBadge = cardElement.querySelector('.fmr-badge');
  if (existingBadge) {
    // Badge exists, check if it's still valid (not orphaned)
    const badgeParent = existingBadge.parentElement;
    if (badgeParent && cardElement.contains(badgeParent)) {
      return;
    }
    // Badge exists but is orphaned, remove it
    existingBadge.remove();
  }
  
  // Check if we have sufficient data
  const hasData = hasSufficientData(cardData.address, cardData.bedrooms, cardData.price);
  
  if (!hasData) {
    // Show insufficient info badge immediately
    // For Zillow cards, make badge non-interactive to prevent event propagation issues
    const isZillowCard = site === 'zillow' && cardElement.getAttribute('data-testid') !== 'fs-chip-container';
    await injectBadge(addressElement, null, cardData.address, false, cardElement, {
      price: cardData.price,
      bedrooms: cardData.bedrooms,
    }, true, isZillowCard); // insufficientInfo = true, nonInteractive = isZillowCard
    return;
  }
  
  // Inject loading skeleton immediately
  // For Zillow cards, make badge non-interactive to prevent event propagation issues
  const isZillowCard = site === 'zillow' && cardElement.getAttribute('data-testid') !== 'fs-chip-container';
  await injectBadge(addressElement, null, cardData.address, true, cardElement, {
    price: cardData.price,
    bedrooms: cardData.bedrooms,
  }, false, isZillowCard);
  
  // Get user preferences
  const preferences = await getPreferences();
  
  // Calculate cash flow
  const cashFlow = await calculateCashFlow(
    cardData.address,
    cardData.bedrooms,
    cardData.price,
    preferences
  );
  
  // Update badge with actual data
  const badge = cardBadges.get(cardElement);
  if (badge && (badge as any).updateContent) {
    (badge as any).updateContent(cashFlow, false, false);
  }
}

/**
 * Process all cards in list or map view
 */
async function processCards(viewType: 'list' | 'map', site: 'redfin' | 'zillow') {
  // Find all card containers based on site
  let cards: NodeListOf<Element>;
  if (site === 'redfin') {
    // Redfin uses .bp-Homecard__Content for card content
    cards = document.querySelectorAll('.bp-Homecard__Content');
  } else {
    // Zillow uses [data-testid="property-card-data"] for card content
    cards = document.querySelectorAll('[data-testid="property-card-data"]');
  }
  const processPromises: Promise<void>[] = [];
  
  // Convert NodeList to Array for iteration
  const cardsArray = Array.from(cards);
  for (const card of cardsArray) {
    const cardElement = card as HTMLElement;
    
    // Extract data to check if card has address
    let cardData: { address: string | null; bedrooms: number | null; price: number | null };
    if (site === 'redfin') {
      cardData = extractPropertyDataFromCard(cardElement);
    } else {
      cardData = extractPropertyDataFromZillowCard(cardElement);
    }
    
    if (cardData.address) {
      // Check if badge exists in card - if not, process it
      const existingBadge = cardElement.querySelector('.fmr-badge');
      if (!existingBadge) {
        // Process asynchronously
          processPromises.push(
            processCard(cardElement, viewType, site).catch(() => {})
          );
      } else {
        // Badge exists, verify it's still valid
        const badgeParent = existingBadge.parentElement;
        if (!badgeParent || !cardElement.contains(badgeParent)) {
          // Badge is orphaned, reprocess
          existingBadge.remove();
          processPromises.push(
            processCard(cardElement, viewType, site).catch(() => {})
          );
        }
      }
    }
  }
  
  // Wait for all cards to start processing (but don't wait for completion)
  await Promise.all(processPromises);
}

/**
 * Check if the current site is enabled in preferences
 */
async function isSiteEnabled(site: string): Promise<boolean> {
  const preferences = await getPreferences();
  const enabledSites = preferences.enabledSites || { redfin: true, zillow: true };
  
  if (site.includes('redfin.com')) {
    return enabledSites.redfin !== false;
  }
  if (site.includes('zillow.com')) {
    return enabledSites.zillow !== false;
  }
  
  // For other sites (realtor, homes), default to enabled for now
  return true;
}

async function processPage() {
  // Wait a bit for page to load (especially for SPAs like Redfin)
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const site = window.location.hostname.toLowerCase();
  
  // Check if this site is enabled
  const siteEnabled = await isSiteEnabled(site);
  if (!siteEnabled) {
    return; // Site is disabled, don't process
  }
  
  const isRedfinDetail = site.includes('redfin.com') && window.location.pathname.toLowerCase().includes('/home/');
  const isZillowDetail = site.includes('zillow.com') && window.location.pathname.toLowerCase().includes('/homedetails/');
  
  // Check if we're on Redfin list or map view
  if (site.includes('redfin.com') && !isRedfinDetail) {
    
    // Process existing cards (both list and map)
    await processCards('list', 'redfin');
    await processCards('map', 'redfin');
    
    // Watch for new cards being added or cards being re-rendered
    // Use a debounced approach to avoid processing too frequently
    let processTimeout: number | null = null;
    const observer = new MutationObserver((mutations) => {
      let hasChanges = false;
      mutations.forEach((mutation) => {
        // Check for added nodes (new cards)
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // Check if it's a card or contains cards
            if (element.classList?.contains('bp-Homecard__Content') || 
                element.querySelector?.('.bp-Homecard__Content')) {
              hasChanges = true;
            }
          }
        });
        
        // Check for removed nodes (cards being re-rendered)
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // If a card was removed, we need to reprocess
            if (element.classList?.contains('bp-Homecard__Content') ||
                element.querySelector?.('.bp-Homecard__Content')) {
              hasChanges = true;
            }
          }
        });
      });
      
      if (hasChanges) {
        // Debounce to avoid processing too frequently
        if (processTimeout) {
          clearTimeout(processTimeout);
        }
        processTimeout = setTimeout(() => {
          processCards('list', 'redfin').catch(() => {});
          processCards('map', 'redfin').catch(() => {});
        }, 500) as unknown as number;
      }
    });
    
    // Observe multiple areas to catch both list and map cards
    const contentAreas = [
      document.querySelector('.HomeViewsView'),
      document.querySelector('.MapAndListView'),
      document.querySelector('[data-rf-test-id="MapAndListView"]'),
      document.querySelector('.MapView'),
      document.querySelector('.MapHomeCard'), // Expanded map card
      document.querySelector('main'),
      document.body
    ].filter(Boolean) as HTMLElement[];
    
    contentAreas.forEach((contentArea) => {
      if (contentArea) {
        observer.observe(contentArea, {
          childList: true,
          subtree: true,
        });
      }
    });
    
    return;
  }
  
  // Check if we're on Zillow list or map view
  if (site.includes('zillow.com') && !isZillowDetail) {
    // Check for expanded view (fs-chip-container)
    const expandedView = document.querySelector('[data-testid="fs-chip-container"]');
    if (expandedView) {
      const expandedData = extractPropertyDataFromZillowExpanded(expandedView as HTMLElement);
      
      if (expandedData.address) {
        // Find address element (h1 in AddressWrapper)
        // Try multiple selectors for AddressWrapper
        let addressElement: HTMLElement | null = null;
        const addressWrappers = [
          expandedView.querySelector('.styles__AddressWrapper-fshdp-8-112-0__sc-13x5vko-0'),
          expandedView.querySelector('[class*="AddressWrapper"]'),
          expandedView.querySelector('[class*="address-wrapper"]'),
        ].filter(Boolean) as HTMLElement[];
        
        for (const addressWrapper of addressWrappers) {
          const h1 = addressWrapper.querySelector('h1');
          if (h1) {
            addressElement = h1 as HTMLElement;
            break;
          }
        }
        
        // Fallback: try any h1 with address-like text
        if (!addressElement) {
          const h1Elements = expandedView.querySelectorAll('h1');
          for (const h1 of Array.from(h1Elements)) {
            const text = h1.textContent?.trim();
            if (text && text.length > 5 && text.includes(',')) {
              addressElement = h1 as HTMLElement;
              break;
            }
          }
        }
        
        if (addressElement) {
          // Check if badge already exists with valid data
          const existingBadge = expandedView.querySelector('.fmr-badge') as HTMLElement;
          if (existingBadge && badgeHasValidData(existingBadge)) {
            return;
          }
          
          // If badge exists but doesn't have valid data, remove it to reprocess
          if (existingBadge) {
            existingBadge.remove();
            cardBadges.delete(expandedView as HTMLElement);
          }
          
          // Check if we have sufficient data
          const hasData = hasSufficientData(expandedData.address, expandedData.bedrooms, expandedData.price);
          
          if (!hasData) {
            await injectBadge(addressElement, null, expandedData.address, false, expandedView as HTMLElement, {
              price: expandedData.price,
              bedrooms: expandedData.bedrooms,
            }, true, false);
            return;
          }
          
          // Inject loading skeleton
          await injectBadge(addressElement, null, expandedData.address, true, expandedView as HTMLElement, {
            price: expandedData.price,
            bedrooms: expandedData.bedrooms,
          }, false, false);
          
          // Get preferences and calculate
          const preferences = await getPreferences();
          const cashFlow = await calculateCashFlow(
            expandedData.address,
            expandedData.bedrooms,
            expandedData.price,
            preferences
          );
          
          // Update badge
          const badge = cardBadges.get(expandedView as HTMLElement);
          if (badge && (badge as any).updateContent) {
            (badge as any).updateContent(cashFlow, false, false);
          }
        }
      }
    }
    
    // Process existing cards (both list and map)
    await processCards('list', 'zillow');
    await processCards('map', 'zillow');
    
    // Watch for new cards being added or cards being re-rendered
    let processTimeout: number | null = null;
    const observer = new MutationObserver((mutations) => {
      let hasChanges = false;
      mutations.forEach((mutation) => {
        // Check for added nodes (new cards)
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // Check if it's a card or contains cards
            if (element.getAttribute?.('data-testid') === 'property-card-data' ||
                element.querySelector?.('[data-testid="property-card-data"]') ||
                element.getAttribute?.('data-testid') === 'fs-chip-container' ||
                element.querySelector?.('[data-testid="fs-chip-container"]')) {
              hasChanges = true;
            }
          }
        });
        
        // Check for removed nodes (cards being re-rendered)
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // If a card was removed, we need to reprocess
            if (element.getAttribute?.('data-testid') === 'property-card-data' ||
                element.querySelector?.('[data-testid="property-card-data"]') ||
                element.getAttribute?.('data-testid') === 'fs-chip-container' ||
                element.querySelector?.('[data-testid="fs-chip-container"]')) {
              hasChanges = true;
            }
          }
        });
      });
      
      if (hasChanges) {
        // Debounce to avoid processing too frequently
        if (processTimeout) {
          clearTimeout(processTimeout);
        }
        processTimeout = setTimeout(() => {
          // Check for expanded view again
          const expandedView = document.querySelector('[data-testid="fs-chip-container"]');
          if (expandedView) {
            const existingBadge = expandedView.querySelector('.fmr-badge') as HTMLElement;
            // Only process if no badge exists or badge doesn't have valid data
            if (existingBadge && badgeHasValidData(existingBadge)) {
              // Badge has valid data, skip refetch
              // Continue to process cards instead
            } else {
              // Remove existing badge if it doesn't have valid data
              if (existingBadge) {
                existingBadge.remove();
                cardBadges.delete(expandedView as HTMLElement);
              }
              
              const expandedData = extractPropertyDataFromZillowExpanded(expandedView as HTMLElement);
              if (expandedData.address) {
                // Find address element (h1 in AddressWrapper)
                let addressElement: HTMLElement | null = null;
                const addressWrappers = [
                  expandedView.querySelector('.styles__AddressWrapper-fshdp-8-112-0__sc-13x5vko-0'),
                  expandedView.querySelector('[class*="AddressWrapper"]'),
                  expandedView.querySelector('[class*="address-wrapper"]'),
                ].filter(Boolean) as HTMLElement[];
                
                for (const addressWrapper of addressWrappers) {
                  const h1 = addressWrapper.querySelector('h1');
                  if (h1) {
                    addressElement = h1 as HTMLElement;
                    break;
                  }
                }
                
                // Fallback: try any h1 with address-like text
                if (!addressElement) {
                  const h1Elements = expandedView.querySelectorAll('h1');
                  for (const h1 of Array.from(h1Elements)) {
                    const text = h1.textContent?.trim();
                    if (text && text.length > 5 && text.includes(',')) {
                      addressElement = h1 as HTMLElement;
                      break;
                    }
                  }
                }
                
                if (addressElement) {
                  // Check if we have sufficient data
                  const hasData = hasSufficientData(expandedData.address, expandedData.bedrooms, expandedData.price);
                  
                  if (!hasData) {
                    injectBadge(addressElement, null, expandedData.address, false, expandedView as HTMLElement, {
                      price: expandedData.price,
                      bedrooms: expandedData.bedrooms,
                    }, true, false).catch(() => {});
                  } else {
                    // Inject loading skeleton
                    injectBadge(addressElement, null, expandedData.address, true, expandedView as HTMLElement, {
                      price: expandedData.price,
                      bedrooms: expandedData.bedrooms,
                    }, false, false).then(() => {
                      // Get preferences and calculate
                      return getPreferences();
                    }).then(preferences => {
                      return calculateCashFlow(
                        expandedData.address!,
                        expandedData.bedrooms,
                        expandedData.price,
                        preferences
                      );
                    }).then(cashFlow => {
                      // Update badge
                      const badge = cardBadges.get(expandedView as HTMLElement);
                      if (badge && (badge as any).updateContent) {
                        (badge as any).updateContent(cashFlow, false, false);
                      }
                    }).catch(() => {});
                  }
                }
              }
            }
          }
          
          // Process both list and map cards
          processCards('list', 'zillow').catch(() => {});
          processCards('map', 'zillow').catch(() => {});
        }, 500) as unknown as number;
      }
    });
    
    // Observe multiple areas to catch both list and map cards
    const contentAreas = [
      document.querySelector('#search-page-list-container'),
      document.querySelector('#map-fullscreen'),
      document.querySelector('#map-fullscreen-list-container'),
      document.querySelector('[data-testid="map-list-container"]'),
      document.querySelector('.SearchPage'),
      document.querySelector('[data-testid="search-page-list-container"]'),
      document.querySelector('main'),
      document.body
    ].filter(Boolean) as HTMLElement[];
    
    contentAreas.forEach((contentArea) => {
      if (contentArea) {
        observer.observe(contentArea, {
          childList: true,
          subtree: true,
        });
      }
    });
    
    return;
  }
  
  // Handle detail pages (existing logic)
  const address = extractAddress();
  
  if (!address) {
    return;
  }
  
  // Skip if already processed
  const addressKey = `${window.location.href}-${address}`;
  if (processedAddresses.has(addressKey)) {
    return;
  }
  
  processedAddresses.add(addressKey);
  
  try {
    // Find address element first (before async operations)
    let addressElement: HTMLElement | null = null;
    
    if (site.includes('zillow.com')) {
      // Try multiple selectors for Zillow detail pages
      addressElement = document.querySelector('[data-testid="home-info"] h1') as HTMLElement ||
                       document.querySelector('h1[data-testid="address"]') as HTMLElement ||
                       document.querySelector('h1.property-address') as HTMLElement ||
                       document.querySelector('[data-testid="zpid-address"]') as HTMLElement ||
                       document.querySelector('[data-testid="home-info"] .Text-c11n-8-112-0__sc-aiai24-0') as HTMLElement ||
                       document.querySelector('h1.Text-c11n-8-112-0__sc-aiai24-0') as HTMLElement;
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
    
    if (!addressElement) {
      return;
    }
    
    // Inject loading skeleton immediately (before checking data to avoid premature "insufficient info")
    await injectBadge(addressElement, null, address, true, undefined, undefined, false, false);
    
    // Wait a bit for page to fully load before extracting property data
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Extract property data after page has had time to load
    const propertyData = extractPropertyData();
    
    // Check if we have sufficient data
    const hasData = hasSufficientData(address, propertyData.bedrooms, propertyData.price);
    
    if (!hasData) {
      // Update badge to show insufficient info
      if (badgeElement && (badgeElement as any).updateContent) {
        (badgeElement as any).updateContent(null, false, true);
      }
      return;
    }
    
    // Get user preferences
    const preferences = await getPreferences();
    
    // Calculate cash flow
    const cashFlow = await calculateCashFlow(
      address,
      propertyData.bedrooms,
      propertyData.price,
      preferences
    );
    
    // Update badge with actual data
    if (badgeElement && (badgeElement as any).updateContent) {
      (badgeElement as any).updateContent(cashFlow, false, false);
    }
  } catch (error) {
    console.error('[FMR Extension] Error:', error);
    // Update badge to show error state
    if (badgeElement && (badgeElement as any).updateContent) {
      (badgeElement as any).updateContent(null, false, false);
    }
  }
}

/**
 * Open mini view modal
 */
async function openMiniView(address: string, zipCode: string, purchasePrice: number | null, bedrooms: number | null) {
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
    z-index: 10011;
  `;

  // Create mini view
  miniViewContainer = createMiniViewElement({
    address,
    zipCode,
    preferences,
    purchasePrice,
    bedrooms,
    overlay, // Pass overlay reference so it can be hidden during dragging
    onClose: () => {
      overlay.remove();
      miniViewContainer = null;
    },
  });

  // Append to overlay
  overlay.appendChild(miniViewContainer);

  // Close on overlay click (but not if we just finished dragging)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      // Don't close if drag just ended (prevents accidental close after dragging)
      if ((overlay as any).__fmrDragJustEnded) {
        return;
      }
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
  // Process page when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => processPage(), 500);
    });
  } else {
    setTimeout(() => processPage(), 500);
  }
  
  // Watch for navigation changes (SPA)
  let lastUrl = location.href;
  const handleUrlChange = () => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      processedAddresses.clear();
      cardBadges.clear();
      setTimeout(processPage, 1500);
    }
  };
  
  setInterval(handleUrlChange, 500);
  
  // Also watch for DOM changes that might indicate new content loaded
  if (document.body) {
    new MutationObserver(handleUrlChange).observe(document.body, { subtree: true, childList: true });
  } else {
    const bodyObserver = new MutationObserver(() => {
      if (document.body) {
        bodyObserver.disconnect();
        new MutationObserver(handleUrlChange).observe(document.body, { subtree: true, childList: true });
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true });
  }
}

// Global error handler to catch any errors preventing script execution
window.addEventListener('error', (e) => {
  console.error('[FMR Extension] Error:', e.error, e.message);
});

// Start the content script
try {
  init();
} catch (error) {
  console.error('[FMR Extension] Error initializing:', error);
}

