# County-Level Metro Fallback Implementation

## Summary

Implemented county-level metro fallback in `compute-investment-scores.ts` to map ZIP codes without direct metro data to Zillow demand data using metro assignments from other ZIPs in the same county.

## Changes Made

### Modified File
- `scripts/compute-investment-scores.ts`

### Implementation Details

1. **Added `county_metro_fallback` CTE**
   - Finds the most common metro assignment for ZIPs within each county
   - Uses `MODE() WITHIN GROUP` to select the most frequent metro
   - Sources metro data from:
     - CBSA mappings (priority 1)
     - ZORI metro_name (priority 2)

2. **Enhanced `zip_metro_mapping` CTE**
   - Now includes all ZIPs from `zip_data_with_canonical` (not just those with ZORI data)
   - Uses three-tier fallback strategy:
     1. **CBSA mapping** (most reliable)
     2. **ZORI metro_name** (from Zillow rent data)
     3. **County-level fallback** (NEW - uses most common metro for county)
   - Properly normalizes metro names for matching with ZORDI data

## Expected Impact

- **~8,352 additional ZIPs** can now be mapped to demand data
- **66% improvement** in coverage for ZIPs that previously lacked demand data
- ZIPs in counties like Suffolk NY, Worcester MA, Cook IL, etc. will now have demand scores

## How It Works

1. For each ZIP without a direct metro mapping:
   - System checks if other ZIPs in the same county have metro assignments
   - If found, uses the most common metro for that county
   - Maps that metro to ZORDI demand data using normalized name matching

2. Example:
   - ZIP 12345 in Suffolk County, NY has no direct metro mapping
   - 38 other ZIPs in Suffolk County map to "New York-Newark-Jersey City, NY-NJ-PA"
   - System assigns this metro to ZIP 12345
   - ZIP 12345 now gets ZORDI demand data for that metro

## Testing

To verify the implementation works:

```bash
# Re-run investment score computation
bun scripts/compute-investment-scores.ts

# Check how many ZIPs now have demand data
# Compare before/after counts
```

## Next Steps

1. ✅ County-level fallback implemented
2. ⏳ Re-run investment score computation to apply changes
3. ⏳ Verify increased coverage (should see ~8,352 more ZIPs with demand data)
4. ⏳ Consider ingesting CBSA mappings for additional coverage (`bun scripts/ingest-cbsa-mapping.ts`)

## Notes

- The county fallback only applies when other ZIPs in the same county have metro mappings
- Metro name normalization ensures proper matching with ZORDI region names
- Priority order (CBSA > ZORI > County) ensures most reliable data is used first





