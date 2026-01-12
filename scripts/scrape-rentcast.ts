#!/usr/bin/env bun

/**
 * RentCast Market Rent Scraper
 * 
 * Scrapes market rent data from RentCast.io on a per-zip basis.
 * Processes systematically by BR size: 3BR, 2BR, 4BR, 1BR, 0BR
 * 
 * Features:
 * - Rate limit detection and intelligent backoff
 * - Progress tracking and resumption
 * - Continuous operation (24/7)
 * - Learns optimal request frequency
 * 
 * Usage:
 *   bun scripts/scrape-rentcast.ts
 *   bun scripts/scrape-rentcast.ts --limit 100
 *   bun scripts/scrape-rentcast.ts --bedroom 3
 */

import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
import { configureDatabase, query, execute } from '../lib/db';
import { chromium, Browser, Page } from 'playwright';

config();

// Bedroom sizes in processing order: 3BR, 2BR, 4BR, 1BR, 0BR
const BEDROOM_ORDER = [3, 2, 4, 1, 0];

// Square footage reference for each bedroom size
const SQFT_BY_BEDROOM: Record<number, number> = {
  0: 600, // median of 400-800
  1: 850, // median of 700-1000
  2: 1150, // median of 900-1400
  3: 1500, // typical 1500-1800
  4: 2150, // median of 1800-2500
};

interface ScrapingState {
  current_zip_code: string | null;
  current_bedroom_count: number | null;
  last_successful_zip: string | null;
  last_successful_bedroom: number | null;
  last_successful_at: Date | null;
  rate_limit_hit_at: Date | null;
  rate_limit_resume_at: Date | null;
  consecutive_rate_limits: number;
  total_requests_made: number;
  total_successful_scrapes: number;
  total_rate_limits: number;
  average_request_interval_ms: number;
}

interface RentData {
  estimated_monthly_rent: number | null;
  rent_per_sqft: number | null;
  rent_per_bedroom: number | null;
  low_estimate: number | null;
  high_estimate: number | null;
  low_estimate_per_sqft: number | null;
  high_estimate_per_sqft: number | null;
}

async function getScrapingState(): Promise<ScrapingState | null> {
  const result = await query<ScrapingState>(
    `SELECT * FROM rentcast_scraping_state ORDER BY id LIMIT 1`
  );
  return result.length > 0 ? result[0] : null;
}

