# API Cache Fix - Butte, CA Showing Old Score (108.5)

## Problem
Butte, CA (FIPS 06007) is showing **108.5** in the map, but the database query returns **91.5** (correct).

## Root Cause
The API route code is correct and uses `COALESCE(score_with_demand, score)`, but **Next.js is likely caching the route handler**.

## Solution

### 1. Restart Dev Server
**This is the most likely fix:**
```bash
# Stop the current dev server (Ctrl+C)
# Then restart:
npm run dev
# or
bun dev
```

Next.js caches route handlers in development. Restarting forces it to reload the updated code.

### 2. Clear Next.js Cache
If restart doesn't work:
```bash
# Delete Next.js cache
rm -rf .next

# Restart dev server
npm run dev
```

### 3. Verify API Response
After restarting, check the browser console for:
```
[USStateMap] Fetched county scores: {
  sample: [
    { fips: "06007", name: "Butte", score: 91.5 }  // ← Should be 91.5, not 108.5
  ]
}
```

Or check the API directly:
```bash
curl "http://localhost:3000/api/stats/state-scores?level=county" | jq '.countyScores[] | select(.countyFips == "06007")'
```

Should show:
```json
{
  "countyFips": "06007",
  "countyName": "Butte",
  "stateCode": "CA",
  "medianScore": 91.5,  // ← Correct value
  ...
}
```

## Verification

The database query is correct:
- Direct SQL query returns: **91.5** ✅
- API route code uses: `COALESCE(score_with_demand, score)` ✅
- But API response shows: **108.5** ❌ (cached)

## Debug Logging Added

The API route now logs:
- When the query executes
- Butte, CA's score specifically
- Timestamp in response

Check server console (not browser console) for:
```
[state-scores API] Executing county query with score_with_demand, year: 2026
[state-scores API] Butte, CA (FIPS 06007): { medianScore: 91.5, avgScore: 91.2 }
```

If you see `medianScore: 108.5` in the server logs, the query isn't using `score_with_demand` correctly.

## Next Steps

1. **Restart dev server** (most likely fix)
2. **Check server console** for debug logs
3. **Check browser console** for API response
4. **Hard refresh browser** after server restart
