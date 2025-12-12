import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface AddressSuggestion {
  display: string;
  value: string;
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

/**
 * Address autocomplete using Nominatim (OpenStreetMap)
 * Free, no API key required, but rate limited to 1 request per second
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') || '';

    if (!q || q.length < 3) {
      return NextResponse.json({ results: [] });
    }

    // Rate limiting: Nominatim requires max 1 request per second
    // We'll add a small delay to be safe
    await new Promise(resolve => setTimeout(resolve, 100));

    // Use Nominatim search API (free, no API key)
    // Limit to US addresses only
    const encodedQuery = encodeURIComponent(q);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&addressdetails=1&limit=8&countrycodes=us&dedupe=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FMR Search App', // Required by Nominatim
        'Accept-Language': 'en-US,en'
      }
    });

    if (!response.ok) {
      console.error('Nominatim API error:', response.status);
      return NextResponse.json({ results: [] });
    }

    const data = await response.json();

    // Transform Nominatim results to our format
    const results: AddressSuggestion[] = data
      .filter((item: any) => {
        // Only include results with address details
        return item.address && (
          item.address.house_number || 
          item.address.road || 
          item.address.street
        );
      })
      .map((item: any) => {
        const addr = item.address;
        const parts: string[] = [];
        
        // Build street address
        if (addr.house_number) parts.push(addr.house_number);
        if (addr.road || addr.street) {
          parts.push(addr.road || addr.street);
        }
        
        const streetAddress = parts.join(' ');
        const city = addr.city || addr.town || addr.village || addr.municipality || '';
        const state = addr.state || '';
        const zipCode = addr.postcode || '';
        
        // Build display string
        let display = streetAddress;
        if (city) display += `, ${city}`;
        if (state) display += `, ${state}`;
        if (zipCode) display += ` ${zipCode}`;
        
        // Build full address value
        const fullAddress = [streetAddress, city, state, zipCode]
          .filter(Boolean)
          .join(', ');

        return {
          display,
          value: fullAddress,
          address: streetAddress,
          city: city || undefined,
          state: state || undefined,
          zipCode: zipCode || undefined,
          country: addr.country || 'US'
        };
      })
      .filter((item: AddressSuggestion) => item.address.trim().length > 0)
      .sort((a: AddressSuggestion, b: AddressSuggestion) => {
        // Prioritize addresses with ZIP codes
        if (a.zipCode && !b.zipCode) return -1;
        if (!a.zipCode && b.zipCode) return 1;
        return 0;
      })
      .slice(0, 8); // Limit to 8 results

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Address autocomplete error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch address suggestions' },
      { status: 500 }
    );
  }
}



