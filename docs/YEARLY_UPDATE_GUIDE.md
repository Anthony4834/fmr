# Yearly Update Guide for FMR/SAFMR Data

This guide explains how to update the FMR and SAFMR data annually, including the required SAFMR areas list and the ZIP code lookup table.

## Overview

Each year, HUD publishes new Fair Market Rent (FMR) and Small Area Fair Market Rent (SAFMR) data. You need to:

1. Update the FMR data (county/metropolitan area level)
2. Update the SAFMR data (ZIP code level)
3. Update the required SAFMR areas list (if it changes)
4. Repopulate the required SAFMR ZIPs lookup table

## Step 1: Update Required SAFMR Areas List

### Data Source

The list of required SAFMR metropolitan areas comes from HUD's official designation. Check these sources:

- **HUD User Portal**: https://www.huduser.gov/portal/datasets/fmr.html
- **Small Area FMR Designations**: Look for "Designated Small Area Fair Market Rent (SAFMR) Areas" dataset
- **Federal Register Notices**: Search for SAFMR designation notices

### Update Process

1. **Download the latest required SAFMR areas list** from HUD
2. **Update `app/required-safmr-areas.txt`** with the new list
   - The file should contain one area per line
   - Format: `Area Name, State MSA` or `Area Name, State HUD Metro FMR Area`
   - Example: `Atlanta-Sandy Springs-Roswell, GA HUD Metro FMR Area`

3. **Verify the format** - the script expects areas ending with "MSA" or "HUD Metro FMR Area"

### Current List (2025 Implementation)

The current list contains 65 mandatory SAFMR metropolitan areas designated by HUD. This includes:
- Original 24 areas from the 2016 SAFMR Final Rule
- Additional 41 areas designated in 2023 notice

**Note**: This list is relatively stable but can change. Always verify with HUD's official sources.

## Step 2: Update FMR Data

### Data Source

- **HUD User Portal**: https://www.huduser.gov/portal/datasets/fmr.html
- **Direct URL Pattern**: `https://www.huduser.gov/portal/datasets/fmr/fmr_YYYY.xlsx` (or CSV)
- **Publication Date**: Typically in the fall for the following year (e.g., October 2024 for FY 2025)

### Update Process

```bash
# Download the FMR data file (e.g., fmr_2026.xlsx or fmr_2026.csv)
# Save it to your data directory

# Ingest the FMR data
bun run ingest:fmr -- --year 2026 --file ./data/fmr-2026.csv

# Or use the default URL
bun run ingest:fmr -- --year 2026 --url https://www.huduser.gov/portal/datasets/fmr/fmr_2026.csv
```

**Note**: The script will replace existing FMR data for the specified year.

## Step 3: Update SAFMR Data

### Data Source

- **HUD User Portal**: https://www.huduser.gov/portal/datasets/fmr/smallarea.html
- **Direct URL Pattern**: `https://www.huduser.gov/portal/datasets/fmr/smallarea/safmr_YYYY.csv`
- **Publication Date**: Typically published alongside FMR data

### Update Process

```bash
# Download the SAFMR data file (e.g., safmr_2026.csv)
# Save it to your data directory

# Ingest the SAFMR data
bun run ingest:safmr -- --year 2026 --file ./data/safmr-2026.csv

# Or use the default URL
bun run ingest:safmr -- --year 2026 --url https://www.huduser.gov/portal/datasets/fmr/smallarea/safmr_2026.csv
```

**Note**: The script will replace existing SAFMR data for the specified year.

## Step 4: Repopulate Required SAFMR ZIPs Lookup Table

After updating the FMR data and the required SAFMR areas list, you need to repopulate the lookup table that maps ZIP codes to required SAFMR areas.

### Update Process

```bash
# Repopulate the required SAFMR ZIPs table for the current year
bun run populate:safmr-zips

# Or specify a year explicitly
bun run populate:safmr-zips -- 2026
```

