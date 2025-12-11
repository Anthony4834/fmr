#!/usr/bin/env bun

/**
 * Lookup Counties for ZIP Codes
 * 
 * Automatically determines counties for ZIP codes using multiple APIs:
 * 1. US Census Geocoding API (free, no API key)
 * 2. SmartyStreets ZIP Code API (requires API key)
 * 3. ZipCodeAPI (requires API key)
 * 
 * Usage:
 *   bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt
 *   bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --api census
 *   bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --api smartystreets --key YOUR_KEY
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { configureDatabase, query } from '../lib/db';

config();

interface ZipCountyResult {
  zipCode: string;
  countyName?: string;
  stateCode?: string;
  stateName?: string;
  cityName?: string;
  source: string;
  success: boolean;
  error?: string;
}

/**
 * Lookup county using US Census Geocoding API
 * Free, no API key required, but rate-limited
 * 
 * Note: Census API requires at least a street address. We use a generic
 * address format that works for most ZIP codes.
 */
/**
 * Lookup county using US Census Geocoding API
 * Free, no API key required, but rate-limited
 * 
 * Uses a two-step process:
 * 1. Get coordinates for ZIP code using a generic address
 * 2. Use coordinates to get county geographies
 */
async function lookupWithCensus(zipCode: string): Promise<ZipCountyResult> {
  try {
    // Step 1: Get location/coordinates for ZIP code
    // Use a generic address format that should work for most ZIPs
    const locationUrl = `https://geocoding.geo.census.gov/geocoder/locations/address?street=1+Main+St&city=&state=&zip=${zipCode}&benchmark=Public_AR_Current&format=json`;
    
    const locationResponse = await fetch(locationUrl);
    
    if (!locationResponse.ok) {
      // Try without street address (ZIP only)
      const zipOnlyUrl = `https://geocoding.geo.census.gov/geocoder/locations/address?zip=${zipCode}&benchmark=Public_AR_Current&format=json`;
      const zipResponse = await fetch(zipOnlyUrl);
      
      if (!zipResponse.ok) {
        const errorText = await zipResponse.text().catch(() => 'Unknown error');
        return {
          zipCode,
          source: 'census',
          success: false,
          error: `HTTP ${zipResponse.status}: ${errorText.substring(0, 100)}`
        };
      }
      
      const zipData = await zipResponse.json();
      if (zipData.result?.addressMatches?.[0]?.coordinates) {
        const coords = zipData.result.addressMatches[0].coordinates;
        const state = zipData.result.addressMatches[0].addressComponents?.state;
        
        // Step 2: Get geographies from coordinates
        const geoUrl = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${coords.x}&y=${coords.y}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
        const geoResponse = await fetch(geoUrl);
        
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          const county = geoData.result?.geographies?.['Counties']?.[0];
          
          return {
            zipCode,
            countyName: county?.NAME,
            stateCode: state,
            stateName: state,
            cityName: zipData.result.addressMatches[0].addressComponents?.city,
            source: 'census',
            success: !!county?.NAME
          };
        }
      }
      
      return {
        zipCode,
        source: 'census',
        success: false,
        error: 'No coordinates found'
      };
    }

    const locationData = await locationResponse.json();
    
    if (!locationData.result?.addressMatches?.[0]?.coordinates) {
      return {
        zipCode,
        source: 'census',
        success: false,
        error: 'No address matches found'
      };
    }

    const match = locationData.result.addressMatches[0];
    const coords = match.coordinates;
    const state = match.addressComponents?.state;
    const city = match.addressComponents?.city;

    // Step 2: Get geographies (county) from coordinates
    const geoUrl = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${coords.x}&y=${coords.y}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
    const geoResponse = await fetch(geoUrl);
    
    if (!geoResponse.ok) {
      return {
        zipCode,
        source: 'census',
        success: false,
        error: `Geography lookup failed: HTTP ${geoResponse.status}`
      };
    }

    const geoData = await geoResponse.json();
    const county = geoData.result?.geographies?.['Counties']?.[0];
    
    return {
      zipCode,
      countyName: county?.NAME,
      stateCode: state,
      stateName: state,
      cityName: city,
      source: 'census',
      success: !!county?.NAME
    };
  } catch (error) {
    return {
      zipCode,
      source: 'census',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Lookup county using SmartyStreets ZIP Code API
 * Requires API key: https://www.smartystreets.com/
 */
async function lookupWithSmartyStreets(zipCode: string, authId: string, authToken: string): Promise<ZipCountyResult> {
  try {
    const url = `https://us-zipcode.api.smartystreets.com/lookup?zipcode=${zipCode}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`
      }
    });
    
    if (!response.ok) {
      return {
        zipCode,
        source: 'smartystreets',
        success: false,
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const result = data[0];
      return {
        zipCode,
        countyName: result.county_name,
        stateCode: result.state_abbreviation,
        stateName: result.state,
        cityName: result.city_names?.[0],
        source: 'smartystreets',
        success: !!result.county_name
      };
    }
    
    return {
      zipCode,
      source: 'smartystreets',
      success: false,
      error: 'No matches found'
    };
  } catch (error) {
    return {
      zipCode,
      source: 'smartystreets',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Lookup county using ZipCodeAPI
 * Requires API key: https://www.zipcodeapi.com/
 */
async function lookupWithZipCodeAPI(zipCode: string, apiKey: string): Promise<ZipCountyResult> {
  try {
    const url = `https://www.zipcodeapi.com/rest/${apiKey}/info.json/${zipCode}/degrees`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return {
        zipCode,
        source: 'zipcodeapi',
        success: false,
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    return {
      zipCode,
      countyName: data.county,
      stateCode: data.state,
      stateName: data.state_full,
      cityName: data.city,
      source: 'zipcodeapi',
      success: !!data.county
    };
  } catch (error) {
    return {
      zipCode,
      source: 'zipcodeapi',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Lookup county using Google Maps Geocoding API
 * Requires API key: https://developers.google.com/maps/documentation/geocoding
 * 
 * Google Maps has excellent coverage and is very reliable.
 * Free tier: $200/month credit (covers ~40,000 geocoding requests)
 */
async function lookupWithGoogleMaps(zipCode: string, apiKey: string): Promise<ZipCountyResult> {
  try {
    // Use ZIP code as address - Google Maps handles this well
    const encodedZip = encodeURIComponent(zipCode);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedZip}&key=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      return {
        zipCode,
        source: 'googlemaps',
        success: false,
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const addressComponents = result.address_components || [];
      
      // Extract county, state, city from address components
      let countyName: string | undefined;
      let stateCode: string | undefined;
      let stateName: string | undefined;
      let cityName: string | undefined;
      
      for (const component of addressComponents) {
        const types = component.types || [];
        
        if (types.includes('administrative_area_level_2')) {
          // County level
          countyName = component.long_name;
        } else if (types.includes('administrative_area_level_1')) {
          // State level
          stateCode = component.short_name;
          stateName = component.long_name;
        } else if (types.includes('locality') || types.includes('sublocality')) {
          // City level
          if (!cityName) {
            cityName = component.long_name;
          }
        }
      }
      
      // If no county found, try postal_town or other administrative levels
      if (!countyName) {
        for (const component of addressComponents) {
          const types = component.types || [];
          if (types.includes('postal_town') || types.includes('administrative_area_level_3')) {
            countyName = component.long_name;
            break;
          }
        }
      }
      
      return {
        zipCode,
        countyName,
        stateCode,
        stateName,
        cityName,
        source: 'googlemaps',
        success: !!countyName && !!stateCode
      };
    } else if (data.status === 'ZERO_RESULTS') {
      return {
        zipCode,
        source: 'googlemaps',
        success: false,
        error: 'No results found'
      };
    } else {
      return {
        zipCode,
        source: 'googlemaps',
        success: false,
        error: `API status: ${data.status}`
      };
    }
  } catch (error) {
    return {
      zipCode,
      source: 'googlemaps',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Parse ZIP codes from exported file
 */
function parseZipCodes(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').slice(1); // Skip header
  const zipCodes: string[] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const zipCode = parts[0]?.trim();
    if (zipCode && /^\d{5}$/.test(zipCode)) {
      zipCodes.push(zipCode);
    }
  }
  
  return [...new Set(zipCodes)]; // Remove duplicates
}

/**
 * Main lookup function
 */
async function lookupZipCounties() {
  const args = process.argv.slice(2);
  let filePath: string | null = null;
  let apiType = 'census';
  let apiKey: string | null = null;
  let authId: string | null = null;
  let authToken: string | null = null;
  
  // Check for Google Maps API key in environment (before parsing args so --api can override)
  if (process.env.GOOGLE_MAPS_API_KEY && !apiKey) {
    apiKey = process.env.GOOGLE_MAPS_API_KEY;
  }
  let delayMs = 20; // Delay between requests (ms) - Google Maps allows 50 req/sec
  let batchSize = 100; // Process in batches
  let concurrency = 10; // Number of parallel requests

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      filePath = args[i + 1];
      i++;
    } else if (args[i] === '--api' && args[i + 1]) {
      apiType = args[i + 1].toLowerCase();
      // Auto-use Google Maps API key from env if available
      if ((apiType === 'googlemaps' || apiType === 'google') && process.env.GOOGLE_MAPS_API_KEY && !apiKey) {
        apiKey = process.env.GOOGLE_MAPS_API_KEY;
        console.log('Using Google Maps API key from environment');
      }
      i++;
    } else if (args[i] === '--key' && args[i + 1]) {
      apiKey = args[i + 1];
      i++;
    } else if (args[i] === '--auth-id' && args[i + 1]) {
      authId = args[i + 1];
      i++;
    } else if (args[i] === '--auth-token' && args[i + 1]) {
      authToken = args[i + 1];
      i++;
    } else if (args[i] === '--delay' && args[i + 1]) {
      delayMs = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      batchSize = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      concurrency = parseInt(args[i + 1]);
      i++;
    }
  }

  if (!filePath) {
    console.error('Error: --file argument required');
    console.log('\nUsage:');
    console.log('  bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt');
    console.log('  bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --api census');
    console.log('  bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --api googlemaps --key YOUR_API_KEY');
    console.log('  bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --api smartystreets --auth-id ID --auth-token TOKEN');
    console.log('  bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --api zipcodeapi --key API_KEY');
    console.log('\n  Or set GOOGLE_MAPS_API_KEY in .env file for automatic use');
    process.exit(1);
  }

  console.log('\n=== ZIP Code to County Lookup ===\n');
  console.log(`File: ${filePath}`);
  console.log(`API: ${apiType}`);
  console.log(`Delay: ${delayMs}ms between chunks`);
  console.log(`Concurrency: ${concurrency} parallel requests\n`);

  // Parse ZIP codes
  const zipCodes = parseZipCodes(filePath);
  console.log(`Found ${zipCodes.length} unique ZIP codes to lookup\n`);

  // Check database for existing mappings
  if (process.env.POSTGRES_URL) {
    configureDatabase({ connectionString: process.env.POSTGRES_URL });
    const existing = await query(`
      SELECT zip_code 
      FROM zip_county_mapping 
      WHERE zip_code = ANY($1::text[])
    `, [zipCodes]);
    
    const existingZips = new Set(existing.map((r: any) => r.zip_code));
    const missingZips = zipCodes.filter(z => !existingZips.has(z));
    
    if (missingZips.length < zipCodes.length) {
      console.log(`Found ${existing.length} ZIPs already in database`);
      console.log(`Looking up ${missingZips.length} missing ZIPs\n`);
      zipCodes.length = 0;
      zipCodes.push(...missingZips);
    }
  }

  const results: ZipCountyResult[] = [];
  let successCount = 0;
  let failCount = 0;
  let processedCount = 0;

  // Helper function to lookup a single ZIP
  async function lookupZip(zipCode: string): Promise<ZipCountyResult> {
    let result: ZipCountyResult;

    switch (apiType) {
      case 'census':
        result = await lookupWithCensus(zipCode);
        break;
      case 'smartystreets':
        if (!authId || !authToken) {
          console.error('Error: SmartyStreets requires --auth-id and --auth-token');
          process.exit(1);
        }
        result = await lookupWithSmartyStreets(zipCode, authId, authToken);
        break;
      case 'zipcodeapi':
        if (!apiKey) {
          console.error('Error: ZipCodeAPI requires --key');
          process.exit(1);
        }
        result = await lookupWithZipCodeAPI(zipCode, apiKey);
        break;
      case 'googlemaps':
      case 'google':
        if (!apiKey) {
          console.error('Error: Google Maps API requires --key or GOOGLE_MAPS_API_KEY environment variable');
          console.error('Get API key: https://developers.google.com/maps/documentation/geocoding/get-api-key');
          process.exit(1);
        }
        result = await lookupWithGoogleMaps(zipCode, apiKey);
        break;
      default:
        console.error(`Error: Unknown API type: ${apiType}`);
        console.error('Available APIs: census, smartystreets, zipcodeapi, googlemaps');
        process.exit(1);
    }

    return result;
  }

  // Process with concurrency control
  async function processBatch(batch: string[], batchNum: number, totalBatches: number) {
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} ZIPs)...`);

    // Process batch with concurrency limit
    const batchResults: ZipCountyResult[] = [];
    
    for (let i = 0; i < batch.length; i += concurrency) {
      const chunk = batch.slice(i, i + concurrency);
      const chunkPromises = chunk.map(zipCode => lookupZip(zipCode));
      const chunkResults = await Promise.all(chunkPromises);
      
      for (const result of chunkResults) {
        batchResults.push(result);
        results.push(result);
        processedCount++;
        
        if (result.success) {
          successCount++;
          process.stdout.write(`✓ ${result.zipCode}: ${result.countyName}, ${result.stateCode}\n`);
        } else {
          failCount++;
          process.stdout.write(`✗ ${result.zipCode}: ${result.error || 'Failed'}\n`);
        }
      }

      // Small delay between chunks to respect rate limits
      if (i + concurrency < batch.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // Progress summary
    const progress = ((processedCount / zipCodes.length) * 100).toFixed(1);
    console.log(`\nProgress: ${progress}% | Success: ${successCount} | Failed: ${failCount} | Processed: ${processedCount}/${zipCodes.length}\n`);
  }

  // Process in batches
  const totalBatches = Math.ceil(zipCodes.length / batchSize);
  for (let i = 0; i < zipCodes.length; i += batchSize) {
    const batch = zipCodes.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    await processBatch(batch, batchNum, totalBatches);
  }

  // Save results
  const timestamp = Date.now();
  const outputFile = `zip-county-lookup-results-${timestamp}.txt`;
  const csvFile = `zip-county-lookup-results-${timestamp}.csv`;

  // Text format
  const textLines = [
    'ZIP Code\tCounty Name\tState Code\tState Name\tCity Name\tSource\tSuccess\tError',
    ...results.map(r => 
      `${r.zipCode}\t${r.countyName || ''}\t${r.stateCode || ''}\t${r.stateName || ''}\t${r.cityName || ''}\t${r.source}\t${r.success ? 'Yes' : 'No'}\t${r.error || ''}`
    )
  ];
  writeFileSync(outputFile, textLines.join('\n'), 'utf-8');

  // CSV format (for import)
  const csvLines = [
    'zip_code,county_name,state_code,state_name,city_name',
    ...results
      .filter(r => r.success)
      .map(r => 
        `"${r.zipCode}","${r.countyName || ''}","${r.stateCode || ''}","${r.stateName || ''}","${r.cityName || ''}"`
      )
  ];
  writeFileSync(csvFile, csvLines.join('\n'), 'utf-8');

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Total ZIPs: ${zipCodes.length}`);
  console.log(`Successful: ${successCount} (${(successCount / zipCodes.length * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failCount} (${(failCount / zipCodes.length * 100).toFixed(1)}%)`);
  console.log(`\nResults saved to:`);
  console.log(`  - ${outputFile} (full results)`);
  console.log(`  - ${csvFile} (CSV for import)`);
  console.log(`\nTo import successful results:`);
  console.log(`  bun run ingest:zip-county -- --file ${csvFile}`);
  console.log('\n✅ Lookup complete!\n');
}

lookupZipCounties()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
