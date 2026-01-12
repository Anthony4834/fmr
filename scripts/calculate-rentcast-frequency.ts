#!/usr/bin/env bun

/**
 * Calculate RentCast Scraping Frequency
 * 
 * Calculates the total number of US zip codes and determines
 * the optimal request frequency to complete scraping in 1 year.
 * 
 * Usage:
 *   bun scripts/calculate-rentcast-frequency.ts
 */

import { config } from 'dotenv';
import { configureDatabase, query } from '../lib/db';

config();

async function main() {
  console.log('\n=== RentCast Scraping Frequency Calculator ===\n');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  // Get total US zip codes (excluding territories)
  const zipResult = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT zip_code) as count 
     FROM zip_county_mapping 
     WHERE state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')`
  );
  const totalZips = parseInt(zipResult[0]?.count || '0');

  // Get already scraped counts by bedroom
  const scrapedResult = await query<{ bedroom_count: number; count: string }>(
    `SELECT bedroom_count, COUNT(*) as count 
     FROM rentcast_market_rents 
     GROUP BY bedroom_count 
     ORDER BY bedroom_count`
  );

  const scrapedByBedroom = new Map<number, number>();
  scrapedResult.forEach((row) => {
    scrapedByBedroom.set(row.bedroom_count, parseInt(row.count || '0'));
  });

  // Calculate totals
  const bedroomSizes = [0, 1, 2, 3, 4];
  const totalRequests = totalZips * bedroomSizes.length;
  
  let totalScraped = 0;
  bedroomSizes.forEach((br) => {
    totalScraped += scrapedByBedroom.get(br) || 0;
  });

  const remainingRequests = totalRequests - totalScraped;

  // Calculate request frequency for 1-year completion
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const intervalMs = Math.floor(oneYearMs / totalRequests);
  const intervalSeconds = intervalMs / 1000;
  const intervalMinutes = intervalSeconds / 60;

  // Calculate time to completion at current rate
  const requestsPerDay = (24 * 60 * 60 * 1000) / intervalMs;
  const daysToComplete = remainingRequests / requestsPerDay;

  console.log(`Total US Zip Codes: ${totalZips.toLocaleString()}`);
  console.log(`Bedroom Sizes: ${bedroomSizes.join(', ')}`);
  console.log(`Total Requests Needed: ${totalRequests.toLocaleString()} (${totalZips.toLocaleString()} zips × ${bedroomSizes.length} BR sizes)\n`);

  console.log('Scraping Progress by Bedroom Size:');
  bedroomSizes.forEach((br) => {
    const scraped = scrapedByBedroom.get(br) || 0;
    const percentage = totalZips > 0 ? ((scraped / totalZips) * 100).toFixed(1) : '0.0';
    console.log(`  ${br}BR: ${scraped.toLocaleString()} / ${totalZips.toLocaleString()} (${percentage}%)`);
  });

  console.log(`\nTotal Scraped: ${totalScraped.toLocaleString()}`);
  console.log(`Remaining: ${remainingRequests.toLocaleString()}\n`);

  console.log('Request Frequency (for 1-year completion):');
  console.log(`  Interval: ${intervalMs.toLocaleString()}ms (${intervalSeconds.toFixed(1)}s / ${intervalMinutes.toFixed(2)}min)`);
  console.log(`  Requests per day: ${requestsPerDay.toFixed(1)}`);
  console.log(`  Requests per hour: ${(requestsPerDay / 24).toFixed(1)}`);
  console.log(`  Requests per minute: ${(requestsPerDay / 24 / 60).toFixed(2)}\n`);

  console.log('Time Estimates:');
  console.log(`  Days to complete: ${daysToComplete.toFixed(1)}`);
  console.log(`  Weeks to complete: ${(daysToComplete / 7).toFixed(1)}`);
  console.log(`  Months to complete: ${(daysToComplete / 30).toFixed(1)}`);
  console.log(`  Years to complete: ${(daysToComplete / 365).toFixed(2)}\n`);

  // Get scraping state
  const stateResult = await query<{
    total_requests_made: number;
    total_successful_scrapes: number;
    total_rate_limits: number;
    average_request_interval_ms: number;
    rate_limit_resume_at: Date | null;
  }>(
    `SELECT 
      total_requests_made,
      total_successful_scrapes,
      total_rate_limits,
      average_request_interval_ms,
      rate_limit_resume_at
     FROM rentcast_scraping_state 
     ORDER BY id LIMIT 1`
  );

  if (stateResult.length > 0) {
    const state = stateResult[0];
    console.log('Current Scraping State:');
    console.log(`  Total requests made: ${state.total_requests_made.toLocaleString()}`);
    console.log(`  Successful scrapes: ${state.total_successful_scrapes.toLocaleString()}`);
    console.log(`  Rate limits hit: ${state.total_rate_limits.toLocaleString()}`);
    if (state.average_request_interval_ms > 0) {
      console.log(`  Average interval: ${state.average_request_interval_ms.toLocaleString()}ms (${(state.average_request_interval_ms / 1000).toFixed(1)}s)`);
    }
    if (state.rate_limit_resume_at) {
      const resumeAt = new Date(state.rate_limit_resume_at);
      const now = new Date();
      if (resumeAt > now) {
        const waitMs = resumeAt.getTime() - now.getTime();
        console.log(`  Rate limit active: Resuming in ${Math.ceil(waitMs / 1000)}s`);
      } else {
        console.log(`  Rate limit expired: Ready to resume`);
      }
    }
  }

  console.log('');
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