**What this does:**
- Matches ZIP codes to the 65 required SAFMR metropolitan areas
- Populates the `required_safmr_zips` table with ZIP codes that should use SAFMR
- Creates the table and indexes if they don't exist
- Clears existing data for the specified year before repopulating

**Note**: This script uses the FMR data to determine which ZIP codes belong to which metropolitan areas, so make sure Step 2 (FMR data update) is completed first.

## Step 5: Regenerate Test Coverage Views

After all data updates, regenerate the test coverage views to ensure they reflect the latest data:

```bash
bun run create-test-views
```

This will:
- Update all test coverage views with the latest data
- Show statistics about data coverage
- Ensure the views use the updated required SAFMR ZIPs table

## Step 6: Verify the Updates

### Check Data Counts

```sql
-- Check FMR data count
SELECT year, COUNT(*) as count FROM fmr_data WHERE year = 2026 GROUP BY year;

-- Check SAFMR data count
SELECT year, COUNT(*) as count FROM safmr_data WHERE year = 2026 GROUP BY year;

-- Check required SAFMR ZIPs count
SELECT year, COUNT(*) as count FROM required_safmr_zips WHERE year = 2026 GROUP BY year;
```

### Test a Sample Query

Test that the system correctly identifies SAFMR vs FMR usage:

```sql
-- Check a ZIP in a required SAFMR area (e.g., Atlanta)
SELECT zcm.zip_code, zcm.county_name, zcm.state_code, zwf.fmr_source, zwf.has_safmr_data_but_uses_fmr
FROM zip_county_mapping zcm
JOIN zips_without_fmr zwf ON zcm.zip_code = zwf.zip_code
WHERE zcm.zip_code LIKE '303%'  -- Atlanta area ZIPs
LIMIT 10;
```

## Complete Yearly Update Checklist

- [ ] Check HUD website for new FMR/SAFMR data publication
- [ ] Download latest FMR data file
- [ ] Download latest SAFMR data file
- [ ] Check for updates to required SAFMR areas list
- [ ] Update `app/required-safmr-areas.txt` if needed
- [ ] Run `bun run ingest:fmr -- --year YYYY`
- [ ] Run `bun run ingest:safmr -- --year YYYY`
- [ ] Run `bun run populate:safmr-zips -- YYYY`
- [ ] Run `bun run create-test-views`
- [ ] Verify data counts and test sample queries
- [ ] Check test coverage page for any issues

## Timing

**Typical Schedule:**
- **Fall (September-October)**: HUD publishes FMR/SAFMR data for the following year
- **January**: New FMR/SAFMR rates become effective
- **Update Window**: Update data in October-November before the new year

**Example Timeline:**
- October 2024: HUD publishes FY 2025 FMR/SAFMR data
- November 2024: Update your database with 2025 data
- January 2025: New rates are effective

## Troubleshooting

### Required SAFMR Areas Not Found

If the populate script finds 0 matching areas:
- Verify the area names in `required-safmr-areas.txt` match the format in FMR data
- Check that FMR data has been ingested for the target year
- Review the matching logic in the populate script

### ZIP Codes Not Matching

If ZIP codes aren't being found for required SAFMR areas:
- Ensure ZIP-county mappings are up to date
- Verify FMR data includes the metropolitan areas you're looking for
- Check that county names match between ZIP mappings and FMR data

### View Creation Hanging

If `create-test-views` hangs:
- Check that the `required_safmr_zips` table exists and has data
- Verify indexes are created on the table
- Try running the populate script first to ensure the table is populated

## Additional Resources

- **HUD FMR Documentation**: https://www.huduser.gov/portal/datasets/fmr.html
- **SAFMR Documentation**: https://www.huduser.gov/portal/datasets/fmr/smallarea.html
- **Federal Register**: https://www.federalregister.gov/ (search for "Small Area Fair Market Rent")

## Quick Reference Commands

```bash
# Full yearly update sequence
bun run ingest:fmr -- --year 2026
bun run ingest:safmr -- --year 2026
bun run populate:safmr-zips -- 2026
bun run create-test-views

# Or use the update script (if available)
bun run update:current-year
```