async function initializeScrapingState(): Promise<void> {
  const existing = await getScrapingState();
  if (!existing) {
    await execute(
      `INSERT INTO rentcast_scraping_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
    );
  }
}

async function updateScrapingState(updates: Partial<ScrapingState>): Promise<void> {
  const setClause = Object.keys(updates)
    .map((key, idx) => `${key} = $${idx + 1}`)
    .join(', ');
  const values = Object.values(updates);
  
  await execute(
    `UPDATE rentcast_scraping_state SET ${setClause}, last_updated = NOW() WHERE id = 1`,
    values
  );
}

async function getUSZipCodes(): Promise<string[]> {
  const result = await query<{ zip_code: string }>(
    `SELECT DISTINCT zip_code 
     FROM zip_county_mapping 
     WHERE state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
     ORDER BY zip_code`
  );
  return result.map((r) => r.zip_code);
}

async function getNextZipToScrape(
  bedroomCount: number,
  allZips: string[],
  lastSuccessfulZip: string | null
): Promise<string | null> {
  if (allZips.length === 0) return null;

  // If we have a last successful zip, start from the next one
  if (lastSuccessfulZip) {
    const lastIndex = allZips.indexOf(lastSuccessfulZip);
    if (lastIndex >= 0 && lastIndex < allZips.length - 1) {
      return allZips[lastIndex + 1];
    }
  }

  // Otherwise, find the first zip that hasn't been scraped for this bedroom count
  const scrapedZips = await query<{ zip_code: string }>(
    `SELECT DISTINCT zip_code 
     FROM rentcast_market_rents 
     WHERE bedroom_count = $1`,
    [bedroomCount]
  );
  const scrapedSet = new Set(scrapedZips.map((r) => r.zip_code));

  for (const zip of allZips) {
    if (!scrapedSet.has(zip)) {
      return zip;
    }
  }

  return null;
}

async function checkIfScraped(zipCode: string, bedroomCount: number): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count 
     FROM rentcast_market_rents 
     WHERE zip_code = $1 AND bedroom_count = $2`,
    [zipCode, bedroomCount]
  );
  return parseInt(result[0]?.count || '0') > 0;
}

function parseRentData(html: string): RentData | null {
  try {
    // Extract estimated monthly rent from: <div class="display-3 text-dark mb-2"> $3,510 </div>
    const estimatedRentMatch = html.match(/display-3[^>]*>\s*\$?\s*([\d,]+)/i);
    const estimatedRent = estimatedRentMatch
      ? parseFloat(estimatedRentMatch[1].replace(/,/g, ''))
      : null;

    if (!estimatedRent) {
      return null; // Must have at least estimated rent
    }

    // Find the row with "per sq.ft." and "per bedroom"
    // Structure: <div class="row">...<div class="col text-right">...$2.34...per sq.ft....<div class="col column-divider text-left">...$1,170.00...per bedroom
    const perSqftSection = html.match(/per sq\.ft\.([\s\S]*?)<\/div>/i);
    let rentPerSqft: number | null = null;
    if (perSqftSection) {
      const sqftMatch = perSqftSection[1].match(/font-weight-bold[^>]*>\s*\$?\s*([\d,]+\.?\d*)/i);
      if (sqftMatch) {
        rentPerSqft = parseFloat(sqftMatch[1].replace(/,/g, ''));
      }
    }

    const perBedroomSection = html.match(/per bedroom([\s\S]*?)<\/div>/i);
    let rentPerBedroom: number | null = null;
    if (perBedroomSection) {
      const bedroomMatch = perBedroomSection[1].match(/font-weight-bold[^>]*>\s*\$?\s*([\d,]+\.?\d*)/i);
      if (bedroomMatch) {
        rentPerBedroom = parseFloat(bedroomMatch[1].replace(/,/g, ''));
      }
    }

    // Extract low and high estimates from the bottom row
    // Structure: <div class="col text-left">...$2,730...$1.82 /sq.ft....<div class="col text-right">...$4,280...$2.85 /sq.ft.
    const lowEstimateMatch = html.match(/Low Estimate[\s\S]*?col text-left[\s\S]*?font-weight-bold[^>]*>\s*\$?\s*([\d,]+)/i);
    const lowEstimate = lowEstimateMatch
      ? parseFloat(lowEstimateMatch[1].replace(/,/g, ''))
      : null;

    const highEstimateMatch = html.match(/High Estimate[\s\S]*?col text-right[\s\S]*?font-weight-bold[^>]*>\s*\$?\s*([\d,]+)/i);
    const highEstimate = highEstimateMatch
      ? parseFloat(highEstimateMatch[1].replace(/,/g, ''))
      : null;

    // Extract per sqft for estimates
    let lowEstimatePerSqft: number | null = null;
    let highEstimatePerSqft: number | null = null;

    if (lowEstimateMatch) {
      const lowSqftMatch = html.match(new RegExp(`\\$${lowEstimateMatch[1].replace(/,/g, '')}[\\s\\S]*?\\$([\\d,]+\\.?\\d*)\\s*\\/sq\\.ft\\.`, 'i'));
      if (lowSqftMatch) {
        lowEstimatePerSqft = parseFloat(lowSqftMatch[1].replace(/,/g, ''));
      }
    }

    if (highEstimateMatch) {
      const highSqftMatch = html.match(new RegExp(`\\$${highEstimateMatch[1].replace(/,/g, '')}[\\s\\S]*?\\$([\\d,]+\\.?\\d*)\\s*\\/sq\\.ft\\.`, 'i'));
      if (highSqftMatch) {
        highEstimatePerSqft = parseFloat(highSqftMatch[1].replace(/,/g, ''));
      }
    }

    // Alternative: try to find all per sqft values and match them
    if (!lowEstimatePerSqft || !highEstimatePerSqft) {
      const allSqftMatches = html.matchAll(/\$([\d,]+\.?\d*)\s*\/sq\.ft\./gi);
      const sqftValues: number[] = [];
      for (const match of allSqftMatches) {
        sqftValues.push(parseFloat(match[1].replace(/,/g, '')));
      }
      if (sqftValues.length >= 2) {
        if (!lowEstimatePerSqft) lowEstimatePerSqft = sqftValues[0];
        if (!highEstimatePerSqft) highEstimatePerSqft = sqftValues[sqftValues.length - 1];
      }
    }

    return {
      estimated_monthly_rent: estimatedRent,
      rent_per_sqft: rentPerSqft,
      rent_per_bedroom: rentPerBedroom,
      low_estimate: lowEstimate,
      high_estimate: highEstimate,
      low_estimate_per_sqft: lowEstimatePerSqft,
      high_estimate_per_sqft: highEstimatePerSqft,
    };
  } catch (error) {
    console.error('Error parsing rent data:', error);
    return null;
  }
}

async function scrapeRentCast(
  browser: Browser,
  zipCode: string,
  bedroomCount: number
): Promise<RentData | null> {
  const sqft = SQFT_BY_BEDROOM[bedroomCount];
  const url = `https://app.rentcast.io/app?address=${zipCode},%20&type=single-family&bedrooms=${bedroomCount}&area=${sqft}`;

  const page = await browser.newPage();
  
  try {
    // Set a reasonable timeout
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for the card-body element to appear
    await page.waitForSelector('.card-body', { timeout: 10000 });
    
    // Get the HTML content
    const html = await page.content();
    
    // Parse the rent data
    const rentData = parseRentData(html);
    
    return rentData;
  } catch (error: any) {
    // Check if it's a rate limit (429 or timeout)
    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      throw new Error('RATE_LIMIT');
    }
    console.error(`Error scraping ${zipCode} ${bedroomCount}BR:`, error.message);
    return null;
  } finally {
    await page.close();
  }
}

