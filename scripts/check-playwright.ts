#!/usr/bin/env bun

/**
 * Quick check if Playwright browsers are installed
 */

import { chromium } from 'playwright';
import { existsSync } from 'fs';
import { join } from 'path';

const browserPath = join(
  process.env.LOCALAPPDATA || process.env.HOME || '',
  'ms-playwright',
  'chromium-1200'
);

console.log('\n=== Playwright Browser Check ===\n');
console.log('Expected browser path:', browserPath);
console.log('Path exists:', existsSync(browserPath));

console.log('\nAttempting to launch browser...');
console.log('(This will timeout after 10 seconds if browsers are not installed)\n');

try {
  const browser = await Promise.race([
    chromium.launch({ headless: true }),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT')), 10000)
    )
  ]) as any;
  
  console.log('✓ Browser launched successfully!');
  await browser.close();
  console.log('✓ Playwright is working correctly.\n');
} catch (error: any) {
  if (error.message === 'TIMEOUT') {
    console.error('✗ Browser launch timed out.');
    console.error('\nBrowsers are likely not installed.');
    console.error('Run: bunx playwright install chromium\n');
  } else {
    console.error('✗ Error:', error.message);
    console.error('\nTry: bunx playwright install chromium\n');
  }
  process.exit(1);
}
