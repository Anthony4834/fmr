#!/usr/bin/env bun

/**
 * RentCast Local Scraper
 * 
 * A standalone local script for scraping RentCast market rent data.
 * Uses Puppeteer with system Chrome for reliable Windows support.
 * 
 * Features:
 * - Live progress tracking
 * - Easy resume on interruption (uses local JSON state file)
 * - No Vercel/serverless dependencies
 * - Works on Windows with system Chrome
 * 
 * Usage:
 *   bun scripts/rentcast-local-scraper.ts
 *   bun scripts/rentcast-local-scraper.ts --limit 100
 *   bun scripts/rentcast-local-scraper.ts --bedroom 3
 *   bun scripts/rentcast-local-scraper.ts --reset  (reset progress)
 */

import { config } from 'dotenv';
import { configureDatabase, query, execute } from '../lib/db';
import { createSchema } from '../lib/schema';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

config();

// ============ Configuration ============
const BEDROOM_ORDER = [3, 2, 4, 1, 0];
const SQFT_BY_BEDROOM: Record<number, number> = {
  0: 600,
  1: 850,
  2: 1150,
  3: 1500,
  4: 2150,
};

// Chrome paths to try
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const STATE_FILE = join(dirname(import.meta.path), '..', '.dev', 'data', 'rentcast-scraper-state.json');
const DEBUG_DIR = join(dirname(import.meta.path), '..', '.dev', 'data', 'rentcast-debug');
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 5000;

// ============ Types ============
interface LocalState {
  currentBedroom: number;
  currentZipIndex: number;
  totalScraped: number;
  totalFailed: number;
  totalSkipped: number;
  startedAt: string;
  lastUpdated: string;
  lastZip: string | null;
  rateLimitHits: number;
  isRunning: boolean;
}

interface RentData {
  estimated_monthly_rent: number | null;
  rent_per_sqft: number | null;
  rent_per_bedroom: number | null;
  low_estimate: number | null;
  high_estimate: number | null;
}

// ============ State Management ============
function loadState(): LocalState {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    } catch {
      console.log('⚠ Could not read state file, starting fresh');
    }
  }
  return {
    currentBedroom: BEDROOM_ORDER[0],
    currentZipIndex: 0,
    totalScraped: 0,
    totalFailed: 0,
    totalSkipped: 0,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    lastZip: null,
    rateLimitHits: 0,
    isRunning: false,
  };
}

