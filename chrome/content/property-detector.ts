// Property data extraction using site-specific CSS selectors

export interface PropertyData {
  bedrooms: number | null;
  price: number | null;
  hoaMonthly: number | null;
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
      // For detail pages, try multiple approaches to find bedrooms
      
      // Approach 1: Try bed-bath-sqft-text structure (mobile/desktop)
      const mobileContainer = document.querySelector('[data-testid="mobile-bed-bath-sqft"]');
      const desktopContainer = document.querySelector('[data-testid="desktop-bed-bath-sqft"]');
      
      for (const container of [mobileContainer, desktopContainer].filter(Boolean)) {
        const firstContainer = container?.querySelector('[data-testid="bed-bath-sqft-text__container"]');
        if (firstContainer) {
          const valueElement = firstContainer.querySelector('[data-testid="bed-bath-sqft-text__value"]');
          if (valueElement) {
            const valueText = valueElement.textContent?.trim() || '';
            // Check for "—" or other non-numeric indicators
            if (!valueText.includes('—') && !valueText.toLowerCase().includes('n/a') && valueText.length > 0) {
              const count = parseInt(valueText, 10);
              if (!isNaN(count) && count >= 0 && count <= 8) {
                return count;
              }
            }
          }
        }
      }
      
      // Approach 2: Try direct bed-bath-sqft-text__container (first one is beds)
      const allContainers = document.querySelectorAll('[data-testid="bed-bath-sqft-text__container"]');
      if (allContainers.length > 0) {
        const firstContainer = allContainers[0];
        const valueElement = firstContainer.querySelector('[data-testid="bed-bath-sqft-text__value"]');
        if (valueElement) {
          const valueText = valueElement.textContent?.trim() || '';
          if (!valueText.includes('—') && !valueText.toLowerCase().includes('n/a') && valueText.length > 0) {
            const count = parseInt(valueText, 10);
            if (!isNaN(count) && count >= 0 && count <= 8) {
              return count;
            }
          }
        }
      }
      
      // Approach 3: Try to find elements with "bed" or "beds" text
      const bedElements = document.querySelectorAll('[data-testid*="bed"], [class*="bed"]');
      for (const element of Array.from(bedElements)) {
        const text = element.textContent || '';
        const match = text.match(/(\d+)\s*(?:bed|bd|br|bedroom)/i);
        if (match) {
          const count = parseInt(match[1], 10);
          if (!isNaN(count) && count >= 0 && count <= 8) {
            return count;
          }
        }
      }
      
