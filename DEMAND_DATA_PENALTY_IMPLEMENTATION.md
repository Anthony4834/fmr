# Demand Data Penalty Implementation

## Summary

Implemented penalty scoring for ZIPs without demand data, treating the absence of data as a signal of low demand rather than neutral.

## Rationale

**Previous Behavior:**
- ZIPs without demand data received `demand_multiplier = 1.0` (neutral, no penalty)
- This treated missing data as "unknown" rather than "low demand"

**New Behavior:**
- ZIPs without demand data receive:
  - `demand_score = 10` (equivalent to 10th percentile - very low demand)
  - `demand_multiplier = 0.75` (25% penalty to final score)

**Reasoning:**
1. **Absence of data is informative** - If Zillow doesn't have demand data for an area, it likely indicates:
   - Low rental market activity
   - Rural/remote location
   - Limited investor interest
   - Small market size

2. **Conservative approach** - Better to penalize uncertain areas than to treat them neutrally
3. **Significant impact** - 25% penalty ensures these ZIPs rank lower in investment scores

## Implementation Details

### Code Changes
**File:** `scripts/compute-investment-scores.ts`

**Before:**
```typescript
} else {
  // No demand data - use neutral multiplier
  score.demandScore = null;
  score.demandMultiplier = 1.0;
}
```

**After:**
```typescript
} else {
  // No demand data - assign low demand score and apply significant penalty
  // Assumption: Absence of demand data likely indicates low demand
  score.demandScore = 10; // Low score indicating insufficient data / low demand
  score.demandMultiplier = 0.75; // 25% penalty for missing demand data
}
```

### Impact on Scoring

**Example Calculation:**
- ZIP with base score of 100:
  - **Before:** `score_with_demand = 100 * 1.0 = 100` (no change)
  - **After:** `score_with_demand = 100 * 0.75 = 75` (25% reduction)

- ZIP with base score of 150:
  - **Before:** `score_with_demand = 150 * 1.0 = 150` (no change)
  - **After:** `score_with_demand = 150 * 0.75 = 112.5` (25% reduction)

### Affected ZIPs

Based on current analysis:
- **~1,405 investment score records** without demand data (7.0% of total)
- Primarily in:
  - Rural areas (Coos NH, Washington ME, etc.)
  - Remote locations (Nantucket MA)
  - Areas with limited Zillow coverage

## Expected Outcomes

1. **Lower rankings** for ZIPs without demand data
2. **Better differentiation** between areas with known high demand vs. unknown/low demand
3. **More conservative scoring** for uncertain markets
4. **Clearer signal** to investors about data availability and market activity

## Statistics Tracking

The code now tracks:
- ZIPs with computed demand score (from actual data)
- ZIPs without demand data (penalized with low score)

This allows monitoring of:
- How many ZIPs are affected by the penalty
- Coverage improvements over time
- Impact on overall score distribution

## Future Considerations

### Potential Adjustments
1. **Tiered penalties** - Different penalties based on why data is missing:
   - No ZORI data at all: 0.75x (current)
   - Has ZORI but no metro: 0.80x (less severe)
   - Has metro but no ZORDI match: 0.85x (even less severe)

2. **State-level proxies** - For rural areas, use state-level demand data as fallback

3. **Alternative data sources** - Integrate other demand indicators for areas without Zillow data

### Monitoring
- Track score distribution before/after penalty
- Monitor if penalty is too harsh (all rural areas at bottom)
- Consider regional adjustments if needed

## Testing

After re-running investment score computation:
1. Verify ~1,405 records now have `demand_score = 10`
2. Verify these records have `demand_multiplier = 0.75`
3. Check that `score_with_demand` is 25% lower than base score for these ZIPs
4. Confirm overall score rankings reflect the penalty appropriately

## Related Files

- `scripts/compute-investment-scores.ts` - Main implementation
- `DEMAND_COVERAGE_FINAL_ANALYSIS.md` - Coverage analysis
- `DEMAND_COVERAGE_ANALYSIS.md` - Initial analysis





