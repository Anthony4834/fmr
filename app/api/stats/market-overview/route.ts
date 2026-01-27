import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

interface MarketOverviewItem {
  rank: number;
  zipCode: string;
  cityName: string;
  countyName: string;
  stateCode: string;
  bedroomCount: number;
  score: number;
  netYield: number;
  propertyValue: number;
  cashFlowEstimate: number;
  valueRatio?: number; // For Best Value metric
}

// Calculate monthly mortgage payment (principal + interest only)
function calculateMortgagePayment(principal: number, annualRate: number, years: number = 30): number {
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;
  if (monthlyRate === 0) return principal / numPayments;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
}

export async function GET(req: NextRequest) {
  try {
    const yearParam = req.nextUrl.searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

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
      : 0.065; // Default 6.5%

    // Base CTE for all queries
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
          -- Calculate cash flow estimate
          (isc.annual_rent / 12 * 0.92) 
          - (isc.property_value * 0.80 * ${mortgageRate} / 12 * 1.5)
          - (isc.property_value * isc.tax_rate / 12)
          as cash_flow_estimate,
          -- Calculate value ratio (score per dollar)
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

    // 1. Highest Score
    const highestScoreQuery = baseCTE + `
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
    `;

    // 2. Highest Yield
    const highestYieldQuery = baseCTE + `
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
    `;

    // 3. Highest Cash Flow
    const highestCashFlowQuery = baseCTE + `
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
    `;

    // 4. Best Entry Level - Cash Flow (highest cash flow with property value between 90k-110k)
    const bestStartersCashFlowQuery = baseCTE + `
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
    `;

    // 5. Best Entry Level - Score (highest score with property value between 90k-110k)
    const bestStartersScoreQuery = baseCTE + `
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
      WHERE property_value BETWEEN 90000 AND 110000
      ORDER BY score DESC
      LIMIT 20
    `;

    // 6. Best Value (highest score per dollar)
    const bestValueQuery = baseCTE + `
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
    `;

    // Execute all queries in parallel
    const [highestScoreResult, highestYieldResult, highestCashFlowResult, bestStartersCashFlowResult, bestStartersScoreResult, bestValueResult] = await Promise.all([
      sql.query(highestScoreQuery, [year]),
      sql.query(highestYieldQuery, [year]),
      sql.query(highestCashFlowQuery, [year]),
      sql.query(bestStartersCashFlowQuery, [year]),
      sql.query(bestStartersScoreQuery, [year]),
      sql.query(bestValueQuery, [year]),
    ]);

    // Helper function to map results
    const mapResults = (rows: any[]): MarketOverviewItem[] => {
      return rows.map((row) => ({
        rank: Number(row.rank) || 0,
        zipCode: String(row.zip_code || ''),
        cityName: String(row.city_name || ''),
        countyName: String(row.county_name || ''),
        stateCode: String(row.state_code || ''),
        bedroomCount: Number(row.bedroom_count) || 0,
        score: Number(row.score) || 0,
        netYield: Number(row.net_yield) || 0,
        propertyValue: Number(row.property_value) || 0,
        cashFlowEstimate: Number(row.cash_flow_estimate) || 0,
        valueRatio: row.value_ratio ? Number(row.value_ratio) : undefined,
      }));
    };

    return NextResponse.json({
      highestScore: mapResults(highestScoreResult.rows),
      highestYield: mapResults(highestYieldResult.rows),
      highestCashFlow: mapResults(highestCashFlowResult.rows),
      bestStarters: mapResults(bestStartersCashFlowResult.rows), // Default to cash flow for backward compatibility
      bestStartersCashFlow: mapResults(bestStartersCashFlowResult.rows),
      bestStartersScore: mapResults(bestStartersScoreResult.rows),
      bestValue: mapResults(bestValueResult.rows),
    });
  } catch (error: any) {
    console.error('Market overview API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market overview data', details: error?.message },
      { status: 500 }
    );
  }
}
