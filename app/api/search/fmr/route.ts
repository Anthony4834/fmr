import { NextRequest, NextResponse } from 'next/server';
import { getFMRByZip, getFMRByCounty, getFMRByCity, getFMRHistoryByZip, getFMRHistoryByCounty, getFMRHistoryByCity } from '@/lib/queries';
import { geocodeAddress } from '@/lib/geocoding';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zip = searchParams.get('zip');
    const county = searchParams.get('county');
    const city = searchParams.get('city');
    const state = searchParams.get('state');
    const address = searchParams.get('address');
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : undefined;

    let result = null;
    let queriedLocation = '';
    let queriedType: 'zip' | 'city' | 'county' | 'address' = 'address';
    let history: Awaited<ReturnType<typeof getFMRHistoryByZip>> | null = null;
    let historyZipCode: string | null = null;

    // Priority: ZIP > City > County > Address
    if (zip) {
      queriedLocation = zip;
      queriedType = 'zip';
      result = await getFMRByZip(zip, year);
      historyZipCode = zip;
    } else if (city && state) {
      queriedLocation = `${city}, ${state}`;
      queriedType = 'city';
      result = await getFMRByCity(city, state, year);
      history = await getFMRHistoryByCity(city, state);
    } else if (county && state) {
      queriedLocation = `${county}, ${state}`;
      queriedType = 'county';
      result = await getFMRByCounty(county, state, year);
      history = await getFMRHistoryByCounty(county, state);
    } else if (address) {
      queriedLocation = address;
      queriedType = 'address';
      
      // Check if ZIP code was passed along with address (format: "address|zipCode")
      let zipCode: string | null = null;
      const addressParts = address.split('|');
      if (addressParts.length === 2) {
        // ZIP code was provided from autocomplete
        queriedLocation = addressParts[0]; // Use the address part for display
        zipCode = addressParts[1];
      } else {
        // Extract ZIP code from address string
        // Look for ZIP codes at the end of the address (after state/city) to avoid matching street numbers
        const zipPatterns = [
          // ZIP at the very end: "..., State 12345" or "..., 12345"
          /\b(\d{5})(-\d{4})?\s*$/,
          // ZIP after state abbreviation: "..., ST 12345"
          /\b([A-Z]{2})\s+(\d{5})(-\d{4})?\s*$/i,
          // ZIP after comma and optional state: "..., State, 12345"
          /,\s*([A-Z]{2})?\s*,?\s*(\d{5})(-\d{4})?\s*$/i,
        ];
        
        for (const pattern of zipPatterns) {
          const match = address.match(pattern);
          if (match) {
            // Extract the ZIP code (could be in different capture groups depending on pattern)
            zipCode = match[match.length - 2] || match[match.length - 1];
            // Remove the +4 extension if present
            zipCode = zipCode?.replace(/-\d{4}$/, '') || null;
            if (zipCode && /^\d{5}$/.test(zipCode)) {
              break;
            }
          }
        }
        
        // Fallback: if no ZIP found at end, try to find any ZIP code but prefer ones near the end
        if (!zipCode) {
          const allZipMatches = Array.from(address.matchAll(/\b(\d{5})(-\d{4})?\b/g));
          if (allZipMatches.length > 0) {
            // Prefer the last match (closer to end of address)
            const lastMatch = allZipMatches[allZipMatches.length - 1];
            zipCode = lastMatch[1];
          }
        }
      }
      
      if (zipCode) {
        result = await getFMRByZip(zipCode, year);
        if (result) {
          // Successfully found FMR data using extracted ZIP
          queriedLocation = addressParts?.[0] || address; // Use address part if split, otherwise full address
          queriedType = 'address';
          historyZipCode = zipCode;
        }
      }
      
      // If no ZIP found or no result, check if address is in "city, state" format
      if (!result) {
        const cityStateMatch = address.match(/^(.+?),\s*([A-Z]{2})$/i);
        if (cityStateMatch) {
          const [, location, stateCode] = cityStateMatch;
          // Try city first, then county
          result = await getFMRByCity(location.trim(), stateCode.trim(), year);
          if (!result && location.toLowerCase().includes('county')) {
            queriedType = 'county';
            result = await getFMRByCounty(location.trim().replace(/\s+county$/i, ''), stateCode.trim(), year);
          } else if (result) {
            queriedType = 'city';
          }
        }
      }
      
      // If still no result, try geocoding
      if (!result) {
        try {
          const geocodeResult = await geocodeAddress(address);
          if (geocodeResult?.zipCode) {
            // Keep the original address as queriedLocation, don't replace with ZIP
            queriedLocation = address;
            queriedType = 'address';
            result = await getFMRByZip(geocodeResult.zipCode, year);
            historyZipCode = geocodeResult.zipCode;
          }
        } catch (geocodeError) {
          console.error('Geocoding failed:', geocodeError);
          // Continue to return error below
        }
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: 'No FMR data found for the given location' },
        { status: 404 }
      );
    }

    // Attach historical series (FY2022–FY2026) for ZIP-based results.
    // For city/county, history is already fetched above.
    if (!history && historyZipCode) {
      history = await getFMRHistoryByZip(historyZipCode);
    }

    return NextResponse.json({ 
      data: {
        ...result,
        history: history ?? undefined,
        queriedLocation,
        queriedType
      }
    });
  } catch (error) {
    console.error('FMR search error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch FMR data' },
      { status: 500 }
    );
  }
}

