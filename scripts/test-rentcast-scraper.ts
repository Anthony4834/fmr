#!/usr/bin/env bun

/**
 * Test RentCast Scraper
 * 
 * Quick test to verify the scraper setup is working correctly.
 * Tests a single zip code scrape to ensure Playwright and parsing work.
 * 
 * Usage:
 *   bun scripts/test-rentcast-scraper.ts
 *   bun scripts/test-rentcast-scraper.ts --zip 98101 --bedroom 3
 */

import { config } from 'dotenv';
import { configureDatabase, execute } from '../lib/db';
import { chromium } from 'playwright';

config();

const SQFT_BY_BEDROOM: Record<number, number> = {
  0: 600,
  1: 850,
  2: 1150,
  3: 1500,
  4: 2150,
};

async function testScrape(zipCode: string = '98101', bedroomCount: number = 3) {
  console.log(`\n=== Testing RentCast Scraper ===\n`);
  console.log(`Zip Code: ${zipCode}`);
  console.log(`Bedroom Count: ${bedroomCount}BR\n`);

  // Test Playwright installation
  console.log('1. Testing Playwright browser launch...');
  console.log('   ⚠ If this hangs for more than 30 seconds, press Ctrl+C');
  console.log('   See PLAYWRIGHT_WINDOWS_FIX.md for Windows-specific solutions\n');
  
  let browser;
  try {
    // On Windows, try with explicit args to avoid hanging
    const launchOptions: any = { 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    };
    
    console.log('   Launching browser (timeout: 30s)...');
    const startTime = Date.now();
    
    const launchPromise = chromium.launch(launchOptions);
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        reject(new Error(`TIMEOUT: Browser launch took ${elapsed}s. On Windows, this is often caused by antivirus/Windows Defender blocking Playwright. See PLAYWRIGHT_WINDOWS_FIX.md`));
      }, 30000)
    );
    
    browser = await Promise.race([launchPromise, timeoutPromise]) as any;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`   ✓ Browser launched successfully (took ${elapsed}s)\n`);
  } catch (error: any) {
    console.error('\n   ✗ Failed to launch browser');
    if (error.message.includes('TIMEOUT')) {
      console.error('\n   ⚠ Browser launch timed out after 30 seconds.');
      console.error('   This is a common Windows issue. Possible causes:');
      console.error('   1. Windows Defender / Antivirus blocking Playwright');
      console.error('   2. Permission issues');
      console.error('   3. Firewall blocking browser launch');
      console.error('\n   Solutions:');
      console.error('   - Add exception in Windows Defender for:');
      console.error('     C:\\Users\\antho\\AppData\\Local\\ms-playwright\\');
      console.error('   - Try running terminal as Administrator');
      console.error('   - See PLAYWRIGHT_WINDOWS_FIX.md for more options\n');
    } else if (error.message.includes('Executable doesn\'t exist') || 
               error.message.includes('ENOENT') ||
               error.message.includes('browser')) {
      console.error('\n   ⚠ Playwright browsers are not installed.');
      console.error('   Run: bunx playwright install chromium\n');
    } else {
      console.error('   Error:', error.message);
    }
    process.exit(1);
  }

  // Test scraping
  console.log('2. Testing RentCast scrape...');
  const sqft = SQFT_BY_BEDROOM[bedroomCount];
  const url = `https://app.rentcast.io/app?address=${zipCode},%20&type=single-family&bedrooms=${bedroomCount}&area=${sqft}`;
  console.log(`   URL: ${url}\n`);

  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('.card-body', { timeout: 10000 });
    const html = await page.content();
    console.log('   ✓ Page loaded successfully\n');

    // Test parsing
    console.log('3. Testing HTML parsing...');
    const estimatedRentMatch = html.match(/display-3[^>]*>\s*\$?\s*([\d,]+)/i);
    if (estimatedRentMatch) {
      const rent = parseFloat(estimatedRentMatch[1].replace(/,/g, ''));
      console.log(`   ✓ Found estimated rent: $${rent.toLocaleString()}/mo\n`);
    } else {
      console.log('   ⚠ Could not find estimated rent in HTML');
      console.log('   HTML snippet (first 500 chars):');
      console.log('   ' + html.slice(0, 500).replace(/\n/g, ' ') + '...\n');
    }

    // Check for rate limit indicators
    if (html.includes('rate limit') || html.includes('429') || html.includes('too many requests')) {
      console.log('   ⚠ Rate limit detected in response\n');
    }

    console.log('=== Test Complete ===\n');
  } catch (error: any) {
    console.error('   ✗ Scraping failed:', error.message);
    if (error.message.includes('timeout')) {
      console.error('   This might indicate a rate limit or network issue.\n');
    }
  } finally {
    await page.close();
    await browser.close();
  }

  // Test database connection
  console.log('4. Testing database connection...');
  if (!process.env.POSTGRES_URL) {
    console.error('   ✗ POSTGRES_URL not set\n');
    process.exit(1);
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  try {
    await execute('SELECT 1');
    console.log('   ✓ Database connection successful\n');
  } catch (error: any) {
    console.error('   ✗ Database connection failed:', error.message);
    console.error('   Check your POSTGRES_URL environment variable\n');
    process.exit(1);
  }

  // Test schema
  console.log('5. Testing database schema...');
  try {
    await execute('SELECT COUNT(*) FROM rentcast_market_rents LIMIT 1');
    await execute('SELECT COUNT(*) FROM rentcast_scraping_state LIMIT 1');
    console.log('   ✓ Schema tables exist\n');
  } catch (error: any) {
    console.error('   ✗ Schema tables missing:', error.message);
    console.error('   Run: bun scripts/scrape-rentcast.ts (it will create schema automatically)\n');
    process.exit(1);
  }

  console.log('=== All Tests Passed ===\n');
  console.log('You can now run the scraper:');
  console.log('  bun run scrape:rentcast --limit 10\n');
}

const args = process.argv.slice(2);
const zipIndex = args.indexOf('--zip');
const bedroomIndex = args.indexOf('--bedroom');

const zipCode = zipIndex >= 0 && args[zipIndex + 1] ? args[zipIndex + 1] : '98101';
const bedroomCount = bedroomIndex >= 0 && args[bedroomIndex + 1] 
  ? parseInt(args[bedroomIndex + 1], 10) 
  : 3;

testScrape(zipCode, bedroomCount).catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
