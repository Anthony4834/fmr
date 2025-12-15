import { execute } from "./db";

/**
 * Creates all database tables and indexes
 * Should be run once during initial setup
 */
export async function createSchema() {
  console.log("Creating database schema...");

  // Enable pg_trgm extension for fuzzy text search
  await execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;");

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

  // Zillow Home Value Index (ZHVI) by ZIP + bedroom count (monthly time series; normalized/long form)
  await execute(`
    CREATE TABLE IF NOT EXISTS zhvi_zip_bedroom_monthly (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      bedroom_count INTEGER NOT NULL CHECK (bedroom_count >= 1 AND bedroom_count <= 5),
      month DATE NOT NULL,
      zhvi NUMERIC(14, 2),
      state_code VARCHAR(2),
      city_name TEXT,
      county_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(zip_code, bedroom_count, month)
    );
  `);

  // Derived helper mapping for city rollups: (zip_code, city_name, state_code)
  // Populated from `cities.zip_codes` via unnest().
  await execute(`
    CREATE TABLE IF NOT EXISTS zip_city_mapping (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      city_name TEXT NOT NULL,
      state_code VARCHAR(2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(zip_code, city_name, state_code)
    );
  `);

  // Precomputed ZHVI rollups for city/county/state (monthly)
  await execute(`
    CREATE TABLE IF NOT EXISTS zhvi_rollup_monthly (
      id SERIAL PRIMARY KEY,
      geo_type VARCHAR(10) NOT NULL CHECK (geo_type IN ('city', 'county', 'state')),
      geo_key TEXT NOT NULL,
      state_code VARCHAR(2),
      city_name TEXT,
      county_name TEXT,
      county_fips VARCHAR(5),
      bedroom_count INTEGER NOT NULL CHECK (bedroom_count >= 1 AND bedroom_count <= 5),
      month DATE NOT NULL,
      zhvi_median NUMERIC(14, 2),
      zhvi_p25 NUMERIC(14, 2),
      zhvi_p75 NUMERIC(14, 2),
      zip_count INTEGER NOT NULL DEFAULT 0,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(geo_type, geo_key, bedroom_count, month)
    );
  `);

  // ACS-derived ZIP/ZCTA effective property tax rate (latest available ACS 5-year vintage)
  // Note: this is not truly "monthly"; the cron can attempt monthly and will no-op when already indexed.
  await execute(`
    CREATE TABLE IF NOT EXISTS acs_tax_zcta_latest (
      id SERIAL PRIMARY KEY,
      acs_vintage INTEGER NOT NULL,
      zcta VARCHAR(5) NOT NULL,
      median_home_value NUMERIC(14, 2),
      median_real_estate_taxes_paid NUMERIC(14, 2),
      effective_tax_rate NUMERIC(10, 6),
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(acs_vintage, zcta)
    );
  `);

  // Create indexes
  console.log("Creating indexes...");

  // Trigram indexes for fuzzy search
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_fmr_area_name_trgm ON fmr_data USING gin (area_name gin_trgm_ops);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zip_county_name_trgm ON zip_county_mapping USING gin (county_name gin_trgm_ops);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_cities_name_trgm ON cities USING gin (city_name gin_trgm_ops);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_geocoded_address_trgm ON geocoded_addresses USING gin (normalized_address gin_trgm_ops);"
  );

  // B-tree indexes for fast lookups
  await execute("CREATE INDEX IF NOT EXISTS idx_fmr_year ON fmr_data(year);");
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_fmr_state ON fmr_data(state_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_fmr_year_state ON fmr_data(year, state_code);"
  );

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_fmr_county_metro_year ON fmr_county_metro(year);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_fmr_county_metro_year_hud_name ON fmr_county_metro(year, hud_area_name);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_fmr_county_metro_year_hud_code ON fmr_county_metro(year, hud_area_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_fmr_county_metro_year_county_fips ON fmr_county_metro(year, county_fips);"
  );

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_safmr_year ON safmr_data(year);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_safmr_zip ON safmr_data(zip_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_safmr_year_zip ON safmr_data(year, zip_code);"
  );

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zip_county_zip ON zip_county_mapping(zip_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zip_county_state ON zip_county_mapping(state_code);"
  );

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_cities_state ON cities(state_code);"
  );

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_geocoded_zip ON geocoded_addresses(zip_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_geocoded_state ON geocoded_addresses(state_code);"
  );

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_required_safmr_zip ON required_safmr_zips(zip_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_required_safmr_year ON required_safmr_zips(year);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_required_safmr_zip_year ON required_safmr_zips(zip_code, year);"
  );

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_dashboard_insights_year ON dashboard_insights_cache(year);"
  );

  // ZHVI indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zhvi_zip_bedroom_month ON zhvi_zip_bedroom_monthly(zip_code, bedroom_count, month DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zhvi_month_bedroom ON zhvi_zip_bedroom_monthly(month, bedroom_count);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zhvi_state_month ON zhvi_zip_bedroom_monthly(state_code, month DESC);"
  );

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zip_city_zip ON zip_city_mapping(zip_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zip_city_state ON zip_city_mapping(state_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zip_city_city_state ON zip_city_mapping(city_name, state_code);"
  );

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zhvi_rollup_geo_month ON zhvi_rollup_monthly(geo_type, geo_key, bedroom_count, month DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zhvi_rollup_month ON zhvi_rollup_monthly(month, geo_type);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zhvi_rollup_state_month ON zhvi_rollup_monthly(state_code, month DESC);"
  );

  // ACS tax-rate indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_acs_tax_zcta ON acs_tax_zcta_latest(zcta);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_acs_tax_vintage ON acs_tax_zcta_latest(acs_vintage);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_acs_tax_rate ON acs_tax_zcta_latest(effective_tax_rate);"
  );

  // Section 8 Investment Score (precomputed for fast lookups)
  await execute(`
    CREATE TABLE IF NOT EXISTS investment_score (
      id SERIAL PRIMARY KEY,
      geo_type VARCHAR(10) NOT NULL CHECK (geo_type IN ('zip', 'city', 'county', 'state')),
      geo_key TEXT NOT NULL,
      zip_code VARCHAR(10),
      state_code VARCHAR(2),
      city_name TEXT,
      county_name TEXT,
      county_fips VARCHAR(5),
      bedroom_count INTEGER NOT NULL CHECK (bedroom_count >= 1 AND bedroom_count <= 4),
      fmr_year INTEGER NOT NULL,
      property_value NUMERIC(14, 2) NOT NULL,
      tax_rate NUMERIC(10, 6) NOT NULL,
      annual_rent NUMERIC(10, 2) NOT NULL,
      annual_taxes NUMERIC(10, 2) NOT NULL,
      net_yield NUMERIC(10, 6) NOT NULL,
      rent_to_price_ratio NUMERIC(10, 6) NOT NULL,
      score NUMERIC(10, 2) NOT NULL,
      data_sufficient BOOLEAN NOT NULL DEFAULT true,
      -- Normalization tracking fields
      raw_zhvi NUMERIC(14, 2),
      county_zhvi_median NUMERIC(14, 2),
      blended_zhvi NUMERIC(14, 2),
      price_floor_applied BOOLEAN DEFAULT false,
      rent_cap_applied BOOLEAN DEFAULT false,
      county_blending_applied BOOLEAN DEFAULT false,
      raw_rent_to_price_ratio NUMERIC(10, 6),
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(geo_type, geo_key, bedroom_count, fmr_year)
    );
  `);

  // Add normalization tracking columns to investment_score if they don't exist
  await execute(`
    DO $$ 
    BEGIN
      -- Add raw_zhvi column if it doesn't exist
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='investment_score' AND column_name='raw_zhvi') THEN
        ALTER TABLE investment_score ADD COLUMN raw_zhvi NUMERIC(14, 2);
      END IF;
      
      -- Add county_zhvi_median column if it doesn't exist
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='investment_score' AND column_name='county_zhvi_median') THEN
        ALTER TABLE investment_score ADD COLUMN county_zhvi_median NUMERIC(14, 2);
      END IF;
      
      -- Add blended_zhvi column if it doesn't exist
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='investment_score' AND column_name='blended_zhvi') THEN
        ALTER TABLE investment_score ADD COLUMN blended_zhvi NUMERIC(14, 2);
      END IF;
      
      -- Add price_floor_applied column if it doesn't exist
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='investment_score' AND column_name='price_floor_applied') THEN
        ALTER TABLE investment_score ADD COLUMN price_floor_applied BOOLEAN DEFAULT false;
      END IF;
      
      -- Add rent_cap_applied column if it doesn't exist
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='investment_score' AND column_name='rent_cap_applied') THEN
        ALTER TABLE investment_score ADD COLUMN rent_cap_applied BOOLEAN DEFAULT false;
      END IF;
      
      -- Add county_blending_applied column if it doesn't exist
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='investment_score' AND column_name='county_blending_applied') THEN
        ALTER TABLE investment_score ADD COLUMN county_blending_applied BOOLEAN DEFAULT false;
      END IF;
      
      -- Add raw_rent_to_price_ratio column if it doesn't exist
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='investment_score' AND column_name='raw_rent_to_price_ratio') THEN
        ALTER TABLE investment_score ADD COLUMN raw_rent_to_price_ratio NUMERIC(10, 6);
      END IF;
    END $$;
  `);

  // Investment score indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_investment_score_zip ON investment_score(zip_code, bedroom_count, fmr_year DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_investment_score_state ON investment_score(state_code, bedroom_count, fmr_year DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_investment_score_county ON investment_score(county_name, state_code, bedroom_count, fmr_year DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_investment_score_city ON investment_score(city_name, state_code, bedroom_count, fmr_year DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_investment_score_geo ON investment_score(geo_type, geo_key, bedroom_count, fmr_year DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_investment_score_value ON investment_score(score DESC, geo_type, fmr_year DESC);"
  );

  console.log("Schema created successfully!");
}
