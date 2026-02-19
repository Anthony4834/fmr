import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

type GeoType = 'state' | 'county' | 'city' | 'zip';
type SortField = 'score' | 'yield' | 'cashFlow' | 'appreciation' | 'affordability' | 'heat' | 'fmr' | 'name';
type AffordabilityTier = 'affordable' | 'midMarket' | 'premium' | 'all';
type YieldRange = 'low' | 'moderate' | 'high' | 'all';

function normalizeType(input: string | null): GeoType {
  return input === 'county' || input === 'city' || input === 'zip' ? input : 'state';
}

function normalizeSort(input: string | null): SortField {
  const valid: SortField[] = ['score', 'yield', 'cashFlow', 'appreciation', 'affordability', 'heat', 'fmr', 'name'];
  return valid.includes(input as SortField) ? (input as SortField) : 'score';
}

function normalizeBedroom(input: string | null): number | 'all' {
  if (input === 'all') return 'all';
  const n = Number(input || '3');
  if (!Number.isFinite(n)) return 3;
  return Math.min(4, Math.max(2, Math.floor(n)));
}

// Calculate monthly mortgage payment
function calculateMortgagePayment(principal: number, annualRate: number, years: number = 30): number {
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;
  if (monthlyRate === 0) return principal / numPayments;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
}

// Fetch market overview data
async function fetchMarketOverview(year: number) {
  const mortgageRateResult = await sql`
    SELECT rate_annual_pct 
    FROM mortgage_rates 
    WHERE rate_type = '30_year_fixed'
    ORDER BY fetched_at DESC 
    LIMIT 1
  `;
  const mortgageRate = mortgageRateResult.rows[0]?.rate_annual_pct 
    ? Number(mortgageRateResult.rows[0].rate_annual_pct) / 100
    : 0.065;

  const baseCTE = `
    WITH latest_versions AS (
      SELECT
        MAX(zhvi_month) as latest_zhvi_month,
        MAX(acs_vintage) as latest_acs_vintage
      FROM investment_score
      WHERE fmr_year = $1
        AND data_sufficient = true
    ),
    base_scores AS (
      SELECT
        isc.zip_code,
        isc.city_name,
        isc.county_name,
        isc.state_code,
        isc.bedroom_count,
        COALESCE(isc.score_with_demand, isc.score) as score,
        isc.net_yield,
        isc.property_value,
        isc.tax_rate,
        isc.annual_rent,
        (isc.annual_rent / 12 * 0.92) 
        - (isc.property_value * 0.80 * ${mortgageRate} / 12 * 1.5)
        - (isc.property_value * isc.tax_rate / 12)
        as cash_flow_estimate,
        (COALESCE(isc.score_with_demand, isc.score) / NULLIF(isc.property_value, 0)) as value_ratio
      FROM investment_score isc
      CROSS JOIN latest_versions lv
      WHERE isc.fmr_year = $1
        AND isc.data_sufficient = true
        AND isc.geo_type = 'zip'
        AND isc.zip_code IS NOT NULL
        AND isc.state_code IS NOT NULL
        AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
        AND isc.bedroom_count IN (2, 3, 4)
        AND (
          (lv.latest_zhvi_month IS NULL AND isc.zhvi_month IS NULL) OR
          (lv.latest_zhvi_month IS NOT NULL AND isc.zhvi_month = lv.latest_zhvi_month)
        )
        AND (
          (lv.latest_acs_vintage IS NULL AND isc.acs_vintage IS NULL) OR
          (lv.latest_acs_vintage IS NOT NULL AND isc.acs_vintage = lv.latest_acs_vintage)
        )
    )
  `;

  const queries = {
    highestScore: baseCTE + `
      SELECT
        ROW_NUMBER() OVER (ORDER BY score DESC) as rank,
        zip_code,
        city_name,
        county_name,
        state_code,
        bedroom_count,
        score,
        net_yield,
        property_value,
        cash_flow_estimate
      FROM base_scores
      ORDER BY score DESC
      LIMIT 20
    `,
    highestYield: baseCTE + `
      SELECT
        ROW_NUMBER() OVER (ORDER BY net_yield DESC) as rank,
        zip_code,
        city_name,
        county_name,
        state_code,
        bedroom_count,
        score,
        net_yield,
        property_value,
        cash_flow_estimate
      FROM base_scores
      ORDER BY net_yield DESC
      LIMIT 20
    `,
    highestCashFlow: baseCTE + `
      SELECT
        ROW_NUMBER() OVER (ORDER BY cash_flow_estimate DESC) as rank,
        zip_code,
        city_name,
        county_name,
        state_code,
        bedroom_count,
        score,
        net_yield,
        property_value,
        cash_flow_estimate
      FROM base_scores
      ORDER BY cash_flow_estimate DESC
      LIMIT 20
    `,
    bestStarters: baseCTE + `
      SELECT
        ROW_NUMBER() OVER (ORDER BY cash_flow_estimate DESC) as rank,
        zip_code,
        city_name,
        county_name,
        state_code,
        bedroom_count,
        score,
        net_yield,
        property_value,
        cash_flow_estimate
      FROM base_scores
      WHERE property_value BETWEEN 90000 AND 110000
      ORDER BY cash_flow_estimate DESC
      LIMIT 20
    `,
    bestValue: baseCTE + `
      SELECT
        ROW_NUMBER() OVER (ORDER BY value_ratio DESC) as rank,
        zip_code,
        city_name,
        county_name,
        state_code,
        bedroom_count,
        score,
        net_yield,
        property_value,
        cash_flow_estimate,
        value_ratio
      FROM base_scores
      WHERE property_value > 0
      ORDER BY value_ratio DESC
      LIMIT 20
    `,
  };

  const [highestScore, highestYield, highestCashFlow, bestStarters, bestValue] = await Promise.all([
    sql.query(queries.highestScore, [year]),
    sql.query(queries.highestYield, [year]),
    sql.query(queries.highestCashFlow, [year]),
    sql.query(queries.bestStarters, [year]),
    sql.query(queries.bestValue, [year]),
  ]);

  return {
    highestScore: highestScore.rows,
    highestYield: highestYield.rows,
    highestCashFlow: highestCashFlow.rows,
    bestStarters: bestStarters.rows,
    bestValue: bestValue.rows,
  };
}

