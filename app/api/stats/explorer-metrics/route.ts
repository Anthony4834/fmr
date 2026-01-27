import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

type GeoType = 'state' | 'county' | 'city' | 'zip';
type SortField = 'score' | 'yield' | 'cashFlow' | 'appreciation' | 'affordability' | 'heat' | 'fmr' | 'name';
type AffordabilityTier = 'affordable' | 'midMarket' | 'premium' | 'all';
type YieldRange = 'low' | 'moderate' | 'high' | 'all';
type HeatLevel = 'cold' | 'warming' | 'hot' | 'all';

interface ExplorerItem {
  rank: number;
  geoType: GeoType;
  geoKey: string;
  name: string;
  stateCode: string;
  countyName?: string;
  countyFips?: string;
  cityName?: string;
  zipCode?: string;
  zipCount: number;
  
  // Core metrics
  score: number | null;
  netYield: number | null;
  grossYield: number | null;
  medianFMR: number | null;
  medianPropertyValue: number | null;
  medianTaxRate: number | null;
  
  // Computed metrics
  cashFlowEstimate: number | null;
  affordabilityIndex: number | null;
  marketHeatScore: number | null;
  
  // Trend data
  appreciation1Y: number | null;
  rentGrowth1Y: number | null;
  
  // Demand indicators
  demandScore: number | null;
  
  // Sparkline data (normalized 0-100)
  zhviTrend: number[];
  
  // Opportunity flags
  flags: {
    highYield: boolean;
    undervalued: boolean;
    hotMarket: boolean;
    affordableEntry: boolean;
    taxFriendly: boolean;
  };
}

interface ExplorerSummary {
  totalCount: number;
  avgScore: number | null;
  medianYield: number | null;
  avgCashFlow: number | null;
  topMarket: { name: string; score: number } | null;
  mostAffordable: { name: string; value: number } | null;
  avgAppreciation1Y: number | null;
}

function normalizeType(input: string | null): GeoType {
  return input === 'county' || input === 'city' || input === 'zip' ? input : 'state';
}

function normalizeSort(input: string | null): SortField {
  const valid: SortField[] = ['score', 'yield', 'cashFlow', 'appreciation', 'affordability', 'heat', 'fmr', 'name'];
  return valid.includes(input as SortField) ? (input as SortField) : 'score';
}

