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

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const zipParam = searchParams.get("zip");
    const cityParam = searchParams.get("city");
    const countyParam = searchParams.get("county");
    const stateParam = searchParams.get("state");
    const yearParam = searchParams.get("year");

    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    // Determine query type
    if (zipParam) {
      const zip = normalizeZip(zipParam);
      const result = await sql.query(
        `
        SELECT 
          geo_type,
          geo_key,
          zip_code,
          state_code,
          city_name,
          county_name,
          county_fips,
          bedroom_count,
          fmr_year,
          property_value,
          tax_rate,
          annual_rent,
          annual_taxes,
          net_yield,
          rent_to_price_ratio,
          score,
          COALESCE(score_with_demand, score) as score_with_demand,
          data_sufficient,
          computed_at
        FROM investment_score
        WHERE zip_code = $1
          AND fmr_year = $2
        ORDER BY bedroom_count
        LIMIT 1
        `,
        [zip, year]
      );

      if (result.rows.length === 0) {
        return NextResponse.json({
          found: false,
          zip,
          year,
          message: "No investment score found for this ZIP code",
        });
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
        score: Number(row.score_with_demand ?? row.score),
        dataSufficient: row.data_sufficient,
        computedAt: row.computed_at,
      });
    }

    if (cityParam && stateParam) {
      // Aggregate scores for all ZIPs in the city
      // Filter to latest data versions for consistency
      const result = await sql.query(
        `
        WITH city_zips AS (
          SELECT DISTINCT zip_code
          FROM zip_city_mapping
          WHERE city_name ILIKE $1
            AND state_code = $2
        ),
        city_data AS (
          SELECT
            COALESCE(isc.score_with_demand, isc.score) as score,
            isc.net_yield,
            isc.property_value,
            isc.tax_rate,
            isc.annual_rent,
            isc.rent_to_price_ratio,
            isc.zhvi_month,
            isc.acs_vintage
          FROM investment_score isc
          INNER JOIN city_zips cz ON cz.zip_code = isc.zip_code
          WHERE isc.fmr_year = $3
            AND isc.data_sufficient = true
        ),
        latest_versions AS (
          SELECT
            MAX(zhvi_month) as latest_zhvi_month,
            MAX(acs_vintage) as latest_acs_vintage
          FROM city_data
        )
        SELECT
          COUNT(*) as zip_count,
          AVG(cd.score) as avg_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cd.score) as median_score,
          AVG(cd.net_yield) as avg_yield,
          AVG(cd.property_value) as avg_property_value,
          AVG(cd.tax_rate) as avg_tax_rate,
          AVG(cd.annual_rent) as avg_annual_rent,
          AVG(cd.rent_to_price_ratio) as avg_rent_to_price_ratio
        FROM city_data cd
        CROSS JOIN latest_versions lv
        WHERE (
          (lv.latest_zhvi_month IS NULL AND cd.zhvi_month IS NULL) OR
          (lv.latest_zhvi_month IS NOT NULL AND cd.zhvi_month = lv.latest_zhvi_month)
        )
        AND (
          (lv.latest_acs_vintage IS NULL AND cd.acs_vintage IS NULL) OR
          (lv.latest_acs_vintage IS NOT NULL AND cd.acs_vintage = lv.latest_acs_vintage)
        )
        `,
        [cityParam, stateParam.toUpperCase(), year]
      );

      if (result.rows.length === 0 || Number(result.rows[0]?.zip_count) === 0) {
        return NextResponse.json({
          found: false,
          city: cityParam,
          state: stateParam,
          year,
          message: "No investment scores found for this city",
        });
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
      });
    }

    if (countyParam && stateParam) {
      // First, try to get county FIPS from county name + state for precise matching
      // This matches the approach used in the state view for consistency
      const normalizedCounty = countyParam.replace(/\s+County\s*$/i, '').trim();
      const fipsLookup = await sql.query(
        `
        SELECT DISTINCT county_fips
        FROM investment_score
        WHERE (county_name ILIKE $1 OR county_name ILIKE $2)
          AND state_code = $3
          AND fmr_year = $4
          AND county_fips IS NOT NULL
          AND LENGTH(TRIM(county_fips)) = 5
        LIMIT 1
        `,
        [`${normalizedCounty}%`, `${normalizedCounty} County%`, stateParam.toUpperCase(), year]
      );

      // Aggregate scores for all ZIPs in the county
      // Use county_fips if available (more precise), otherwise fall back to county_name matching
      // Filter to latest data versions to match state-counties endpoint behavior
      let result;
      if (fipsLookup.rows.length > 0 && fipsLookup.rows[0]?.county_fips) {
        const countyFips = String(fipsLookup.rows[0].county_fips).padStart(5, '0');
        result = await sql.query(
          `
          WITH county_data AS (
            SELECT
              COALESCE(score_with_demand, score) as score,
              net_yield,
              property_value,
              tax_rate,
              annual_rent,
              rent_to_price_ratio,
              zhvi_month,
              acs_vintage
            FROM investment_score
            WHERE county_fips = $1
              AND state_code = $2
              AND fmr_year = $3
              AND data_sufficient = true
          ),
          latest_versions AS (
            SELECT
              MAX(zhvi_month) as latest_zhvi_month,
              MAX(acs_vintage) as latest_acs_vintage
            FROM county_data
          )
          SELECT
            COUNT(*) as zip_count,
            AVG(cd.score) as avg_score,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cd.score) as median_score,
            AVG(cd.net_yield) as avg_yield,
            AVG(cd.property_value) as avg_property_value,
            AVG(cd.tax_rate) as avg_tax_rate,
            AVG(cd.annual_rent) as avg_annual_rent,
            AVG(cd.rent_to_price_ratio) as avg_rent_to_price_ratio
          FROM county_data cd
          CROSS JOIN latest_versions lv
          WHERE (
            (lv.latest_zhvi_month IS NULL AND cd.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND cd.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND cd.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND cd.acs_vintage = lv.latest_acs_vintage)
          )
          `,
          [countyFips, stateParam.toUpperCase(), year]
        );
      } else {
        // Fallback to county_name matching if FIPS not found
        result = await sql.query(
          `
          WITH county_data AS (
            SELECT
              COALESCE(score_with_demand, score) as score,
              net_yield,
              property_value,
              tax_rate,
              annual_rent,
              rent_to_price_ratio,
              zhvi_month,
              acs_vintage
            FROM investment_score
            WHERE (county_name ILIKE $1 OR county_name ILIKE $2)
              AND state_code = $3
              AND fmr_year = $4
              AND data_sufficient = true
          ),
          latest_versions AS (
            SELECT
              MAX(zhvi_month) as latest_zhvi_month,
              MAX(acs_vintage) as latest_acs_vintage
            FROM county_data
          )
          SELECT
            COUNT(*) as zip_count,
            AVG(cd.score) as avg_score,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cd.score) as median_score,
            AVG(cd.net_yield) as avg_yield,
            AVG(cd.property_value) as avg_property_value,
            AVG(cd.tax_rate) as avg_tax_rate,
            AVG(cd.annual_rent) as avg_annual_rent,
            AVG(cd.rent_to_price_ratio) as avg_rent_to_price_ratio
          FROM county_data cd
          CROSS JOIN latest_versions lv
          WHERE (
            (lv.latest_zhvi_month IS NULL AND cd.zhvi_month IS NULL) OR
            (lv.latest_zhvi_month IS NOT NULL AND cd.zhvi_month = lv.latest_zhvi_month)
          )
          AND (
            (lv.latest_acs_vintage IS NULL AND cd.acs_vintage IS NULL) OR
            (lv.latest_acs_vintage IS NOT NULL AND cd.acs_vintage = lv.latest_acs_vintage)
          )
          `,
          [`${normalizedCounty}%`, `${normalizedCounty} County%`, stateParam.toUpperCase(), year]
        );
      }

      if (result.rows.length === 0 || Number(result.rows[0]?.zip_count) === 0) {
        return NextResponse.json({
          found: false,
          county: countyParam,
          state: stateParam,
          year,
          message: "No investment scores found for this county",
        });
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
      });
    }

    if (stateParam) {
      // Aggregate scores for all ZIPs in the state
      // Filter to latest data versions for consistency
      const result = await sql.query(
        `
        WITH state_data AS (
          SELECT
            COALESCE(score_with_demand, score) as score,
            net_yield,
            property_value,
            tax_rate,
            annual_rent,
            rent_to_price_ratio,
            zhvi_month,
            acs_vintage
          FROM investment_score
          WHERE state_code = $1
            AND fmr_year = $2
            AND data_sufficient = true
        ),
        latest_versions AS (
          SELECT
            MAX(zhvi_month) as latest_zhvi_month,
            MAX(acs_vintage) as latest_acs_vintage
          FROM state_data
        )
        SELECT
          COUNT(*) as zip_count,
          AVG(sd.score) as avg_score,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sd.score) as median_score,
          AVG(sd.net_yield) as avg_yield,
          AVG(sd.property_value) as avg_property_value,
          AVG(sd.tax_rate) as avg_tax_rate,
          AVG(sd.annual_rent) as avg_annual_rent,
          AVG(sd.rent_to_price_ratio) as avg_rent_to_price_ratio
        FROM state_data sd
        CROSS JOIN latest_versions lv
        WHERE (
          (lv.latest_zhvi_month IS NULL AND sd.zhvi_month IS NULL) OR
          (lv.latest_zhvi_month IS NOT NULL AND sd.zhvi_month = lv.latest_zhvi_month)
        )
        AND (
          (lv.latest_acs_vintage IS NULL AND sd.acs_vintage IS NULL) OR
          (lv.latest_acs_vintage IS NOT NULL AND sd.acs_vintage = lv.latest_acs_vintage)
        )
        `,
        [stateParam.toUpperCase(), year]
      );

      if (result.rows.length === 0 || Number(result.rows[0]?.zip_count) === 0) {
        return NextResponse.json({
          found: false,
          state: stateParam,
          year,
          message: "No investment scores found for this state",
        });
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
      });
    }

    return NextResponse.json(
      { error: "Provide zip, city+state, county+state, or state parameter" },
      { status: 400 }
    );
  } catch (e: any) {
    console.error("Investment score error:", e);
    return NextResponse.json(
      { error: "Failed to fetch investment score" },
      { status: 500 }
    );
  }
}

