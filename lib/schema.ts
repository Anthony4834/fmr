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

  // ACS-derived ZIP/ZCTA effective property tax rate (multiple ACS 5-year vintages)
  // Note: Despite the "_latest" suffix in the table name, this table stores multiple vintages
  // per ZCTA (via UNIQUE(acs_vintage, zcta)) to preserve historical data.
  // The cron can attempt monthly and will no-op when a vintage is already indexed.
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

  // Cached mortgage rates (fetched daily from API Ninjas)
  await execute(`
    CREATE TABLE IF NOT EXISTS mortgage_rates (
      id SERIAL PRIMARY KEY,
      rate_type VARCHAR(50) NOT NULL DEFAULT '30_year_fixed',
      rate_annual_pct NUMERIC(10, 6) NOT NULL,
      source VARCHAR(100) NOT NULL DEFAULT 'API Ninjas',
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Precomputed insights (yield movers) for screener and yield-movers APIs; populated on the 19th by cron
  await execute(`
    CREATE TABLE IF NOT EXISTS insights_index (
      geo_type VARCHAR(10) NOT NULL CHECK (geo_type IN ('zip', 'city', 'county')),
      geo_key VARCHAR(255) NOT NULL,
      state_code VARCHAR(2) NOT NULL,
      zip_code VARCHAR(10),
      city_name TEXT,
      area_name TEXT,
      county_name TEXT,
      fmr_curr NUMERIC(14, 2) NOT NULL,
      fmr_yoy NUMERIC(10, 4) NOT NULL,
      zhvi_curr NUMERIC(14, 2) NOT NULL,
      zhvi_yoy NUMERIC(10, 4) NOT NULL,
      yield_curr NUMERIC(10, 6) NOT NULL,
      yield_delta_pp NUMERIC(10, 4) NOT NULL,
      divergence_pp NUMERIC(10, 4) NOT NULL,
      zip_count INTEGER,
      zhvi_as_of_month VARCHAR(10) NOT NULL,
      fmr_year INTEGER NOT NULL,
      indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (geo_type, geo_key)
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
    "CREATE INDEX IF NOT EXISTS idx_insights_index_geo_state ON insights_index(geo_type, state_code);"
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

  // Mortgage rate indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_mortgage_rates_fetched_at ON mortgage_rates(fetched_at DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_mortgage_rates_type_fetched ON mortgage_rates(rate_type, fetched_at DESC);"
  );

  // RentCast market rent data (scraped from rentcast.io)
  await execute(`
    CREATE TABLE IF NOT EXISTS rentcast_market_rents (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      bedroom_count INTEGER NOT NULL CHECK (bedroom_count >= 0 AND bedroom_count <= 4),
      estimated_monthly_rent NUMERIC(10, 2),
      rent_per_sqft NUMERIC(10, 2),
      rent_per_bedroom NUMERIC(10, 2),
      low_estimate NUMERIC(10, 2),
      high_estimate NUMERIC(10, 2),
      low_estimate_per_sqft NUMERIC(10, 2),
      high_estimate_per_sqft NUMERIC(10, 2),
      data_status VARCHAR(20) CHECK (data_status IN ('available', 'insufficient_comps', 'no_data')),
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(zip_code, bedroom_count)
    );
  `);

  // RentCast scraping state and rate limit tracking
  await execute(`
    CREATE TABLE IF NOT EXISTS rentcast_scraping_state (
      id SERIAL PRIMARY KEY,
      current_zip_code VARCHAR(10),
      current_bedroom_count INTEGER CHECK (current_bedroom_count >= 0 AND current_bedroom_count <= 4),
      last_successful_zip VARCHAR(10),
      last_successful_bedroom INTEGER,
      last_successful_at TIMESTAMPTZ,
      rate_limit_hit_at TIMESTAMPTZ,
      rate_limit_resume_at TIMESTAMPTZ,
      consecutive_rate_limits INTEGER DEFAULT 0,
      total_requests_made INTEGER DEFAULT 0,
      total_successful_scrapes INTEGER DEFAULT 0,
      total_rate_limits INTEGER DEFAULT 0,
      average_request_interval_ms INTEGER DEFAULT 0,
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(id)
    );
  `);

  // RentCast scraping indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_rentcast_zip_bedroom ON rentcast_market_rents(zip_code, bedroom_count);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_rentcast_scraped_at ON rentcast_market_rents(scraped_at DESC);"
  );
  
  // Add data_status column if it doesn't exist (for existing tables)
  // Must run BEFORE creating index on this column
  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'rentcast_market_rents' 
        AND column_name = 'data_status'
      ) THEN
        ALTER TABLE rentcast_market_rents 
        ADD COLUMN data_status VARCHAR(20) CHECK (data_status IN ('available', 'insufficient_comps', 'no_data'));
      END IF;
    END $$;
  `);
  
  // Create index on data_status after ensuring column exists
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_rentcast_data_status ON rentcast_market_rents(data_status);"
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
      -- Historical data tracking: track which data sources were used
      zhvi_month DATE,
      acs_vintage INTEGER,
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
      -- Include zhvi_month and acs_vintage in unique constraint to preserve historical versions
      UNIQUE(geo_type, geo_key, bedroom_count, fmr_year, zhvi_month, acs_vintage)
    );
  `);

  // Add normalization tracking columns to investment_score if they don't exist
  await execute(`
    DO $$ 
    BEGIN
      -- Add zhvi_month column if it doesn't exist (for historical data tracking)
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='investment_score' AND column_name='zhvi_month') THEN
        ALTER TABLE investment_score ADD COLUMN zhvi_month DATE;
      END IF;
      
      -- Add acs_vintage column if it doesn't exist (for historical data tracking)
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='investment_score' AND column_name='acs_vintage') THEN
        ALTER TABLE investment_score ADD COLUMN acs_vintage INTEGER;
      END IF;
      
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

      -- Add demand_score column if it doesn't exist (rental demand factor 0-100)
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='investment_score' AND column_name='demand_score') THEN
        ALTER TABLE investment_score ADD COLUMN demand_score NUMERIC(10, 2);
      END IF;

      -- Add demand_multiplier column if it doesn't exist (0.90-1.10)
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='investment_score' AND column_name='demand_multiplier') THEN
        ALTER TABLE investment_score ADD COLUMN demand_multiplier NUMERIC(10, 4);
      END IF;

      -- Add score_with_demand column if it doesn't exist (final score adjusted by demand)
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='investment_score' AND column_name='score_with_demand') THEN
        ALTER TABLE investment_score ADD COLUMN score_with_demand NUMERIC(10, 2);
      END IF;

      -- Add zordi_metro column for tracking which metro demand was used
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='investment_score' AND column_name='zordi_metro') THEN
        ALTER TABLE investment_score ADD COLUMN zordi_metro TEXT;
      END IF;

      -- Add zori_yoy column for tracking rent growth (year-over-year)
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='investment_score' AND column_name='zori_yoy') THEN
        ALTER TABLE investment_score ADD COLUMN zori_yoy NUMERIC(10, 6);
      END IF;

      -- Update unique constraint to include zhvi_month and acs_vintage if the old constraint exists
      -- This allows preserving historical versions when data sources change
      IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'investment_score_geo_type_geo_key_bedroom_count_fmr_year_key'
        AND conrelid = 'investment_score'::regclass
      ) THEN
        -- Drop old constraint
        ALTER TABLE investment_score DROP CONSTRAINT investment_score_geo_type_geo_key_bedroom_count_fmr_year_key;
        -- Add new constraint with historical tracking
        ALTER TABLE investment_score ADD CONSTRAINT investment_score_geo_type_geo_key_bedroom_count_fmr_year_zhvi_month_acs_vintage_key 
          UNIQUE(geo_type, geo_key, bedroom_count, fmr_year, zhvi_month, acs_vintage);
      END IF;
    END $$;
  `);

  // Zillow Observed Rent Index (ZORI) - ZIP-level rent data (monthly time series)
  await execute(`
    CREATE TABLE IF NOT EXISTS zillow_zori_zip_monthly (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      month DATE NOT NULL,
      zori NUMERIC(10, 2),
      state_code VARCHAR(2),
      city_name TEXT,
      county_name TEXT,
      metro_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(zip_code, month)
    );
  `);

  // Zillow Observed Renter Demand Index (ZORDI) - Metro-level demand data (monthly time series)
  await execute(`
    CREATE TABLE IF NOT EXISTS zillow_zordi_metro_monthly (
      id SERIAL PRIMARY KEY,
      region_name TEXT NOT NULL,
      region_type VARCHAR(20) NOT NULL,
      cbsa_code VARCHAR(10),
      month DATE NOT NULL,
      zordi NUMERIC(10, 4),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(region_name, region_type, month)
    );
  `);

  // CBSA to ZIP mapping (for joining metro-level ZORDI to ZIP-level data)
  await execute(`
    CREATE TABLE IF NOT EXISTS cbsa_zip_mapping (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10) NOT NULL,
      cbsa_code VARCHAR(10) NOT NULL,
      cbsa_name TEXT NOT NULL,
      state_code VARCHAR(2),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(zip_code, cbsa_code)
    );
  `);

  // ZORI indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zori_zip_month ON zillow_zori_zip_monthly(zip_code, month DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zori_month ON zillow_zori_zip_monthly(month DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zori_state ON zillow_zori_zip_monthly(state_code, month DESC);"
  );

  // ZORDI indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zordi_region_month ON zillow_zordi_metro_monthly(region_name, month DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zordi_cbsa_month ON zillow_zordi_metro_monthly(cbsa_code, month DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_zordi_month ON zillow_zordi_metro_monthly(month DESC);"
  );

  // CBSA mapping indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_cbsa_zip ON cbsa_zip_mapping(zip_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_cbsa_code ON cbsa_zip_mapping(cbsa_code);"
  );

  // Missing data events (fire-and-forget logging for debugging data gaps)
  await execute(`
    CREATE TABLE IF NOT EXISTS missing_data_events (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10),
      address TEXT,
      bedrooms INTEGER,
      price NUMERIC(14, 2),
      missing_fields TEXT[] NOT NULL,
      source VARCHAR(50),
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Missing data events indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_missing_data_zip ON missing_data_events(zip_code);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_missing_data_created ON missing_data_events(created_at DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_missing_data_fields ON missing_data_events USING gin(missing_fields);"
  );

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

  // ============================================
  // Authentication Tables
  // ============================================
  console.log("Creating authentication tables...");

  // Users table (core user identity)
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      email_verified TIMESTAMPTZ,
      name TEXT,
      image TEXT,
      password_hash TEXT,  -- bcrypt hash, null for OAuth-only users
      tier VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'paid', 'free_forever')),
      role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      signup_method VARCHAR(20) CHECK (signup_method IN ('credentials', 'google', 'admin_created')),
      locked_until TIMESTAMPTZ,  -- account lockout timestamp
      last_seen TIMESTAMPTZ,  -- last activity (middleware / auth)
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Add last_seen column if it doesn't exist (existing DBs)
  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'last_seen'
      ) THEN
        ALTER TABLE users ADD COLUMN last_seen TIMESTAMPTZ;
      END IF;
    END $$;
  `);

  // Add role column if it doesn't exist (for existing tables)
  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role'
      ) THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin'));
      END IF;
    END $$;
  `);

  // Add signup_method column if it doesn't exist
  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'signup_method'
      ) THEN
        ALTER TABLE users ADD COLUMN signup_method VARCHAR(20) CHECK (signup_method IN ('credentials', 'google', 'admin_created'));
        -- Update existing users based on presence of password_hash
        UPDATE users SET signup_method = 'credentials' WHERE password_hash IS NOT NULL AND signup_method IS NULL;
        UPDATE users SET signup_method = 'google' WHERE password_hash IS NULL AND signup_method IS NULL;
      END IF;
    END $$;
  `);

  // OAuth accounts with ENCRYPTED tokens
  await execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      provider VARCHAR(50) NOT NULL,
      provider_account_id TEXT NOT NULL,
      -- Tokens are AES-256-GCM encrypted, NOT plaintext
      refresh_token_encrypted TEXT,
      access_token_encrypted TEXT,
      expires_at INTEGER,
      token_type VARCHAR(50),
      scope TEXT,
      id_token_encrypted TEXT,
      session_state TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_account_id)
    );
  `);

  // Login attempts for brute-force protection
  await execute(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY,
      identifier VARCHAR(255) NOT NULL,
      identifier_type VARCHAR(10) NOT NULL CHECK (identifier_type IN ('email', 'ip')),
      success BOOLEAN NOT NULL,
      attempted_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Verification tokens (email verification, password reset)
  await execute(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires TIMESTAMPTZ NOT NULL,
      type VARCHAR(20) CHECK (type IN ('email_verification', 'password_reset')),
      PRIMARY KEY (identifier, token_hash)
    );
  `);

  // Add type column if it doesn't exist
  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'verification_tokens' AND column_name = 'type'
      ) THEN
        ALTER TABLE verification_tokens ADD COLUMN type VARCHAR(20) CHECK (type IN ('email_verification', 'password_reset'));
      END IF;
    END $$;
  `);

  // Verification attempts table for tracking brute force attempts
  await execute(`
    CREATE TABLE IF NOT EXISTS verification_attempts (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      success BOOLEAN NOT NULL,
      attempted_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Guests table for tracking guest users and conversions
  await execute(`
    CREATE TABLE IF NOT EXISTS guests (
      id SERIAL PRIMARY KEY,
      guest_id UUID UNIQUE NOT NULL,
      ip_hash VARCHAR(64) NOT NULL,
      ua_hash VARCHAR(64) NOT NULL,
      first_seen TIMESTAMPTZ DEFAULT NOW(),
      last_seen TIMESTAMPTZ DEFAULT NOW(),
      request_count INTEGER DEFAULT 0,
      limit_hit_at TIMESTAMPTZ,
      converted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      conversion_reason VARCHAR(50) CHECK (conversion_reason IN ('organic', 'after_limit_hit', 'extension')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Auth table indexes
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier, attempted_at DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_login_attempts_cleanup ON login_attempts(attempted_at);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_verification_tokens_identifier ON verification_tokens(identifier);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_verification_attempts_email ON verification_attempts(email, attempted_at DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_verification_attempts_ip ON verification_attempts(ip_address, attempted_at DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_guests_guest_id ON guests(guest_id);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_guests_converted_user_id ON guests(converted_user_id) WHERE converted_user_id IS NOT NULL;"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_guests_limit_hit_at ON guests(limit_hit_at) WHERE limit_hit_at IS NOT NULL;"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_guests_last_seen ON guests(last_seen DESC);"
  );

  console.log("Schema created successfully!");
}