function saveState(state: LocalState) {
  state.lastUpdated = new Date().toISOString();
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function resetState() {
  if (existsSync(STATE_FILE)) {
    const backup = STATE_FILE + '.backup.' + Date.now();
    writeFileSync(backup, readFileSync(STATE_FILE));
    console.log(`📦 Backed up old state to: ${backup}`);
  }
  const freshState: LocalState = {
    currentBedroom: BEDROOM_ORDER[0],
    currentZipIndex: 0,
    totalScraped: 0,
    totalFailed: 0,
    totalSkipped: 0,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    lastZip: null,
    rateLimitHits: 0,
    isRunning: false,
  };
  saveState(freshState);
  console.log('🔄 State reset to beginning');
}

// ============ Progress Display ============
function displayProgress(state: LocalState, totalZips: number, currentZip: string, status: string) {
  const bedroomIdx = BEDROOM_ORDER.indexOf(state.currentBedroom);
  const totalOperations = totalZips * BEDROOM_ORDER.length;
  const completedOperations = bedroomIdx * totalZips + state.currentZipIndex;
  const progressPct = ((completedOperations / totalOperations) * 100).toFixed(2);
  
  const elapsed = Date.now() - new Date(state.startedAt).getTime();
  const avgTimePerOp = state.totalScraped > 0 ? elapsed / state.totalScraped : 0;
  const remainingOps = totalOperations - completedOperations;
  const etaMs = avgTimePerOp * remainingOps;
  const etaHours = (etaMs / 1000 / 60 / 60).toFixed(1);
  
  process.stdout.write('\r\x1b[K');
  process.stdout.write(
    `[${progressPct}%] ${state.currentBedroom}BR | ZIP ${currentZip} (${state.currentZipIndex + 1}/${totalZips}) | ` +
    `✓${state.totalScraped} ✗${state.totalFailed} ⊘${state.totalSkipped} | ` +
    `ETA: ${etaHours}h | ${status}`
  );
}

function displaySummary(state: LocalState, totalZips: number) {
  const elapsed = Date.now() - new Date(state.startedAt).getTime();
  const elapsedHours = (elapsed / 1000 / 60 / 60).toFixed(2);
  
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 SCRAPING SUMMARY');
  console.log('='.repeat(60));
  console.log(`Started:        ${state.startedAt}`);
  console.log(`Last Updated:   ${state.lastUpdated}`);
  console.log(`Elapsed:        ${elapsedHours} hours`);
  console.log(`Current BR:     ${state.currentBedroom}BR`);
  console.log(`Current Index:  ${state.currentZipIndex} / ${totalZips}`);
  console.log('---');
  console.log(`✓ Scraped:      ${state.totalScraped}`);
  console.log(`✗ Failed:       ${state.totalFailed}`);
  console.log(`⊘ Skipped:      ${state.totalSkipped}`);
  console.log(`⚠ Rate Limits:  ${state.rateLimitHits}`);
  console.log('='.repeat(60) + '\n');
}

// ============ Database Functions ============
async function getUSZipCodes(): Promise<string[]> {
  const result = await query<{ zip_code: string }>(
    `SELECT DISTINCT zip_code 
     FROM zip_county_mapping 
     WHERE state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
     ORDER BY zip_code`
  );
  return result.map((r) => r.zip_code);
}

async function checkIfScraped(zipCode: string, bedroomCount: number): Promise<boolean> {
  // Only consider it scraped if we have actual data (not insufficient_comps or no_data)
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count 
     FROM rentcast_market_rents 
     WHERE zip_code = $1 AND bedroom_count = $2 
     AND (data_status IS NULL OR data_status = 'available')`,
    [zipCode, bedroomCount]
  );
  return parseInt(result[0]?.count || '0') > 0;
}

async function saveRentData(
  zipCode: string, 
  bedroomCount: number, 
  rentData: RentData | null, 
  dataStatus: 'available' | 'insufficient_comps' | 'no_data' = 'available'
): Promise<void> {
  await execute(
    `INSERT INTO rentcast_market_rents (
      zip_code, bedroom_count, estimated_monthly_rent, rent_per_sqft, rent_per_bedroom,
      low_estimate, high_estimate, data_status, scraped_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    ON CONFLICT (zip_code, bedroom_count) 
    DO UPDATE SET
      estimated_monthly_rent = EXCLUDED.estimated_monthly_rent,
      rent_per_sqft = EXCLUDED.rent_per_sqft,
      rent_per_bedroom = EXCLUDED.rent_per_bedroom,
      low_estimate = EXCLUDED.low_estimate,
      high_estimate = EXCLUDED.high_estimate,
      data_status = EXCLUDED.data_status,
      updated_at = NOW()`,
    [
      zipCode,
      bedroomCount,
      rentData?.estimated_monthly_rent || null,
      rentData?.rent_per_sqft || null,
      rentData?.rent_per_bedroom || null,
      rentData?.low_estimate || null,
      rentData?.high_estimate || null,
      dataStatus,
    ]
  );
}

// ============ Debug Functions ============
function saveDebugHTML(zipCode: string, bedroomCount: number, html: string, reason: string) {
  try {
    if (!existsSync(DEBUG_DIR)) {
      mkdirSync(DEBUG_DIR, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${zipCode}-${bedroomCount}BR-${timestamp}-${reason}.html`;
    const filepath = join(DEBUG_DIR, filename);
    
    // Add metadata comment at the top
    const metadata = `<!--
Debug file saved: ${new Date().toISOString()}
Zip Code: ${zipCode}
Bedroom Count: ${bedroomCount}
Reason: ${reason}
URL: https://app.rentcast.io/app?address=${zipCode},%20&type=single-family&bedrooms=${bedroomCount}&area=${SQFT_BY_BEDROOM[bedroomCount]}
-->
`;
    
    writeFileSync(filepath, metadata + html);
    return filepath;
  } catch (error) {
    console.error(`Failed to save debug HTML: ${error}`);
    return null;
  }
}

// ============ Scraping Functions ============
function parseRentData(html: string): RentData | null {
  try {
    // Extract estimated monthly rent
    const estimatedRentMatch = html.match(/display-3[^>]*>\s*\$?\s*([\d,]+)/i);
    const estimatedRent = estimatedRentMatch
      ? parseFloat(estimatedRentMatch[1].replace(/,/g, ''))
      : null;

    if (!estimatedRent) return null;

    let rentPerSqft: number | null = null;
    let rentPerBedroom: number | null = null;
    let lowEstimate: number | null = null;
    let highEstimate: number | null = null;

    // Per sqft
    const sqftMatch = html.match(/\$([\d.]+)\s*(?:\/sq\.?ft\.?|per sq)/i);
    if (sqftMatch) rentPerSqft = parseFloat(sqftMatch[1]);

    // Per bedroom
    const bedroomMatch = html.match(/\$([\d,]+\.?\d*)\s*per bedroom/i);
    if (bedroomMatch) rentPerBedroom = parseFloat(bedroomMatch[1].replace(/,/g, ''));

    // Low/high estimates
    const lowMatch = html.match(/Low Estimate[\s\S]*?\$([\d,]+)/i);
    if (lowMatch) lowEstimate = parseFloat(lowMatch[1].replace(/,/g, ''));
    
    const highMatch = html.match(/High Estimate[\s\S]*?\$([\d,]+)/i);
    if (highMatch) highEstimate = parseFloat(highMatch[1].replace(/,/g, ''));

    return {
      estimated_monthly_rent: estimatedRent,
      rent_per_sqft: rentPerSqft,
      rent_per_bedroom: rentPerBedroom,
      low_estimate: lowEstimate,
      high_estimate: highEstimate,
    };
  } catch {
    return null;
  }
}

async function scrapeZip(page: Page, zipCode: string, bedroomCount: number): Promise<RentData | null> {
  const sqft = SQFT_BY_BEDROOM[bedroomCount];
  const url = `https://app.rentcast.io/app?address=${zipCode},%20&type=single-family&bedrooms=${bedroomCount}&area=${sqft}`;

  let html: string | null = null;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait a bit for Angular to render
    await new Promise(r => setTimeout(r, 3000));
    
    // Try to wait for content
    let cardBodyFound = false;
    try {
      await page.waitForSelector('.card-body', { timeout: 10000 });
      cardBodyFound = true;
    } catch {
      // Card body might not exist - no data available
      cardBodyFound = false;
    }
    
    html = await page.content();
    
    // Get visible text content to check for specific messages
    let visibleText = '';
    try {
      visibleText = await page.evaluate(() => document.body.innerText || '');
    } catch {
      // Fallback: extract text from HTML, excluding style/script tags
      const textOnly = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
      visibleText = textOnly;
    }
    
    // Check for "insufficient comps" message first (not a rate limit, just no data)
    const insufficientCompsPatterns = [
      /not enough comps/i,
      /insufficient.*comps/i,
      /cannot calculate.*rent estimate/i,
      /unable to calculate.*rent/i,
    ];
    
    const hasInsufficientComps = insufficientCompsPatterns.some(pattern => pattern.test(visibleText));
    
    if (hasInsufficientComps) {
      saveDebugHTML(zipCode, bedroomCount, html, 'insufficient-comps');
      // Save to DB with insufficient_comps flag
      await saveRentData(zipCode, bedroomCount, null, 'insufficient_comps');
      return null; // Not an error, just no data available
    }
    
    // Check for actual rate limit messages in visible text only
    // Note: We avoid matching standalone "429" as it can appear in addresses (e.g., "429 Central Pike")
    const rateLimitPatterns = [
      /\brate limit\b/i,
      /\btoo many requests\b/i,
      /\b429\s+(error|status|code|too many)/i,  // Only match 429 in HTTP context
      /\bhttp.*429/i,  // HTTP 429
      /\bstatus.*429/i,  // Status 429
      /\brate.*exceeded\b/i,
      /\bquota.*exceeded\b/i,
    ];
    
    const hasRateLimit = rateLimitPatterns.some(pattern => pattern.test(visibleText));
    
    if (hasRateLimit) {
      saveDebugHTML(zipCode, bedroomCount, html, 'rate-limit');
      throw new Error('RATE_LIMIT');
    }
    
    // Try to parse rent data - if we get it, the page is working
    const rentData = parseRentData(html);
    
    // If we couldn't get rent data, save debug file and flag in DB
    if (!rentData) {
      const reason = cardBodyFound ? 'no-data-parsed' : 'no-card-body';
      saveDebugHTML(zipCode, bedroomCount, html, reason);
      // Save to DB with no_data flag
      await saveRentData(zipCode, bedroomCount, null, 'no_data');
    } else {
      // Save successful data with available status
      await saveRentData(zipCode, bedroomCount, rentData, 'available');
    }
    
    return rentData;
  } catch (error: any) {
    // Save HTML if we haven't already and it's not a rate limit
    if (html && error.message !== 'RATE_LIMIT' && !error.message?.includes('429')) {
      saveDebugHTML(zipCode, bedroomCount, html, 'error');
    }
    
    if (error.message?.includes('429') || error.message === 'RATE_LIMIT') {
      throw new Error('RATE_LIMIT');
    }
    throw error;
  }
}

