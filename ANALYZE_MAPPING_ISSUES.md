# Analyzing ZIP County Mapping Issues

You have **15,000 ZIP codes** with county mapping issues. This guide helps you investigate and resolve them.

## Quick Analysis

Run the analysis script to get a breakdown:

```bash
bun scripts/analyze-zip-mapping-issues.ts
```

This will show you:
- Total issues breakdown (NO_MAPPING vs MULTIPLE_MAPPINGS)
- State/region patterns
- ZIP range analysis
- Coverage statistics

## Understanding the Issues

### 1. ZIPs Without Mapping (NO_MAPPING)

These are ZIP codes that exist in your `safmr_data` table but don't have any entry in `zip_county_mapping`.

**Possible causes:**
- ZIP-county mapping data source is incomplete
- Newer ZIP codes not included in mapping source
- Data quality issues in the mapping source

**Impact:**
- These ZIPs won't show county/state info in the dashboard
- Search results may be incomplete

### 2. ZIPs With Multiple Mappings (MULTIPLE_MAPPINGS)

These ZIP codes legitimately span multiple counties. This is **normal** - ZIP codes can cross county boundaries.

**This is expected behavior** - many ZIP codes serve areas that span multiple counties.

**Impact:**
- The system currently picks one county (first one alphabetically)
- May cause confusion in search results

## Investigation Steps

### Step 1: Run Analysis

```bash
bun scripts/analyze-zip-mapping-issues.ts
```

Review the output to understand:
- How many are NO_MAPPING vs MULTIPLE_MAPPINGS
- Which states/regions are most affected
- Patterns in ZIP code ranges

### Step 2: Export Sample Data

Export a sample for detailed review:

```bash
# Export all issues
bun scripts/export-mapping-issues.ts --limit 5000

# Export only NO_MAPPING issues
bun scripts/export-mapping-issues.ts --type NO_MAPPING --limit 5000

# Export only MULTIPLE_MAPPINGS issues
bun scripts/export-mapping-issues.ts --type MULTIPLE_MAPPINGS --limit 1000
```

### Step 3: Check Data Source Coverage

Verify your ZIP-county mapping data source:

```bash
# Check how many ZIPs are in your mapping table
bun -e "
import { config } from 'dotenv';
import { sql } from '@vercel/postgres';
config();
const result = await sql\`SELECT COUNT(DISTINCT zip_code) as count FROM zip_county_mapping\`;
console.log('ZIP codes in mapping table:', result.rows[0].count);
"
```

Compare this to:
- Total ZIPs in SAFMR data
- Expected ZIP code count (~42,000 active ZIP codes in US)

### Step 4: Review Data Source

Check `ZIP_COUNTY_DATA_SOURCES.md` for:
- What data source you used
- When it was last updated
- If there's a more complete source available

## Solutions

### For NO_MAPPING Issues

1. **Update ZIP-County Mapping Data**
   - Find a more complete data source
   - Re-run ingestion: `bun run ingest:zip-county -- --file <new-source.csv>`

2. **Verify ZIP Codes**
   - Some ZIPs in SAFMR data might be invalid/obsolete
   - Check if they're real, active ZIP codes

3. **Accept Some Missing Mappings**
   - If ZIPs are very new or rare, they may not have county data yet
   - Consider showing "Unknown County" instead of nothing

### For MULTIPLE_MAPPINGS Issues

1. **This is Normal**
   - ZIP codes can span multiple counties
   - The current behavior (picking first county) may be acceptable

2. **Improve Display Logic**
   - Show all counties: "ZIP 12345 spans County A, County B"
   - Let users pick which county to use
   - Use primary county based on population/area

3. **Use Primary County**
   - Some data sources include "primary county" designation
   - Update mapping to include this field

## Database Queries for Investigation

### Check specific ZIP codes

```sql
-- Check a specific ZIP
SELECT * FROM zip_county_mapping_issues WHERE zip_code = '12345';

-- See all counties for a ZIP
SELECT * FROM zip_county_mapping WHERE zip_code = '12345';
```

### Find patterns

```sql
-- ZIPs without mapping by first digit
SELECT 
  SUBSTRING(zip_code, 1, 1) as first_digit,
  COUNT(*) as count
FROM zip_county_mapping_issues
WHERE issue_type = 'NO_MAPPING'
GROUP BY first_digit
ORDER BY count DESC;

-- States with most multiple mappings
SELECT 
  SUBSTRING(counties, 1, 2) as state_code,
  COUNT(*) as zip_count
FROM zip_county_mapping_issues
WHERE issue_type = 'MULTIPLE_MAPPINGS'
GROUP BY state_code
ORDER BY zip_count DESC
LIMIT 10;
```

## Next Steps

1. ✅ Run analysis script
2. ✅ Export sample data
3. ✅ Review data source completeness
4. ✅ Decide on approach:
   - Update mapping data source?
   - Accept missing mappings?
   - Improve multiple mapping handling?

## UI View

You can also view these issues in the UI:
- Navigate to: `/test-coverage`
- Click "ZIP Mappings" tab
- Filter by issue type
- Review paginated results