// Fetch market explorer data (simplified version with 500 limit)
async function fetchMarketExplorer(
  year: number,
  type: GeoType,
  sort: SortField,
  sortDirection: 'asc' | 'desc',
  bedroom: number | 'all',
  search: string | null,
  stateFilter: string | null,
  affordabilityTier: AffordabilityTier,
  yieldRange: YieldRange,
  minScore: number | null
) {
  const limit = 500; // Max 500 results as per requirements

  const mortgageRateResult = await sql`
    SELECT rate_annual_pct 
    FROM mortgage_rates 
    WHERE rate_type = '30_year_fixed'
    ORDER BY fetched_at DESC 
    LIMIT 1
  `;
  const mortgageRate = mortgageRateResult.rows[0]?.rate_annual_pct 
    ? Number(mortgageRateResult.rows[0].rate_annual_pct) / 100
    : 0.07;

  const nationalMedianResult = await sql`
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) as national_median
    FROM investment_score
    WHERE fmr_year = ${year}
      AND data_sufficient = true
      AND property_value > 0
      AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
  `;
  const nationalMedianZHVI = Number(nationalMedianResult.rows[0]?.national_median) || 300000;

  const getSortClause = () => {
    const direction = sortDirection.toUpperCase();
    const nullsLast = 'NULLS LAST';
    switch (sort) {
      case 'yield': return `median_yield ${direction} ${nullsLast}`;
      case 'cashFlow': return `cash_flow_estimate ${direction} ${nullsLast}`;
      case 'appreciation': return `appreciation_1y ${direction} ${nullsLast}`;
      case 'affordability': return `median_value ${direction} ${nullsLast}`;
      case 'heat': return `heat_score ${direction} ${nullsLast}`;
      case 'fmr': return `median_fmr ${direction} ${nullsLast}`;
      case 'name': return type === 'state' ? `state_code ${direction}` : `name ${direction}`;
      default: return `median_score ${direction} ${nullsLast}`;
    }
  };

  const buildFilterConditions = () => {
    const conditions: string[] = [];
    if (minScore !== null && !isNaN(minScore)) {
      conditions.push(`median_score >= ${minScore}`);
    }
    if (affordabilityTier === 'affordable') {
      conditions.push('median_value < 150000');
    } else if (affordabilityTier === 'midMarket') {
      conditions.push('median_value >= 150000 AND median_value <= 350000');
    } else if (affordabilityTier === 'premium') {
      conditions.push('median_value > 350000');
    }
    if (yieldRange === 'low') {
      conditions.push('median_yield < 0.05');
    } else if (yieldRange === 'moderate') {
      conditions.push('median_yield >= 0.05 AND median_yield <= 0.07');
    } else if (yieldRange === 'high') {
      conditions.push('median_yield > 0.07');
    }
    return conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  };

  // Handle different geo types
  if (type === 'state') {
    // State-level aggregation
    const query = `
      WITH latest_versions AS (
        SELECT
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
      ),
      base_scores AS (
        SELECT
          isc.state_code,
          COALESCE(isc.score_with_demand, isc.score) as score,
          isc.net_yield,
          isc.property_value,
          isc.tax_rate,
          isc.annual_rent,
          isc.demand_score,
          isc.zori_yoy
        FROM investment_score isc
        CROSS JOIN latest_versions lv
        WHERE isc.fmr_year = $1
          AND isc.data_sufficient = true
          AND isc.state_code IS NOT NULL
          AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          AND (
            (lv.latest_zhvi_month IS NULL AND isc.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND isc.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND isc.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND isc.acs_vintage = lv.latest_acs_vintage)
          )
          AND ($2::text IS NULL OR isc.state_code ILIKE ($2::text || '%'))
      ),
      aggregated AS (
        SELECT
          bs.state_code,
          bs.state_code as name,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.score) as median_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.net_yield) as median_yield,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) as median_value,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.tax_rate) as median_tax,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.annual_rent / 12) as median_fmr,
          AVG(bs.demand_score) as avg_demand,
          AVG(bs.zori_yoy) as avg_rent_growth,
          COUNT(DISTINCT bs.state_code || '-' || COALESCE(bs.net_yield::text, '')) as zip_count,
          (${nationalMedianZHVI} / NULLIF(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value), 0)) * 100 as affordability_index,
          COALESCE(AVG(bs.demand_score), 50) * 0.4 + 
          COALESCE(AVG(bs.zori_yoy) * 100, 0) * 6 as heat_score,
          (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.annual_rent / 12) * 0.92) 
          - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * 0.80 * ${mortgageRate} / 12 * 1.5)
          - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.tax_rate) / 12)
          as cash_flow_estimate
        FROM base_scores bs
        GROUP BY bs.state_code
      ),
      filtered AS (
        SELECT * FROM aggregated
        ${buildFilterConditions()}
      ),
      ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY ${getSortClause()}) as rank
        FROM filtered
      )
      SELECT * FROM ranked
      ORDER BY rank
      LIMIT ${limit}
    `;

    const result = await sql.query(query, [year, search]);
    return result.rows;
  } else if (type === 'county') {
    // County-level aggregation
    const query = `
      WITH latest_versions AS (
        SELECT
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
      ),
      base_scores AS (
        SELECT
          isc.county_fips,
          isc.county_name,
          isc.state_code,
          COALESCE(isc.score_with_demand, isc.score) as score,
          isc.net_yield,
          isc.property_value,
          isc.tax_rate,
          isc.annual_rent,
          isc.demand_score,
          isc.zori_yoy
        FROM investment_score isc
        CROSS JOIN latest_versions lv
        WHERE isc.fmr_year = $1
          AND isc.data_sufficient = true
          AND isc.county_fips IS NOT NULL
          AND LENGTH(TRIM(isc.county_fips)) = 5
          AND isc.state_code IS NOT NULL
          AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          AND (
            (lv.latest_zhvi_month IS NULL AND isc.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND isc.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND isc.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND isc.acs_vintage = lv.latest_acs_vintage)
          )
          AND ($2::text IS NULL OR isc.state_code = $2::text)
          AND ($3::text IS NULL OR isc.county_name ILIKE ('%' || $3::text || '%'))
      ),
      aggregated AS (
        SELECT
          bs.county_fips,
          COALESCE(bs.county_name, 'Unknown County') as name,
          bs.state_code,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.score) as median_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.net_yield) as median_yield,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) as median_value,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.tax_rate) as median_tax,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.annual_rent / 12) as median_fmr,
          AVG(bs.demand_score) as avg_demand,
          AVG(bs.zori_yoy) as avg_rent_growth,
          COUNT(*) as zip_count,
          (${nationalMedianZHVI} / NULLIF(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value), 0)) * 100 as affordability_index,
          COALESCE(AVG(bs.demand_score), 50) * 0.4 + 
          COALESCE(AVG(bs.zori_yoy) * 100, 0) * 6 as heat_score,
          (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.annual_rent / 12) * 0.92) 
          - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * 0.80 * ${mortgageRate} / 12 * 1.5)
          - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.tax_rate) / 12)
          as cash_flow_estimate
        FROM base_scores bs
        GROUP BY bs.county_fips, bs.county_name, bs.state_code
      ),
      filtered AS (
        SELECT * FROM aggregated
        ${buildFilterConditions()}
      ),
      ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY ${getSortClause()}) as rank
        FROM filtered
      )
      SELECT * FROM ranked
      ORDER BY rank
      LIMIT ${limit}
    `;

    const result = await sql.query(query, [year, stateFilter, search]);
    return result.rows;
  } else if (type === 'city') {
    // City-level aggregation
    const query = `
      WITH latest_versions AS (
        SELECT
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
      ),
      base_scores AS (
        SELECT
          isc.city_name,
          isc.county_name,
          isc.state_code,
          COALESCE(isc.score_with_demand, isc.score) as score,
          isc.net_yield,
          isc.property_value,
          isc.tax_rate,
          isc.annual_rent,
          isc.demand_score,
          isc.zori_yoy
        FROM investment_score isc
        CROSS JOIN latest_versions lv
        WHERE isc.fmr_year = $1
          AND isc.data_sufficient = true
          AND isc.city_name IS NOT NULL
          AND isc.state_code IS NOT NULL
          AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          AND (
            (lv.latest_zhvi_month IS NULL AND isc.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND isc.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND isc.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND isc.acs_vintage = lv.latest_acs_vintage)
          )
          AND ($2::text IS NULL OR isc.state_code = $2::text)
          AND ($3::text IS NULL OR isc.city_name ILIKE ('%' || $3::text || '%'))
      ),
      aggregated AS (
        SELECT
          bs.city_name as name,
          bs.state_code,
          (SELECT county_name FROM base_scores WHERE city_name = bs.city_name AND state_code = bs.state_code LIMIT 1) as county_name,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.score) as median_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.net_yield) as median_yield,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) as median_value,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.tax_rate) as median_tax,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.annual_rent / 12) as median_fmr,
          AVG(bs.demand_score) as avg_demand,
          AVG(bs.zori_yoy) as avg_rent_growth,
          COUNT(*) as zip_count,
          (${nationalMedianZHVI} / NULLIF(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value), 0)) * 100 as affordability_index,
          COALESCE(AVG(bs.demand_score), 50) * 0.4 + 
          COALESCE(AVG(bs.zori_yoy) * 100, 0) * 6 as heat_score,
          (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.annual_rent / 12) * 0.92) 
          - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * 0.80 * ${mortgageRate} / 12 * 1.5)
          - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.tax_rate) / 12)
          as cash_flow_estimate
        FROM base_scores bs
        GROUP BY bs.city_name, bs.state_code
      ),
      filtered AS (
        SELECT * FROM aggregated
        ${buildFilterConditions()}
      ),
      ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY ${getSortClause()}) as rank
        FROM filtered
      )
      SELECT * FROM ranked
      ORDER BY rank
      LIMIT ${limit}
    `;

    const result = await sql.query(query, [year, stateFilter, search]);
    return result.rows;
  } else if (type === 'zip') {
    const bedroomFilter = bedroom === 'all' 
      ? 'AND isc.bedroom_count IN (2, 3, 4)'
      : 'AND isc.bedroom_count = $4::integer';
    
    const baseScoresSelect = bedroom === 'all'
      ? `
      WITH latest_versions AS (
        SELECT
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
      ),
      base_scores AS (
        SELECT
          isc.zip_code,
          MAX(isc.city_name) as city_name,
          MAX(isc.county_name) as county_name,
          MAX(isc.state_code) as state_code,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(isc.score_with_demand, isc.score)) as score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY isc.net_yield) as net_yield,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY isc.property_value) as property_value,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY isc.tax_rate) as tax_rate,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY isc.annual_rent) as annual_rent,
          AVG(isc.demand_score) as demand_score,
          AVG(isc.zori_yoy) as zori_yoy
        FROM investment_score isc
        CROSS JOIN latest_versions lv
        WHERE isc.fmr_year = $1
          AND isc.data_sufficient = true
          AND isc.geo_type = 'zip'
          AND isc.zip_code IS NOT NULL
          AND isc.state_code IS NOT NULL
          AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          ${bedroomFilter}
          AND (
            (lv.latest_zhvi_month IS NULL AND isc.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND isc.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND isc.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND isc.acs_vintage = lv.latest_acs_vintage)
          )
          AND ($2::text IS NULL OR isc.state_code = $2::text)
          AND ($3::text IS NULL OR isc.zip_code ILIKE ($3::text || '%'))
        GROUP BY isc.zip_code
      ),`
      : `
      WITH latest_versions AS (
        SELECT
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM investment_score
        WHERE fmr_year = $1
          AND data_sufficient = true
      ),
      base_scores AS (
        SELECT
          isc.zip_code,
          isc.city_name,
          isc.county_name,
          isc.state_code,
          isc.bedroom_count,
          COALESCE(isc.score_with_demand, isc.score) as score,
          isc.net_yield,
          isc.property_value,
          isc.tax_rate,
          isc.annual_rent,
          isc.demand_score,
          isc.zori_yoy
        FROM investment_score isc
        CROSS JOIN latest_versions lv
        WHERE isc.fmr_year = $1
          AND isc.data_sufficient = true
          AND isc.geo_type = 'zip'
          AND isc.zip_code IS NOT NULL
          AND isc.state_code IS NOT NULL
          AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
          ${bedroomFilter}
          AND (
            (lv.latest_zhvi_month IS NULL AND isc.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND isc.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND isc.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND isc.acs_vintage = lv.latest_acs_vintage)
          )
          AND ($2::text IS NULL OR isc.state_code = $2::text)
          AND ($3::text IS NULL OR isc.zip_code ILIKE ($3::text || '%'))
      ),`;

    const query = `
      ${baseScoresSelect}
      with_metrics AS (
        SELECT
          bs.zip_code as name,
          bs.zip_code,
          bs.city_name,
          bs.county_name,
          bs.state_code,
          bs.bedroom_count,
          bs.score as median_score,
          bs.net_yield as median_yield,
          bs.property_value as median_value,
          bs.tax_rate as median_tax,
          bs.annual_rent / 12 as median_fmr,
          bs.demand_score as avg_demand,
          bs.zori_yoy as avg_rent_growth,
          1 as zip_count,
          (${nationalMedianZHVI} / NULLIF(bs.property_value, 0)) * 100 as affordability_index,
          COALESCE(bs.demand_score, 50) * 0.4 + COALESCE(bs.zori_yoy * 100, 0) * 6 as heat_score,
          (bs.annual_rent / 12 * 0.92) 
          - (bs.property_value * 0.80 * ${mortgageRate} / 12 * 1.5)
          - (bs.property_value * bs.tax_rate / 12)
          as cash_flow_estimate
        FROM base_scores bs
      ),
      filtered AS (
        SELECT * FROM with_metrics
        ${buildFilterConditions()}
      ),
      ranked AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (ORDER BY ${getSortClause()}) as rank
        FROM filtered
      )
      SELECT * FROM ranked
      ORDER BY rank
      LIMIT ${limit}
    `;

    const queryParams = bedroom === 'all' 
      ? [year, stateFilter, search]
      : [year, stateFilter, search, bedroom];
    
    const result = await sql.query(query, queryParams);
    return result.rows;
  }

  // Fallback (should not reach here)
  return [];
}

