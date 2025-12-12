# ZIP Code to County Lookup Guide

This guide helps you automate the process of finding counties for ZIP codes that are missing county mappings.

## Available Resources

### 1. **US Census Geocoding API** (Recommended - Free, No API Key)

**Best for**: Free, no registration required, official government data

- **URL**: https://geocoding.geo.census.gov/geocoder/
- **Rate Limits**: Reasonable for public use (add delays between requests)
- **No API Key Required**: Free to use
- **Documentation**: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html

**Usage with script**:
```bash
bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --api census --delay 200
```

**Pros**:
- Free, no API key needed
- Official government data
- Reliable

**Cons**:
- Rate limited (need delays between requests)
- Slower for large batches (5k ZIPs = ~17 minutes with 200ms delay)

### 2. **SmartyStreets ZIP Code API** (Commercial)

**Best for**: Fast, reliable, good for large batches

- **URL**: https://www.smartystreets.com/products/apis/us-zipcode-api
- **Requires**: API key (free tier available)
- **Cost**: Free tier: 250 lookups/month, then paid
- **Documentation**: https://smartystreets.com/docs/cloud/us-zipcode-api

**Usage with script**:
```bash
bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt \
  --api smartystreets \
  --auth-id YOUR_AUTH_ID \
  --auth-token YOUR_AUTH_TOKEN
```

**Pros**:
- Fast and reliable
- Good for batch processing
- Free tier available

**Cons**:
- Requires API key
- Limited free tier (250/month)

### 3. **Google Maps Geocoding API** (Recommended - Best Coverage)

**Best for**: Most comprehensive coverage, very reliable, excellent data quality

- **URL**: https://developers.google.com/maps/documentation/geocoding
- **Requires**: API key (free tier available)
- **Cost**: $200/month free credit (covers ~40,000 geocoding requests)
- **Documentation**: https://developers.google.com/maps/documentation/geocoding

**Usage with script**:
```bash
# Option 1: Pass API key as argument
bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt \
  --api googlemaps \
  --key YOUR_API_KEY

# Option 2: Set in .env file (automatically used)
# Add to .env: GOOGLE_MAPS_API_KEY=your_key_here
bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt \
  --api googlemaps
```

**Get API Key**:
1. Go to https://console.cloud.google.com/
2. Create a project (or use existing)
3. Enable "Geocoding API"
4. Create credentials (API Key)
5. Optionally restrict key to Geocoding API only

**Pros**:
- ✅ **Best coverage** - Google has the most comprehensive ZIP code database
- ✅ **Very reliable** - Excellent data quality
- ✅ **Fast** - No significant rate limits (within free tier)
- ✅ **Free tier**: $200/month credit = ~40,000 requests/month
- ✅ **Well documented** - Extensive documentation

**Cons**:
- Requires API key (but free tier is generous)
- Need to set up Google Cloud account

### 4. **ZipCodeAPI** (Commercial)

**Best for**: Simple API, good documentation

- **URL**: https://www.zipcodeapi.com/
- **Requires**: API key (free tier available)
- **Cost**: Free tier: 10 requests/hour, then paid
- **Documentation**: https://www.zipcodeapi.com/API

**Usage with script**:
```bash
bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt \
  --api zipcodeapi \
  --key YOUR_API_KEY
```

**Pros**:
- Simple API
- Free tier available

**Cons**:
- Very limited free tier (10/hour)
- Requires API key

## Automated Script

The `lookup-zip-counties.ts` script automates the lookup process:

### Basic Usage (Census API - Free)

```bash
# Lookup all ZIPs from exported file
bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt

# With custom delay (slower but safer)
bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --delay 300

# Process in smaller batches
bun scripts/lookup-zip-counties.ts --file app/zips-missing-counties.txt --batch-size 50
```

### With Commercial APIs

```bash
# SmartyStreets
bun scripts/lookup-zip-counties.ts \
  --file app/zips-missing-counties.txt \
  --api smartystreets \
  --auth-id YOUR_AUTH_ID \
  --auth-token YOUR_AUTH_TOKEN

# ZipCodeAPI
bun scripts/lookup-zip-counties.ts \
  --file app/zips-missing-counties.txt \
  --api zipcodeapi \
  --key YOUR_API_KEY
```

## Script Features

