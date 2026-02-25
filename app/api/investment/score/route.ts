import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { getLatestFMRYear } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

function normalizeZip(zip: string): string {
  const digits = zip.trim().replace(/\D/g, "");
  if (digits.length === 5) return digits;
  if (digits.length < 5) return digits.padStart(5, "0");
  return digits.slice(0, 5);
}

function formatZhviMonth(val: unknown): string | null {
  if (!val) return null;
  return typeof val === 'string' ? val.slice(0, 7) : (val as Date)?.toISOString?.()?.slice(0, 7) ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const zipParam = searchParams.get("zip");
    const cityParam = searchParams.get("city");
    const countyParam = searchParams.get("county");
    const stateParam = searchParams.get("state");
    const yearParam = searchParams.get("year");

    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    if (zipParam) {
      const zip = normalizeZip(zipParam);
      const result = await sql.query(
        `
        SELECT
          isc.zip_code, isc.state_code, isc.city_name, isc.county_name, isc.county_fips,
          isc.bedroom_count, isc.fmr_year, isc.property_value, isc.tax_rate,
          isc.annual_rent, isc.annual_taxes, isc.net_yield, isc.rent_to_price_ratio,
          isc.adjusted_score as display_score,
          isc.data_sufficient, isc.computed_at, isc.zhvi_month, isc.acs_vintage,
          isc.confidence_score, isc.market_rent_missing, isc.zordi_metro, isc.demand_score
        FROM investment_score isc
        WHERE isc.zip_code = $1
          AND isc.fmr_year = $2
        ORDER BY CASE isc.bedroom_count WHEN 3 THEN 1 WHEN 2 THEN 2 WHEN 4 THEN 3 ELSE 4 END
        LIMIT 1
        `,
        [zip, year]
      );

      if (result.rows.length === 0) {
        return NextResponse.json({ found: false, zip, year, message: "No investment score found for this ZIP code" });
      }

      const row = result.rows[0];
      return NextResponse.json({
        found: true,
        geoType: "zip",
        zip: row.zip_code,
        stateCode: row.state_code,
        cityName: row.city_name,
        countyName: row.county_name,
        bedroomCount: Number(row.bedroom_count),
        year: Number(row.fmr_year),
        propertyValue: Number(row.property_value),
        taxRate: Number(row.tax_rate),
        taxRatePct: Number(row.tax_rate) * 100,
        annualRent: Number(row.annual_rent),
        annualTaxes: Number(row.annual_taxes),
        netYield: Number(row.net_yield),
        netYieldPct: Number(row.net_yield) * 100,
        rentToPriceRatio: Number(row.rent_to_price_ratio),
        rentToPriceRatioPct: Number(row.rent_to_price_ratio) * 100,
        score: Number(row.display_score),
        dataSufficient: row.data_sufficient,
        computedAt: row.computed_at,
        zhviMonth: formatZhviMonth(row.zhvi_month),
        acsVintage: row.acs_vintage != null ? Number(row.acs_vintage) : null,
        confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
        marketRentMissing: row.market_rent_missing ?? true,
        zordiMetro: row.zordi_metro ?? null,
        demandScore: row.demand_score != null ? Number(row.demand_score) : null,
      });
    }

    if (cityParam && stateParam) {
      const result = await sql.query(
        `
        SELECT
          COUNT(*) as zip_count,
          AVG(isc.adjusted_score) as avg_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY isc.adjusted_score) as median_score,
          AVG(isc.net_yield) as avg_yield,
          AVG(isc.property_value) as avg_property_value,
          AVG(isc.tax_rate) as avg_tax_rate,
          AVG(isc.annual_rent) as avg_annual_rent,
          AVG(isc.rent_to_price_ratio) as avg_rent_to_price_ratio,
          MAX(isc.zhvi_month) as latest_zhvi_month,
          MAX(isc.acs_vintage) as latest_acs_vintage,
          AVG(isc.confidence_score) as avg_confidence_score,
          AVG(CASE WHEN isc.market_rent_missing THEN 1.0 ELSE 0.0 END) as market_rent_missing_pct,
          AVG(CASE WHEN isc.zordi_metro IS NULL THEN 1.0 ELSE 0.0 END) as demand_missing_pct
        FROM investment_score isc
        INNER JOIN zip_city_mapping zcm ON zcm.zip_code = isc.zip_code
        WHERE zcm.city_name ILIKE $1
          AND zcm.state_code = $2
          AND isc.fmr_year = $3
          AND isc.bedroom_count = 3
        `,
        [cityParam, stateParam.toUpperCase(), year]
      );

      if (result.rows.length === 0 || Number(result.rows[0]?.zip_count) === 0) {
        return NextResponse.json({ found: false, city: cityParam, state: stateParam, year, message: "No investment scores found for this city" });
      }

      const row = result.rows[0];
      return NextResponse.json({
        found: true,
        geoType: "city",
        city: cityParam,
        stateCode: stateParam.toUpperCase(),
        year,
        zipCount: Number(row.zip_count),
        avgScore: Number(row.avg_score),
        medianScore: Number(row.median_score),
        avgYield: Number(row.avg_yield),
        avgYieldPct: Number(row.avg_yield) * 100,
        avgPropertyValue: Number(row.avg_property_value),
        avgTaxRate: Number(row.avg_tax_rate),
        avgTaxRatePct: Number(row.avg_tax_rate) * 100,
        avgAnnualRent: Number(row.avg_annual_rent),
        avgRentToPriceRatio: Number(row.avg_rent_to_price_ratio),
        avgRentToPriceRatioPct: Number(row.avg_rent_to_price_ratio) * 100,
        zhviMonth: formatZhviMonth(row.latest_zhvi_month),
        acsVintage: row.latest_acs_vintage != null ? Number(row.latest_acs_vintage) : null,
        confidenceScore: row.avg_confidence_score != null ? Math.round(Number(row.avg_confidence_score)) : null,
        marketRentMissingPct: row.market_rent_missing_pct != null ? Number(row.market_rent_missing_pct) : null,
        demandMissingPct: row.demand_missing_pct != null ? Number(row.demand_missing_pct) : null,
      });
    }

    if (countyParam && stateParam) {
      const normalizedCounty = countyParam.replace(/\s+County\s*$/i, '').trim();

      // Prefer FIPS-based matching (more precise)
      const fipsLookup = await sql.query(
        `SELECT DISTINCT county_fips FROM investment_score
         WHERE (county_name ILIKE $1 OR county_name ILIKE $2)
           AND state_code = $3 AND fmr_year = $4
           AND county_fips IS NOT NULL AND LENGTH(TRIM(county_fips)) = 5
         LIMIT 1`,
        [`${normalizedCounty}%`, `${normalizedCounty} County%`, stateParam.toUpperCase(), year]
      );

      const whereClause = fipsLookup.rows.length > 0 && fipsLookup.rows[0]?.county_fips
        ? { sql: 'isc.county_fips = $1 AND isc.state_code = $2 AND isc.fmr_year = $3', params: [String(fipsLookup.rows[0].county_fips).padStart(5, '0'), stateParam.toUpperCase(), year] }
        : { sql: '(isc.county_name ILIKE $1 OR isc.county_name ILIKE $2) AND isc.state_code = $3 AND isc.fmr_year = $4 AND isc.county_fips IS NOT NULL AND LENGTH(TRIM(isc.county_fips)) = 5', params: [`${normalizedCounty}%`, `${normalizedCounty} County%`, stateParam.toUpperCase(), year] };

      const result = await sql.query(
        `
        SELECT
          COUNT(*) as zip_count,
          AVG(isc.adjusted_score) as avg_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY isc.adjusted_score) as median_score,
          AVG(isc.net_yield) as avg_yield,
          AVG(isc.property_value) as avg_property_value,
          AVG(isc.tax_rate) as avg_tax_rate,
          AVG(isc.annual_rent) as avg_annual_rent,
          AVG(isc.rent_to_price_ratio) as avg_rent_to_price_ratio,
          MAX(isc.zhvi_month) as latest_zhvi_month,
          MAX(isc.acs_vintage) as latest_acs_vintage,
          AVG(isc.confidence_score) as avg_confidence_score,
          AVG(CASE WHEN isc.market_rent_missing THEN 1.0 ELSE 0.0 END) as market_rent_missing_pct,
          AVG(CASE WHEN isc.zordi_metro IS NULL THEN 1.0 ELSE 0.0 END) as demand_missing_pct
        FROM investment_score isc
        WHERE ${whereClause.sql}
          AND isc.bedroom_count = 3
        `,
        whereClause.params
      );

      if (result.rows.length === 0 || Number(result.rows[0]?.zip_count) === 0) {
        return NextResponse.json({ found: false, county: countyParam, state: stateParam, year, message: "No investment scores found for this county" });
      }

      const row = result.rows[0];
      return NextResponse.json({
        found: true,
        geoType: "county",
        county: countyParam,
        stateCode: stateParam.toUpperCase(),
        year,
        zipCount: Number(row.zip_count),
        avgScore: Number(row.avg_score),
        medianScore: Number(row.median_score),
        avgYield: Number(row.avg_yield),
        avgYieldPct: Number(row.avg_yield) * 100,
        avgPropertyValue: Number(row.avg_property_value),
        avgTaxRate: Number(row.avg_tax_rate),
        avgTaxRatePct: Number(row.avg_tax_rate) * 100,
        avgAnnualRent: Number(row.avg_annual_rent),
        avgRentToPriceRatio: Number(row.avg_rent_to_price_ratio),
        avgRentToPriceRatioPct: Number(row.avg_rent_to_price_ratio) * 100,
        zhviMonth: formatZhviMonth(row.latest_zhvi_month),
        acsVintage: row.latest_acs_vintage != null ? Number(row.latest_acs_vintage) : null,
        confidenceScore: row.avg_confidence_score != null ? Math.round(Number(row.avg_confidence_score)) : null,
        marketRentMissingPct: row.market_rent_missing_pct != null ? Number(row.market_rent_missing_pct) : null,
        demandMissingPct: row.demand_missing_pct != null ? Number(row.demand_missing_pct) : null,
      });
    }

    if (stateParam) {
      const result = await sql.query(
        `
        SELECT
          COUNT(*) as zip_count,
          AVG(adjusted_score) as avg_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY adjusted_score) as median_score,
          AVG(net_yield) as avg_yield,
          AVG(property_value) as avg_property_value,
          AVG(tax_rate) as avg_tax_rate,
          AVG(annual_rent) as avg_annual_rent,
          AVG(rent_to_price_ratio) as avg_rent_to_price_ratio,
          MAX(zhvi_month) as latest_zhvi_month,
          MAX(acs_vintage) as latest_acs_vintage
        FROM investment_score
        WHERE state_code = $1
          AND fmr_year = $2
          AND bedroom_count = 3
        `,
        [stateParam.toUpperCase(), year]
      );

      if (result.rows.length === 0 || Number(result.rows[0]?.zip_count) === 0) {
        return NextResponse.json({ found: false, state: stateParam, year, message: "No investment scores found for this state" });
      }

      const row = result.rows[0];
      return NextResponse.json({
        found: true,
        geoType: "state",
        stateCode: stateParam.toUpperCase(),
        year,
        zipCount: Number(row.zip_count),
        avgScore: Number(row.avg_score),
        medianScore: Number(row.median_score),
        avgYield: Number(row.avg_yield),
        avgYieldPct: Number(row.avg_yield) * 100,
        avgPropertyValue: Number(row.avg_property_value),
        avgTaxRate: Number(row.avg_tax_rate),
        avgTaxRatePct: Number(row.avg_tax_rate) * 100,
        avgAnnualRent: Number(row.avg_annual_rent),
        avgRentToPriceRatio: Number(row.avg_rent_to_price_ratio),
        avgRentToPriceRatioPct: Number(row.avg_rent_to_price_ratio) * 100,
        zhviMonth: formatZhviMonth(row.latest_zhvi_month),
        acsVintage: row.latest_acs_vintage != null ? Number(row.latest_acs_vintage) : null,
      });
    }

    return NextResponse.json(
      { error: "Provide zip, city+state, county+state, or state parameter" },
      { status: 400 }
    );
  } catch (e: any) {
    console.error("Investment score error:", e);
    return NextResponse.json({ error: "Failed to fetch investment score" }, { status: 500 });
  }
}
