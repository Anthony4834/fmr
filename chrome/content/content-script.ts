// Main content script for address detection and badge injection

import { extractAddress, extractZipFromAddress } from './address-detector';
import { extractPropertyData, extractPropertyDataFromCard, extractPropertyDataFromZillowCard, extractPropertyDataFromZillowExpanded } from './property-detector';
import { fetchFMRData, fetchMarketParams, trackMissingData, MissingDataField } from '../shared/api-client';
import { computeCashFlow, getRentForBedrooms } from '../shared/cashflow';
import { DEFAULT_PREFERENCES, ExtensionPreferences } from '../shared/types';
import { createBadgeElement } from './badge';
import { createMiniViewElement } from './mini-view';
import { isLoggedIn, login } from '../shared/auth';
import { getApiBaseUrl } from '../shared/config';

// Rate limit marker - returned when API returns 429
const RATE_LIMITED = 'RATE_LIMITED' as const;
type RateLimitMarker = typeof RATE_LIMITED;

// Cache to avoid re-processing the same page
let processedAddresses = new Set<string>();
let badgeElement: HTMLElement | null = null;
let miniViewContainer: HTMLElement | null = null;

// Track badges by card element for cleanup
const cardBadges = new Map<HTMLElement, HTMLElement>();

// Used to detect when Zillow reuses a card DOM node for a different listing
const CARD_KEY_DATASET_FIELD = 'fmrKey';
const HOA_PENDING_DATASET_FIELD = 'fmrHoaPending';

// Zillow card selectors: property-card (new c11n layout), property-card-data (legacy)
const ZILLOW_CARD_SELECTOR = '[data-testid="property-card"], [data-testid="property-card-data"]';

function isZillowListOrMapCard(el: HTMLElement): boolean {
  const tid = el.getAttribute('data-testid');
  return tid === 'property-card' || tid === 'property-card-data';
}

type BadgeMode = 'cashFlow' | 'fmr';

// We keep a lightweight, live view of the current mode so we can
// - branch badge rendering without re-reading storage for every decision
// - update badges immediately when the user switches modes in the popup
let currentBadgeMode: BadgeMode = DEFAULT_PREFERENCES.mode;
let hasLoadedInitialMode = false;

let zillowCardPollInterval: number | null = null;

function isElementWithinZillowCardOrExpandedView(target: Node | null): boolean {
  if (!target) return false;
  const el = (target.nodeType === Node.ELEMENT_NODE ? (target as Element) : (target.parentElement as Element | null));
  if (!el) return false;
  return !!el.closest?.(`${ZILLOW_CARD_SELECTOR}, [data-testid="fs-chip-container"]`);
}

function startZillowCardKeyPolling(): void {
  // Backstop: Zillow sometimes swaps selected map card state without triggering our debounced observer.
  if (zillowCardPollInterval !== null) return;
  zillowCardPollInterval = setInterval(() => {
    try {
      // Only poll on Zillow search/map pages (not detail pages)
      const site = window.location.hostname.toLowerCase();
      const isZillowDetail = site.includes('zillow.com') && window.location.pathname.toLowerCase().includes('/homedetails/');
      if (!site.includes('zillow.com') || isZillowDetail) return;

      // Limit work: only check a small number of visible cards that already have badges
      const badgedCards = Array.from(
        document.querySelectorAll(`${ZILLOW_CARD_SELECTOR} .fmr-badge`)
      )
        .map((b) => (b as HTMLElement).closest(ZILLOW_CARD_SELECTOR) as HTMLElement | null)
        .filter(Boolean) as HTMLElement[];

      const seen = new Set<HTMLElement>();
      let checked = 0;
      for (const card of badgedCards) {
        if (seen.has(card)) continue;
        seen.add(card);
        if (!(card as any).isConnected) continue;
        // "Visible-ish" heuristic
        if ((card as any).offsetParent === null) continue;
        checked++;
        if (checked > 5) break;

        const cardData = extractPropertyDataFromZillowCard(card);
        if (!cardData.address) continue;
        const key = getCardDataKey(cardData.address, cardData.price, cardData.bedrooms);
        const lastKey = (card as any).dataset?.[CARD_KEY_DATASET_FIELD] as string | undefined;
        if (lastKey && lastKey !== key) {
          const existingBadge = card.querySelector('.fmr-badge') as HTMLElement | null;
          if (existingBadge) existingBadge.remove();
          processCard(card, 'map', 'zillow').catch(() => {});
        }
      }
    } catch {
      // Ignore polling errors
    }
  }, 650) as unknown as number;
}

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

// FMR-only cache (ZIP -> FMR response data). Kept separate so we don't pollute the
// cash-flow cache with incomplete market params.
interface FmrOnlyZipCacheEntry {
  fmrData: any;
  timestamp: number;
}

const fmrOnlyZipCache = new Map<string, FmrOnlyZipCacheEntry>();
const MAX_FMR_ONLY_CACHE_SIZE = 100;

function getCachedFmrOnlyZipData(zipCode: string): any | null {
  const entry = fmrOnlyZipCache.get(zipCode);
  if (!entry) return null;
  // LRU: move to end
  fmrOnlyZipCache.delete(zipCode);
  fmrOnlyZipCache.set(zipCode, entry);
  return entry.fmrData;
}

function setCachedFmrOnlyZipData(zipCode: string, fmrData: any): void {
  if (fmrOnlyZipCache.size >= MAX_FMR_ONLY_CACHE_SIZE) {
    const firstKey = fmrOnlyZipCache.keys().next().value;
    if (firstKey) fmrOnlyZipCache.delete(firstKey);
  }
  fmrOnlyZipCache.set(zipCode, { fmrData, timestamp: Date.now() });
}

// Cache for cash flow results by property (prioritizes results with HOA)
interface CashFlowCacheEntry {
  cashFlow: number | null | RateLimitMarker;
  hoaMonthly: number | null; // null means HOA was not available, number means HOA was available (could be 0)
  hasHOA: boolean; // true if HOA was available in the view (even if 0), false if not available
  timestamp: number;
}

// Cache key: address + price + bedrooms (normalized)
function getCashFlowCacheKey(address: string, price: number | null, bedrooms: number | null): string {
  const normalizedAddress = address.toLowerCase().trim();
  const priceStr = price !== null ? String(price) : 'null';
  const bedroomsStr = bedrooms !== null ? String(bedrooms) : 'null';
  return `${normalizedAddress}|${priceStr}|${bedroomsStr}`;
}

// LRU-like cache with max 200 entries
const cashFlowCache = new Map<string, CashFlowCacheEntry>();
const MAX_CASH_FLOW_CACHE_SIZE = 200;

/**
 * Get cached cash flow for a property
 * Returns null if not cached, or if cached but HOA unavailable and we need HOA
 */
function getCachedCashFlow(
  address: string,
  price: number | null,
  bedrooms: number | null,
  requireHOA: boolean = false
): CashFlowCacheEntry | null {
  const key = getCashFlowCacheKey(address, price, bedrooms);
  const entry = cashFlowCache.get(key);
  
  if (entry) {
    // If we require HOA but cached entry doesn't have HOA, don't use it
    if (requireHOA && !entry.hasHOA) {
      return null;
    }
    
    // Move to end (most recently used) for LRU behavior
    cashFlowCache.delete(key);
    cashFlowCache.set(key, entry);
    return entry;
  }
  
  return null;
}