// ============ Browser Launch ============
function findChromePath(): string {
  for (const path of CHROME_PATHS) {
    if (existsSync(path)) {
      return path;
    }
  }
  throw new Error(
    'Chrome not found. Please install Chrome from https://www.google.com/chrome/\n' +
    'Checked paths:\n' + CHROME_PATHS.map(p => `  - ${p}`).join('\n')
  );
}

async function launchBrowser(): Promise<Browser> {
  const chromePath = findChromePath();
  console.log(`🚀 Launching Chrome from: ${chromePath}\n`);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-web-security',
    ],
  });
  
  console.log('   ✓ Browser launched successfully\n');
  return browser;
}

// ============ Main Loop ============
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--reset')) {
    resetState();
    return;
  }

  const limit = args.includes('--limit')
    ? parseInt(args[args.indexOf('--limit') + 1] || '0', 10)
    : null;
  const bedroomFilter = args.includes('--bedroom')
    ? parseInt(args[args.indexOf('--bedroom') + 1] || '-1', 10)
    : null;

  console.log('\n' + '='.repeat(60));
  console.log('🏠 RentCast Local Scraper (Puppeteer Edition)');
  console.log('='.repeat(60));
  console.log('Press Ctrl+C to stop (progress is saved automatically)\n');

  // Setup database
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Ensure schema exists
  console.log('📋 Ensuring database schema...');
  await createSchema();

  // Load state
  let state = loadState();
  
  // Handle graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (browser?: Browser) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n\n🛑 Shutting down gracefully...');
    state.isRunning = false;
    saveState(state);
    if (browser) await browser.close();
  };

  process.on('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });

  // Get zip codes
  console.log('📋 Loading US zip codes...');
  const allZips = await getUSZipCodes();
  console.log(`   Found ${allZips.length} zip codes\n`);

  displaySummary(state, allZips.length);

  // Launch browser
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  // Set user agent to look like a real browser
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  state.isRunning = true;
  saveState(state);

  try {
    const bedroomsToProcess = bedroomFilter !== null
      ? BEDROOM_ORDER.filter((br) => br === bedroomFilter)
      : BEDROOM_ORDER;

    // Find starting bedroom index
    let startBedroomIdx = bedroomsToProcess.indexOf(state.currentBedroom);
    if (startBedroomIdx < 0) startBedroomIdx = 0;

    for (let brIdx = startBedroomIdx; brIdx < bedroomsToProcess.length; brIdx++) {
      if (isShuttingDown) break;
      
      const bedroom = bedroomsToProcess[brIdx];
      state.currentBedroom = bedroom;
      
      // Reset zip index when changing bedroom (except on resume)
      if (brIdx > startBedroomIdx) {
        state.currentZipIndex = 0;
      }

      console.log(`\n📦 Processing ${bedroom}BR apartments...\n`);

      for (let zipIdx = state.currentZipIndex; zipIdx < allZips.length; zipIdx++) {
        if (isShuttingDown) break;
        if (limit !== null && state.totalScraped >= limit) {
          console.log(`\n\n✅ Reached limit of ${limit} scrapes`);
          break;
        }

        const zip = allZips[zipIdx];
        state.currentZipIndex = zipIdx;
        state.lastZip = zip;

        displayProgress(state, allZips.length, zip, 'Checking...');

        // Check if already scraped
        if (await checkIfScraped(zip, bedroom)) {
          state.totalSkipped++;
          saveState(state);
          continue;
        }

        displayProgress(state, allZips.length, zip, 'Scraping...');

        try {
          const rentData = await scrapeZip(page, zip, bedroom);
          
          // Data is already saved in scrapeZip function (with appropriate status)
          if (rentData) {
            state.totalScraped++;
            displayProgress(state, allZips.length, zip, `✓ $${rentData.estimated_monthly_rent}/mo`);
          } else {
            state.totalFailed++;
            displayProgress(state, allZips.length, zip, '✗ No data');
          }
        } catch (error: any) {
          if (error.message === 'RATE_LIMIT') {
            state.rateLimitHits++;
            displayProgress(state, allZips.length, zip, '⚠ Rate limit - waiting 5min...');
            await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
            zipIdx--; // Retry this zip
          } else {
            state.totalFailed++;
            displayProgress(state, allZips.length, zip, `✗ ${error.message.slice(0, 30)}`);
          }
        }

        saveState(state);

        // Random delay
        const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
        await new Promise((r) => setTimeout(r, delay));
      }

      if (limit !== null && state.totalScraped >= limit) break;
    }

    console.log('\n\n🎉 Scraping complete!');
  } finally {
    await browser.close();
    state.isRunning = false;
    saveState(state);
    displaySummary(state, allZips.length);
  }
}

main().catch((e) => {
  console.error('\n\n❌ Fatal error:', e.message);
  process.exit(1);
});
