# ZIP Code to County Mapping Data Sources

This guide helps you find and download ZIP code to county mapping data for the `ingest-zip-county` script.

## Recommended Sources (Easiest to Use)

### Option 1: Row Zero (Recommended - Free CSV)

**Best for**: Quick download, clean CSV format

1. **Visit**: https://rowzero.com/datasets/zip-code-to-county-fips-codes
2. **Download**: Click the download button to get the CSV file
3. **Format**: CSV with columns like `zip`, `county`, `state`, `fips`
4. **Usage**:
   ```bash
   bun run ingest:zip-county -- --file ./data/zip-county-fips.csv
   ```

**Direct download link** (if available):
- Check the Row Zero page for direct CSV download
- Usually includes: ZIP code, County name, State, FIPS codes

### Option 2: Gigasheet (Free Spreadsheet)

**Best for**: Comprehensive data with additional fields

1. **Visit**: https://www.gigasheet.com/sample-data/zip-code-to-county-spreadsheet
2. **Download**: Export as CSV
3. **Format**: Includes ZIP, State, City, County, FIPS codes
4. **Usage**:
   ```bash
   bun run ingest:zip-county -- --file ./data/gigasheet-zip-county.csv
   ```

### Option 3: U.S. Census Bureau (Official Source)

**Best for**: Official government data, most authoritative

1. **Visit**: https://www.census.gov/geographies/mapping-files.html
2. **Search for**: "ZIP Code Tabulation Area" or "ZCTA to County"
3. **Alternative**: https://www.census.gov/data/data-tools/gazetteer.html
4. **Look for**: Gazetteer files or relationship files
5. **Format**: May require some parsing/transformation

**Note**: Census Bureau files may need column name adjustments in the script.

### Option 4: SimpleMaps (Commercial but has free sample)

**Best for**: Well-structured data

1. **Visit**: https://simplemaps.com/data/us-zips
2. **Download**: Free sample or purchase full dataset
3. **Format**: CSV with ZIP, City, State, County, etc.

## Quick Start: Using Row Zero

1. **Download the CSV**:
   ```bash
   # Create data directory
   mkdir -p data
   
   # Download from Row Zero (you'll need to visit the site and download manually)
   # Or use curl if they provide a direct link:
   # curl -o data/zip-county.csv <direct-download-url>
   ```

2. **Run the ingestion**:
   ```bash
   bun run ingest:zip-county -- --file ./data/zip-county.csv
   ```

## CSV Format Requirements

The script expects a CSV with these columns (case-insensitive, flexible naming):

**Required columns:**
- ZIP code: `zip`, `zip_code`, `zipcode`, `ZIP`
- County name: `county`, `county_name`, `COUNTY`
- State code: `state`, `state_code`, `STATE` (2-letter code)

**Optional columns:**
- State name: `state_name`, `STATE_NAME`
- County FIPS: `county_fips`, `fips`, `COUNTYFP`

**Example CSV format:**
```csv
zip,county,state,state_name,county_fips
10001,New York,NY,New York,36061
10002,New York,NY,New York,36061
90210,Beverly Hills,CA,California,06037
```

## Testing with Sample Data

If you want to test the script first, create a small sample CSV:

```bash
cat > data/test-zip-county.csv << 'EOF'
zip,county,state,state_name
10001,New York,NY,New York
10002,New York,NY,New York
90210,Beverly Hills,CA,California
EOF

# Test ingestion
bun run ingest:zip-county -- --file ./data/test-zip-county.csv
```

## Column Mapping

The script automatically maps these column name variations:

| Expected Field | Accepted Column Names |
|---------------|---------------------|
| ZIP Code | `zip`, `zip_code`, `zipcode`, `ZIP` |
| County | `county`, `county_name`, `COUNTY` |
| State Code | `state`, `state_code`, `STATE` |
| State Name | `state_name`, `STATE_NAME` |
| County FIPS | `county_fips`, `fips`, `COUNTYFP` |

## Troubleshooting

### "No ZIP-County records found"

- Check that your CSV has headers
- Verify column names match expected formats
- Ensure ZIP codes are 5 digits (script normalizes them)

### "Invalid records" warnings

- ZIP codes must be valid 5-digit codes
- State codes must be 2-letter codes
- County names cannot be empty

### Column mapping issues

If your CSV uses different column names, you can:
1. Rename columns in the CSV to match expected names
2. Modify the `parseZIPCountyCSV()` function in `scripts/ingest-zip-county.ts`

## Data Quality Notes

- **ZIP codes can span multiple counties**: The script handles this by creating separate records
- **Some ZIPs may not have county data**: These will be skipped
- **FIPS codes**: Optional but recommended for accuracy

## Recommended Workflow

1. **Download from Row Zero** (easiest):
   - Visit: https://rowzero.com/datasets/zip-code-to-county-fips-codes
   - Download CSV
   - Save to `data/zip-county.csv`

2. **Run ingestion**:
   ```bash
   bun run ingest:zip-county -- --file ./data/zip-county.csv
   ```

3. **Verify data**:
   ```bash
   # Check record count
   bun -e "
   import { config } from 'dotenv';
   import { sql } from '@vercel/postgres';
   config();
   const result = await sql\`SELECT COUNT(*) as count FROM zip_county_mapping\`;
   console.log('ZIP-County mappings:', result.rows[0].count);
   "
   ```

## Alternative: Direct URL Download

If a source provides a direct CSV URL, you can use:

```bash
bun run ingest:zip-county -- --url https://example.com/zip-county-data.csv
```

## Next Steps

After successfully ingesting ZIP-County data:
1. ✅ Verify tables were created
2. ✅ Check record counts
3. ✅ Proceed to FMR/SAFMR data ingestion