// Generate filename based on filters
function generateFilename(
  type: GeoType,
  bedroom: number | 'all',
  stateFilter: string | null,
  search: string | null,
  affordabilityTier: AffordabilityTier,
  yieldRange: YieldRange,
  minScore: number | null
): string {
  const parts: string[] = ['fmr', 'export'];
  
  // Add type
  parts.push(type);
  
  // Add bedroom filter
  if (bedroom === 'all') {
    parts.push('allbr');
  } else {
    parts.push(`${bedroom}br`);
  }
  
  // Add state filter if present
  if (stateFilter) {
    parts.push(stateFilter.toLowerCase());
  }
  
  // Add search if present (truncate to 20 chars)
  if (search) {
    const searchClean = search.replace(/[^a-z0-9]/gi, '').substring(0, 20).toLowerCase();
    if (searchClean) {
      parts.push(searchClean);
    }
  }
  
  // Add affordability tier if not 'all'
  if (affordabilityTier !== 'all') {
    parts.push(affordabilityTier);
  }
  
  // Add yield range if not 'all'
  if (yieldRange !== 'all') {
    parts.push(yieldRange);
  }
  
  // Add min score if present
  if (minScore !== null) {
    parts.push(`min${minScore}`);
  }
  
  // Add date
  const date = new Date().toISOString().split('T')[0];
  parts.push(date);
  
  // Join with dashes and ensure no trailing dashes, then add extension
  const filename = parts.filter(p => p.length > 0).join('-');
  return `${filename}.xlsx`;
}

