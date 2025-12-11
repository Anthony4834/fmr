# Running Data Ingestion Scripts (Scrapers)

This guide explains how to run the data ingestion scripts to index FMR, SAFMR, and ZIP-County mapping data.

## Prerequisites

1. **Install Bun** (if not already installed):
   ```bash
   # macOS/Linux
   curl -fsSL https://bun.sh/install | bash
   
   # Or using Homebrew (macOS)
   brew install bun
   ```
   
   Verify installation:
   ```bash
   bun --version
   ```

2. **Install project dependencies**:
   ```bash
   bun install
   ```
   
   This will install all required packages including:
   - `@vercel/postgres` - Database client
   - `csv-parse` - CSV parsing
   - `dotenv` - Environment variable loading

3. **Set up environment variables**:
   Create a `.env` file in the project root:
   ```bash
   POSTGRES_URL=postgresql://user:password@host:port/database
   ```
   
   Get your `POSTGRES_URL` from your Vercel dashboard after creating a Postgres database.

## Running the Scripts

### 1. ZIP-County Mapping (One-Time Setup)

This maps ZIP codes to counties. Run this once during initial setup:

```bash
# From a URL:
bun run ingest:zip-county -- --url https://example.com/zip-county-data.csv

# From a local file:
bun run ingest:zip-county -- --file ./data/zip-county.csv
```

**Note**: You'll need to find the actual Census Bureau ZIP-County mapping file. See `DATA_SOURCES.md` for details.

### 2. FMR Data (Yearly)

Indexes Fair Market Rent data for metropolitan areas and counties:

```bash
# Use current year (auto-detected):
bun run ingest:fmr

# Specify a year:
bun run ingest:fmr -- --year 2024

# Use custom URL:
bun run ingest:fmr -- --year 2024 --url https://hud.gov/fmr-2024.csv

# Replace existing data:
bun run ingest:fmr -- --year 2024 --replace
```

### 3. SAFMR Data (Yearly)

Indexes Small Area Fair Market Rent data at ZIP code level:

```bash
# Use current year (auto-detected):
bun run ingest:safmr

# Specify a year:
bun run ingest:safmr -- --year 2024

# Use custom URL:
bun run ingest:safmr -- --year 2024 --url https://hud.gov/safmr-2024.csv

# Replace existing data:
bun run ingest:safmr -- --year 2024 --replace
```

### 4. Update Current Year (All Data)

Updates both FMR and SAFMR data for the current year:

```bash
# Update current year (auto-detected):
bun run update:current-year

# Update specific year:
bun run update:current-year -- --year 2024
```

## Script Options

All scripts support these command-line options:

- `--year <year>`: Specify the year (defaults to current FMR year)
- `--url <url>`: Custom data source URL (overrides default HUD URLs)
- `--replace`: Replace existing data for the year (otherwise skips if data exists)
- `--file <path>`: Use local file instead of URL (ZIP-County script only)

## Typical Workflow

### Initial Setup (First Time)

```bash
# 1. Install dependencies
bun install

# 2. Set up .env file with POSTGRES_URL

# 3. Index ZIP-County mapping (one-time)
bun run ingest:zip-county -- --url <census-data-url>

# 4. Index FMR data for current year
bun run ingest:fmr -- --year 2024

# 5. Index SAFMR data for current year
bun run ingest:safmr -- --year 2024
```

### Annual Updates (October)

```bash
# Update all data for the new year
bun run update:current-year -- --year 2024
```

## Troubleshooting

### Database Connection Error

If you see connection errors:
- Verify your `POSTGRES_URL` in `.env` is correct
- Check that your Vercel Postgres database is running
- Ensure the connection string format is: `postgresql://user:password@host:port/database`

### CSV Parsing Errors

If CSV parsing fails:
- The HUD CSV format may have changed - check `DATA_SOURCES.md` for current URLs
- You may need to adjust column mappings in the ingestion scripts
- Try downloading the CSV manually and inspecting its structure

### Missing Data URLs

The default URLs in the scripts are placeholders. You'll need to:
1. Visit https://www.huduser.gov/portal/datasets/fmr.html
2. Find the actual CSV download URLs
3. Update the `getDefaultFMRUrl()` and `getDefaultSAFMRUrl()` functions in the scripts
4. Or use `--url` flag to specify the URL directly

## Direct Script Execution

You can also run scripts directly without npm/bun scripts:

```bash
# Direct execution
bun scripts/ingest-fmr.ts -- --year 2024

# Or make executable and run
chmod +x scripts/ingest-fmr.ts
./scripts/ingest-fmr.ts -- --year 2024
```

## Verifying Data

After running the scripts, you can verify data was ingested by checking your database:

```sql
-- Check FMR data count
SELECT COUNT(*) FROM fmr_data WHERE year = 2024;

-- Check SAFMR data count
SELECT COUNT(*) FROM safmr_data WHERE year = 2024;

-- Check ZIP-County mappings
SELECT COUNT(*) FROM zip_county_mapping;
```

