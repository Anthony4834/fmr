# Map Debugging Steps

## Issue
Map still looks the same despite database having correct `score_with_demand` values.

## Changes Made

1. ✅ **API Routes Updated** - All routes use `COALESCE(score_with_demand, score)`
2. ✅ **Cache-Busting Added** - Fetch calls include timestamp query parameter
3. ✅ **Debug Logging Added** - API responses include timestamp and sample data
4. ✅ **Component Logging** - Map component logs fetched data to console

## Verification Steps

### 1. Check Browser Console
Open browser DevTools (F12) and check the Console tab. You should see:
```
[USStateMap] Fetched county scores: {
  count: 2661,
  debug: { timestamp: "...", count: 2661, sample: [...] },
  sample: [...]
}
```

### 2. Check Network Tab
1. Open DevTools → Network tab
2. Filter by "state-scores"
3. Click on the request
4. Check the Response tab
5. Verify `_debug.timestamp` is recent (not cached)
6. Check sample counties - should show demand-weighted scores

### 3. Verify Sample Counties
Look for these counties in the API response that should show color changes:

**Chambers, AL (FIPS 01017):**
- OLD: 124.3 (Light Green)
- NEW: 93.2 (Red) ← Should be RED now

**Butte, CA (FIPS 06007):**
- OLD: 108.5 (Light Green)
- NEW: 91.5 (Red) ← Should be RED now

### 4. Hard Refresh
- **Chrome/Edge:** `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- **Firefox:** `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
- **Safari:** `Cmd+Option+R`

### 5. Clear Cache Completely
If hard refresh doesn't work:
1. Open DevTools → Application tab (Chrome) or Storage tab (Firefox)
2. Click "Clear storage" or "Clear site data"
3. Check all boxes
4. Click "Clear site data"
5. Refresh page

### 6. Check if Using Production Build
If running `npm run build && npm start`:
- The API routes should still work (they're dynamic)
- But if you see cached responses, restart the server

### 7. Verify API is Being Called
In the Network tab, check:
- Request URL includes `?_t=...` timestamp
- Response status is 200 (not 304 Not Modified)
- Response includes `_debug` object with recent timestamp

## Expected Results

After fixes:
- **861 counties (32.4%)** should show different colors
- **558 counties** should cross 95 threshold (red ↔ green)
- **303 counties** should cross 130 threshold (light ↔ dark green)

## If Still Not Working

1. **Check if deployed** - If using Vercel/Netlify, the changes need to be deployed
2. **Restart dev server** - `npm run dev` or `bun dev`
3. **Check database connection** - Verify `POSTGRES_URL` is correct
4. **Verify year parameter** - Make sure the correct year (2026) is being used

## Sample API Response

The API should return:
```json
{
  "year": 2026,
  "countyScores": [
    {
      "countyFips": "01017",
      "countyName": "Chambers",
      "stateCode": "AL",
      "medianScore": 93.2,  // ← This should be 93.2, not 124.3
      "avgScore": 92.1,
      "zipCount": 5
    },
    ...
  ],
  "_debug": {
    "timestamp": "2026-01-XX...",
    "count": 2661,
    "sample": [...]
  }
}
```





