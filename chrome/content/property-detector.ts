// Property data extraction using site-specific CSS selectors

export interface PropertyData {
  bedrooms: number | null;
  price: number | null;
}

type Site = 'zillow' | 'redfin' | 'realtor' | 'homes' | 'unknown';

/**
 * Detect which real estate site we're on
 */
export function detectSite(): Site {
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
  // Zillow detail pages: /homedetails/...
  // Redfin detail pages: /home/...
  // Realtor.com detail pages: /realestateandhomes-detail/...
  // Homes.com detail pages: /property/...
  return (
    path.includes('/homedetails/') ||
    path.includes('/home/') ||
    path.includes('/realestateandhomes-detail/') ||
    path.includes('/property/')
  );
}

/**
 * Extract bedrooms count from the DOM
 */
export function extractBedrooms(): number | null {
  const site = detectSite();
  const isDetail = isDetailPage();
  
  let selectors: string[] = [];
  
  if (site === 'zillow') {
    if (isDetail) {
      selectors = [
        '[data-testid="bed-bath-item"] [data-testid="bed"]',
        '.ds-bed-bath-living-area-container [data-testid="bed"]',
        '.ds-bed-bath-living-area-row [data-testid="bed"]',
      ];
    } else {
      selectors = [
        '.PropertyCardWrapper [data-testid="bed"]',
        '[data-testid="property-card-bed"]',
      ];
    }
  } else if (site === 'redfin') {
    if (isDetail) {
      selectors = [
        '[data-rf-test-id="abp-beds"] .statsValue',
        '[data-rf-test-id="abp-beds"]',
        '.PropertyStatsBlock .stats .stat[data-rf-test-id="abp-beds"]',
      ];
    } else {
      selectors = [
        '.bottomV2 .stats .stat',
      ];
    }
  } else if (site === 'realtor') {
    if (isDetail) {
      selectors = [
        '[data-label="property-meta-beds"]',
        '.PropertyMetaBlock [data-label="property-meta-beds"]',
      ];
    } else {
      selectors = [
        '.BasePropertyCard__PropertyMeta [data-label="pc-meta-beds"]',
      ];
    }
  } else if (site === 'homes') {
    if (isDetail) {
      selectors = [
        '.property-features .bedrooms',
        '.detail-features [data-feature="bedrooms"]',
      ];
    } else {
      selectors = [
        '.home-features [data-feature="bedrooms"]',
      ];
    }
  }
  
  // Try each selector
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent || element.getAttribute('aria-label') || '';
        const match = text.match(/(\d+)\s*(?:bed|bd|br|bedroom)/i);
        if (match) {
          const count = parseInt(match[1], 10);
          if (!isNaN(count) && count >= 0 && count <= 8) {
            return count;
          }
        }
        // Try to parse the text content directly as a number
        const directMatch = text.trim().match(/^(\d+)$/);
        if (directMatch) {
          const count = parseInt(directMatch[1], 10);
          if (!isNaN(count) && count >= 0 && count <= 8) {
            return count;
          }
        }
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  return null;
}

/**
 * Extract price from the DOM
 */
export function extractPrice(): number | null {
  const site = detectSite();
  const isDetail = isDetailPage();
  
  let selectors: string[] = [];
  
  if (site === 'zillow') {
    if (isDetail) {
      selectors = [
        '[data-testid="price"]',
        '.ds-price',
        '.ds-summary-row span[aria-label*="$"]',
      ];
    } else {
      selectors = [
        '.PropertyCardWrapper [data-testid="property-card-price"]',
        '[data-testid="price"]',
      ];
    }
  } else if (site === 'redfin') {
    if (isDetail) {
      selectors = [
        '[data-rf-test-id="abp-price"] .statsValue',
        '[data-rf-test-id="abp-price"]',
        '.info-block .price',
        '.dp-price-display',
      ];
    } else {
      selectors = [
        '.bottomV2 .homecardV2Price',
        '.homecardV2Price',
      ];
    }
  } else if (site === 'realtor') {
    if (isDetail) {
      selectors = [
        '[data-label="property-price"]',
        '.ldp-price',
      ];
    } else {
      selectors = [
        '.BasePropertyCard__Price [data-label="pc-price"]',
      ];
    }
  } else if (site === 'homes') {
    if (isDetail) {
      selectors = [
        '.property-price',
        '.price-display',
      ];
    } else {
      selectors = [
        '.home-price',
        '.price',
      ];
    }
  }
  
  // Try each selector
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent || element.getAttribute('aria-label') || '';
        const price = parsePrice(text);
        if (price !== null) {
          return price;
        }
      }
    } catch (e) {
      // Continue to next selector
    }
  }
  
  return null;
}

/**
 * Parse price string to number
 * Handles formats like: $450,000, $1.2M, $500K, etc.
 */
function parsePrice(text: string): number | null {
  // Remove currency symbols and whitespace
  let cleaned = text.replace(/[\$\s,]/g, '');
  
  // Handle million suffix
  if (cleaned.toLowerCase().includes('m')) {
    const match = cleaned.match(/^([\d.]+)m/i);
    if (match) {
      const value = parseFloat(match[1]);
      if (!isNaN(value)) {
        return Math.round(value * 1000000);
      }
    }
  }
  
  // Handle thousand suffix
  if (cleaned.toLowerCase().includes('k')) {
    const match = cleaned.match(/^([\d.]+)k/i);
    if (match) {
      const value = parseFloat(match[1]);
      if (!isNaN(value)) {
        return Math.round(value * 1000);
      }
    }
  }
  
  // Try to parse as direct number
  const number = parseFloat(cleaned);
  if (!isNaN(number) && number > 0) {
    return Math.round(number);
  }
  
  return null;
}

/**
 * Extract both bedrooms and price
 */
export function extractPropertyData(): PropertyData {
  return {
    bedrooms: extractBedrooms(),
    price: extractPrice(),
  };
}