/**
 * Set cached cash flow for a property
 * If entry exists with HOA, only update if new entry also has HOA (prioritize HOA results)
 * If entry exists without HOA, always update (expanded view results are better)
 */
function setCachedCashFlow(
  address: string,
  price: number | null,
  bedrooms: number | null,
  cashFlow: number | null | RateLimitMarker,
  hoaMonthly: number | null,
  hasHOA: boolean
): void {
  const key = getCashFlowCacheKey(address, price, bedrooms);
  const existing = cashFlowCache.get(key);
  
  // If existing entry has HOA and new one doesn't, don't overwrite (prioritize HOA)
  if (existing && existing.hasHOA && !hasHOA) {
    return;
  }
  
  // Remove oldest entry if cache is full
  if (cashFlowCache.size >= MAX_CASH_FLOW_CACHE_SIZE) {
    const firstKey = cashFlowCache.keys().next().value;
    if (firstKey) {
      cashFlowCache.delete(firstKey);
    }
  }
  
  // Add or update entry
  cashFlowCache.set(key, {
    cashFlow,
    hoaMonthly,
    hasHOA,
    timestamp: Date.now(),
  });
}

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

function normalizeBadgeMode(value: any): BadgeMode {
  return value === 'fmr' ? 'fmr' : 'cashFlow';
}

async function loadInitialBadgeMode(): Promise<void> {
  try {
    const prefs = await getPreferences();
    currentBadgeMode = normalizeBadgeMode((prefs as any).mode);
  } catch {
    // ignore
  } finally {
    hasLoadedInitialMode = true;
  }
}

async function refreshBadgesForModeChange(options?: { forceReprocess?: boolean }): Promise<void> {
  const site = window.location.hostname.toLowerCase();
  const forceReprocess = options?.forceReprocess ?? false;

  // Only refresh if this site is enabled.
  const siteEnabled = await isSiteEnabled(site);
  if (!siteEnabled) {
    // If disabled, remove any existing badges (best-effort) to avoid stale mode display.
    document.querySelectorAll('.fmr-badge').forEach((b) => b.remove());
    cardBadges.clear();
    badgeElement = null;
    return;
  }

  const isRedfinDetail = site.includes('redfin.com') && window.location.pathname.toLowerCase().includes('/home/');
  const isZillowDetail = site.includes('zillow.com') && window.location.pathname.toLowerCase().includes('/homedetails/');

  // List/map pages: re-run card processing.
  // When forceReprocess (e.g. rent source change), remove badges first so processCards reprocesses all.
  if (site.includes('redfin.com') && !isRedfinDetail) {
    if (forceReprocess) {
      document.querySelectorAll('.fmr-badge').forEach((b) => b.remove());
      cardBadges.clear();
    }
    await processCards('list', 'redfin');
    await processCards('map', 'redfin');
    return;
  }

  if (site.includes('zillow.com') && !isZillowDetail) {
    if (forceReprocess) {
      document.querySelectorAll('.fmr-badge').forEach((b) => b.remove());
      cardBadges.clear();
    }
    const expandedView = document.querySelector('[data-testid="fs-chip-container"]');
    if (expandedView) {
      processCard(expandedView as HTMLElement, 'map', 'zillow').catch(() => {});
    }
    await processCards('list', 'zillow');
    await processCards('map', 'zillow');
    return;
  }

  // Detail pages: force re-processing quickly.
  processedAddresses.clear();
  document.querySelectorAll('.fmr-badge').forEach((b) => b.remove());
  cardBadges.clear();
  badgeElement = null;
  await processPage({ skipWait: true });
}

function setupModeChangeListener(): void {
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      
      // Handle mode changes
      if (changes.mode) {
        const next = normalizeBadgeMode(changes.mode.newValue);
        const prev = currentBadgeMode;
        currentBadgeMode = next;

        if (next !== prev) {
          // Refresh in the background; badge updates are "live" and shouldn't require page refresh.
          refreshBadgesForModeChange().catch(() => {});
        }
      }

      // Handle rent source changes (effective vs FMR) - affects both FMR display and cash flow calc
      if (changes.rentSource) {
        const next = changes.rentSource.newValue as string | undefined;
        const prev = changes.rentSource.oldValue as string | undefined;
        if (next !== prev && (next === 'effective' || next === 'fmr')) {
          cashFlowCache.clear(); // Cached cash flow was computed with old rentSource
          refreshBadgesForModeChange({ forceReprocess: true }).catch(() => {});
        }
      }

      // Handle auth state changes (user logged in/out)
      if (changes.fmr_extension_auth) {
        console.log('[FMR Content] Auth state changed, clearing cache and refreshing badges');
        // Clear all caches so we re-fetch data with new auth state
        zipCodeCache.clear();
        cashFlowCache.clear();
        processedAddresses.clear();
        // Refresh all badges
        refreshBadgesForModeChange().catch(() => {});
      }
    });
  } catch {
    // ignore
  }
}

/**
 * Calculate cash flow for detected property
 * @param address Property address
 * @param detectedBedrooms Number of bedrooms
 * @param detectedPrice Purchase price
 * @param preferences User preferences
 * @param hoaMonthly HOA monthly dues (null if not available)
 * @param checkCache Whether to check cache first (default: true)
 * @param isExpandedView Whether this is from an expanded/detail view (default: false)
 */