async function saveRentData(zipCode: string, bedroomCount: number, rentData: RentData): Promise<void> {
  await execute(
    `INSERT INTO rentcast_market_rents (
      zip_code, bedroom_count, estimated_monthly_rent, rent_per_sqft, rent_per_bedroom,
      low_estimate, high_estimate, low_estimate_per_sqft, high_estimate_per_sqft,
      scraped_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
    ON CONFLICT (zip_code, bedroom_count) 
    DO UPDATE SET
      estimated_monthly_rent = EXCLUDED.estimated_monthly_rent,
      rent_per_sqft = EXCLUDED.rent_per_sqft,
      rent_per_bedroom = EXCLUDED.rent_per_bedroom,
      low_estimate = EXCLUDED.low_estimate,
      high_estimate = EXCLUDED.high_estimate,
      low_estimate_per_sqft = EXCLUDED.low_estimate_per_sqft,
      high_estimate_per_sqft = EXCLUDED.high_estimate_per_sqft,
      updated_at = NOW()`,
    [
      zipCode,
      bedroomCount,
      rentData.estimated_monthly_rent,
      rentData.rent_per_sqft,
      rentData.rent_per_bedroom,
      rentData.low_estimate,
      rentData.high_estimate,
      rentData.low_estimate_per_sqft,
      rentData.high_estimate_per_sqft,
    ]
  );
}

async function calculateRequestFrequency(totalZips: number): Promise<number> {
  // Calculate requests needed: total zips * 5 bedroom sizes
  const totalRequests = totalZips * 5;
  
  // One year = 365 days * 24 hours * 60 minutes * 60 seconds * 1000 ms
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  
  // Request interval in milliseconds
  const intervalMs = Math.floor(oneYearMs / totalRequests);
  
  return intervalMs;
}

