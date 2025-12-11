# Data Sources Reference

This document outlines the data sources used for indexing FMR data.

## HUD Data Sources

### Fair Market Rent (FMR) Data
- **Source**: U.S. Department of Housing and Urban Development (HUD)
- **URL Pattern**: `https://www.huduser.gov/portal/datasets/fmr/fmr_csvs/fmr_YYYY.csv`
- **Update Frequency**: Annually (effective October 1st)
- **Format**: CSV with columns for area name, state, county, bedroom sizes (0-4 BR)
- **Note**: You may need to adjust the URL pattern and column mapping in `scripts/ingest-fmr.ts` based on the actual HUD CSV structure

### Small Area Fair Market Rent (SAFMR) Data
- **Source**: HUD Small Area FMR datasets
- **URL Pattern**: `https://www.huduser.gov/portal/datasets/fmr/smallarea/safmr_YYYY.csv`
- **Update Frequency**: Annually (effective October 1st)
- **Format**: CSV with ZIP code and bedroom sizes (0-4 BR)
- **Note**: You may need to adjust the URL pattern and column mapping in `scripts/ingest-safmr.ts` based on the actual HUD CSV structure

### Finding Current Data URLs
1. Visit https://www.huduser.gov/portal/datasets/fmr.html
2. Navigate to the current year's FMR data
3. Download the CSV file and note the URL structure
4. Update the `getDefaultFMRUrl()` function in `scripts/ingest-fmr.ts` accordingly

## ZIP Code to County Mapping

### U.S. Census Bureau ZCTA to County Relationship
- **Source**: U.S. Census Bureau
- **Update Frequency**: Rarely changes (one-time import)
- **Format**: CSV with ZIP code, county name, state, FIPS codes
- **Finding the Data**:
  - Search for "ZIP Code Tabulation Area to County" relationship files
  - Available through Census Bureau data portals
  - May be available at: https://www.census.gov/geographies/mapping-files.html

## Geocoding Services

### US Census Geocoding API (Recommended - Free)
- **URL**: https://geocoding.geo.census.gov/geocoder/geographies/address
- **Rate Limits**: Reasonable for public use
- **No API Key Required**: Free to use
- **Documentation**: https://geocoding.geo.census.gov/geocoder/

### Google Maps Geocoding API (Alternative)
- **URL**: https://maps.googleapis.com/maps/api/geocode/json
- **Requires API Key**: Yes
- **Cost**: Pay-per-use (has free tier)
- **Documentation**: https://developers.google.com/maps/documentation/geocoding

## Notes

- All data is indexed internally in PostgreSQL for fast lookups
- Geocoded addresses are cached in the `geocoded_addresses` table
- Only current year FMR/SAFMR data is stored (older years are replaced)
- ZIP-County mapping is static and rarely needs updating

