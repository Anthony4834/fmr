#!/usr/bin/env bun

/**
 * Delete investment scores for a specific year
 * 
 * Usage:
 *   bun scripts/delete-investment-scores.ts
 *   bun scripts/delete-investment-scores.ts --year 2026
 */

import { sql } from "@vercel/postgres";
import { config } from "dotenv";
import { configureDatabase } from "../lib/db";
import { getLatestFMRYear } from "../lib/queries";

config();

if (process.env.POSTGRES_URL) {
  configureDatabase({ connectionString: process.env.POSTGRES_URL });
}

async function deleteInvestmentScores() {
  const args = process.argv.slice(2);
  let year: number | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--year" && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 2020 && n <= 2030) {
        year = n;
      }
      i++;
    }
  }

  const targetYear = year || (await getLatestFMRYear());

  console.log(`\n=== Deleting Investment Scores for Year ${targetYear} ===\n`);

  // First, count how many records will be deleted
  const countResult = await sql.query(
    `SELECT COUNT(*) as count FROM investment_score WHERE fmr_year = $1`,
    [targetYear]
  );
  const count = parseInt(countResult.rows[0]?.count || "0", 10);

  if (count === 0) {
    console.log(`No investment scores found for year ${targetYear}. Nothing to delete.\n`);
    process.exit(0);
  }

  console.log(`Found ${count.toLocaleString()} investment score records for year ${targetYear}`);
  console.log("Deleting...\n");

  // Delete the records
  const deleteResult = await sql.query(
    `DELETE FROM investment_score WHERE fmr_year = $1`,
    [targetYear]
  );

  console.log(`✅ Deleted ${count.toLocaleString()} investment score records for year ${targetYear}\n`);
  process.exit(0);
}

deleteInvestmentScores().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