async function main() {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') 
    ? parseInt(args[args.indexOf('--limit') + 1] || '0', 10)
    : null;
  const bedroomFilter = args.includes('--bedroom')
    ? parseInt(args[args.indexOf('--bedroom') + 1] || '-1', 10)
    : null;

  console.log('\n=== RentCast Market Rent Scraper ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Initialize scraping state
  await initializeScrapingState();
  const state = await getScrapingState();
  if (!state) {
    throw new Error('Failed to initialize scraping state');
  }

  // Get all US zip codes
  console.log('Loading US zip codes...');
  const allZips = await getUSZipCodes();
  console.log(`Found ${allZips.length} US zip codes\n`);

  // Calculate request frequency for 1-year completion
  const intervalMs = await calculateRequestFrequency(allZips.length);
  console.log(`Request frequency: ${intervalMs}ms (${(intervalMs / 1000).toFixed(1)}s) per request`);
  console.log(`Estimated completion time: 1 year (${allZips.length} zips × 5 BR sizes)\n`);

  // Check if we're currently rate-limited
  if (state.rate_limit_resume_at) {
    const resumeAt = new Date(state.rate_limit_resume_at);
    if (resumeAt > new Date()) {
      const waitMs = resumeAt.getTime() - Date.now();
      console.log(`Rate limit active. Resuming in ${Math.ceil(waitMs / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } else {
      // Rate limit expired, reset
      await updateScrapingState({
        rate_limit_resume_at: null,
        consecutive_rate_limits: 0,
      });
    }
  }

  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });

  try {
    let totalScraped = 0;
    const bedroomsToProcess = bedroomFilter !== null 
      ? [bedroomFilter].filter((br) => BEDROOM_ORDER.includes(br))
      : BEDROOM_ORDER;

    for (const bedroomCount of bedroomsToProcess) {
      console.log(`\n--- Processing ${bedroomCount}BR ---\n`);

      let bedroomScraped = 0;
      let requestsThisBedroom = 0;

      while (true) {
        // Check limit
        if (limit !== null && totalScraped >= limit) {
          console.log(`\nReached limit of ${limit} scrapes. Stopping.`);
          break;
        }

        // Get next zip to scrape
        const zipCode = await getNextZipToScrape(
          bedroomCount,
          allZips,
          state.last_successful_zip || null
        );

        if (!zipCode) {
          console.log(`\nAll zips processed for ${bedroomCount}BR. Moving to next bedroom size.`);
          break;
        }

        // Check if already scraped (double-check)
        if (await checkIfScraped(zipCode, bedroomCount)) {
          await updateScrapingState({
            last_successful_zip: zipCode,
            last_successful_bedroom: bedroomCount,
            last_successful_at: new Date(),
          });
          continue;
        }

        // Update current state
        await updateScrapingState({
          current_zip_code: zipCode,
          current_bedroom_count: bedroomCount,
        });

        console.log(`Scraping ${zipCode} ${bedroomCount}BR...`);

        try {
          // Scrape
          const rentData = await scrapeRentCast(browser, zipCode, bedroomCount);

          if (rentData) {
            // Save to database
            await saveRentData(zipCode, bedroomCount, rentData);

            // Update state
            const newTotalRequests = state.total_requests_made + 1;
            const newTotalScrapes = state.total_successful_scrapes + 1;
            await updateScrapingState({
              last_successful_zip: zipCode,
              last_successful_bedroom: bedroomCount,
              last_successful_at: new Date(),
              total_requests_made: newTotalRequests,
              total_successful_scrapes: newTotalScrapes,
            });

            // Update local state
            state.total_requests_made = newTotalRequests;
            state.total_successful_scrapes = newTotalScrapes;
            state.last_successful_zip = zipCode;
            state.last_successful_bedroom = bedroomCount;
            state.last_successful_at = new Date();

            bedroomScraped++;
            totalScraped++;
            requestsThisBedroom++;

            console.log(`  ✓ Saved: $${rentData.estimated_monthly_rent}/mo`);

            // Wait before next request (adaptive based on rate limit history)
            const currentInterval = state.average_request_interval_ms || intervalMs;
            const waitTime = Math.max(currentInterval, 1000); // Minimum 1 second
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          } else {
            console.log(`  ✗ No data found`);
            const newTotalRequests = state.total_requests_made + 1;
            await updateScrapingState({
              total_requests_made: newTotalRequests,
            });
            state.total_requests_made = newTotalRequests;
          }
        } catch (error: any) {
          if (error.message === 'RATE_LIMIT') {
            console.log(`  ⚠ Rate limit hit!`);

            // Calculate backoff: exponential with max cap
            const consecutiveLimits = state.consecutive_rate_limits + 1;
            const backoffMinutes = Math.min(15 * Math.pow(2, consecutiveLimits - 1), 60); // Max 60 minutes
            const resumeAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

            const newTotalRequests = state.total_requests_made + 1;
            const newTotalRateLimits = state.total_rate_limits + 1;
            await updateScrapingState({
              rate_limit_hit_at: new Date(),
              rate_limit_resume_at: resumeAt,
              consecutive_rate_limits: consecutiveLimits,
              total_requests_made: newTotalRequests,
              total_rate_limits: newTotalRateLimits,
            });

            // Update local state
            state.rate_limit_hit_at = new Date();
            state.rate_limit_resume_at = resumeAt;
            state.consecutive_rate_limits = consecutiveLimits;
            state.total_requests_made = newTotalRequests;
            state.total_rate_limits = newTotalRateLimits;

            console.log(`  Waiting ${backoffMinutes} minutes before resuming...`);
            await new Promise((resolve) => setTimeout(resolve, backoffMinutes * 60 * 1000));

            // Reset consecutive rate limits after successful wait
            await updateScrapingState({
              consecutive_rate_limits: 0,
            });
            state.consecutive_rate_limits = 0;
          } else {
            console.log(`  ✗ Error: ${error.message}`);
            const newTotalRequests = state.total_requests_made + 1;
            await updateScrapingState({
              total_requests_made: newTotalRequests,
            });
            state.total_requests_made = newTotalRequests;
          }
        }
      }

      console.log(`\nCompleted ${bedroomCount}BR: ${bedroomScraped} scrapes`);
    }

    console.log(`\n=== Scraping Complete ===`);
    console.log(`Total scrapes: ${totalScraped}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
