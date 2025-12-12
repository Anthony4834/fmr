import { execute } from './db';

/**
 * Creates all database tables and indexes
 * Should be run once during initial setup
 */
export async function createSchema() {
  console.log('Creating database schema...');

  // Enable pg_trgm extension for fuzzy text search
  await execute('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

  // FMR Data table (county/metropolitan area level)
  await execute(`
    CREATE TABLE IF NOT EXISTS fmr_data (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      area_type VARCHAR(20) NOT NULL CHECK (area_type IN ('metropolitan', 'nonmetropolitan')),
      area_name TEXT NOT NULL,
      state_code VARCHAR(2) NOT NULL,
      county_code VARCHAR(10),
      bedroom_0 NUMERIC(10, 2),
      bedroom_1 NUMERIC(10, 2),
      bedroom_2 NUMERIC(10, 2),
      bedroom_3 NUMERIC(10, 2),
      bedroom_4 NUMERIC(10, 2),
      effective_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, area_name, state_code, area_type)
    );
  `);

  // FMR county -> HUD metro mapping
  // This preserves HUD's metro naming (hud_area_name / hud_area_code) even though fmr_data.area_name
  // is stored as the county name for better county-level lookups.
  await execute(`
    CREATE TABLE IF NOT EXISTS fmr_county_metro (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      state_code VARCHAR(2) NOT NULL,
      county_name TEXT,
      county_fips VARCHAR(5),
      hud_area_code TEXT,
      hud_area_name TEXT,
      is_metro BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, state_code, county_fips, hud_area_code)
    );
  `);

  // If the table existed from an older schema, widen hud_area_code (HUD values like "METRO33860M33860"
  // exceed 10 chars).
  await execute(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'fmr_county_metro'
          AND column_name = 'hud_area_code'
          AND data_type <> 'text'
      ) THEN
        ALTER TABLE fmr_county_metro ALTER COLUMN hud_area_code TYPE TEXT;
      END IF;
    END $$;
  `);

  // SAFMR Data table (ZIP code level)
  await execute(`
    CREATE TABLE IF NOT EXISTS safmr_data (
      id SERIAL PRIMARY KEY,
      year INTEGER NOT NULL,
      zip_code VARCHAR(10) NOT NULL,
      bedroom_0 NUMERIC(10, 2),
      bedroom_1 NUMERIC(10, 2),
      bedroom_2 NUMERIC(10, 2),
      bedroom_3 NUMERIC(10, 2),
      bedroom_4 NUMERIC(10, 2),
      effective_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, zip_code)
    );
  `);

  // ZIP to County mapping (static, rarely changes)
  // Note: ZIP codes can span multiple counties, so we use composite unique constraint
  await execute(`
    CREATE TABLE IF NOT EXISTS zip_county_mapping (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      county_name TEXT NOT NULL,
      state_code VARCHAR(2) NOT NULL,
      state_name TEXT NOT NULL,
      county_fips VARCHAR(5),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(zip_code, county_name, state_code)
    );
  `);

  // Cities table for autocomplete (derived from ZIP data)
  await execute(`
    CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY,
      city_name TEXT NOT NULL,
      state_code VARCHAR(2) NOT NULL,
      state_name TEXT NOT NULL,
      zip_codes TEXT[] NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(city_name, state_code)
    );
  `);

  // Geocoded addresses cache (internal index)
  await execute(`
    CREATE TABLE IF NOT EXISTS geocoded_addresses (
      id SERIAL PRIMARY KEY,
      normalized_address TEXT NOT NULL UNIQUE,
      original_address TEXT NOT NULL,
      zip_code VARCHAR(10),
      county_name TEXT,
      state_code VARCHAR(2),
      city_name TEXT,
      latitude NUMERIC(10, 7),
      longitude NUMERIC(10, 7),
      geocoded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      source VARCHAR(50)
    );
  `);

  // Required SAFMR ZIP codes index (ZIPs that fall within the 65 required SAFMR metropolitan areas)
  await execute(`
    CREATE TABLE IF NOT EXISTS required_safmr_zips (
      zip_code VARCHAR(10) NOT NULL,
      year INTEGER NOT NULL DEFAULT 2026,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (zip_code, year)
    );
  `);

  // Cached dashboard insights (precomputed annually; avoids expensive aggregation at request time)
  await execute(`
    CREATE TABLE IF NOT EXISTS dashboard_insights_cache (
      year INTEGER NOT NULL,
      type VARCHAR(10) NOT NULL CHECK (type IN ('zip', 'city', 'county')),
      payload JSONB NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (year, type)
    );
  `);

  // Create indexes
  console.log('Creating indexes...');

  // Trigram indexes for fuzzy search
  await execute('CREATE INDEX IF NOT EXISTS idx_fmr_area_name_trgm ON fmr_data USING gin (area_name gin_trgm_ops);');
  await execute('CREATE INDEX IF NOT EXISTS idx_zip_county_name_trgm ON zip_county_mapping USING gin (county_name gin_trgm_ops);');
  await execute('CREATE INDEX IF NOT EXISTS idx_cities_name_trgm ON cities USING gin (city_name gin_trgm_ops);');
  await execute('CREATE INDEX IF NOT EXISTS idx_geocoded_address_trgm ON geocoded_addresses USING gin (normalized_address gin_trgm_ops);');

  // B-tree indexes for fast lookups
  await execute('CREATE INDEX IF NOT EXISTS idx_fmr_year ON fmr_data(year);');
  await execute('CREATE INDEX IF NOT EXISTS idx_fmr_state ON fmr_data(state_code);');
  await execute('CREATE INDEX IF NOT EXISTS idx_fmr_year_state ON fmr_data(year, state_code);');

  await execute('CREATE INDEX IF NOT EXISTS idx_fmr_county_metro_year ON fmr_county_metro(year);');
  await execute('CREATE INDEX IF NOT EXISTS idx_fmr_county_metro_year_hud_name ON fmr_county_metro(year, hud_area_name);');
  await execute('CREATE INDEX IF NOT EXISTS idx_fmr_county_metro_year_hud_code ON fmr_county_metro(year, hud_area_code);');
  await execute('CREATE INDEX IF NOT EXISTS idx_fmr_county_metro_year_county_fips ON fmr_county_metro(year, county_fips);');
  
  await execute('CREATE INDEX IF NOT EXISTS idx_safmr_year ON safmr_data(year);');
  await execute('CREATE INDEX IF NOT EXISTS idx_safmr_zip ON safmr_data(zip_code);');
  await execute('CREATE INDEX IF NOT EXISTS idx_safmr_year_zip ON safmr_data(year, zip_code);');
  
  await execute('CREATE INDEX IF NOT EXISTS idx_zip_county_zip ON zip_county_mapping(zip_code);');
  await execute('CREATE INDEX IF NOT EXISTS idx_zip_county_state ON zip_county_mapping(state_code);');
  
  await execute('CREATE INDEX IF NOT EXISTS idx_cities_state ON cities(state_code);');
  
  await execute('CREATE INDEX IF NOT EXISTS idx_geocoded_zip ON geocoded_addresses(zip_code);');
  await execute('CREATE INDEX IF NOT EXISTS idx_geocoded_state ON geocoded_addresses(state_code);');
  
  await execute('CREATE INDEX IF NOT EXISTS idx_required_safmr_zip ON required_safmr_zips(zip_code);');
  await execute('CREATE INDEX IF NOT EXISTS idx_required_safmr_year ON required_safmr_zips(year);');
  await execute('CREATE INDEX IF NOT EXISTS idx_required_safmr_zip_year ON required_safmr_zips(zip_code, year);');

  await execute('CREATE INDEX IF NOT EXISTS idx_dashboard_insights_year ON dashboard_insights_cache(year);');

  console.log('Schema created successfully!');
}

