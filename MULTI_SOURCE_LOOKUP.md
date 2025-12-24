# Multi-Source ZIP-County Lookup Strategy

Since Row Zero and other free bulk sources don't have complete coverage, use this multi-source approach to maximize coverage.

## Strategy Overview

1. **Bulk CSV Downloads** - Get what's available from free sources
2. **Database Check** - Use existing mappings
3. **API Lookups** - Fill in remaining gaps
4. **Merge & Import** - Combine all sources

## Step-by-Step Process

### Step 1: Download Multiple Bulk Sources

Try multiple free sources to maximize coverage:

```bash
# Create data directory
mkdir -p data

# Download from Row Zero (if you haven't already)
# Visit: https://rowzero.com/datasets/zip-code-to-county-fips-codes
# Save as: data/rowzero-zip-county.csv

# Download from Gigasheet (alternative source)
# Visit: https://www.gigasheet.com/sample-data/zip-code-to-county-spreadsheet
# Export as CSV, save as: data/gigasheet-zip-county.csv

# Download from Census Bureau (official source)
# Visit: https://www.census.gov/data/data-tools/gazetteer.html
# Look for ZCTA to County relationship files
# Save as: data/census-zip-county.csv
```

### Step 2: Merge All Bulk Sources

Use the merge script to combine multiple CSV files:

```bash
# Merge Row Zero data
bun scripts/merge-zip-sources.ts \
  --missing-file app/zips-missing-counties.txt \
  --bulk-csv data/rowzero-zip-county.csv \
  --output data/merged-step1.csv

# If you have multiple sources, merge them sequentially
# (The script will deduplicate)
```

### Step 3: Check What's Still Missing

The merge script will show you:
- How many ZIPs were found in bulk CSV
- How many are still missing
- A list of ZIPs that still need lookup

### Step 4: API Lookup for Remaining ZIPs

For ZIPs not found in bulk sources, use API lookups:

```bash
# Option A: Census API (free, slower)
bun scripts/lookup-zip-counties.ts \
  --file app/zips-missing-counties.txt \
  --api census \
  --delay 200

# Option B: SmartyStreets (faster, requires API key)
bun scripts/lookup-zip-counties.ts \
  --file app/zips-missing-counties.txt \
  --api smartystreets \
  --auth-id YOUR_AUTH_ID \
  --auth-token YOUR_AUTH_TOKEN
```

### Step 5: Combine All Results

Merge bulk CSV results with API lookup results:

```bash
# The API lookup script outputs CSV files
# Combine them manually or use a simple script:

# If you have multiple CSV files to merge:
cat data/merged-step1.csv data/zip-county-lookup-results-*.csv | \
  sort -u > data/final-merged.csv

# Or import them separately (they'll deduplicate on import)
```

### Step 6: Import Final Results

```bash
bun run ingest:zip-county -- --file data/final-merged.csv
```

## Alternative: Try Multiple Free Sources

### Source 1: Row Zero
- URL: https://rowzero.com/datasets/zip-code-to-county-fips-codes
- Coverage: Good, but not complete
- Format: CSV

### Source 2: Gigasheet
- URL: https://www.gigasheet.com/sample-data/zip-code-to-county-spreadsheet
- Coverage: May have different ZIPs than Row Zero
- Format: CSV export

### Source 3: Census Bureau Gazetteer
- URL: https://www.census.gov/data/data-tools/gazetteer.html
- Coverage: Official, but may need processing
- Format: Various formats

### Source 4: SimpleMaps (Free Sample)
- URL: https://simplemaps.com/data/us-zips
- Coverage: Limited free sample
- Format: CSV

### Source 5: GitHub Repositories
Search GitHub for "zip code county mapping" - there are several community-maintained datasets:
- Some are more complete than commercial sources
- Check licenses before using

## Recommended Workflow

```bash
# 1. Download from Row Zero
# (Manual download, save as data/rowzero.csv)

# 2. Merge with your missing ZIPs
bun scripts/merge-zip-sources.ts \
  --missing-file app/zips-missing-counties.txt \
  --bulk-csv data/rowzero.csv \
  --output data/merged.csv

# 3. Check the report to see how many are still missing
cat data/merged-report.txt

# 4. For remaining ZIPs, use API lookup
# Create a file with just the still-missing ZIPs
# (extract from the report or use grep)

# 5. Run API lookup on remaining ZIPs
bun scripts/lookup-zip-counties.ts \
  --file remaining-zips.txt \
  --api census \
  --delay 200

# 6. Combine and import
bun run ingest:zip-county -- --file data/merged.csv
bun run ingest:zip-county -- --file zip-county-lookup-results-*.csv
```

## Expected Coverage

Based on typical free sources:
- **Row Zero**: ~80-85% coverage
- **Gigasheet**: ~75-80% coverage (may have different ZIPs)
- **Combined bulk sources**: ~85-90% coverage
- **API lookups**: Can fill remaining 10-15%

## Cost Estimate

For 5,265 missing ZIPs:
- **Bulk CSV**: Free (from multiple sources)
- **Census API**: Free, but takes ~17 minutes
- **SmartyStreets**: Free tier (250/month), then $0.0025 per lookup
  - First 250: Free
  - Remaining ~5,015: ~$12.50

## Tips

1. **Start with bulk sources** - They're free and fast
2. **Combine multiple sources** - Each may have different ZIPs
3. **Use API for remainder** - Only lookup what's truly missing
4. **Check database first** - Script automatically skips existing mappings
5. **Import incrementally** - You can import multiple CSV files

## Troubleshooting

### "Still missing X ZIPs after bulk merge"

This is expected. Some ZIPs are:
- Very new (not in any database yet)
- PO Box only (no physical location)
- Invalid/obsolete codes
- Military/Diplomatic ZIPs (special handling)

Use API lookup for these, but expect some may never resolve.

### "API lookup is too slow"

- Use SmartyStreets for faster lookups (requires API key)
- Or process in smaller batches over time
- Or accept partial coverage (85-90% is often sufficient)

### "Multiple sources have conflicting data"

The merge script uses the first source found. For conflicts:
- Database mappings take precedence
- Then bulk CSV
- Then API lookups
- You can manually review conflicts if needed