// Convert data to Excel format
function createExcelFile(
  overviewData: any,
  explorerData: any[],
  year: number,
  type: GeoType,
  bedroom: number | 'all'
) {
  const workbook = XLSX.utils.book_new();

  // Market Overview Sheet - combine all categories with Category column
  const overviewRows: any[] = [];
  
  const addCategoryRows = (rows: any[], category: string) => {
    rows.forEach((row: any) => {
      overviewRows.push({
        Category: category,
        Rank: Number(row.rank) || 0,
        'ZIP Code': String(row.zip_code || ''),
        City: String(row.city_name || ''),
        County: String(row.county_name || ''),
        State: String(row.state_code || ''),
        Bedrooms: Number(row.bedroom_count) || 0,
        Score: Number(row.score) || 0,
        'Net Yield (%)': row.net_yield ? (Number(row.net_yield) * 100).toFixed(2) : '',
        'Property Value': Number(row.property_value) || 0,
        'Cash Flow Estimate': Math.round(Number(row.cash_flow_estimate) || 0),
      });
    });
  };

  addCategoryRows(overviewData.highestScore, 'Highest Score');
  addCategoryRows(overviewData.highestYield, 'Highest Yield');
  addCategoryRows(overviewData.highestCashFlow, 'Highest Cash Flow');
  addCategoryRows(overviewData.bestStarters, 'Low Barrier to Entry');
  addCategoryRows(overviewData.bestValue, 'Best Value');

  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
  XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Market Overview');

  // Market Explorer Sheet - format based on geo type
  if (explorerData.length > 0) {
    const explorerRows = explorerData.map((row: any) => {
      const baseRow: any = {
        Rank: Number(row.rank) || 0,
        Name: String(row.name || ''),
        State: String(row.state_code || ''),
        Bedrooms: bedroom === 'all' ? 'All (Median)' : String(bedroom),
        Score: row.median_score !== null ? Number(row.median_score) : '',
        'Net Yield (%)': row.median_yield !== null ? (Number(row.median_yield) * 100).toFixed(2) : '',
        'Property Value': row.median_value !== null ? Number(row.median_value) : '',
        'Cash Flow Estimate': row.cash_flow_estimate !== null ? Math.round(Number(row.cash_flow_estimate)) : '',
        'Affordability Index': row.affordability_index !== null ? Math.round(Number(row.affordability_index)) : '',
        'Market Heat Score': row.heat_score !== null ? Math.round(Number(row.heat_score)) : '',
        'Rent Growth 1Y (%)': row.avg_rent_growth !== null ? (Number(row.avg_rent_growth) * 100).toFixed(2) : '',
        'Demand Score': row.avg_demand !== null ? Number(row.avg_demand).toFixed(1) : '',
        'ZIP Count': row.zip_count !== null ? Number(row.zip_count) : '',
      };

      // Add type-specific fields
      if (type === 'county' || type === 'city') {
        baseRow.County = String(row.county_name || '');
      }
      if (type === 'city' || type === 'zip') {
        baseRow.City = String(row.city_name || '');
      }
      if (type === 'zip') {
        baseRow['ZIP Code'] = String(row.zip_code || '');
        // For ZIP type, we can show actual bedroom count if available
        if (row.bedroom_count !== undefined && row.bedroom_count !== null) {
          baseRow.Bedrooms = Number(row.bedroom_count);
        }
      }

      return baseRow;
    });

    const explorerSheet = XLSX.utils.json_to_sheet(explorerRows);
    XLSX.utils.book_append_sheet(workbook, explorerSheet, 'Market Explorer');
  }

  return workbook;
}

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in to export data.' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const sp = req.nextUrl.searchParams;
    const type = normalizeType(sp.get('type'));
    const sort = normalizeSort(sp.get('sort'));
    const sortDirection = sp.get('sortDirection') === 'asc' ? 'asc' : 'desc';
    const bedroom = normalizeBedroom(sp.get('bedroom'));
    const search = sp.get('search') || null;
    const stateFilter = sp.get('state') || null;
    const yearParam = sp.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();
    
    const affordabilityTier = (sp.get('affordabilityTier') || 'all') as AffordabilityTier;
    const yieldRange = (sp.get('yieldRange') || 'all') as YieldRange;
    const minScore = sp.get('minScore') ? Number(sp.get('minScore')) : null;

    // Fetch data in parallel
    const [overviewData, explorerData] = await Promise.all([
      fetchMarketOverview(year),
      fetchMarketExplorer(year, type, sort, sortDirection, bedroom, search, stateFilter, affordabilityTier, yieldRange, minScore),
    ]);

    // Generate Excel file
    const workbook = createExcelFile(overviewData, explorerData, year, type, bedroom);
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Generate filename based on filters
    const filename = generateFilename(type, bedroom, stateFilter, search, affordabilityTier, yieldRange, minScore);

    // Return file with proper headers
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error('Export API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate export' },
      { status: 500 }
    );
  }
}