async function calculateCashFlow(
  address: string,
  detectedBedrooms: number | null,
  detectedPrice: number | null,
  preferences: ExtensionPreferences,
  hoaMonthly: number | null = null,
  checkCache: boolean = true,
  isExpandedView: boolean = false
): Promise<number | null | RateLimitMarker> {
  try {
    // Check cash flow cache first if enabled
    if (checkCache && detectedPrice !== null && detectedBedrooms !== null) {
      const cached = getCachedCashFlow(address, detectedPrice, detectedBedrooms, false);
      if (cached && (!isExpandedView || cached.hasHOA)) {
        // Use cached value if:
        // - It's a card view (not expanded), or
        // - It's an expanded view and cached value has HOA
        return cached.cashFlow;
      }
    }
    
    // Extract ZIP code from address first
    const zipCode = extractZipFromAddress(address);
    if (!zipCode) {
      trackMissingData({
        address,
        bedrooms: detectedBedrooms,
        price: detectedPrice,
        missingFields: ['zip_code'],
      });
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
      if (fmrResponse.rateLimited) {
        // Rate limited - return special marker
        return 'RATE_LIMITED' as any;
      }
      if (fmrResponse.error || !fmrResponse.data) {
        trackMissingData({
          zipCode,
          address,
          bedrooms: detectedBedrooms,
          price: detectedPrice,
          missingFields: ['fmr_data'],
        });
        return null;
      }

      fmrData = fmrResponse.data;
      
      // Fetch market params (tax rate and mortgage rate)
      const marketResponse = await fetchMarketParams(zipCode);
      if (marketResponse.rateLimited) {
        // Rate limited - return special marker
        return 'RATE_LIMITED' as any;
      }
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
    
    // Get rent for bedrooms (use rentSource preference: effective or fmr)
    const rentMonthly = getRentForBedrooms(fmrData, bedrooms, preferences.rentSource || 'effective');
    if (rentMonthly === null) {
      trackMissingData({
        zipCode,
        address,
        bedrooms,
        price: detectedPrice,
        missingFields: ['fmr_bedroom'],
      });
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
      const missingFields: MissingDataField[] = [];
      if (taxRate === null) missingFields.push('property_tax_rate');
      if (mortgageRate === null) missingFields.push('mortgage_rate');
      trackMissingData({
        zipCode,
        address,
        bedrooms,
        price: purchasePrice,
        missingFields,
      });
      return null;
    }
    
    // Calculate property management cost
    let propertyManagementMonthly = 0;
    if (preferences.propertyManagementMode === 'percent') {
      propertyManagementMonthly = rentMonthly * (preferences.propertyManagementPercent / 100);
    } else {
      propertyManagementMonthly = preferences.propertyManagementAmount;
    }
    
    // Use detected HOA if available, otherwise use preference (default 0)
    const hoa = hoaMonthly !== null ? hoaMonthly : preferences.hoaMonthly;
    
    // Calculate cash flow
    const result = computeCashFlow({
      purchasePrice,
      rentMonthly,
      bedrooms,
      interestRateAnnualPct: mortgageRate,
      propertyTaxRateAnnualPct: taxRate,
      insuranceMonthly: preferences.insuranceMonthly,
      hoaMonthly: hoa,
      propertyManagementMonthly,
      downPayment: {
        mode: preferences.downPaymentMode || 'percent',
        percent: preferences.downPaymentPercent,
        amount: preferences.downPaymentAmount,
      },
      termMonths: 360,
      customLineItems: preferences.customLineItems || [],
    });
    
    const cashFlow = result?.monthlyCashFlow ?? null;
    
    // Cache the result
    if (checkCache && purchasePrice !== null && bedrooms !== null) {
      const hasHOA = hoaMonthly !== null; // HOA was available (even if 0)
      setCachedCashFlow(address, purchasePrice, bedrooms, cashFlow, hoaMonthly, hasHOA);
    }
    
    return cashFlow;
  } catch (error) {
    console.error('[FMR Extension] Error calculating cash flow:', error);
    return null;
  }
}

/**
 * Calculate FMR monthly rent for a detected property (no cash flow calculation).
 * Uses ZIP -> FMR data and bedroom count.
 */
async function calculateFmrMonthly(
  address: string,
  detectedBedrooms: number | null,
  rentSource: 'effective' | 'fmr' = 'effective'
): Promise<number | null | RateLimitMarker> {
  try {
    const zipCode = extractZipFromAddress(address);
    if (!zipCode) {
      trackMissingData({
        address,
        bedrooms: detectedBedrooms,
        missingFields: ['zip_code'],
        source: 'chrome-extension-fmr-only',
      });
      return null;
    }

    if (detectedBedrooms === null || detectedBedrooms === undefined || isNaN(detectedBedrooms)) {
      trackMissingData({
        zipCode,
        address,
        missingFields: ['bedrooms'],
        source: 'chrome-extension-fmr-only',
      });
      return null;
    }

    // Reuse cash-flow ZIP cache if available (it includes FMR data), otherwise use FMR-only cache.
    const cachedZip = getCachedZipData(zipCode);
    let fmrData: any = cachedZip?.fmrData ?? getCachedFmrOnlyZipData(zipCode);

    if (!fmrData) {
      const fmrResponse = await fetchFMRData(zipCode);
      if (fmrResponse.rateLimited) {
        // Rate limited - return special marker
        return 'RATE_LIMITED' as any;
      }
      if (fmrResponse.error || !fmrResponse.data) {
        trackMissingData({
          zipCode,
          address,
          bedrooms: detectedBedrooms,
          missingFields: ['fmr_data'],
          source: 'chrome-extension-fmr-only',
        });
        return null;
      }
      fmrData = fmrResponse.data;
      setCachedFmrOnlyZipData(zipCode, fmrData);
    }

    const rentMonthly = getRentForBedrooms(fmrData, detectedBedrooms, rentSource);
    if (rentMonthly === null) {
      trackMissingData({
        zipCode,
        address,
        bedrooms: detectedBedrooms,
        missingFields: ['fmr_bedroom'],
        source: 'chrome-extension-fmr-only',
      });
    }
    return rentMonthly;
  } catch (error) {
    console.error('[FMR Extension] Error calculating FMR:', error);
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
  propertyData?: { price: number | null; bedrooms: number | null; hoaMonthly: number | null },
  insufficientInfo: boolean = false,
  nonInteractive: boolean = false,
  hoaUnavailable: boolean = false,
  rateLimited: boolean = false
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
  
  // Get FMR data if in FMR mode (and rent constraint flags for tooltip when available)
  let fmrMonthly: number | null | RateLimitMarker = null;
  let rentConstrained = false;
  let missingMarketRent = false;
  const zipCode = extractZipFromAddress(address);
  if (zipCode) {
    const cachedZip = getCachedZipData(zipCode);
    const cachedFmrOnly = getCachedFmrOnlyZipData(zipCode);
    const fmrData = cachedZip?.fmrData ?? cachedFmrOnly ?? null;
    if (fmrData) {
      const rc = fmrData.rentConstraint;
      if (rc) {
        rentConstrained = !!rc.isConstrained;
        missingMarketRent = !!rc.missingMarketRent;
      }
      if (currentBadgeMode === 'fmr' && !isLoading && !insufficientInfo && propertyData && propertyData.bedrooms !== null) {
        const prefs = await getPreferences();
        fmrMonthly = getRentForBedrooms(fmrData, propertyData.bedrooms, prefs.rentSource || 'effective');
      }
    }
  }
  
  // Create and inject badge
  const badge = createBadgeElement({
    cashFlow,
    mode: currentBadgeMode,
    fmrMonthly,
    isLoading,
    insufficientInfo,
    nonInteractive,
    hoaUnavailable,
    rateLimited,
    rentConstrained,
    missingMarketRent,
    onClick: async () => {
      // Check if user is logged in
      const loggedIn = await isLoggedIn();
      
      if (rateLimited || !loggedIn) {
        // Trigger login flow
        try {
          await login();
          location.reload();
        } catch (error) {
          console.error('[FMR Extension] Login error:', error);
        }
      } else {
        // Open mini view
        const zipCode = extractZipFromAddress(address);
        if (zipCode) {
          // Use provided property data or extract it
          const data = propertyData || extractPropertyData();
          openMiniView(address, zipCode, data.price, data.bedrooms, data.hoaMonthly);
        }
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
  if (cardElement && isZillowListOrMapCard(cardElement)) {
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
 * Check if we have sufficient data to calculate cash flow (Cash Flow mode).
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
 * Check if we have sufficient data to display FMR (FMR-only mode).
 * Price is not required.
 */
function hasSufficientDataForFmr(address: string | null, bedrooms: number | null): boolean {
  if (!address) return false;

  const zipCode = extractZipFromAddress(address);
  if (!zipCode) return false;

  if (bedrooms === null || bedrooms === undefined || isNaN(bedrooms)) return false;

  return true;
}

/**
 * Check if a badge already has valid data (not loading, not insufficient info, has cash flow)
 */
function badgeHasValidData(badge: HTMLElement): boolean {
  if (!badge) return false;
  const rawMode = (badge as any).dataset?.fmrMode as string | undefined;
  const mode: BadgeMode = rawMode === 'fmr' ? 'fmr' : 'cashFlow';
  
  // Check if badge is in loading state (has shimmer animation)
  const hasShimmer = badge.querySelector('[style*="shimmer"]') || 
                     badge.querySelector('[style*="animation"]');
  if (hasShimmer) {
    return false; // Still loading
  }
  
  // Check if badge shows insufficient data (covers both missing input data and failed API fetch)
  const badgeText = badge.textContent || '';
  if (badgeText.includes('Insufficient data')) {
    return false; // Invalid or missing data
  }
  
  if (mode === 'cashFlow') {
    // Check if badge has a cash flow value (contains $ sign and number)
    // Badge format is like: "fmr.fyi +$1,234/mo"
    return /[\+\-]\$[\d,]+/.test(badgeText) && badgeText.includes('/mo');
  }

  // FMR-only mode: "$1,234/mo"
  return /\$[\d,]+/.test(badgeText) && badgeText.includes('/mo');
}

function getCardDataKey(address: string, price: number | null, bedrooms: number | null): string {
  // Reuse the same normalization as the cashflow cache key
  return getCashFlowCacheKey(address, price, bedrooms);
}

/**
 * Process a single card element (Redfin or Zillow)
 */
async function processCard(cardElement: HTMLElement, viewType: 'list' | 'map', site: 'redfin' | 'zillow') {
  // Extract data from card based on site
  let cardData: { address: string | null; bedrooms: number | null; price: number | null; hoaMonthly: number | null };
  let addressElement: HTMLElement | null = null;
  let isExpandedView = false;
  
  if (site === 'redfin') {
    cardData = extractPropertyDataFromCard(cardElement);
    addressElement = cardElement.querySelector('.bp-Homecard__Address') as HTMLElement;
  } else {
    // Zillow - check if it's an expanded view or regular card
    if (cardElement.getAttribute('data-testid') === 'fs-chip-container') {
      // Expanded view
      isExpandedView = true;
      cardData = extractPropertyDataFromZillowExpanded(cardElement);
      const addressWrapper = cardElement.querySelector('.styles__AddressWrapper-fshdp-8-112-0__sc-13x5vko-0');
      addressElement = addressWrapper?.querySelector('h1') as HTMLElement;
    } else {
      // Regular card
      cardData = extractPropertyDataFromZillowCard(cardElement);
      // Address element is the <address> tag inside the address link
      const addressLink = cardElement.querySelector('.property-card-link') ||
        cardElement.querySelector('a[data-test="property-card-link"]') ||
        cardElement.querySelector('a[data-testid="property-card-address-link"]');
      addressElement = addressLink?.querySelector('address') as HTMLElement;
    }
  }
  
  if (!cardData.address || !addressElement) {
    return;
  }

  // If Zillow reuses the same card DOM node for a new listing (common in map view),
  // detect it and reprocess even if a badge already exists.
  const currentKey = getCardDataKey(cardData.address, cardData.price, cardData.bedrooms);
  const lastKey = (cardElement as any).dataset?.[CARD_KEY_DATASET_FIELD] as string | undefined;
  
  // Check if badge already exists in this card
  const existingBadge = cardElement.querySelector('.fmr-badge');
  if (existingBadge) {
    // Badge exists, check if it's still valid (not orphaned)
    const badgeParent = existingBadge.parentElement;
    const isOrphaned = !(badgeParent && cardElement.contains(badgeParent));
    const isSameListing = lastKey === currentKey;
    const rawMode = (existingBadge as any).dataset?.fmrMode as string | undefined;
    const existingMode: BadgeMode = rawMode === 'fmr' ? 'fmr' : 'cashFlow'; // default old badges to cashFlow
    const modeMatches = existingMode === currentBadgeMode;
    
    // Check if badge shows "Insufficient data" - if so, treat as final state (don't reprocess)
    const badgeText = existingBadge.textContent || '';
    const showsInsufficientData = badgeText.includes('Insufficient data');

    if (isSameListing && !isOrphaned && modeMatches) {
      // If badge shows insufficient data, don't reprocess (it's a final state)
      if (showsInsufficientData) {
        return;
      }
      // Otherwise check if badge has valid data
      if (badgeHasValidData(existingBadge as HTMLElement)) {
        return;
      }
    }
    // Badge exists but listing changed, is orphaned, mode changed, or needs update; remove and reprocess
    existingBadge.remove();
  }

  // Record the key we processed for this DOM node (best-effort)
  try {
    (cardElement as any).dataset[CARD_KEY_DATASET_FIELD] = currentKey;
  } catch {}
  
  // Check if user is logged in - require login for extension to work
  const loggedIn = await isLoggedIn();
  
  if (!loggedIn) {
    // Show login required badge immediately
    const isZillowCard = site === 'zillow' && !isExpandedView;
    await injectBadge(addressElement, null, cardData.address, false, cardElement, {
      price: cardData.price,
      bedrooms: cardData.bedrooms,
      hoaMonthly: cardData.hoaMonthly,
    }, false, isZillowCard, !isExpandedView, true); // rateLimited = true
    return;
  }
  
  // Check if we have sufficient data
  const hasCashFlowData = hasSufficientData(cardData.address, cardData.bedrooms, cardData.price);
  const hasFmrData = hasSufficientDataForFmr(cardData.address, cardData.bedrooms);
  const hasData = currentBadgeMode === 'fmr' ? hasFmrData : hasCashFlowData;
  
  if (!hasData) {
    // Show insufficient info badge immediately
    // For Zillow cards, make badge non-interactive to prevent event propagation issues
    const isZillowCard = site === 'zillow' && !isExpandedView;
    await injectBadge(addressElement, null, cardData.address, false, cardElement, {
      price: cardData.price,
      bedrooms: cardData.bedrooms,
      hoaMonthly: cardData.hoaMonthly,
    }, true, isZillowCard, !isExpandedView); // insufficientInfo = true, nonInteractive = isZillowCard, hoaUnavailable = !isExpandedView
    return;
  }

  // Inject loading skeleton immediately
  // For Zillow cards, make badge non-interactive to prevent event propagation issues
  const isZillowCard = site === 'zillow' && !isExpandedView;
  await injectBadge(addressElement, null, cardData.address, true, cardElement, {
    price: cardData.price,
    bedrooms: cardData.bedrooms,
    hoaMonthly: cardData.hoaMonthly,
  }, false, isZillowCard, !isExpandedView);

  // Get user preferences
  const preferences = await getPreferences();
  // Keep our live mode in sync with storage (used by observers + mode switching refresh).
  currentBadgeMode = normalizeBadgeMode((preferences as any).mode);

  if (currentBadgeMode === 'fmr') {
    const fmrMonthly: number | null | RateLimitMarker = await calculateFmrMonthly(cardData.address, cardData.bedrooms, preferences.rentSource || 'effective');

    // Update badge with actual data (FMR-only mode)
    const badge = cardBadges.get(cardElement);
    if (fmrMonthly === RATE_LIMITED) {
      if (badge && (badge as any).updateRateLimitedContent) {
        (badge as any).updateRateLimitedContent();
      }
    } else if (badge && (badge as any).updateFmrContent) {
      (badge as any).updateFmrContent(fmrMonthly, false, false, !isExpandedView);
    } else if (badge && (badge as any).updateContent) {
      // Fallback: show N/A using existing rendering
      (badge as any).updateContent(null, false, false, false);
    }
    return;
  }

  // Check cache first for card views
  let cashFlow: number | null | RateLimitMarker = null;
  let hoaUnavailable = !isExpandedView;
  
  if (!isExpandedView && cardData.price !== null && cardData.bedrooms !== null) {
    // Check if we have a cached result with HOA
    const cached = getCachedCashFlow(cardData.address, cardData.price, cardData.bedrooms, false);
    if (cached && cached.hasHOA) {
      // Use cached result with HOA - no tooltip needed
      cashFlow = cached.cashFlow;
      hoaUnavailable = false;
    }
  }
  
  // Calculate if not using cache
  if (cashFlow === null) {
    cashFlow = await calculateCashFlow(
      cardData.address,
      cardData.bedrooms,
      cardData.price,
      preferences,
      cardData.hoaMonthly,
      true, // checkCache
      isExpandedView
    );
  }

  // Update badge with actual data
  const badge = cardBadges.get(cardElement);
  if (cashFlow === RATE_LIMITED) {
    if (badge && (badge as any).updateRateLimitedContent) {
      (badge as any).updateRateLimitedContent();
    }
  } else if (badge && (badge as any).updateContent) {
    (badge as any).updateContent(cashFlow, false, false, hoaUnavailable);
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
    // Zillow: property-card (new c11n layout), property-card-data (legacy)
    cards = document.querySelectorAll(ZILLOW_CARD_SELECTOR);
  }
  const processPromises: Promise<void>[] = [];
  
  // Convert NodeList to Array for iteration
  const cardsArray = Array.from(cards);
  for (const card of cardsArray) {
    const cardElement = card as HTMLElement;
    
    // Extract data to check if card has address
    let cardData: { address: string | null; bedrooms: number | null; price: number | null; hoaMonthly: number | null };
    if (site === 'redfin') {
      cardData = extractPropertyDataFromCard(cardElement);
    } else {
      cardData = extractPropertyDataFromZillowCard(cardElement);
    }
    
    if (cardData.address) {
      const key = getCardDataKey(cardData.address, cardData.price, cardData.bedrooms);
      const lastKey = (cardElement as any).dataset?.[CARD_KEY_DATASET_FIELD] as string | undefined;

      // Check if badge exists in card - if not, process it
      const existingBadge = cardElement.querySelector('.fmr-badge');
      if (!existingBadge) {
        // Process asynchronously
          processPromises.push(
            processCard(cardElement, viewType, site).catch(() => {})
          );
      } else {
        // If Zillow reused this card node for a different listing, reprocess even if badge exists.
        if (site === 'zillow' && lastKey && lastKey !== key) {
          existingBadge.remove();
          processPromises.push(processCard(cardElement, viewType, site).catch(() => {}));
          continue;
        }

        // If the badge is from a different mode, force reprocess so it swaps cleanly.
        const rawMode = (existingBadge as any).dataset?.fmrMode as string | undefined;
        const existingMode: BadgeMode = rawMode === 'fmr' ? 'fmr' : 'cashFlow';
        if (existingMode !== currentBadgeMode) {
          existingBadge.remove();
          processPromises.push(processCard(cardElement, viewType, site).catch(() => {}));
          continue;
        }

        // Badge exists, verify it's still valid
        const badgeParent = existingBadge.parentElement;
        if (!badgeParent || !cardElement.contains(badgeParent)) {
          // Badge is orphaned, reprocess
          existingBadge.remove();
          processPromises.push(
            processCard(cardElement, viewType, site).catch(() => {})
          );
        } else {
          // Check if badge shows "Insufficient data" - if so, don't reprocess (it's a final state)
          const badgeText = existingBadge.textContent || '';
          if (badgeText.includes('Insufficient data')) {
            // Badge shows insufficient data, skip reprocessing
            continue;
          }
          
          // Badge exists and is valid - check if we have cached HOA data to update it
          if (currentBadgeMode === 'cashFlow') {
            if (cardData.price !== null && cardData.bedrooms !== null) {
              const cached = getCachedCashFlow(cardData.address, cardData.price, cardData.bedrooms, false);
              if (cached && cached.hasHOA && (existingBadge as any).updateContent) {
                // Update badge with cached HOA data (remove tooltip)
                (existingBadge as any).updateContent(cached.cashFlow, false, false, false);
              }
            }
          }
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

async function processPage(options?: { skipWait?: boolean }) {
  // Ensure we have the user's selected mode before processing anything.
  if (!hasLoadedInitialMode) {
    await loadInitialBadgeMode();
  }

  // Wait a bit for page to load (especially for SPAs like Redfin)
  if (!options?.skipWait) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
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
    startZillowCardKeyPolling();

    // Check for expanded view (fs-chip-container)
    const expandedView = document.querySelector('[data-testid="fs-chip-container"]');
    if (expandedView) {
      if (currentBadgeMode === 'fmr') {
        // FMR-only mode: keep expanded view simple and reuse the normal card processing path.
        await processCard(expandedView as HTMLElement, 'map', 'zillow');
      } else {
        const expandedData = extractPropertyDataFromZillowExpanded(expandedView as HTMLElement);
      
        if (expandedData.address) {
          const expandedKey = getCardDataKey(expandedData.address, expandedData.price, expandedData.bedrooms);
          const lastExpandedKey = (expandedView as any).dataset?.[CARD_KEY_DATASET_FIELD] as string | undefined;

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
          // If Zillow reused this expanded container for a new listing, never keep the old badge
          const existingBadge = expandedView.querySelector('.fmr-badge') as HTMLElement;
          const isSameListing = lastExpandedKey === expandedKey;
          
          // Check if existing badge shows "Insufficient data" - if so, don't reprocess (it's a final state)
          if (existingBadge && isSameListing) {
            const badgeText = existingBadge.textContent || '';
            if (badgeText.includes('Insufficient data')) {
              // Badge already shows insufficient data for this listing, skip reprocessing
              return;
            }
          }
          
          if (existingBadge && !isSameListing) {
            existingBadge.remove();
            cardBadges.delete(expandedView as HTMLElement);
          }

          // Track which listing this expanded view currently represents (Zillow can reuse this node)
          try {
            (expandedView as any).dataset[CARD_KEY_DATASET_FIELD] = expandedKey;
          } catch {}
          
          // Get current mode (ensure it's loaded) - use currentBadgeMode if available, otherwise fetch
          if (!hasLoadedInitialMode) {
            await loadInitialBadgeMode();
          }
          
          // Get preferences to ensure mode is current
          const prefs = await getPreferences();
          const mode = normalizeBadgeMode((prefs as any).mode);
          
          // Check if we have sufficient data
          const hasCashFlowData = hasSufficientData(expandedData.address, expandedData.bedrooms, expandedData.price);
          const hasFmrData = hasSufficientDataForFmr(expandedData.address, expandedData.bedrooms);
          const hasData = mode === 'fmr' ? hasFmrData : hasCashFlowData;
          
          if (!hasData) {
            // Clear HOA pending flag
            try { (expandedView as any).dataset[HOA_PENDING_DATASET_FIELD] = '0'; } catch {}
            await injectBadge(addressElement, null, expandedData.address, false, expandedView as HTMLElement, {
              price: expandedData.price,
              bedrooms: expandedData.bedrooms,
              hoaMonthly: expandedData.hoaMonthly,
            }, true, false, false); // hoaUnavailable = false for expanded view
            return;
          }

          // In expanded view, never show the non-HOA cached value even briefly.
          // If we already have an HOA-aware cached result, we can show it immediately.
          let cachedHoaCashFlow: number | null | RateLimitMarker = null;
          if (expandedData.price !== null && expandedData.bedrooms !== null) {
            const cachedHoa = getCachedCashFlow(expandedData.address, expandedData.price, expandedData.bedrooms, true);
            if (cachedHoa && cachedHoa.hasHOA) {
              cachedHoaCashFlow = cachedHoa.cashFlow;
            }
          }

          const existingBadge2 = expandedView.querySelector('.fmr-badge') as HTMLElement | null;
          if (cachedHoaCashFlow !== null && existingBadge2 && (existingBadge2 as any).updateContent) {
            // Ensure we don't refetch if we already have HOA-aware cached result and badge matches listing
            (existingBadge2 as any).updateContent(cachedHoaCashFlow, false, false, false);
            try { (expandedView as any).dataset[HOA_PENDING_DATASET_FIELD] = '0'; } catch {}
            if (isSameListing && badgeHasValidData(existingBadge2)) {
              return;
            }
          } else {
            // Force loading immediately (prevents "cached -> loading -> HOA" flicker)
            try { (expandedView as any).dataset[HOA_PENDING_DATASET_FIELD] = '1'; } catch {}
            if (existingBadge2 && (existingBadge2 as any).updateContent) {
              (existingBadge2 as any).updateContent(null, true, false, false);
            } else {
              await injectBadge(addressElement, null, expandedData.address, true, expandedView as HTMLElement, {
                price: expandedData.price,
                bedrooms: expandedData.bedrooms,
                hoaMonthly: expandedData.hoaMonthly,
              }, false, false, false); // hoaUnavailable = false for expanded view
            }
          }
          
          // Get preferences and calculate
          const preferences = await getPreferences();
          const cashFlow = await calculateCashFlow(
            expandedData.address,
            expandedData.bedrooms,
            expandedData.price,
            preferences,
            expandedData.hoaMonthly,
            true, // checkCache
            true // isExpandedView
          );
          
          // Update badge
          const badge = cardBadges.get(expandedView as HTMLElement);
          if (cashFlow === RATE_LIMITED) {
            if (badge && (badge as any).updateRateLimitedContent) {
              (badge as any).updateRateLimitedContent();
            }
          } else if (badge && (badge as any).updateContent) {
            // HOA is available in expanded view
            (badge as any).updateContent(cashFlow, false, false, false);
          }
          try { (expandedView as any).dataset[HOA_PENDING_DATASET_FIELD] = '0'; } catch {}
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
        // Zillow map selection changes often show up as text/attribute mutations
        if (mutation.type === 'attributes' || mutation.type === 'characterData') {
          if (isElementWithinZillowCardOrExpandedView(mutation.target)) {
            hasChanges = true;
          }
        }

        // Check for added nodes (new cards)
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            // Check if it's a card or contains cards
            if (element.matches?.(ZILLOW_CARD_SELECTOR) ||
                element.querySelector?.(ZILLOW_CARD_SELECTOR) ||
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
            if (element.matches?.(ZILLOW_CARD_SELECTOR) ||
                element.querySelector?.(ZILLOW_CARD_SELECTOR) ||
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
            const expandedData = extractPropertyDataFromZillowExpanded(expandedView as HTMLElement);
            if (expandedData.address) {
              const expandedKey = getCardDataKey(expandedData.address, expandedData.price, expandedData.bedrooms);
              const lastExpandedKey = (expandedView as any).dataset?.[CARD_KEY_DATASET_FIELD] as string | undefined;
              const isSameListing = lastExpandedKey === expandedKey;

              // If listing changed, clear old badge immediately
              if (existingBadge && !isSameListing) {
                existingBadge.remove();
                cardBadges.delete(expandedView as HTMLElement);
              }

              // Check if existing badge shows "Insufficient data" - if so, don't reprocess (it's a final state)
              if (isSameListing && existingBadge) {
                const badgeText = existingBadge.textContent || '';
                if (badgeText.includes('Insufficient data')) {
                  // Badge already shows insufficient data for this listing, skip reprocessing
                  return; // Return early from the timeout callback
                }
              }

              // If we already have HOA-aware cached value and badge is valid, skip
              if (isSameListing && existingBadge && badgeHasValidData(existingBadge)) {
                // ok
              } else {
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
                  // Track which listing this expanded view currently represents
                  try {
                    (expandedView as any).dataset[CARD_KEY_DATASET_FIELD] = expandedKey;
                  } catch {}

                  const hasCashFlowData = hasSufficientData(expandedData.address, expandedData.bedrooms, expandedData.price);
                  const hasFmrData = hasSufficientDataForFmr(expandedData.address, expandedData.bedrooms);
                  const hasData = currentBadgeMode === 'fmr' ? hasFmrData : hasCashFlowData;
                  if (!hasData) {
                    try { (expandedView as any).dataset[HOA_PENDING_DATASET_FIELD] = '0'; } catch {}
                    injectBadge(addressElement, null, expandedData.address, false, expandedView as HTMLElement, {
                      price: expandedData.price,
                      bedrooms: expandedData.bedrooms,
                      hoaMonthly: expandedData.hoaMonthly,
                    }, true, false, false).catch(() => {});
                  } else {
                    // Always show loading unless we already have HOA-aware cached result
                    let cachedHoaCashFlow: number | null | RateLimitMarker = null;
                    if (expandedData.price !== null && expandedData.bedrooms !== null) {
                      const cachedHoa = getCachedCashFlow(expandedData.address, expandedData.price, expandedData.bedrooms, true);
                      if (cachedHoa && cachedHoa.hasHOA) cachedHoaCashFlow = cachedHoa.cashFlow;
                    }

                    const existingBadge2 = expandedView.querySelector('.fmr-badge') as HTMLElement | null;
                    if (cachedHoaCashFlow !== null && existingBadge2 && (existingBadge2 as any).updateContent) {
                      (existingBadge2 as any).updateContent(cachedHoaCashFlow, false, false, false);
                      try { (expandedView as any).dataset[HOA_PENDING_DATASET_FIELD] = '0'; } catch {}
                    } else {
                      try { (expandedView as any).dataset[HOA_PENDING_DATASET_FIELD] = '1'; } catch {}
                      if (existingBadge2 && (existingBadge2 as any).updateContent) {
                        (existingBadge2 as any).updateContent(null, true, false, false);
                      } else {
                        injectBadge(addressElement, null, expandedData.address, true, expandedView as HTMLElement, {
                          price: expandedData.price,
                          bedrooms: expandedData.bedrooms,
                          hoaMonthly: expandedData.hoaMonthly,
                        }, false, false, false).catch(() => {});
                      }
                    }

                    getPreferences()
                      .then((preferences) =>
                        calculateCashFlow(
                          expandedData.address!,
                          expandedData.bedrooms,
                          expandedData.price,
                          preferences,
                          expandedData.hoaMonthly,
                          true,
                          true
                        )
                      )
                      .then((cashFlow: number | null | RateLimitMarker) => {
                        const badge = cardBadges.get(expandedView as HTMLElement);
                        if (cashFlow === RATE_LIMITED) {
                          if (badge && (badge as any).updateRateLimitedContent) {
                            (badge as any).updateRateLimitedContent();
                          }
                        } else if (badge && (badge as any).updateContent) {
                          (badge as any).updateContent(cashFlow, false, false, false);
                        }
                        try { (expandedView as any).dataset[HOA_PENDING_DATASET_FIELD] = '0'; } catch {}
                      })
                      .catch(() => {});
                  }
                }
              }
            }
          }
          
          // Process both list and map cards
          processCards('list', 'zillow').catch(() => {});
          processCards('map', 'zillow').catch(() => {});
        }, 150) as unknown as number;
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
          // Zillow often updates the selected map card by mutating text/attributes,
          // without adding/removing nodes.
          attributes: true,
          characterData: true,
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
    // Check if badge already exists and shows insufficient data - if so, don't reprocess
    const existingBadge = document.querySelector('.fmr-badge') as HTMLElement;
    if (existingBadge) {
      const badgeText = existingBadge.textContent || '';
      if (badgeText.includes('Insufficient data')) {
        return; // Badge already shows insufficient data, don't reprocess
      }
      // If badge has valid data, also don't reprocess
      if (badgeHasValidData(existingBadge)) {
        return;
      }
    }
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
    
    // Wait a bit for page to fully load before extracting property data
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Extract property data after page has had time to load
    const propertyData = extractPropertyData();
    
    // Check if user is logged in - require login for extension to work
    const loggedIn = await isLoggedIn();
    
    if (!loggedIn) {
      // Show login required badge immediately
      await injectBadge(addressElement, null, address, false, undefined, propertyData, false, false, false, true); // rateLimited = true
      return;
    }
    
    // Get user preferences to check mode
    const preferences = await getPreferences();
    currentBadgeMode = normalizeBadgeMode((preferences as any).mode);
    
    // Check if we have sufficient data based on mode
    const hasCashFlowData = hasSufficientData(address, propertyData.bedrooms, propertyData.price);
    const hasFmrData = hasSufficientDataForFmr(address, propertyData.bedrooms);
    const hasData = currentBadgeMode === 'fmr' ? hasFmrData : hasCashFlowData;
    
    if (!hasData) {
      // Inject insufficient info badge
      await injectBadge(addressElement, null, address, false, undefined, undefined, true, false);
      return;
    }

    if (currentBadgeMode === 'fmr') {
      // FMR-only mode: check for cached FMR data first
      let cachedFmrMonthly: number | null = null;
      if (propertyData.bedrooms !== null) {
        const zipCode = extractZipFromAddress(address);
        if (zipCode) {
          const cachedZip = getCachedZipData(zipCode);
          const cachedFmrOnly = getCachedFmrOnlyZipData(zipCode);
          const fmrData = cachedZip?.fmrData ?? cachedFmrOnly;
          if (fmrData) {
            cachedFmrMonthly = getRentForBedrooms(fmrData, propertyData.bedrooms, preferences.rentSource || 'effective');
          }
        }
      }

      // Inject badge: show cached FMR if available, otherwise show loading
      if (cachedFmrMonthly !== null) {
        await injectBadge(addressElement, null, address, false, undefined, propertyData, false, false);
        // Update badge with cached FMR immediately
        if (badgeElement && (badgeElement as any).updateFmrContent) {
          (badgeElement as any).updateFmrContent(cachedFmrMonthly, false, false, false);
        }
      } else {
        await injectBadge(addressElement, null, address, true, undefined, propertyData, false, false);
      }

      // Calculate and display FMR (if not already cached)
      if (cachedFmrMonthly === null) {
        const fmrMonthly: number | null | RateLimitMarker = await calculateFmrMonthly(address, propertyData.bedrooms, preferences.rentSource || 'effective');
        
        // Update badge with FMR data
        if (badgeElement && (badgeElement as any).updateFmrContent) {
          if (fmrMonthly === RATE_LIMITED) {
            if ((badgeElement as any).updateRateLimitedContent) {
              (badgeElement as any).updateRateLimitedContent();
            }
          } else if (fmrMonthly === null) {
            // If fmrMonthly is null (missing data), show insufficient data instead of N/A to prevent reprocessing
            (badgeElement as any).updateFmrContent(null, false, true, false); // insufficientInfo = true
          } else {
            (badgeElement as any).updateFmrContent(fmrMonthly, false, false, false);
          }
        }
      }
    } else {
      // Cash flow mode: existing logic
      // On detail pages, never show non-HOA cached value even briefly.
      // Check if we already have HOA-aware cached result first.
      let cachedHoaCashFlow: number | null | RateLimitMarker = null;
      if (propertyData.price !== null && propertyData.bedrooms !== null) {
        const cachedHoa = getCachedCashFlow(address, propertyData.price, propertyData.bedrooms, true);
        if (cachedHoa && cachedHoa.hasHOA) {
          cachedHoaCashFlow = cachedHoa.cashFlow;
        }
      }

      // Inject badge first (show loading or cached value)
      if (cachedHoaCashFlow !== null && cachedHoaCashFlow !== RATE_LIMITED) {
        await injectBadge(addressElement, cachedHoaCashFlow, address, false, undefined, propertyData, false, false);
        // Badge already shows cached value, no need to update
      } else {
        // Inject badge with loading state
        await injectBadge(addressElement, null, address, true, undefined, propertyData, false, false);
      }

      // Calculate cash flow (HOA is available on detail pages)
      // Always recalculate to ensure we have the latest result (cache might be stale)
      const cashFlow: number | null | RateLimitMarker = await calculateCashFlow(
        address,
        propertyData.bedrooms,
        propertyData.price,
        preferences,
        propertyData.hoaMonthly,
        false, // checkCache: skip cache check to always recalculate with HOA (prevents flicker)
        true // isExpandedView (detail pages are expanded views)
      );

      // Update badge with actual data (HOA is available on detail pages)
      // Ensure badgeElement exists (it should have been created above)
      if (!badgeElement) {
        // Badge wasn't created, create it now
        await injectBadge(addressElement, null, address, false, undefined, propertyData, false, false);
      }
      
      if (badgeElement && (badgeElement as any).updateContent) {
        if (cashFlow === RATE_LIMITED) {
          if ((badgeElement as any).updateRateLimitedContent) {
            (badgeElement as any).updateRateLimitedContent();
          }
        } else if (cashFlow === null) {
          // If cashFlow is null (missing market data), show insufficient data instead of N/A to prevent reprocessing
          (badgeElement as any).updateContent(null, false, true, false); // insufficientInfo = true
        } else {
          (badgeElement as any).updateContent(cashFlow, false, false, false);
        }
      }
    }
  } catch (error) {
    console.error('[FMR Extension] Error:', error);
    // Update badge to show error state (show insufficient data to prevent reprocessing)
    if (badgeElement && (badgeElement as any).updateContent) {
      (badgeElement as any).updateContent(null, false, true, false); // insufficientInfo = true
    }
  }
}

/**
 * Update card badges for a property when we get expanded view results
 * Also triggers re-processing of matching cards to ensure they get updated
 */
function updateCardBadgesForProperty(address: string, price: number, bedrooms: number): void {
  // Check cache for this property
  const cached = getCachedCashFlow(address, price, bedrooms, false);
  if (!cached || !cached.hasHOA) {
    return; // No cached result with HOA
  }
  
  // Normalize address for comparison
  const normalizedAddress = address.toLowerCase().trim();
  
  // Track which cards we've updated to avoid duplicates
  const updatedCards = new Set<HTMLElement>();
  
  // Find all card badges in the map and update them if they match this property
  for (const [cardElement, badge] of cardBadges.entries()) {
    // Skip expanded views (they're already updated)
    if (cardElement.getAttribute('data-testid') === 'fs-chip-container') {
      continue;
    }
    
    // Check if card element is still in the DOM
    if (!cardElement.isConnected) {
      continue;
    }
    
    // Try to extract property data from the card to see if it matches
    let cardData: { address: string | null; price: number | null; bedrooms: number | null } | null = null;
    
    try {
      // Check if it's a Zillow card
      if (isZillowListOrMapCard(cardElement)) {
        cardData = extractPropertyDataFromZillowCard(cardElement);
      } else if (cardElement.classList?.contains('bp-Homecard__Content')) {
        // Redfin card
        cardData = extractPropertyDataFromCard(cardElement);
      }
    } catch (e) {
      // Skip if extraction fails
      continue;
    }
    
    // Check if this card matches the property
    if (!cardData || !cardData.address) {
      continue;
    }
    
    // Use more flexible matching - check if addresses are similar (normalize whitespace, case)
    const cardAddressNormalized = cardData.address.toLowerCase().trim().replace(/\s+/g, ' ');
    const targetAddressNormalized = normalizedAddress.replace(/\s+/g, ' ');
    
    if (cardAddressNormalized === targetAddressNormalized &&
        cardData.price === price &&
        cardData.bedrooms === bedrooms) {
      // Update the badge with cached result (no tooltip since HOA is available)
      if ((badge as any).updateContent) {
        (badge as any).updateContent(cached.cashFlow, false, false, false);
        updatedCards.add(cardElement);
      }
    }
  }
  
  // Also search the DOM directly for badges that might not be in the map
  // (e.g., if cards were re-rendered after expanded view closed)
  const allBadges = document.querySelectorAll('.fmr-badge');
  for (const badgeElement of Array.from(allBadges)) {
    const badge = badgeElement as HTMLElement;
    
    // Skip if this badge is already in our map (we updated it above)
    let isInMap = false;
    for (const mappedBadge of Array.from(cardBadges.values())) {
      if (mappedBadge === badge) {
        isInMap = true;
        break;
      }
    }
    if (isInMap) {
      continue;
    }
    
    // Find the card element that contains this badge
    const cardElement = badge.closest(ZILLOW_CARD_SELECTOR) ||
                       badge.closest('.bp-Homecard__Content') ||
                       badge.closest('[data-testid="fs-chip-container"]');
    
    if (!cardElement) {
      continue;
    }
    
    // Skip expanded views
    if ((cardElement as HTMLElement).getAttribute('data-testid') === 'fs-chip-container') {
      continue;
    }
    
    // Skip if already updated
    if (updatedCards.has(cardElement as HTMLElement)) {
      continue;
    }
    
    // Try to extract property data
    let cardData: { address: string | null; price: number | null; bedrooms: number | null } | null = null;
    
    try {
      if (isZillowListOrMapCard(cardElement as HTMLElement)) {
        cardData = extractPropertyDataFromZillowCard(cardElement as HTMLElement);
      } else if ((cardElement as HTMLElement).classList?.contains('bp-Homecard__Content')) {
        cardData = extractPropertyDataFromCard(cardElement as HTMLElement);
      }
    } catch (e) {
      continue;
    }
    
    // Check if this card matches the property
    if (!cardData || !cardData.address) {
      continue;
    }
    
    // Use more flexible matching - check if addresses are similar (normalize whitespace, case)
    const cardAddressNormalized = cardData.address.toLowerCase().trim().replace(/\s+/g, ' ');
    const targetAddressNormalized = normalizedAddress.replace(/\s+/g, ' ');
    
    if (cardAddressNormalized === targetAddressNormalized &&
        cardData.price === price &&
        cardData.bedrooms === bedrooms) {
      // Update the badge with cached result (no tooltip since HOA is available)
      if ((badge as any).updateContent) {
        (badge as any).updateContent(cached.cashFlow, false, false, false);
        updatedCards.add(cardElement as HTMLElement);
      }
    }
  }
  
  // Also trigger re-processing of matching cards that don't have badges yet
  // This ensures newly rendered cards get the HOA-aware value
  const site = window.location.hostname.toLowerCase();
  if (site.includes('zillow.com')) {
    const allCards = document.querySelectorAll(ZILLOW_CARD_SELECTOR);
    for (const card of Array.from(allCards)) {
      const cardElement = card as HTMLElement;
      if (updatedCards.has(cardElement)) {
        continue; // Already updated
      }
      
      let cardData: { address: string | null; price: number | null; bedrooms: number | null } | null = null;
      try {
        cardData = extractPropertyDataFromZillowCard(cardElement);
      } catch (e) {
        continue;
      }
      
      if (!cardData || !cardData.address) {
        continue;
      }
      
      const cardAddressNormalized = cardData.address.toLowerCase().trim().replace(/\s+/g, ' ');
      const targetAddressNormalized = normalizedAddress.replace(/\s+/g, ' ');
      
      if (cardAddressNormalized === targetAddressNormalized &&
          cardData.price === price &&
          cardData.bedrooms === bedrooms) {
        // Re-process this card to get the HOA-aware value
        processCard(cardElement, 'list', 'zillow').catch(() => {});
        processCard(cardElement, 'map', 'zillow').catch(() => {});
      }
    }
  } else if (site.includes('redfin.com')) {
    const allCards = document.querySelectorAll('.bp-Homecard__Content');
    for (const card of Array.from(allCards)) {
      const cardElement = card as HTMLElement;
      if (updatedCards.has(cardElement)) {
        continue; // Already updated
      }
      
      let cardData: { address: string | null; price: number | null; bedrooms: number | null } | null = null;
      try {
        cardData = extractPropertyDataFromCard(cardElement);
      } catch (e) {
        continue;
      }
      
      if (!cardData || !cardData.address) {
        continue;
      }
      
      const cardAddressNormalized = cardData.address.toLowerCase().trim().replace(/\s+/g, ' ');
      const targetAddressNormalized = normalizedAddress.replace(/\s+/g, ' ');
      
      if (cardAddressNormalized === targetAddressNormalized &&
          cardData.price === price &&
          cardData.bedrooms === bedrooms) {
        // Re-process this card to get the HOA-aware value
        processCard(cardElement, 'list', 'redfin').catch(() => {});
        processCard(cardElement, 'map', 'redfin').catch(() => {});
      }
    }
  }
}

/**
 * Open mini view modal
 */
async function openMiniView(address: string, zipCode: string, purchasePrice: number | null, bedrooms: number | null, hoaMonthly: number | null = null) {
  // Remove existing mini view if any
  const existingOverlay = document.querySelector('.fmr-mini-view-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Get user preferences and API base URL (respects popup config)
  const [preferences, apiBaseUrl] = await Promise.all([getPreferences(), getApiBaseUrl()]);

  // Detect source site from hostname
  const hostname = window.location.hostname.toLowerCase();
  let sourceSite: string | undefined;
  if (hostname.includes('zillow.com')) {
    sourceSite = 'zillow';
  } else if (hostname.includes('redfin.com')) {
    sourceSite = 'redfin';
  } else if (hostname.includes('realtor.com')) {
    sourceSite = 'realtor';
  } else if (hostname.includes('homes.com')) {
    sourceSite = 'homes';
  }

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
    apiBaseUrl,
    preferences,
    purchasePrice,
    bedrooms,
    hoaMonthly, // Pass detected HOA (null if not available, 0 if explicitly no HOA, or the actual amount)
    overlay, // Pass overlay reference so it can be hidden during dragging
    sourceSite, // Pass source site for referrer tracking
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
  // Setup mode change listener first
  setupModeChangeListener();
  
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

