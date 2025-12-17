// Address detection using site-specific CSS selectors

/**
 * Detect which real estate site we're on
 */
function detectSite(): 'zillow' | 'redfin' | 'realtor' | 'homes' | 'unknown' {
  const hostname = window.location.hostname.toLowerCase();
  if (hostname.includes('zillow.com')) return 'zillow';
  if (hostname.includes('redfin.com')) return 'redfin';
  if (hostname.includes('realtor.com')) return 'realtor';
  if (hostname.includes('homes.com')) return 'homes';
  return 'unknown';
}

/**
 * Check if we're on a property detail page vs search results
 */
function isDetailPage(): boolean {
  const path = window.location.pathname.toLowerCase();
  return (
    path.includes('/homedetails/') ||
    path.includes('/home/') ||
    path.includes('/realestateandhomes-detail/') ||
    path.includes('/property/')
  );
}

/**
 * Extract address from the DOM using site-specific selectors
 */
export function extractAddress(): string | null {
  const site = detectSite();
  const isDetail = isDetailPage();
  console.log('[FMR Extension] Detected site:', site, 'isDetail:', isDetail);
  
  let selectors: string[] = [];
  
  if (site === 'zillow') {
    if (isDetail) {
      selectors = [
        'h1[data-testid="address"]',
        'h1.property-address',
        '[data-testid="zpid-address"]',
      ];
    } else {
      selectors = [
        '.property-card-data address',
        '[data-testid="address"]',
        '.list-card-addr',
      ];
    }
  } else if (site === 'redfin') {
    if (isDetail) {
      selectors = [
        '[data-testid="AddressDisplay"]',
        '.AddressDisplay',
        '.dp-address-block',
        'h1[class*="address"]',
        '.addressHeader',
        'h1.address',
        '.property-header-address',
      ];
    } else {
      selectors = [
        '.addressDisplay',
        '.bottomV2 .link-and-anchor',
        '.address',
        '[data-testid="address"]',
      ];
    }
  } else if (site === 'realtor') {
    if (isDetail) {
      selectors = [
        '[data-label="property-address"]',
        '.ldp-header-address',
        '.PropertyAddress',
      ];
    } else {
      selectors = [
        '.BasePropertyCard__Address',
        '[data-label="pc-address"]',
        '.PropertyCardAddress',
      ];
    }
  } else if (site === 'homes') {
    if (isDetail) {
      selectors = [
        '.property-header-address',
        'h1.address',
        '.property-address-header',
      ];
    } else {
      selectors = [
        '.property-address',
        '.home-card-address',
        '.address',
      ];
    }
  }
  
  // Try each selector
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const text = (element.textContent || element.getAttribute('aria-label') || '').trim();
        if (text && text.length > 5) { // Minimum reasonable address length
          return text;
        }
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  return null;
}

/**
 * Extract zip code from address string
 * Prefers ZIP codes that appear at the end or after a state abbreviation
 */
export function extractZipFromAddress(address: string): string | null {
  if (!address) return null;
  
  // Pattern 1: ZIP code at the end of the string (most common)
  // Matches: "..., MI 48184" or "...48184"
  const endZipMatch = address.match(/\b(\d{5})\s*$/);
  if (endZipMatch) {
    return endZipMatch[1];
  }
  
  // Pattern 2: ZIP code after a state abbreviation (2 letters)
  // Matches: "..., MI 48184" or "..., CA 90210"
  const stateZipMatch = address.match(/\b([A-Z]{2})\s+(\d{5})\b/);
  if (stateZipMatch) {
    return stateZipMatch[2];
  }
  
  // Pattern 3: ZIP code after a comma (likely at the end of address line)
  // Matches: "..., 48184" or "..., Wayne, MI 48184"
  const commaZipMatch = address.match(/,\s*(\d{5})\b/);
  if (commaZipMatch) {
    return commaZipMatch[1];
  }
  
  // Pattern 4: Find all 5-digit numbers and prefer the last one
  // (ZIP codes typically appear after street numbers)
  const allZips = Array.from(address.matchAll(/\b(\d{5})\b/g));
  if (allZips.length > 0) {
    // Return the last match (most likely to be the ZIP code)
    return allZips[allZips.length - 1][1];
  }
  
  return null;
}
