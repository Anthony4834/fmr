# UI Score With Demand Fix

## Issue

The US map and state rankings were showing identical results before and after adding demand weighting because the UI was using the old `score` field instead of `score_with_demand`.

## Root Cause

Multiple API routes were querying the `score` field instead of `score_with_demand`, which meant:
- The map was displaying base scores (without demand weighting)
- State rankings were using base scores
- County aggregations were using base scores
- Individual ZIP lookups were using base scores

## Changes Made

### Updated API Routes

1. **`app/api/stats/state-scores/route.ts`**
   - State-level aggregations now use `COALESCE(score_with_demand, score)`
   - County-level aggregations now use `COALESCE(score_with_demand, score)`

2. **`app/api/maps/county-scores/route.ts`**
   - County score aggregations now use `COALESCE(score_with_demand, score)`

3. **`app/api/stats/states-ranked/route.ts`**
   - State rankings now use `COALESCE(score_with_demand, score)`

4. **`app/api/investment/score/route.ts`**
   - ZIP lookups now return `score_with_demand` as primary score
   - City/county/state aggregations now use `COALESCE(score_with_demand, score)`

5. **`app/api/investment/zip-scores/route.ts`**
   - ZIP score lists now use `COALESCE(score_with_demand, score)`

## Implementation Details

### Pattern Used

All aggregations now use:
```sql
COALESCE(score_with_demand, score)
```

This ensures:
- If `score_with_demand` exists (demand-weighted), use it
- If `score_with_demand` is NULL (legacy data), fall back to `score`
- Backward compatible with existing data

### Individual ZIP Lookups

For individual ZIP lookups, the API now:
1. Selects both `score` and `score_with_demand`
2. Returns `score_with_demand` as the primary `score` field
3. Falls back to `score` if `score_with_demand` is NULL

## Impact

### Before Fix
- Map showed base scores (no demand weighting)
- State rankings used base scores
- No differentiation between high/low demand areas

### After Fix
- Map shows demand-weighted scores
- State rankings reflect demand-adjusted scores
- Areas with high demand get boosted scores
- Areas with low/missing demand get penalized scores (0.75x multiplier)

## Expected Visual Changes

1. **US Map Colors**
   - States/counties with high demand will appear brighter/greener
   - States/counties with low demand will appear dimmer/redder
   - Overall map should show more variation

2. **State Rankings**
   - Rankings will shift based on demand data
   - States with strong demand markets will rank higher
   - States with weak demand markets will rank lower

3. **Individual ZIP Scores**
   - ZIP scores displayed will reflect demand weighting
   - Scores will be lower for areas without demand data (penalty applied)

## Testing

After deploying these changes:
1. Refresh the US map - should show different colors than before
2. Check state rankings - should be different from previous rankings
3. View individual ZIP scores - should reflect demand weighting
4. Compare before/after - map should show demand-adjusted scores

## Files Modified

- `app/api/stats/state-scores/route.ts`
- `app/api/maps/county-scores/route.ts`
- `app/api/stats/states-ranked/route.ts`
- `app/api/investment/score/route.ts`
- `app/api/investment/zip-scores/route.ts`

## Notes

- All changes use `COALESCE(score_with_demand, score)` for backward compatibility
- If `score_with_demand` is NULL (old data), falls back to `score`
- After re-running investment score computation, all records will have `score_with_demand`





