#!/usr/bin/env bun

/**
 * Report on ZIP codes with incomplete ZHVI data (missing any 1-4BR values)
 *
 * Usage:
 *   bun scripts/report-incomplete-zhvi-zips.ts
 *   bun scripts/report-incomplete-zhvi-zips.ts --list-incomplete
 *   bun scripts/report-incomplete-zhvi-zips.ts --state CA
 *   bun scripts/report-incomplete-zhvi-zips.ts --min-bedrooms 2
 */

import { sql } from "@vercel/postgres";
import { config } from "dotenv";
import { configureDatabase } from "../lib/db";

config();

if (process.env.POSTGRES_URL) {
  configureDatabase({ connectionString: process.env.POSTGRES_URL });
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let listIncomplete = false;
  let stateFilter: string | null = null;
  let minBedrooms = 1; // Minimum number of bedroom counts required

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--list-incomplete") {
      listIncomplete = true;
    } else if (a === "--state" && args[i + 1]) {
      stateFilter = args[i + 1].trim().toUpperCase();
      i++;
    } else if (a === "--min-bedrooms" && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 4) {
        minBedrooms = n;
      }
      i++;
    }
  }

  return { listIncomplete, stateFilter, minBedrooms };
}

async function reportIncompleteZips() {
  const { listIncomplete, stateFilter, minBedrooms } = parseArgs(process.argv);

  console.log("\n=== ZHVI Data Completeness Report ===\n");

  // Get the latest month
  const latestMonthRes = await sql`
    SELECT MAX(month) as latest_month
    FROM zhvi_zip_bedroom_monthly
    LIMIT 1
  `;
  const latestMonth = latestMonthRes.rows[0]?.latest_month || null;

  if (!latestMonth) {
    console.log("❌ No ZHVI data found in database.");
    return;
  }

  console.log(`Using latest month: ${latestMonth}\n`);

  // Build query to get all ZIPs with their bedroom count coverage
  let queryText = `
    WITH latest_zhvi AS (
      SELECT DISTINCT ON (zip_code, bedroom_count)
        zip_code,
        bedroom_count,
        zhvi,
        state_code
      FROM zhvi_zip_bedroom_monthly
      WHERE month = $1
        AND bedroom_count BETWEEN 1 AND 4
      ORDER BY zip_code, bedroom_count, month DESC
    ),
    zip_coverage AS (
      SELECT 
        zip_code,
        MAX(state_code) as state_code,
        COUNT(CASE WHEN bedroom_count = 1 AND zhvi IS NOT NULL THEN 1 END) as has_1br,
        COUNT(CASE WHEN bedroom_count = 2 AND zhvi IS NOT NULL THEN 1 END) as has_2br,
        COUNT(CASE WHEN bedroom_count = 3 AND zhvi IS NOT NULL THEN 1 END) as has_3br,
        COUNT(CASE WHEN bedroom_count = 4 AND zhvi IS NOT NULL THEN 1 END) as has_4br,
        COUNT(*) as total_bedrooms
      FROM latest_zhvi
      GROUP BY zip_code
    )
    SELECT 
      zip_code,
      state_code,
      has_1br,
      has_2br,
      has_3br,
      has_4br,
      total_bedrooms,
      (has_1br + has_2br + has_3br + has_4br) as complete_count
    FROM zip_coverage
  `;

  const params: any[] = [latestMonth];

  if (stateFilter) {
    queryText += ` WHERE state_code = $${params.length + 1}`;
    params.push(stateFilter);
  }

  queryText += ` ORDER BY zip_code`;

  const result = await sql.query(queryText, params);

  const totalZips = result.rows.length;
  let completeZips = 0; // Has all 4 bedroom counts
  let incompleteZips = 0; // Missing at least one
  const byMissingCount: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const incompleteList: any[] = [];

  for (const row of result.rows) {
    const completeCount = Number(row.complete_count);
    const totalBedrooms = Number(row.total_bedrooms);
    const missingCount = 4 - completeCount;

    if (completeCount === 4) {
      completeZips++;
    } else {
      incompleteZips++;
      if (completeCount >= minBedrooms) {
        incompleteList.push({
          zipCode: row.zip_code,
          stateCode: row.state_code || "N/A",
          has1BR: Number(row.has_1br) > 0,
          has2BR: Number(row.has_2br) > 0,
          has3BR: Number(row.has_3br) > 0,
          has4BR: Number(row.has_4br) > 0,
          completeCount,
          missingCount,
        });
      }
      byMissingCount[missingCount] = (byMissingCount[missingCount] || 0) + 1;
    }
  }

  // Print summary statistics
  console.log("📊 Summary Statistics");
  console.log("─".repeat(50));
  console.log(`Total ZIP codes: ${totalZips.toLocaleString()}`);
  console.log(
    `Complete (all 4BR): ${completeZips.toLocaleString()} (${(
      (completeZips / totalZips) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `Incomplete (missing ≥1BR): ${incompleteZips.toLocaleString()} (${(
      (incompleteZips / totalZips) *
      100
    ).toFixed(1)}%)`
  );
  console.log("");

  // Breakdown by missing count
  console.log("📉 Breakdown by Missing Bedroom Counts");
  console.log("─".repeat(50));
  for (let i = 1; i <= 4; i++) {
    const count = byMissingCount[i] || 0;
    if (count > 0) {
      console.log(
        `Missing ${i} bedroom count(s): ${count.toLocaleString()} ZIPs`
      );
    }
  }
  console.log("");

  // Breakdown by which bedroom counts are missing
  const missing1BR = incompleteList.filter((z) => !z.has1BR).length;
  const missing2BR = incompleteList.filter((z) => !z.has2BR).length;
  const missing3BR = incompleteList.filter((z) => !z.has3BR).length;
  const missing4BR = incompleteList.filter((z) => !z.has4BR).length;

  console.log("📋 Missing Data by Bedroom Count");
  console.log("─".repeat(50));
  console.log(`Missing 1BR: ${missing1BR.toLocaleString()} ZIPs`);
  console.log(`Missing 2BR: ${missing2BR.toLocaleString()} ZIPs`);
  console.log(`Missing 3BR: ${missing3BR.toLocaleString()} ZIPs`);
  console.log(`Missing 4BR: ${missing4BR.toLocaleString()} ZIPs`);
  console.log("");

  // List incomplete ZIPs if requested
  if (listIncomplete && incompleteList.length > 0) {
    console.log(
      `📝 Incomplete ZIP Codes (showing first 100, use filters to see more)`
    );
    console.log("─".repeat(80));
    console.log(
      "ZIP Code".padEnd(12) +
        "State".padEnd(8) +
        "1BR".padEnd(6) +
        "2BR".padEnd(6) +
        "3BR".padEnd(6) +
        "4BR".padEnd(6) +
        "Complete"
    );
    console.log("─".repeat(80));

    const toShow = incompleteList.slice(0, 100);
    for (const zip of toShow) {
      const status = (has: boolean) => (has ? "✓" : "✗");
      console.log(
        zip.zipCode.padEnd(12) +
          (zip.stateCode || "N/A").padEnd(8) +
          status(zip.has1BR).padEnd(6) +
          status(zip.has2BR).padEnd(6) +
          status(zip.has3BR).padEnd(6) +
          status(zip.has4BR).padEnd(6) +
          `${zip.completeCount}/4`
      );
    }

    if (incompleteList.length > 100) {
      console.log(
        `\n... and ${(incompleteList.length - 100).toLocaleString()} more`
      );
    }
    console.log("");
  }

  // State breakdown if no state filter
  if (!stateFilter && incompleteList.length > 0) {
    console.log("🗺️  Top States by Incomplete ZIPs");
    console.log("─".repeat(50));
    const stateCounts: Record<string, number> = {};
    for (const zip of incompleteList) {
      const state = zip.stateCode || "UNKNOWN";
      stateCounts[state] = (stateCounts[state] || 0) + 1;
    }

    const sortedStates = Object.entries(stateCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [state, count] of sortedStates) {
      console.log(`${state}: ${count.toLocaleString()} incomplete ZIPs`);
    }
    console.log("");
  }

  console.log("✅ Report complete");
}

if (import.meta.main) {
  reportIncompleteZips()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("❌ Error:", e);
      process.exit(1);
    });
}