function normalizeOffset(input: string | null): number {
  const n = Number(input || '0');
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function normalizeLimit(input: string | null): number {
  const n = Number(input || '100');
  if (!Number.isFinite(n)) return 100;
  return Math.min(200, Math.max(1, Math.floor(n)));
}

function normalizeBedroom(input: string | null): number | 'all' {
  if (input === 'all') return 'all';
  const n = Number(input || '3');
  if (!Number.isFinite(n)) return 3;
  return Math.min(4, Math.max(2, Math.floor(n)));
}

// Calculate monthly mortgage payment (principal + interest only)
function calculateMortgagePayment(principal: number, annualRate: number, years: number = 30): number {
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;
  if (monthlyRate === 0) return principal / numPayments;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
}

// Normalize sparkline values to 0-100 scale
function normalizeSparkline(values: (number | null)[]): number[] {
  const validValues = values.filter((v): v is number => v !== null && v > 0);
  if (validValues.length === 0) return [];
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min;
  if (range === 0) return validValues.map(() => 50);
  return values.map(v => v === null ? 0 : Math.round(((v - min) / range) * 100));
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = normalizeType(sp.get('type'));
    const sort = normalizeSort(sp.get('sort'));
    const sortDirection = sp.get('sortDirection') === 'asc' ? 'asc' : 'desc';
    const offset = normalizeOffset(sp.get('offset'));
    const limit = normalizeLimit(sp.get('limit'));
    const bedroom = normalizeBedroom(sp.get('bedroom'));
    const search = sp.get('search') || null;
    const stateFilter = sp.get('state') || null;
    const yearParam = sp.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();
    
    // Filter parameters
    const minScore = sp.get('minScore') ? Number(sp.get('minScore')) : null;
    const minYield = sp.get('minYield') ? Number(sp.get('minYield')) : null;
    const affordabilityTier = (sp.get('affordabilityTier') || 'all') as AffordabilityTier;
    const yieldRange = (sp.get('yieldRange') || 'all') as YieldRange;
    const heatLevel = (sp.get('heatLevel') || 'all') as HeatLevel;

    // Get current mortgage rate
    const mortgageRateResult = await sql`
      SELECT rate_annual_pct 
      FROM mortgage_rates 
      WHERE rate_type = '30_year_fixed'
      ORDER BY fetched_at DESC 
      LIMIT 1
    `;
    const mortgageRate = mortgageRateResult.rows[0]?.rate_annual_pct 
      ? Number(mortgageRateResult.rows[0].rate_annual_pct) / 100
      : 0.07; // Default 7%

    // Get national median ZHVI for affordability index
    const nationalMedianResult = await sql`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) as national_median
      FROM investment_score
      WHERE fmr_year = ${year}
        AND data_sufficient = true
        AND property_value > 0
        AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    `;
    const nationalMedianZHVI = Number(nationalMedianResult.rows[0]?.national_median) || 300000;

    // Get percentile thresholds for flags
    const percentilesResult = await sql`
      SELECT
        PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY net_yield) as yield_p80,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY property_value) as value_p50
      FROM investment_score
      WHERE fmr_year = ${year}
        AND data_sufficient = true
        AND state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
    `;
    const yieldP80 = Number(percentilesResult.rows[0]?.yield_p80) || 0.08;
    const valueP50 = Number(percentilesResult.rows[0]?.value_p50) || 300000;

    // Build the sort clause
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

    // Build filter conditions
    const buildFilterConditions = () => {
      const conditions: string[] = [];
      
      if (minScore !== null && !isNaN(minScore)) {
        conditions.push(`median_score >= ${minScore}`);
      }
      if (minYield !== null && !isNaN(minYield)) {
        conditions.push(`median_yield >= ${minYield / 100}`);
      }
      
      // Affordability tier filter
      if (affordabilityTier === 'affordable') {
        conditions.push('median_value < 150000');
      } else if (affordabilityTier === 'midMarket') {
        conditions.push('median_value >= 150000 AND median_value <= 350000');
      } else if (affordabilityTier === 'premium') {
        conditions.push('median_value > 350000');
      }
      
      // Yield range filter
      if (yieldRange === 'low') {
        conditions.push('median_yield < 0.05');
      } else if (yieldRange === 'moderate') {
        conditions.push('median_yield >= 0.05 AND median_yield <= 0.07');
      } else if (yieldRange === 'high') {
        conditions.push('median_yield > 0.07');
      }
      
      // Heat level filter
      if (heatLevel === 'cold') {
        conditions.push('heat_score < 33');
      } else if (heatLevel === 'warming') {
        conditions.push('heat_score >= 33 AND heat_score <= 66');
      } else if (heatLevel === 'hot') {
        conditions.push('heat_score > 66');
      }
      
      return conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    };

    let result;
    let totalCount = 0;
    let summaryResult;

    if (type === 'state') {
      // State-level aggregation with rich metrics
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
        zhvi_trends AS (
          SELECT
            state_code,
            array_agg(zhvi ORDER BY month) as trend_values
          FROM (
            SELECT DISTINCT ON (z.state_code, z.month)
              z.state_code,
              z.month,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY z.zhvi) as zhvi
            FROM zhvi_zip_bedroom_monthly z
            WHERE z.month >= NOW() - INTERVAL '12 months'
              AND z.bedroom_count = $3
              AND z.zhvi IS NOT NULL
              AND z.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            GROUP BY z.state_code, z.month
            ORDER BY z.state_code, z.month
          ) sub
          GROUP BY state_code
        ),
        appreciation AS (
          SELECT
            state_code,
            (
              (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY zhvi) 
               FROM zhvi_zip_bedroom_monthly 
               WHERE state_code = z.state_code 
                 AND bedroom_count = $3 
                 AND month = (SELECT MAX(month) FROM zhvi_zip_bedroom_monthly WHERE bedroom_count = $3))
              -
              (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY zhvi) 
               FROM zhvi_zip_bedroom_monthly 
               WHERE state_code = z.state_code 
                 AND bedroom_count = $3 
                 AND month = (SELECT MAX(month) FROM zhvi_zip_bedroom_monthly WHERE bedroom_count = $3) - INTERVAL '12 months')
            ) / NULLIF(
              (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY zhvi) 
               FROM zhvi_zip_bedroom_monthly 
               WHERE state_code = z.state_code 
                 AND bedroom_count = $3 
                 AND month = (SELECT MAX(month) FROM zhvi_zip_bedroom_monthly WHERE bedroom_count = $3) - INTERVAL '12 months'),
              0
            ) * 100 as appreciation_1y
          FROM (SELECT DISTINCT state_code FROM base_scores) z
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
            zt.trend_values as zhvi_trend,
            apr.appreciation_1y,
            -- Computed metrics
            (${nationalMedianZHVI} / NULLIF(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value), 0)) * 100 as affordability_index,
            -- Heat score: demand (40%) + appreciation (30%) + rent growth (30%)
            COALESCE(AVG(bs.demand_score), 50) * 0.4 + 
            COALESCE(apr.appreciation_1y, 0) * 3 + 
            COALESCE(AVG(bs.zori_yoy) * 100, 0) * 3 as heat_score,
            -- Cash flow estimate (simplified: assumes 20% down, 30yr mortgage)
            (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.annual_rent / 12) * 0.92) 
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * 0.80 * ${mortgageRate} / 12 * 1.5)
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.tax_rate) / 12)
            as cash_flow_estimate
          FROM base_scores bs
          LEFT JOIN zhvi_trends zt ON bs.state_code = zt.state_code
          LEFT JOIN appreciation apr ON bs.state_code = apr.state_code
          GROUP BY bs.state_code, zt.trend_values, apr.appreciation_1y
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
        OFFSET $4 LIMIT $5
      `;

      result = await sql.query(query, [year, search, bedroom, offset, limit]);

      // Get total count
      const countQuery = `
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
        appreciation AS (
          SELECT
            state_code,
            0::numeric as appreciation_1y
          FROM (SELECT DISTINCT state_code FROM base_scores) z
        ),
        aggregated AS (
          SELECT
            bs.state_code,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.score) as median_score,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.net_yield) as median_yield,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) as median_value,
            AVG(bs.demand_score) as avg_demand,
            AVG(bs.zori_yoy) as avg_rent_growth,
            COALESCE(AVG(bs.demand_score), 50) * 0.4 + 
            COALESCE(apr.appreciation_1y, 0) * 3 + 
            COALESCE(AVG(bs.zori_yoy) * 100, 0) * 3 as heat_score,
            (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.annual_rent / 12) * 0.92) 
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * 0.80 * ${mortgageRate} / 12 * 1.5)
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.tax_rate) / 12)
            as cash_flow_estimate
          FROM base_scores bs
          LEFT JOIN appreciation apr ON bs.state_code = apr.state_code
          GROUP BY bs.state_code, apr.appreciation_1y
        ),
        filtered AS (
          SELECT * FROM aggregated
          ${buildFilterConditions()}
        )
        SELECT COUNT(*) as total FROM filtered
      `;
      const countResult = await sql.query(countQuery, [year, search]);
      totalCount = Number(countResult.rows[0]?.total || 0);

      // Get summary statistics
      summaryResult = await sql.query(`
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
            isc.annual_rent,
            isc.tax_rate
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
        ),
        state_agg AS (
          SELECT
            state_code,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY net_yield) as median_yield,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) as median_value,
            (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_rent / 12) * 0.92) 
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) * 0.80 * ${mortgageRate} / 12 * 1.5)
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) * PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tax_rate) / 12)
            as cash_flow
          FROM base_scores
          GROUP BY state_code
        )
        SELECT
          COUNT(*) as total_count,
          AVG(median_score) as avg_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_yield) as median_yield,
          AVG(cash_flow) as avg_cash_flow,
          (SELECT state_code FROM state_agg ORDER BY median_score DESC NULLS LAST LIMIT 1) as top_market_name,
          (SELECT median_score FROM state_agg ORDER BY median_score DESC NULLS LAST LIMIT 1) as top_market_score,
          (SELECT state_code FROM state_agg ORDER BY median_value ASC NULLS LAST LIMIT 1) as affordable_market_name,
          (SELECT median_value FROM state_agg ORDER BY median_value ASC NULLS LAST LIMIT 1) as affordable_market_value
        FROM state_agg
      `, [year]);

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
        OFFSET $4 LIMIT $5
      `;

      result = await sql.query(query, [year, stateFilter, search, offset, limit]);

      // Get total count
      const countQuery = `
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
            bs.state_code,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.score) as median_score,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.net_yield) as median_yield,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) as median_value,
            AVG(bs.demand_score) as avg_demand,
            AVG(bs.zori_yoy) as avg_rent_growth,
            COALESCE(AVG(bs.demand_score), 50) * 0.4 + 
            COALESCE(AVG(bs.zori_yoy) * 100, 0) * 6 as heat_score,
            (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.annual_rent / 12) * 0.92) 
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * 0.80 * ${mortgageRate} / 12 * 1.5)
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) * PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.tax_rate) / 12)
            as cash_flow_estimate
          FROM base_scores bs
          GROUP BY bs.county_fips, bs.state_code
        ),
        filtered AS (
          SELECT * FROM aggregated
          ${buildFilterConditions()}
        )
        SELECT COUNT(*) as total FROM filtered
      `;
      const countResult = await sql.query(countQuery, [year, stateFilter, search]);
      totalCount = Number(countResult.rows[0]?.total || 0);

      // Get summary statistics for counties
      summaryResult = await sql.query(`
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
            isc.state_code,
            COALESCE(isc.score_with_demand, isc.score) as score,
            isc.net_yield,
            isc.property_value,
            isc.annual_rent,
            isc.tax_rate
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
        ),
        county_agg AS (
          SELECT
            county_fips,
            state_code,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY net_yield) as median_yield,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) as median_value,
            (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_rent / 12) * 0.92) 
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) * 0.80 * ${mortgageRate} / 12 * 1.5)
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) * PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tax_rate) / 12)
            as cash_flow
          FROM base_scores
          GROUP BY county_fips, state_code
        ),
        filtered_counties AS (
          SELECT * FROM county_agg
          ${buildFilterConditions()}
        )
        SELECT
          COUNT(*) as total_count,
          AVG(median_score) as avg_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_yield) as median_yield,
          AVG(cash_flow) as avg_cash_flow,
          NULL as top_market_name,
          NULL as top_market_score,
          NULL as affordable_market_name,
          NULL as affordable_market_value
        FROM filtered_counties
      `, [year, stateFilter]);

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
        OFFSET $4 LIMIT $5
      `;

      result = await sql.query(query, [year, stateFilter, search, offset, limit]);

      // Get total count
      const countQuery = `
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
            bs.city_name,
            bs.state_code,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.score) as median_score,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.net_yield) as median_yield,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bs.property_value) as median_value,
            AVG(bs.demand_score) as avg_demand,
            AVG(bs.zori_yoy) as avg_rent_growth,
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
        )
        SELECT COUNT(*) as total FROM filtered
      `;
      const countResult = await sql.query(countQuery, [year, stateFilter, search]);
      totalCount = Number(countResult.rows[0]?.total || 0);

      // Get summary statistics for cities
      summaryResult = await sql.query(`
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
            isc.state_code,
            COALESCE(isc.score_with_demand, isc.score) as score,
            isc.net_yield,
            isc.property_value,
            isc.annual_rent,
            isc.tax_rate
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
        city_agg AS (
          SELECT
            city_name,
            state_code,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median_score,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY net_yield) as median_yield,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) as median_value,
            (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY annual_rent / 12) * 0.92) 
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) * 0.80 * ${mortgageRate} / 12 * 1.5)
            - (PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY property_value) * PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tax_rate) / 12)
            as cash_flow
          FROM base_scores
          GROUP BY city_name, state_code
        ),
        filtered_cities AS (
          SELECT * FROM city_agg
          ${buildFilterConditions()}
        )
        SELECT
          COUNT(*) as total_count,
          AVG(median_score) as avg_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_yield) as median_yield,
          AVG(cash_flow) as avg_cash_flow,
          NULL as top_market_name,
          NULL as top_market_score,
          NULL as affordable_market_name,
          NULL as affordable_market_value
        FROM filtered_cities
      `, [year, stateFilter, search]);

    } else {
      // ZIP-level data
      const bedroomFilter = bedroom === 'all' 
        ? 'AND isc.bedroom_count IN (2, 3, 4)'
        : 'AND isc.bedroom_count = $4::integer';
      
      const baseScoresSelect = bedroom === 'all'
        ? `
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
        base_scores AS (
          SELECT
            isc.zip_code,
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
        WITH latest_versions AS (
          SELECT
            MAX(zhvi_month) as latest_zhvi_month,
            MAX(acs_vintage) as latest_acs_vintage
          FROM investment_score
          WHERE fmr_year = $1
            AND data_sufficient = true
        ),
        ${baseScoresSelect}
        with_metrics AS (
          SELECT
            bs.zip_code as name,
            bs.zip_code,
            bs.city_name,
            bs.county_name,
            bs.state_code,
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
          ORDER BY bs.zip_code, bs.score DESC NULLS LAST
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
        OFFSET ${bedroom === 'all' ? '$4' : '$5'} LIMIT ${bedroom === 'all' ? '$5' : '$6'}
      `;

      const queryParams = bedroom === 'all' 
        ? [year, stateFilter, search, offset, limit]
        : [year, stateFilter, search, bedroom, offset, limit];
      
      result = await sql.query(query, queryParams);

      // Get total count
      const countBedroomFilter = bedroom === 'all' 
        ? 'AND isc.bedroom_count IN (2, 3, 4)'
        : 'AND isc.bedroom_count = $4::integer';
      
      const countBaseScoresSelect = bedroom === 'all'
        ? `
        base_scores AS (
          SELECT
            isc.zip_code,
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
            ${countBedroomFilter}
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
        base_scores AS (
          SELECT
            isc.zip_code,
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
            AND isc.geo_type = 'zip'
            AND isc.zip_code IS NOT NULL
            AND isc.state_code IS NOT NULL
            AND isc.state_code NOT IN ('PR', 'GU', 'VI', 'MP', 'AS')
            ${countBedroomFilter}
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
      
      const countQuery = `
        WITH latest_versions AS (
          SELECT
            MAX(zhvi_month) as latest_zhvi_month,
            MAX(acs_vintage) as latest_acs_vintage
          FROM investment_score
          WHERE fmr_year = $1
            AND data_sufficient = true
        ),
        ${countBaseScoresSelect}
        with_metrics AS (
          SELECT
            bs.zip_code,
            bs.score as median_score,
            bs.net_yield as median_yield,
            bs.property_value as median_value,
            bs.demand_score as avg_demand,
            bs.zori_yoy as avg_rent_growth,
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
        )
        SELECT COUNT(*) as total FROM filtered
      `;
      const countQueryParams = bedroom === 'all' 
        ? [year, stateFilter, search]
        : [year, stateFilter, search, bedroom];
      const countResult = await sql.query(countQuery, countQueryParams);
      totalCount = Number(countResult.rows[0]?.total || 0);

      // Get summary statistics for ZIPs
      const summaryBedroomFilter = bedroom === 'all' 
        ? 'AND isc.bedroom_count IN (2, 3, 4)'
        : 'AND isc.bedroom_count = $4::integer';
      
      const summaryBaseScoresSelect = bedroom === 'all'
        ? `
        base_scores AS (
          SELECT
            isc.zip_code,
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
            ${summaryBedroomFilter}
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
        base_scores AS (
          SELECT
            isc.zip_code,
            isc.state_code,
            COALESCE(isc.score_with_demand, isc.score) as score,
            isc.net_yield,
            isc.property_value,
            isc.annual_rent,
            isc.tax_rate,
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
            ${summaryBedroomFilter}
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
      
      const summaryQuery = `
        WITH latest_versions AS (
          SELECT
            MAX(zhvi_month) as latest_zhvi_month,
            MAX(acs_vintage) as latest_acs_vintage
          FROM investment_score
          WHERE fmr_year = $1
            AND data_sufficient = true
        ),
        ${summaryBaseScoresSelect}
        zip_metrics AS (
          SELECT
            score as median_score,
            net_yield as median_yield,
            property_value as median_value,
            COALESCE(demand_score, 50) * 0.4 + COALESCE(zori_yoy * 100, 0) * 6 as heat_score,
            (annual_rent / 12 * 0.92) 
            - (property_value * 0.80 * ${mortgageRate} / 12 * 1.5)
            - (property_value * tax_rate / 12)
            as cash_flow
          FROM base_scores
        ),
        filtered_zips AS (
          SELECT * FROM zip_metrics
          ${buildFilterConditions()}
        )
        SELECT
          COUNT(*) as total_count,
          AVG(median_score) as avg_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY median_yield) as median_yield,
          AVG(cash_flow) as avg_cash_flow,
          NULL as top_market_name,
          NULL as top_market_score,
          NULL as affordable_market_name,
          NULL as affordable_market_value
        FROM filtered_zips
      `;
      const summaryQueryParams = bedroom === 'all' 
        ? [year, stateFilter, search]
        : [year, stateFilter, search, bedroom];
      summaryResult = await sql.query(summaryQuery, summaryQueryParams);
    }

    // Map results to response format
    const items: ExplorerItem[] = result.rows.map((row: any) => {
      const medianValue = Number(row.median_value) || null;
      const medianYield = Number(row.median_yield) || null;
      const medianTax = Number(row.median_tax) || null;
      const demandScore = Number(row.avg_demand) || null;
      const rentGrowth = Number(row.avg_rent_growth) || null;
      const appreciation = Number(row.appreciation_1y) || null;
      
      // Calculate flags
      const flags = {
        highYield: medianYield !== null && medianYield >= yieldP80,
        undervalued: rentGrowth !== null && appreciation !== null && rentGrowth > appreciation + 0.02,
        hotMarket: demandScore !== null && demandScore > 70 && appreciation !== null && appreciation > 5,
        affordableEntry: medianValue !== null && medianValue < valueP50,
        taxFriendly: medianTax !== null && medianTax < 0.01,
      };

      // Normalize sparkline if available
      const zhviTrend = row.zhvi_trend ? normalizeSparkline(row.zhvi_trend) : [];

      const baseItem: ExplorerItem = {
        rank: Number(row.rank),
        geoType: type,
        geoKey: type === 'state' ? row.state_code : (row.county_fips || row.name),
        name: row.name || row.state_code,
        stateCode: row.state_code,
        zipCount: Number(row.zip_count) || 1,
        
        // Core metrics
        score: row.median_score !== null ? Number(row.median_score) : null,
        netYield: medianYield,
        grossYield: medianYield !== null && medianTax !== null ? medianYield + medianTax : null,
        medianFMR: row.median_fmr !== null ? Number(row.median_fmr) : null,
        medianPropertyValue: medianValue,
        medianTaxRate: medianTax,
        
        // Computed metrics
        cashFlowEstimate: row.cash_flow_estimate !== null ? Math.round(Number(row.cash_flow_estimate)) : null,
        affordabilityIndex: row.affordability_index !== null ? Math.round(Number(row.affordability_index)) : null,
        marketHeatScore: row.heat_score !== null ? Math.min(100, Math.max(0, Math.round(Number(row.heat_score)))) : null,
        
        // Trend data
        appreciation1Y: appreciation,
        rentGrowth1Y: rentGrowth !== null ? rentGrowth * 100 : null,
        
        // Demand
        demandScore,
        
        // Sparkline
        zhviTrend,
        
        // Flags
        flags,
      };

      // Add type-specific fields
      if (type === 'county') {
        baseItem.countyFips = row.county_fips;
        baseItem.countyName = row.name;
      } else if (type === 'city') {
        baseItem.cityName = row.name;
        baseItem.countyName = row.county_name;
      } else if (type === 'zip') {
        baseItem.zipCode = row.zip_code;
        baseItem.cityName = row.city_name;
        baseItem.countyName = row.county_name;
      }

      return baseItem;
    });

    // Build summary
    const summaryRow = summaryResult?.rows?.[0];
    const summary: ExplorerSummary = {
      totalCount,
      avgScore: summaryRow?.avg_score !== null ? Number(summaryRow.avg_score) : null,
      medianYield: summaryRow?.median_yield !== null ? Number(summaryRow.median_yield) * 100 : null,
      avgCashFlow: summaryRow?.avg_cash_flow !== null ? Math.round(Number(summaryRow.avg_cash_flow)) : null,
      topMarket: summaryRow?.top_market_name ? {
        name: summaryRow.top_market_name,
        score: Number(summaryRow.top_market_score),
      } : null,
      mostAffordable: summaryRow?.affordable_market_name ? {
        name: summaryRow.affordable_market_name,
        value: Number(summaryRow.affordable_market_value),
      } : null,
      avgAppreciation1Y: null,
    };

    const hasMore = items.length === limit && (offset + limit) < totalCount;

    return NextResponse.json({
      year,
      type,
      sort,
      bedroom,
      items,
      summary,
      total: totalCount,
      hasMore,
      offset,
      limit,
      mortgageRate: mortgageRate * 100,
      nationalMedianZHVI,
    });

  } catch (e: any) {
    console.error('Explorer metrics error:', e);
    return NextResponse.json(
      {
        error: 'Failed to fetch explorer metrics',
        ...(process.env.NODE_ENV !== 'production'
          ? { details: e?.message ? String(e.message) : String(e) }
          : {}),
      },
      { status: 500 }
    );
  }
}
