#!/usr/bin/env bun

/**
 * Check what ZHVI data exists for a specific ZIP code
 * Usage: bun scripts/check-zip-zhvi-data.ts 39175
 */

import { sql } from "@vercel/postgres";
import { config } from "dotenv";
import { configureDatabase } from "../lib/db";

config();

if (process.env.POSTGRES_URL) {
  configureDatabase({ connectionString: process.env.POSTGRES_URL });
}

async function checkZipData(zipCode: string) {
  console.log(`\nChecking ZHVI data for ZIP ${zipCode}...\n`);

  // Check all months and bedroom counts
  const allData = await sql.query(
    `
    SELECT 
      bedroom_count,
      month,
      zhvi,
      state_code,
      city_name,
      county_name,
      updated_at
    FROM zhvi_zip_bedroom_monthly
    WHERE zip_code = $1
    ORDER BY bedroom_count, month DESC
    `,
    [zipCode]
  );

  if (allData.rows.length === 0) {
    console.log(`❌ No ZHVI data found for ZIP ${zipCode}`);
    return;
  }

  console.log(`Found ${allData.rows.length} records:\n`);

  // Group by bedroom count
  const byBedroom: Record<number, any[]> = {};
  for (const row of allData.rows) {
    const br = Number(row.bedroom_count);
    if (!byBedroom[br]) {
      byBedroom[br] = [];
    }
    byBedroom[br].push(row);
  }

  // Show latest month for each bedroom count
  const latestMonth = allData.rows.reduce((latest, row) => {
    const month = new Date(row.month);
    return month > latest ? month : latest;
  }, new Date(0));

  console.log(
    `Latest month in database: ${latestMonth.toISOString().slice(0, 7)}\n`
  );

  for (let br = 1; br <= 5; br++) {
    const records = byBedroom[br] || [];
    if (records.length === 0) {
      console.log(`${br}BR: ❌ NO DATA`);
    } else {
      const latest = records[0];
      const month = new Date(latest.month);
      const isLatestMonth = month.getTime() === latestMonth.getTime();
      const marker = isLatestMonth ? "✅" : "⚠️";
      console.log(
        `${br}BR: ${marker} ${
          latest.zhvi ? `$${Number(latest.zhvi).toLocaleString()}` : "NULL"
        } (month: ${latest.month}${isLatestMonth ? " - LATEST" : ""})`
      );
      if (records.length > 1) {
        console.log(`     (${records.length} total months of data)`);
      }
    }
  }

  // Check if data exists in source files
  console.log(`\n--- Checking source files ---\n`);
  const urlBase = "https://files.zillowstatic.com/research/public_csvs/zhvi";

  for (let br = 1; br <= 4; br++) {
    const urls = [
      `${urlBase}/Zip_zhvi_bdrmcnt_${br}_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv`,
      `${urlBase}/Zip_zhvi_bdrmcnt_${br}.csv`,
    ];

    let found = false;
    let sourceUrl = "";
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            Accept: "text/csv,*/*",
            "User-Agent": "fmr-search (check-zip-zhvi-data)",
          },
        });
        if (res.ok) {
          const text = await res.text();
          const lines = text.split("\n").filter((l) => l.trim());

          // Find header
          const headerLine = lines[0];
          if (!headerLine) continue;

          // Parse header to find RegionName column
          const headerCols = headerLine
            .split(",")
            .map((c) => c.trim().replace(/"/g, ""));
          const regionIdx = headerCols.findIndex(
            (c) => c === "RegionName" || c === "Region Name"
          );

          if (regionIdx === -1) {
            console.log(`${br}BR: ⚠️  Header format unexpected`);
            continue;
          }

          // Find ZIP code row
          const zipLine = lines.find((line) => {
            const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
            return cols[regionIdx] === zipCode;
          });

          if (zipLine) {
            const cols = zipLine
              .split(",")
              .map((c) => c.trim().replace(/"/g, ""));

            // Find latest date column
            const dateCols = headerCols
              .map((h, i) => ({ name: h, idx: i }))
              .filter(({ name }) => /^\d{4}-\d{2}-\d{2}$/.test(name));

            if (dateCols.length > 0) {
              const latestDateCol = dateCols
                .sort((a, b) => a.name.localeCompare(b.name))
                .pop()!;
              const value = cols[latestDateCol.idx]?.trim();

              if (
                value &&
                value !== "" &&
                !isNaN(Number(value)) &&
                Number(value) > 0
              ) {
                console.log(
                  `${br}BR: ✅ EXISTS in source - $${Number(
                    value
                  ).toLocaleString()} (${latestDateCol.name})`
                );
                console.log(`     URL: ${url}`);
                found = true;
                sourceUrl = url;
                break;
              } else if (
                value === "" ||
                value === null ||
                value === undefined
              ) {
                console.log(
                  `${br}BR: ⚠️  ZIP found but value is empty/null in source (${latestDateCol.name})`
                );
                console.log(`     URL: ${url}`);
                found = true; // ZIP exists but no value
                break;
              }
            }
          } else {
            // ZIP not in this file at all
            console.log(`${br}BR: ❌ ZIP ${zipCode} not found in source file`);
            console.log(`     URL: ${url}`);
          }
        }
      } catch (e: any) {
        console.log(`${br}BR: ❌ Error fetching ${url}: ${e.message}`);
      }
    }
    if (!found && !sourceUrl) {
      console.log(`${br}BR: ❌ Could not check source files (all URLs failed)`);
    }
  }
}

const zipCode = process.argv[2];
if (!zipCode) {
  console.error("Usage: bun scripts/check-zip-zhvi-data.ts <zip-code>");
  process.exit(1);
}

checkZipData(zipCode)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });
