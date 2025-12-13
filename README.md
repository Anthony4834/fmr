# FMR Search Application

A Vercel-hosted Next.js application for searching Fair Market Rent (FMR) data by address, city/state, ZIP code, or county.

## Prerequisites

- **Bun**: This project uses [Bun](https://bun.sh) as the runtime. Install it from https://bun.sh
- **Vercel Postgres**: Set up a Vercel Postgres database and get your `POSTGRES_URL`
- **Environment Variables**: Create a `.env` file with:
   ```
   POSTGRES_URL=your_postgres_connection_string
   API_NINJAS_API_KEY=your_api_ninjas_key
   ```

## Data Indexing

This project includes reusable, configurable scripts for indexing FMR and SAFMR data.

### Initial Setup

1. **Clean up old Node.js files (if migrating from npm/yarn):**
   ```bash
   rm -rf node_modules package-lock.json yarn.lock
   ```

2. **Install dependencies with Bun:**
   ```bash
   bun install
   ```

2. **Create database schema:**
   The schema is automatically created when you run any ingestion script, but you can also run it manually if needed.

3. **Index ZIP-County mapping (one-time):**
   ```bash
   bun run ingest:zip-county -- --url <census-data-url>
   # Or from a local file:
   bun run ingest:zip-county -- --file <path-to-csv>
   ```

4. **Index FMR data for current year:**
   ```bash
   bun run ingest:fmr -- --year 2024
   ```

5. **Index SAFMR data for current year:**
   ```bash
   bun run ingest:safmr -- --year 2024
   ```

### Yearly Updates

**📖 See [YEARLY_UPDATE_GUIDE.md](./YEARLY_UPDATE_GUIDE.md) for complete instructions including data sources and step-by-step process.**

Quick update for the current year (typically run in October):

```bash
bun run update:current-year
```

Or specify a year:
```bash
bun run update:current-year -- --year 2026
```

**Important**: After running the update script, also run:
```bash
bun run create-test-views
```

This will regenerate the test coverage views with the latest data.

### Script Options

All ingestion scripts support the following options:

- `--year <year>`: Specify the year (defaults to current FMR year)
- `--url <url>`: Custom data source URL
- `--replace`: Replace existing data for the year (otherwise skips if data exists)

### Data Sources

- **FMR Data**: HUD Fair Market Rent datasets (annual, updated October 1st)
- **SAFMR Data**: HUD Small Area Fair Market Rent datasets (annual, ZIP code level)
- **ZIP-County Mapping**: U.S. Census Bureau ZCTA to County relationship file

Note: You'll need to update the default URLs in the ingestion scripts based on the actual HUD data URL structure.