      // Fallback to other selectors
      selectors = [
        '[data-testid="bed-bath-item"] [data-testid="bed"]',
        '.ds-bed-bath-living-area-container [data-testid="bed"]',
        '.ds-bed-bath-living-area-row [data-testid="bed"]',
        '[data-testid="bed"]',
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
      // Try price-text class first (matches the HTML structure)
      const priceTextElement = document.querySelector('[data-testid="home-info"] .price-text') || 
                               document.querySelector('.price-text');
      if (priceTextElement) {
        const text = priceTextElement.textContent || '';
        const price = parsePrice(text);
        if (price !== null) {
          return price;
        }
      }
      
      // Fallback to other selectors
      selectors = [
        '[data-testid="price"]',
        '[data-testid="home-info"] [data-testid="price"]',
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
 * Extract HOA monthly dues from the DOM (detail pages only)
 */
export function extractHOA(): number | null {
  const site = detectSite();
  const isDetail = isDetailPage();
  
  // HOA is only available on detail pages
  if (!isDetail) {
    return null;
  }
  
  if (site === 'zillow') {
    // Zillow: Look for span with "HOA" text containing price
    // Format 1: <span class="Text-c11n-8-112-0__sc-aiai24-0 ...">$509/mo HOA</span>
    // Format 2: <span class="Text-c11n-8-112-0__sc-aiai24-0 hdp__sc-6k0go5-3 ...">$290 monthly HOA fee</span>
    // Or: $-- HOA (when no HOA)
    const hoaElements = document.querySelectorAll('span[class*="Text-c11n-8-112-0"]');
    for (const element of Array.from(hoaElements)) {
      const text = element.textContent?.trim() || '';
      if (text.includes('HOA')) {
        // Check if it's the "no HOA" indicator
        if (text.includes('$--') || text.includes('$—')) {
          return 0; // Explicitly no HOA
        }
        // Format 1: "$509/mo HOA" -> 509
        let match = text.match(/\$([\d,]+)\/mo/);
        if (match) {
          const price = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(price) && price >= 0) {
            return price;
          }
        }
        // Format 2: "$290 monthly HOA fee" -> 290
        match = text.match(/\$([\d,]+)\s+monthly\s+HOA\s+fee/i);
        if (match) {
          const price = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(price) && price >= 0) {
            return price;
          }
        }
      }
    }
  } else if (site === 'redfin') {
    // Redfin: Look for keyDetails-row with "HOA Dues" valueType
    // Structure: <div class="keyDetails-row">...<span class="valueText">$509/mo</span><span class="valueType">HOA Dues</span>...</div>
    const keyDetailsRows = document.querySelectorAll('.keyDetails-row');
    for (const row of Array.from(keyDetailsRows)) {
      const valueType = row.querySelector('.valueType');
      if (valueType && valueType.textContent?.trim().toLowerCase().includes('hoa')) {
        const valueText = row.querySelector('.valueText');
        if (valueText) {
          const text = valueText.textContent?.trim() || '';
          // Extract price: "$509/mo" -> 509
          const match = text.match(/\$([\d,]+)\/mo/);
          if (match) {
            const price = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(price) && price >= 0) {
              return price;
            }
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract HOA from Zillow expanded view
 */
export function extractHOAFromZillowExpanded(container: HTMLElement): number | null {
  // Look for span with "HOA" text containing price
  // Format 1: <span class="Text-c11n-8-112-0__sc-aiai24-0 ...">$509/mo HOA</span>
  // Format 2: <span class="Text-c11n-8-112-0__sc-aiai24-0 hdp__sc-6k0go5-3 ...">$290 monthly HOA fee</span>
  const hoaElements = container.querySelectorAll('span[class*="Text-c11n-8-112-0"]');
  for (const element of Array.from(hoaElements)) {
    const text = element.textContent?.trim() || '';
    if (text.includes('HOA')) {
      // Check if it's the "no HOA" indicator
      if (text.includes('$--') || text.includes('$—')) {
        return 0; // Explicitly no HOA
      }
      // Format 1: "$509/mo HOA" -> 509
      let match = text.match(/\$([\d,]+)\/mo/);
      if (match) {
        const price = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(price) && price >= 0) {
          return price;
        }
      }
      // Format 2: "$290 monthly HOA fee" -> 290
      match = text.match(/\$([\d,]+)\s+monthly\s+HOA\s+fee/i);
      if (match) {
        const price = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(price) && price >= 0) {
          return price;
        }
      }
    }
  }
  return null;
}

/**
 * Extract HOA from Redfin detail page
 */
export function extractHOAFromRedfinDetail(): number | null {
  // Look for keyDetails-row with "HOA Dues" valueType
  const keyDetailsRows = document.querySelectorAll('.keyDetails-row');
  for (const row of Array.from(keyDetailsRows)) {
    const valueType = row.querySelector('.valueType');
    if (valueType && valueType.textContent?.trim().toLowerCase().includes('hoa')) {
      const valueText = row.querySelector('.valueText');
      if (valueText) {
        const text = valueText.textContent?.trim() || '';
        // Extract price: "$509/mo" -> 509
        const match = text.match(/\$([\d,]+)\/mo/);
        if (match) {
          const price = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(price) && price >= 0) {
            return price;
          }
        }
      }
    }
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
    hoaMonthly: extractHOA(),
  };
}

/**
 * Extract address from a Redfin card element
 */
export function extractAddressFromCard(cardElement: HTMLElement): string | null {
  // Try the address link
  const addressLink = cardElement.querySelector('.bp-Homecard__Address');
  if (addressLink) {
    const text = addressLink.textContent?.trim();
    if (text && text.length > 5) {
      return text;
    }
  }
  return null;
}

/**
 * Extract bedrooms from a Redfin card element
 */
export function extractBedroomsFromCard(cardElement: HTMLElement): number | null {
  const bedsElement = cardElement.querySelector('.bp-Homecard__Stats--beds');
  if (bedsElement) {
    const text = bedsElement.textContent || '';
    // Check for "—" or other non-numeric indicators
    if (text.includes('—') || text.trim() === '' || text.toLowerCase().includes('n/a')) {
      return null;
    }
    const match = text.match(/(\d+)\s*(?:bed|bd|br|bedroom)/i);
    if (match) {
      const count = parseInt(match[1], 10);
      if (!isNaN(count) && count >= 0 && count <= 8) {
        return count;
      }
    }
  }
  return null;
}

/**
 * Extract price from a Redfin card element
 */
export function extractPriceFromCard(cardElement: HTMLElement): number | null {
  // Try the price value element
  const priceElement = cardElement.querySelector('.bp-Homecard__Price--value');
  if (priceElement) {
    const text = priceElement.textContent || '';
    const price = parsePrice(text);
    if (price !== null) return price;
  }
  
  // Fallback: try the whole price container
  const priceContainer = cardElement.querySelector('.bp-Homecard__Price');
  if (priceContainer) {
    const text = priceContainer.textContent || '';
    const price = parsePrice(text);
    if (price !== null) return price;
  }
  
  return null;
}

/**
 * Extract property data from a Redfin card element
 */
export function extractPropertyDataFromCard(cardElement: HTMLElement): {
  address: string | null;
  bedrooms: number | null;
  price: number | null;
  hoaMonthly: number | null;
} {
  return {
    address: extractAddressFromCard(cardElement),
    bedrooms: extractBedroomsFromCard(cardElement),
    price: extractPriceFromCard(cardElement),
    hoaMonthly: null, // HOA not available in card view
  };
}

/**
 * Extract address from a Zillow card element
 */
export function extractAddressFromZillowCard(cardElement: HTMLElement): string | null {
  // Try the address element inside the property-card-link
  const addressElement = cardElement.querySelector('address');
  if (addressElement) {
    const text = addressElement.textContent?.trim();
    if (text && text.length > 5) {
      return text;
    }
  }
  return null;
}

/**
 * Extract bedrooms from a Zillow card element
 */
export function extractBedroomsFromZillowCard(cardElement: HTMLElement): number | null {
  // Bedrooms are in [data-testid="property-card-details"] > li > b (first li)
  const detailsList = cardElement.querySelector('[data-testid="property-card-details"]');
  if (detailsList) {
    const firstLi = detailsList.querySelector('li');
    if (firstLi) {
      const boldElement = firstLi.querySelector('b');
      if (boldElement) {
        const text = boldElement.textContent?.trim();
        if (text) {
          // Check for "—" or other non-numeric indicators
          if (text.includes('—') || text.toLowerCase().includes('n/a')) {
            return null;
          }
          const count = parseInt(text, 10);
          if (!isNaN(count) && count >= 0 && count <= 8) {
            return count;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Extract price from a Zillow card element
 */
export function extractPriceFromZillowCard(cardElement: HTMLElement): number | null {
  // Try the price element with data-test attribute
  const priceElement = cardElement.querySelector('[data-test="property-card-price"]');
  if (priceElement) {
    const text = priceElement.textContent || '';
    const price = parsePrice(text);
    if (price !== null) return price;
  }
  
  // Fallback: try the styled price line
  const priceLine = cardElement.querySelector('.PropertyCardWrapper__StyledPriceLine-srp-8-109-3__sc-16e8gqd-1');
  if (priceLine) {
    const text = priceLine.textContent || '';
    const price = parsePrice(text);
    if (price !== null) return price;
  }
  
  return null;
}

/**
 * Extract property data from a Zillow card element
 */
export function extractPropertyDataFromZillowCard(cardElement: HTMLElement): {
  address: string | null;
  bedrooms: number | null;
  price: number | null;
  hoaMonthly: number | null;
} {
  return {
    address: extractAddressFromZillowCard(cardElement),
    bedrooms: extractBedroomsFromZillowCard(cardElement),
    price: extractPriceFromZillowCard(cardElement),
    hoaMonthly: null, // HOA not available in card view
  };
}

/**
 * Extract address from Zillow expanded view
 */
export function extractAddressFromZillowExpanded(container: HTMLElement): string | null {
  // Try multiple selectors for AddressWrapper (class names may vary)
  const addressWrappers = [
    container.querySelector('.styles__AddressWrapper-fshdp-8-112-0__sc-13x5vko-0'),
    container.querySelector('[class*="AddressWrapper"]'),
    container.querySelector('[class*="address-wrapper"]'),
  ].filter(Boolean) as HTMLElement[];
  
  for (const addressWrapper of addressWrappers) {
    const h1 = addressWrapper.querySelector('h1');
    if (h1) {
      const text = h1.textContent?.trim();
      if (text && text.length > 5) {
        return text;
      }
    }
  }
  
  // Fallback: try any h1 with address-like text
  const h1Elements = container.querySelectorAll('h1');
  for (const h1 of Array.from(h1Elements)) {
    const text = h1.textContent?.trim();
    if (text && text.length > 5 && text.includes(',')) {
      return text;
    }
  }
  return null;
}

/**
 * Extract bedrooms from Zillow expanded view
 */
export function extractBedroomsFromZillowExpanded(container: HTMLElement): number | null {
  // Bedrooms are in [data-testid="bed-bath-sqft-facts"] > first [data-testid="bed-bath-sqft-fact-container"]
  const factsContainer = container.querySelector('[data-testid="bed-bath-sqft-facts"]');
  if (factsContainer) {
    const firstFact = factsContainer.querySelector('[data-testid="bed-bath-sqft-fact-container"]');
    if (firstFact) {
      // The value is in a span with class containing "StyledValueText"
      const valueSpan = firstFact.querySelector('span[class*="StyledValueText"]');
      if (valueSpan) {
        const text = valueSpan.textContent?.trim();
        if (text) {
          // Check for "—" or other non-numeric indicators
          if (text.includes('—') || text.toLowerCase().includes('n/a')) {
            return null;
          }
          const count = parseInt(text, 10);
          if (!isNaN(count) && count >= 0 && count <= 8) {
            return count;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Extract price from Zillow expanded view
 */
export function extractPriceFromZillowExpanded(container: HTMLElement): number | null {
  // Price is in [data-testid="price"]
  const priceElement = container.querySelector('[data-testid="price"]');
  if (priceElement) {
    const text = priceElement.textContent || '';
    const price = parsePrice(text);
    if (price !== null) return price;
  }
  return null;
}

/**
 * Extract property data from Zillow expanded view
 */
export function extractPropertyDataFromZillowExpanded(container: HTMLElement): {
  address: string | null;
  bedrooms: number | null;
  price: number | null;
  hoaMonthly: number | null;
} {
  return {
    address: extractAddressFromZillowExpanded(container),
    bedrooms: extractBedroomsFromZillowExpanded(container),
    price: extractPriceFromZillowExpanded(container),
    hoaMonthly: extractHOAFromZillowExpanded(container),
  };
}