- ✅ **Automatic deduplication**: Skips ZIPs already in database
- ✅ **Rate limiting**: Configurable delays between requests
- ✅ **Batch processing**: Processes in configurable batches
- ✅ **Progress tracking**: Shows real-time progress
- ✅ **Error handling**: Continues on errors, reports failures
- ✅ **Multiple outputs**: 
  - Full results (text file with errors)
  - CSV file (ready for import)

## Output Files

The script generates two files:

1. **`zip-county-lookup-results-{timestamp}.txt`**
   - Full results including errors
   - Tab-separated format
   - Includes success/failure status

2. **`zip-county-lookup-results-{timestamp}.csv`**
   - Only successful lookups
   - CSV format ready for import
   - Can be directly imported using `ingest-zip-county` script

## Importing Results

After lookup completes, import the CSV file:

```bash
bun run ingest:zip-county -- --file zip-county-lookup-results-{timestamp}.csv
```

## Recommended Approach for 5,265 ZIPs

### Option 1: Google Maps API (Recommended - Best Coverage)

```bash
# Get API key from https://console.cloud.google.com/
# Enable "Geocoding API"
# Add to .env: GOOGLE_MAPS_API_KEY=your_key_here

# Run lookup (fast, reliable, best coverage)
# Estimated time: ~5-10 minutes for 5,265 ZIPs
bun scripts/lookup-zip-counties.ts \
  --file app/zips-missing-counties.txt \
  --api googlemaps \
  --delay 50 \
  --batch-size 100
```

**Pros**: 
- ✅ Best coverage (Google has most comprehensive database)
- ✅ Fast (~5-10 minutes)
- ✅ Very reliable
- ✅ Free tier covers 40,000 requests/month

**Cons**: Requires API key (but free tier is generous)

### Option 2: Census API (Free, Slower)

```bash
# Run with 200ms delay (safe rate limit)
# Estimated time: ~17 minutes for 5,265 ZIPs
bun scripts/lookup-zip-counties.ts \
  --file app/zips-missing-counties.txt \
  --api census \
  --delay 200 \
  --batch-size 100
```

**Pros**: Free, no setup
**Cons**: Takes ~17 minutes, may have gaps in coverage

### Option 2: SmartyStreets (Fast, Requires API Key)

1. Sign up at https://www.smartystreets.com/
2. Get free tier API credentials
3. Run script:

```bash
bun scripts/lookup-zip-counties.ts \
  --file app/zips-missing-counties.txt \
  --api smartystreets \
  --auth-id YOUR_AUTH_ID \
  --auth-token YOUR_AUTH_TOKEN \
  --delay 50
```

**Pros**: Much faster (~5 minutes)
**Cons**: Requires API key, free tier limited to 250/month

### Option 3: Hybrid Approach

1. Use SmartyStreets for first 250 ZIPs (free tier)
2. Use Census API for remaining ~5,000 ZIPs
3. Combine results and import

## Alternative: Bulk CSV Download

If you prefer bulk downloads over API lookups:

1. **Download complete ZIP-county mapping** from:
   - Row Zero: https://rowzero.com/datasets/zip-code-to-county-fips-codes
   - Gigasheet: https://www.gigasheet.com/sample-data/zip-code-to-county-spreadsheet
   - Census Bureau: https://www.census.gov/data/data-tools/gazetteer.html

2. **Filter for missing ZIPs**:
   ```bash
   # Extract ZIP codes from your file
   cut -f1 app/zips-missing-counties.txt | tail -n +2 > missing-zips.txt
   
   # Filter bulk CSV for these ZIPs (using grep or similar)
   grep -f missing-zips.txt bulk-zip-county.csv > found-mappings.csv
   ```

3. **Import filtered results**:
   ```bash
   bun run ingest:zip-county -- --file found-mappings.csv
   ```

## Troubleshooting

### Rate Limiting Errors

If you get rate limit errors:
- Increase `--delay` parameter (try 500ms or 1000ms)
- Reduce `--batch-size` (try 10 or 20)
- Use a commercial API with higher limits

### API Key Issues

- SmartyStreets: Check auth-id and auth-token are correct
- ZipCodeAPI: Verify API key is active and has remaining quota

### No Results Found

Some ZIP codes may be:
- Invalid or obsolete
- PO Box only (no physical location)
- Very new (not yet in databases)

These will be reported in the error column of the results file.

## Next Steps

1. ✅ Run lookup script with your preferred API
2. ✅ Review results file for any errors
3. ✅ Import successful lookups using `ingest-zip-county`
4. ✅ Re-run test coverage to verify improvements



