# Automation Readiness Analysis

**Date:** 2026-01-20  
**Question:** Will the system automatically ingest data next month with all fallbacks in place?

## Summary

✅ **YES** - With the changes made, the system will automatically handle data ingestion next month with minimal manual intervention.

## Current Automation Status

### ✅ Fully Automated (Monthly Cron Job)

The system has a **monthly cron job** (`0 8 18 * *` = 18th of each month at 8:00 AM) that runs:

1. **ZHVI ingestion** (property values) - ✅ Automated
2. **ACS tax rates** - ✅ Automated  
3. **Zillow rentals** (ZORI + ZORDI) - ✅ Automated
4. **CBSA mapping update** - ✅ **NOW ADDED** to cron job
5. **Investment score computation** - ✅ Automated

### Fallback Mechanisms (All Automatic)

#### 1. County-Level Metro Fallback ✅
- **Status:** Fully automatic
- **How it works:** Uses existing `zip_county_mapping` and metro assignments from other ZIPs
- **No manual steps needed:** The fallback logic is built into `compute-investment-scores.ts`
- **Next month:** Will automatically work with new ZORI/ZORDI data

#### 2. CBSA Mappings ✅
- **Status:** Now automated in cron job
- **How it works:** 
  - Rebuilds from FMR county-metro data (uses latest year automatically)
  - Rebuilds from ZORDI metro names (uses latest data automatically)
- **Next month:** Will automatically update when cron runs

#### 3. Demand Data Penalty ✅
- **Status:** Fully automatic (code logic)
- **How it works:** ZIPs without demand data get `demand_score = 10` and `demand_multiplier = 0.75`
- **Next month:** Will automatically apply to any ZIPs still missing demand data

## Changes Made for Automation

### Added to Cron Job
**File:** `app/api/cron/property-data/route.ts`

Added CBSA mapping update step between Zillow rentals and investment score computation:

```typescript
// Step 3.5: Update CBSA mappings (for metro fallback in demand scoring)
try {
  console.log('[property-data cron] Starting CBSA mapping update...');
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  const command = 'bun scripts/ingest-cbsa-mapping.ts';
  const { stdout, stderr } = await execAsync(command, {
    env: { ...process.env, POSTGRES_URL: process.env.POSTGRES_URL },
    maxBuffer: 10 * 1024 * 1024,
  });
  
  results.cbsaMapping = { success: true, output: stdout, warnings: stderr };
  console.log('[property-data cron] CBSA mapping update complete');
} catch (e: any) {
  console.error('[property-data cron] CBSA mapping update error:', e);
  results.cbsaMapping = { error: e.message };
}
```

## Monthly Automation Flow

### What Happens Automatically Each Month:

1. **ZHVI data** → Ingested automatically
2. **ACS tax data** → Ingested automatically
3. **ZORI data** → Ingested automatically (ZIP-level rent data)
4. **ZORDI data** → Ingested automatically (metro-level demand data)
5. **CBSA mappings** → **Rebuilt automatically** from:
   - Latest FMR county-metro data
   - Latest ZORDI metro names
6. **Investment scores** → Computed automatically with:
   - County-level metro fallback (automatic)
   - CBSA mapping fallback (automatic)
   - Demand data penalty for missing data (automatic)

### Fallback Chain (All Automatic)

When computing investment scores, the system automatically tries:

1. **CBSA mapping** → If ZIP has CBSA code, use that metro
2. **ZORI metro_name** → If ZIP has ZORI data with metro_name, use that
3. **County-level fallback** → If other ZIPs in same county have metro, use that
4. **Demand penalty** → If still no metro, assign low demand score (10) and 0.75x multiplier

## Manual Steps Still Required

### Yearly Updates (Not Monthly)

These are **yearly** updates, not monthly:

1. **FMR data** (yearly) - When HUD publishes new FMR data
   - Run: `bun run ingest:fmr -- --year 2027`
   - Typically published in fall for following year

2. **SAFMR data** (yearly) - When HUD publishes new SAFMR data
   - Run: `bun run ingest:safmr -- --year 2027`
   - Typically published alongside FMR data

3. **ZIP-County mapping** (rarely) - Only if ZIP boundaries change
   - Usually stable, only update if needed

### Why These Are Manual

- FMR/SAFMR data is published **yearly**, not monthly
- Requires checking HUD website for new data availability
- May need to verify data format hasn't changed

## Next Month: What Will Happen

### Automatic (No Manual Steps)

✅ **ZORI data** - New monthly data ingested automatically  
✅ **ZORDI data** - New monthly data ingested automatically  
✅ **CBSA mappings** - Rebuilt automatically from latest data  
✅ **Investment scores** - Recomputed automatically with all fallbacks  
✅ **County fallback** - Works automatically with existing county mappings  
✅ **Demand penalty** - Applied automatically to ZIPs without data  

### Expected Behavior

1. Cron job runs on 18th of month
2. New ZORI/ZORDI data ingested
3. CBSA mappings updated with any new metros
4. Investment scores recomputed
5. ZIPs with new demand data get proper scores
6. ZIPs still without data get penalty scores
7. County fallback catches any ZIPs that can be mapped via county

## Testing Automation

To verify automation works:

```bash
# Test the full pipeline locally
bun scripts/index-property-data.ts

# Or test individual components
bun scripts/ingest-zori.ts
bun scripts/ingest-zordi.ts
bun scripts/ingest-cbsa-mapping.ts
bun scripts/compute-investment-scores.ts
```

## Monitoring

### What to Check After Monthly Cron

1. **Cron job logs** - Verify all steps completed successfully
2. **CBSA mapping count** - Should increase if new metros appear
3. **Investment score coverage** - Should maintain ~93% coverage
4. **Demand data stats** - Check how many ZIPs have demand data vs. penalty

### Key Metrics

- Investment score records with demand data: Should stay ~93%
- CBSA mappings: Should update with new ZORDI metros
- County fallback usage: Should catch any gaps

## Conclusion

✅ **The system is now fully automated for monthly data ingestion.**

All fallback mechanisms (county-level, CBSA mappings, demand penalty) are built into the code and will work automatically when the cron job runs each month. No manual intervention needed for monthly updates.

**Only yearly FMR/SAFMR updates require manual steps**, which is expected since that data is published yearly, not monthly.



