# ZIP Code to Zillow Demand Data Mapping Analysis

**Analysis Date:** 2026-01-20  
**Source File:** `zips-without-demand-2026-1765851975147.csv`  
**Total ZIPs Without Demand Data:** 12,646

## Executive Summary

The analysis identified **8,352 ZIP codes** (66% of missing ZIPs) that can be easily mapped to Zillow demand data using county-level metro assignments. This is the largest and easiest opportunity to improve demand data coverage.

## Key Findings

### 1. ZIPs with ZORI Data but No Metro Name
- **Count:** 39 ZIPs
- **Issue:** These ZIPs have ZORI (rent) data but lack a `metro_name` field, preventing ZORDI (demand) mapping
- **Current Status:** None have CBSA mappings available
- **Opportunity:** Low (requires CBSA data ingestion first)

### 2. County-Level Mapping Opportunities ⭐ **BIGGEST OPPORTUNITY**
- **Count:** 8,352 ZIPs across 1,307 counties
- **Strategy:** Use metro assignments from other ZIPs in the same county
- **Logic:** If other ZIPs in a county have metro mappings, assign the same metro to missing ZIPs in that county

**Top 10 County Mapping Opportunities:**
1. **Suffolk, NY:** 55 missing ZIPs → New York-Newark-Jersey City, NY-NJ-PA (38 ZIPs already mapped)
2. **Worcester, MA:** 54 missing ZIPs → Worcester, MA-CT (22 ZIPs already mapped)
3. **Cook, IL:** 44 missing ZIPs → Chicago-Naperville-Elgin, IL-IN-WI (125 ZIPs already mapped)
4. **Nassau, NY:** 41 missing ZIPs → New York-Newark-Jersey City, NY-NJ-PA (24 ZIPs already mapped)
5. **Allegheny, PA:** 39 missing ZIPs → Pittsburgh, PA (55 ZIPs already mapped)
6. **Jefferson, AL:** 38 missing ZIPs → Birmingham-Hoover, AL (34 ZIPs already mapped)
7. **Barnstable, MA:** 36 missing ZIPs → Barnstable Town, MA (1 ZIPs already mapped)
8. **Ulster, NY:** 36 missing ZIPs → Kingston, NY (4 ZIPs already mapped)
9. **Jefferson, KY:** 32 missing ZIPs → Louisville/Jefferson County, KY-IN (31 ZIPs already mapped)
10. **Grafton, NH:** 32 missing ZIPs → Lebanon, NH-VT (1 ZIPs already mapped)

### 3. CBSA Mapping Opportunities
- **Count:** 0 ZIPs
- **Issue:** The `cbsa_zip_mapping` table is currently empty
- **Action Required:** Run `bun scripts/ingest-cbsa-mapping.ts` to populate CBSA mappings

## Recommended Implementation Strategy

### Phase 1: County-Level Metro Assignment (Easiest Win - 8,352 ZIPs)

**Implementation Approach:**
1. For each ZIP without demand data, check if other ZIPs in the same county have metro mappings
2. If a majority of ZIPs in the county map to a specific metro, assign that metro to missing ZIPs
3. Update the `zip_metro_mapping` CTE in `compute-investment-scores.ts` to include county-level fallback

**SQL Logic:**
```sql
-- Add county-level metro fallback
county_metro_fallback AS (
  SELECT DISTINCT ON (zdc.zip_code)
    zdc.zip_code,
    zdc.county_fips,
    zdc.state_code,
    -- Get the most common metro for this county
    MODE() WITHIN GROUP (ORDER BY zmm.metro_name) as county_metro
  FROM zip_data_with_canonical zdc
  JOIN zip_metro_mapping zmm ON zmm.zip_code IN (
    SELECT zip_code 
    FROM zip_county_mapping 
    WHERE county_fips = zdc.county_fips 
      AND state_code = zdc.state_code
  )
  WHERE zmm.metro_name IS NOT NULL
  GROUP BY zdc.zip_code, zdc.county_fips, zdc.state_code
)
```

### Phase 2: CBSA Data Ingestion (Medium Priority)

**Action:** Populate CBSA mappings to enable metro assignment for ZIPs without ZORI metro_name

```bash
# Ingest CBSA mappings from HUD crosswalk files
bun scripts/ingest-cbsa-mapping.ts
```

This will enable:
- Mapping ZIPs with ZORI data but no metro_name via CBSA codes
- Direct CBSA-to-metro mapping for ZIPs without ZORI data

### Phase 3: Enhanced Metro Matching (Future Enhancement)

**Improvements:**
1. Better normalization of metro names (handle variations like "New York" vs "New York-Newark-Jersey City")
2. Fuzzy matching for metro names that don't exactly match
3. State-level metro assignments as last resort

## Implementation Code Changes

### Update `scripts/compute-investment-scores.ts`

Modify the `zip_metro_mapping` CTE to include county-level fallback:

```sql
zip_metro_mapping AS (
  SELECT DISTINCT ON (z.zip_code)
    z.zip_code,
    COALESCE(
      cbsa.cbsa_name, 
      z.metro_name,
      -- County-level fallback
      (SELECT MODE() WITHIN GROUP (ORDER BY z2.metro_name)
       FROM zillow_zori_zip_monthly z2
       JOIN zip_county_mapping zcm2 ON zcm2.zip_code = z2.zip_code
       JOIN zip_county_mapping zcm ON zcm.county_fips = zcm2.county_fips 
         AND zcm.state_code = zcm2.state_code
       WHERE zcm.zip_code = z.zip_code
         AND z2.metro_name IS NOT NULL
       LIMIT 1)
    ) as metro_name,
    -- ... normalization logic
  FROM zillow_zori_zip_monthly z
  LEFT JOIN cbsa_zip_mapping cbsa ON cbsa.zip_code = z.zip_code
  -- Also include ZIPs without ZORI data but with county info
  FULL OUTER JOIN zip_county_mapping zcm ON zcm.zip_code = COALESCE(z.zip_code, ...)
  WHERE ...
)
```

## Expected Impact

- **Immediate:** Map 8,352 ZIPs (66% of missing) via county-level assignments
- **After CBSA ingestion:** Additional ZIPs can be mapped via CBSA codes
- **Total Coverage Improvement:** From ~0% to ~66%+ of currently unmapped ZIPs

## Next Steps

1. ✅ **Analysis Complete** - This document
2. ⏳ **Implement county-level fallback** in `compute-investment-scores.ts`
3. ⏳ **Ingest CBSA mappings** via `ingest-cbsa-mapping.ts`
4. ⏳ **Test and verify** mapping improvements
5. ⏳ **Re-run investment score computation** to include newly mapped ZIPs

## Files Modified/Created

- `scripts/analyze-zip-demand-mapping.ts` - Analysis script
- `ZIP_DEMAND_MAPPING_ANALYSIS.md` - This document
- `scripts/compute-investment-scores.ts` - Needs update for county fallback





