import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getLatestFMRYear } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'summary'; // summary, cities, zips, counties
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : await getLatestFMRYear();

    if (type === 'summary') {
      // Valid US state codes (50 states + DC + US territories)
      const validUSStates = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
        'PR', 'VI', 'GU', 'MP', 'AS' // US territories: Puerto Rico, US Virgin Islands, Guam, Northern Mariana Islands, American Samoa
      ];

      // Note: Test coverage is computed from base tables and the requested `year`.
      // We no longer require SQL views to exist for this endpoint.

      // Get summary statistics (excluding PR)
      const [cityStats, zipStats, countyStats, mappingStats, requiredSafmrTotals, safmrTotals] = await Promise.all([
        sql`
          WITH city_fmr_status AS (
            SELECT DISTINCT
              c.city_name,
              c.state_code,
              CASE 
                WHEN EXISTS (
                  SELECT 1 
                  FROM safmr_data sd 
                  WHERE sd.zip_code = ANY(c.zip_codes) 
                  AND sd.year = ${year}
                ) THEN true
                WHEN EXISTS (
                  SELECT 1 
                  FROM zip_county_mapping zcm
                  JOIN fmr_data fd ON (
                    fd.county_code = zcm.county_fips
                    AND fd.state_code = zcm.state_code
                    AND fd.year = ${year}
                  )
                  WHERE zcm.zip_code = ANY(c.zip_codes)
                ) THEN true
                ELSE false
              END as has_fmr_data
            FROM cities c
            WHERE c.state_code != 'PR'
          )
          SELECT 
            COUNT(*) as total_cities,
            COUNT(*) FILTER (WHERE has_fmr_data = false) as cities_without_fmr,
            COUNT(*) FILTER (WHERE has_fmr_data = true) as cities_with_fmr
          FROM city_fmr_status
        `,
        // NOTE: We intentionally avoid `zips_without_fmr` here because it's a complex view and
        // `COUNT(DISTINCT ...)` can be extremely slow on large datasets.
        // Instead, compute the same summary directly from the base tables using FIPS joins.
        sql`
          WITH
          zip_base AS (
            SELECT
              zcm.zip_code,
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM required_safmr_zips rsz
                  WHERE rsz.zip_code = zcm.zip_code
                    AND rsz.year = ${year}
                ) THEN 1 ELSE 0
              END AS is_required_safmr,
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM safmr_data sd
                  WHERE sd.zip_code = zcm.zip_code
                    AND sd.year = ${year}
                ) THEN 1 ELSE 0
              END AS has_safmr_data,
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM zip_county_mapping z2
                  JOIN fmr_data fd
                    ON fd.year = ${year}
                   AND fd.county_code IS NOT NULL
                   AND fd.county_code = z2.county_fips
                   AND (
                     fd.state_code = z2.state_code
                     OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                   )
                  WHERE z2.zip_code = zcm.zip_code
                ) THEN 1 ELSE 0
              END AS has_fmr
            FROM (
              SELECT DISTINCT zip_code
              FROM zip_county_mapping
              WHERE state_code != 'PR'
            ) zcm
          )
          SELECT
            COUNT(*) AS total_zips,
            COUNT(*) FILTER (WHERE is_required_safmr = 1) AS zips_with_safmr,
            COUNT(*) FILTER (WHERE is_required_safmr = 0 AND has_fmr = 1 AND has_safmr_data = 0) AS zips_with_fmr_only,
            COUNT(*) FILTER (WHERE is_required_safmr = 0 AND has_safmr_data = 1) AS zips_with_safmr_data_but_uses_fmr,
            COUNT(*) FILTER (WHERE is_required_safmr = 0 AND has_fmr = 0 AND has_safmr_data = 0) AS zips_without_fmr
          FROM zip_base
        `,
        sql`
          WITH county_fmr_status AS (
            SELECT DISTINCT
              zcm.county_name,
              zcm.state_code,
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM zip_county_mapping z2
                  JOIN fmr_data fd
                    ON fd.year = ${year}
                   AND fd.county_code IS NOT NULL
                   AND fd.county_code = z2.county_fips
                   AND (
                     fd.state_code = z2.state_code
                     OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                   )
                  WHERE z2.county_name = zcm.county_name
                    AND z2.state_code = zcm.state_code
                    AND z2.county_fips IS NOT NULL
                ) THEN true
                ELSE false
              END as has_fmr_data
            FROM zip_county_mapping zcm
            WHERE zcm.state_code != 'PR'
          )
          SELECT 
            COUNT(*) as total_counties,
            COUNT(*) FILTER (WHERE has_fmr_data = false) as counties_without_fmr,
            COUNT(*) FILTER (WHERE has_fmr_data = true) as counties_with_fmr
          FROM county_fmr_status
        `,
        sql`
          WITH zip_mapping_counts AS (
            SELECT 
              zip_code,
              COUNT(*)::int as county_count
            FROM zip_county_mapping
            GROUP BY zip_code
          ),
          zips_without_mapping AS (
            SELECT COUNT(DISTINCT sd.zip_code)::int as count
            FROM safmr_data sd
            WHERE sd.year = ${year}
              AND NOT EXISTS (
                SELECT 1 FROM zip_county_mapping zcm WHERE zcm.zip_code = sd.zip_code
              )
          ),
          zips_with_multiple_mappings AS (
            SELECT COUNT(*)::int as count
            FROM zip_mapping_counts
            WHERE county_count > 1
          )
          SELECT
            (SELECT count FROM zips_without_mapping) + (SELECT count FROM zips_with_multiple_mappings) as total_issues,
            (SELECT count FROM zips_without_mapping) as zips_without_mapping,
            (SELECT count FROM zips_with_multiple_mappings) as zips_with_multiple_mappings
        `
        ,
        // Required SAFMR ZIP totals (source-of-truth derived from mandatory metro list)
        sql`
          SELECT
            COUNT(*)::int AS required_safmr_zips_total,
            COUNT(*) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM safmr_data sd
                WHERE sd.year = ${year}
                  AND sd.zip_code = rsz.zip_code
              )
            )::int AS required_safmr_zips_with_safmr_data
          FROM required_safmr_zips rsz
          WHERE rsz.year = ${year}
        `,
        // SAFMR data totals (regardless of whether required)
        sql`
          SELECT
            COUNT(*)::int AS safmr_zips_total,
            COUNT(*) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM required_safmr_zips rsz
                WHERE rsz.year = ${year}
                  AND rsz.zip_code = sd.zip_code
              )
            )::int AS safmr_zips_required
          FROM safmr_data sd
          WHERE sd.year = ${year}
        `
      ]);

      // Get invalid state codes count separately
      const invalidCitiesCount = await sql.query(
        `SELECT COUNT(*) as count
         FROM cities
         WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})`,
        validUSStates
      );
      
      const invalidCountiesCount = await sql.query(
        `SELECT COUNT(DISTINCT (county_name, state_code)) as count
         FROM zip_county_mapping
         WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})`,
        validUSStates
      );
      
      const invalidStateStats = {
        rows: [{
          invalid_cities: invalidCitiesCount.rows[0]?.count || '0',
          invalid_counties: invalidCountiesCount.rows[0]?.count || '0'
        }]
      };

      // Convert string numbers to integers for consistency
      const payload: any = {
        cities: {
          total_cities: parseInt(cityStats.rows[0]?.total_cities || '0'),
          cities_without_fmr: parseInt(cityStats.rows[0]?.cities_without_fmr || '0'),
          cities_with_fmr: parseInt(cityStats.rows[0]?.cities_with_fmr || '0'),
        },
        zips: {
          total_zips: parseInt(zipStats.rows[0]?.total_zips || '0'),
          zips_without_fmr: parseInt(zipStats.rows[0]?.zips_without_fmr || '0'),
          zips_with_safmr: parseInt(zipStats.rows[0]?.zips_with_safmr || '0'),
          zips_with_fmr_only: parseInt(zipStats.rows[0]?.zips_with_fmr_only || '0'),
          zips_with_safmr_data_but_uses_fmr: parseInt(zipStats.rows[0]?.zips_with_safmr_data_but_uses_fmr || '0'),
          total_using_fmr: parseInt(zipStats.rows[0]?.zips_with_fmr_only || '0') + parseInt(zipStats.rows[0]?.zips_with_safmr_data_but_uses_fmr || '0'),

          // These are based directly on the mandatory SAFMR list-derived lookup table.
          required_safmr_zips_total: parseInt(requiredSafmrTotals.rows[0]?.required_safmr_zips_total || '0'),
          required_safmr_zips_with_safmr_data: parseInt(requiredSafmrTotals.rows[0]?.required_safmr_zips_with_safmr_data || '0'),
          required_safmr_zips_missing_safmr_data:
            parseInt(requiredSafmrTotals.rows[0]?.required_safmr_zips_total || '0') -
            parseInt(requiredSafmrTotals.rows[0]?.required_safmr_zips_with_safmr_data || '0'),

          safmr_zips_total: parseInt(safmrTotals.rows[0]?.safmr_zips_total || '0'),
          safmr_zips_required: parseInt(safmrTotals.rows[0]?.safmr_zips_required || '0'),
          safmr_zips_not_required:
            parseInt(safmrTotals.rows[0]?.safmr_zips_total || '0') -
            parseInt(safmrTotals.rows[0]?.safmr_zips_required || '0'),
        },
        counties: {
          total_counties: parseInt(countyStats.rows[0]?.total_counties || '0'),
          counties_without_fmr: parseInt(countyStats.rows[0]?.counties_without_fmr || '0'),
          counties_with_fmr: parseInt(countyStats.rows[0]?.counties_with_fmr || '0'),
        },
        mappings: {
          total_issues: parseInt(mappingStats.rows[0]?.total_issues || '0'),
          zips_without_mapping: parseInt(mappingStats.rows[0]?.zips_without_mapping || '0'),
          zips_with_multiple_mappings: parseInt(mappingStats.rows[0]?.zips_with_multiple_mappings || '0'),
        },
        invalid_state_codes: {
          invalid_cities: parseInt(invalidStateStats.rows[0]?.invalid_cities || '0'),
          invalid_counties: parseInt(invalidStateStats.rows[0]?.invalid_counties || '0'),
        },
      };

      return NextResponse.json(payload);
    }

    if (type === 'cities') {
      const missingOnly = searchParams.get('missing') === 'true';
      const state = searchParams.get('state');
      const exportAll = searchParams.get('export') === 'true';
      const limit = exportAll ? 999999999 : parseInt(searchParams.get('limit') || '100');
      const offset = exportAll ? 0 : parseInt(searchParams.get('offset') || '0');

      // Use sql.query + explicit params to avoid driver quirks around nested sql fragments.
      const params: any[] = [year];
      let p = 2;
      let stateClause = '';
      if (state) {
        stateClause = ` AND c.state_code = $${p++}`;
        params.push(state.toUpperCase());
      }

      let outerWhere = '';
      if (missingOnly) outerWhere = `WHERE has_fmr_data = false`;

      let limitOffset = '';
      if (!exportAll) {
        limitOffset = ` LIMIT $${p++} OFFSET $${p++}`;
        params.push(limit, offset);
      }

      const results = await sql.query(
        `
        WITH city_fmr_status AS (
          SELECT DISTINCT
            c.city_name,
            c.state_code,
            c.state_name,
            c.zip_codes,
            CASE 
              WHEN EXISTS (
                SELECT 1 
                FROM safmr_data sd 
                WHERE sd.zip_code = ANY(c.zip_codes) 
                  AND sd.year = $1
              ) THEN true
              WHEN EXISTS (
                SELECT 1 
                FROM zip_county_mapping zcm
                JOIN fmr_data fd ON (
                  fd.county_code = zcm.county_fips
                  AND fd.state_code = zcm.state_code
                  AND fd.year = $1
                )
                WHERE zcm.zip_code = ANY(c.zip_codes)
              ) THEN true
              ELSE false
            END as has_fmr_data
          FROM cities c
          WHERE c.state_code != 'PR'${stateClause}
        )
        SELECT city_name, state_code, state_name, zip_codes, has_fmr_data
        FROM city_fmr_status
        ${outerWhere}
        ORDER BY state_code, city_name
        ${limitOffset}
        `,
        params
      );

      if (exportAll) {
        // Format as text file
        const lines = [
          'City Name\tState Code\tState Name\tZIP Codes\tHas FMR Data',
          ...results.rows.map(row => {
            const zipCodes = Array.isArray(row.zip_codes) 
              ? row.zip_codes.join(', ') 
              : (row.zip_codes || '');
            return `${row.city_name}\t${row.state_code}\t${row.state_name}\t${zipCodes}\t${row.has_fmr_data ? 'Yes' : 'No'}`;
          })
        ];
        return new NextResponse(lines.join('\n'), {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="cities-${missingOnly ? 'missing' : 'all'}-${Date.now()}.txt"`,
          },
        });
      }

      const totalParams: any[] = [year];
      let tp = 2;
      let totalStateClause = '';
      if (state) {
        totalStateClause = ` AND c.state_code = $${tp++}`;
        totalParams.push(state.toUpperCase());
      }
      const totalWhere = missingOnly ? `WHERE has_fmr_data = false` : ``;

      const total = await sql.query(
        `
        WITH city_fmr_status AS (
          SELECT DISTINCT
            c.city_name,
            c.state_code,
            CASE 
              WHEN EXISTS (
                SELECT 1 
                FROM safmr_data sd 
                WHERE sd.zip_code = ANY(c.zip_codes) 
                  AND sd.year = $1
              ) THEN true
              WHEN EXISTS (
                SELECT 1 
                FROM zip_county_mapping zcm
                JOIN fmr_data fd ON (
                  fd.county_code = zcm.county_fips
                  AND fd.state_code = zcm.state_code
                  AND fd.year = $1
                )
                WHERE zcm.zip_code = ANY(c.zip_codes)
              ) THEN true
              ELSE false
            END as has_fmr_data
          FROM cities c
          WHERE c.state_code != 'PR'${totalStateClause}
        )
        SELECT COUNT(*) as count
        FROM city_fmr_status
        ${totalWhere}
        `,
        totalParams
      );

      return NextResponse.json({
        results: results.rows,
        total: parseInt(total.rows[0].count),
        limit,
        offset
      });
    }

    if (type === 'zips') {
      const missingOnly = searchParams.get('missing') === 'true';
      const state = searchParams.get('state');
      const exportAll = searchParams.get('export') === 'true';
      const limit = exportAll ? 999999999 : parseInt(searchParams.get('limit') || '100');
      const offset = exportAll ? 0 : parseInt(searchParams.get('offset') || '0');

      // IMPORTANT: don't rely on `zips_without_fmr` here.
      // It can be slow/stale and may not match the current gating + FIPS-join behavior.
      //
      // Instead, compute per-ZIP status directly from base tables.
      const zipParams: any[] = [year];
      let zp = 2;
      let zipStateClause = '';
      if (state) {
        zipStateClause = ` AND zcm.state_code = $${zp++}`;
        zipParams.push(state.toUpperCase());
      }
      const zipWhere = missingOnly ? `WHERE fmr_source = 'NONE'` : ``;
      let zipLimitOffset = '';
      if (!exportAll) {
        zipLimitOffset = ` LIMIT $${zp++} OFFSET $${zp++}`;
        zipParams.push(limit, offset);
      }

      const results = await sql.query(
        `
        WITH zip_status AS (
          SELECT DISTINCT ON (zcm.zip_code)
            zcm.zip_code,
            zcm.county_name,
            zcm.state_code,
            zcm.state_name,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM required_safmr_zips rsz
                WHERE rsz.zip_code = zcm.zip_code
                  AND rsz.year = $1
              ) THEN 'SAFMR'
              WHEN EXISTS (
                SELECT 1
                FROM zip_county_mapping z2
                JOIN fmr_data fd
                  ON fd.year = $1
                 AND fd.county_code IS NOT NULL
                 AND fd.county_code = z2.county_fips
                 AND (
                   fd.state_code = z2.state_code
                   OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                 )
                WHERE z2.zip_code = zcm.zip_code
                  AND z2.state_code != 'PR'
              ) THEN 'FMR'
              ELSE 'NONE'
            END AS fmr_source,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM safmr_data sd
                WHERE sd.zip_code = zcm.zip_code
                  AND sd.year = $1
              )
              AND NOT EXISTS (
                SELECT 1
                FROM required_safmr_zips rsz
                WHERE rsz.zip_code = zcm.zip_code
                  AND rsz.year = $1
              )
              THEN TRUE
              ELSE FALSE
            END AS has_safmr_data_but_uses_fmr
          FROM zip_county_mapping zcm
          WHERE zcm.state_code != 'PR'${zipStateClause}
          ORDER BY zcm.zip_code, zcm.state_code, zcm.county_name
        )
        SELECT zip_code, county_name, state_code, state_name, fmr_source, has_safmr_data_but_uses_fmr
        FROM zip_status
        ${zipWhere}
        ORDER BY state_code, zip_code
        ${zipLimitOffset}
        `,
        zipParams
      );

      if (exportAll) {
        // Format as text file
        const lines = [
          'ZIP Code\tCounty Name\tState Code\tState Name\tFMR Source\tHas SAFMR Data But Uses FMR',
          ...results.rows.map(row => 
            `${row.zip_code}\t${row.county_name || ''}\t${row.state_code}\t${row.state_name || ''}\t${row.fmr_source || 'NONE'}\t${row.has_safmr_data_but_uses_fmr ? 'Yes' : 'No'}`
          )
        ];
        return new NextResponse(lines.join('\n'), {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="zips-${missingOnly ? 'missing' : 'all'}-${Date.now()}.txt"`,
          },
        });
      }

      const totalZipParams: any[] = [year];
      let tzp = 2;
      let totalZipStateClause = '';
      if (state) {
        totalZipStateClause = ` AND zcm.state_code = $${tzp++}`;
        totalZipParams.push(state.toUpperCase());
      }
      const totalZipWhere = missingOnly ? `WHERE fmr_source = 'NONE'` : ``;

      const total = await sql.query(
        `
        WITH zip_status AS (
          SELECT DISTINCT ON (zcm.zip_code)
            zcm.zip_code,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM required_safmr_zips rsz
                WHERE rsz.zip_code = zcm.zip_code
                  AND rsz.year = $1
              ) THEN 'SAFMR'
              WHEN EXISTS (
                SELECT 1
                FROM zip_county_mapping z2
                JOIN fmr_data fd
                  ON fd.year = $1
                 AND fd.county_code IS NOT NULL
                 AND fd.county_code = z2.county_fips
                 AND (
                   fd.state_code = z2.state_code
                   OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                 )
                WHERE z2.zip_code = zcm.zip_code
                  AND z2.state_code != 'PR'
              ) THEN 'FMR'
              ELSE 'NONE'
            END AS fmr_source
          FROM zip_county_mapping zcm
          WHERE zcm.state_code != 'PR'${totalZipStateClause}
          ORDER BY zcm.zip_code, zcm.state_code, zcm.county_name
        )
        SELECT COUNT(*) as count
        FROM zip_status
        ${totalZipWhere}
        `,
        totalZipParams
      );

      return NextResponse.json({
        results: results.rows,
        total: parseInt(total.rows[0].count),
        limit,
        offset
      });
    }

    if (type === 'counties') {
      const missingOnly = searchParams.get('missing') === 'true';
      const state = searchParams.get('state');
      const exportAll = searchParams.get('export') === 'true';
      const limit = exportAll ? 999999999 : parseInt(searchParams.get('limit') || '100');
      const offset = exportAll ? 0 : parseInt(searchParams.get('offset') || '0');

      let results;
      
      if (state) {
        if (missingOnly && exportAll) {
          results = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                zcm.state_name,
                COUNT(DISTINCT zcm.zip_code) as zip_count,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              AND zcm.state_code = ${state.toUpperCase()}
              GROUP BY zcm.county_name, zcm.state_code, zcm.state_name
            )
            SELECT county_name, state_code, state_name, zip_count, has_fmr_data
            FROM county_fmr_status
            WHERE has_fmr_data = false
            ORDER BY state_code, county_name
          `;
        } else if (missingOnly && !exportAll) {
          results = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                zcm.state_name,
                COUNT(DISTINCT zcm.zip_code) as zip_count,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              AND zcm.state_code = ${state.toUpperCase()}
              GROUP BY zcm.county_name, zcm.state_code, zcm.state_name
            )
            SELECT county_name, state_code, state_name, zip_count, has_fmr_data
            FROM county_fmr_status
            WHERE has_fmr_data = false
            ORDER BY state_code, county_name
            LIMIT ${limit} OFFSET ${offset}
          `;
        } else if (!missingOnly && exportAll) {
          results = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                zcm.state_name,
                COUNT(DISTINCT zcm.zip_code) as zip_count,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              AND zcm.state_code = ${state.toUpperCase()}
              GROUP BY zcm.county_name, zcm.state_code, zcm.state_name
            )
            SELECT county_name, state_code, state_name, zip_count, has_fmr_data
            FROM county_fmr_status
            ORDER BY state_code, county_name
          `;
        } else {
          results = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                zcm.state_name,
                COUNT(DISTINCT zcm.zip_code) as zip_count,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              AND zcm.state_code = ${state.toUpperCase()}
              GROUP BY zcm.county_name, zcm.state_code, zcm.state_name
            )
            SELECT county_name, state_code, state_name, zip_count, has_fmr_data
            FROM county_fmr_status
            ORDER BY state_code, county_name
            LIMIT ${limit} OFFSET ${offset}
          `;
        }
      } else {
        if (missingOnly && exportAll) {
          results = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                zcm.state_name,
                COUNT(DISTINCT zcm.zip_code) as zip_count,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              GROUP BY zcm.county_name, zcm.state_code, zcm.state_name
            )
            SELECT county_name, state_code, state_name, zip_count, has_fmr_data
            FROM county_fmr_status
            WHERE has_fmr_data = false
            ORDER BY state_code, county_name
          `;
        } else if (missingOnly && !exportAll) {
          results = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                zcm.state_name,
                COUNT(DISTINCT zcm.zip_code) as zip_count,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              GROUP BY zcm.county_name, zcm.state_code, zcm.state_name
            )
            SELECT county_name, state_code, state_name, zip_count, has_fmr_data
            FROM county_fmr_status
            WHERE has_fmr_data = false
            ORDER BY state_code, county_name
            LIMIT ${limit} OFFSET ${offset}
          `;
        } else if (!missingOnly && exportAll) {
          results = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                zcm.state_name,
                COUNT(DISTINCT zcm.zip_code) as zip_count,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              GROUP BY zcm.county_name, zcm.state_code, zcm.state_name
            )
            SELECT county_name, state_code, state_name, zip_count, has_fmr_data
            FROM county_fmr_status
            ORDER BY state_code, county_name
          `;
        } else {
          results = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                zcm.state_name,
                COUNT(DISTINCT zcm.zip_code) as zip_count,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              GROUP BY zcm.county_name, zcm.state_code, zcm.state_name
            )
            SELECT county_name, state_code, state_name, zip_count, has_fmr_data
            FROM county_fmr_status
            ORDER BY state_code, county_name
            LIMIT ${limit} OFFSET ${offset}
          `;
        }
      }

      if (exportAll) {
        // Format as text file
        const lines = [
          'County Name\tState Code\tState Name\tZIP Count\tHas FMR Data',
          ...results.rows.map(row => 
            `${row.county_name}\t${row.state_code}\t${row.state_name || ''}\t${row.zip_count || 0}\t${row.has_fmr_data ? 'Yes' : 'No'}`
          )
        ];
        return new NextResponse(lines.join('\n'), {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="counties-${missingOnly ? 'missing' : 'all'}-${Date.now()}.txt"`,
          },
        });
      }

      let total;
      if (state) {
        if (missingOnly) {
          total = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              AND zcm.state_code = ${state.toUpperCase()}
              GROUP BY zcm.county_name, zcm.state_code
            )
            SELECT COUNT(*) as count
            FROM county_fmr_status
            WHERE has_fmr_data = false
          `;
        } else {
          total = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              AND zcm.state_code = ${state.toUpperCase()}
              GROUP BY zcm.county_name, zcm.state_code
            )
            SELECT COUNT(*) as count
            FROM county_fmr_status
          `;
        }
      } else {
        if (missingOnly) {
          total = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              GROUP BY zcm.county_name, zcm.state_code
            )
            SELECT COUNT(*) as count
            FROM county_fmr_status
            WHERE has_fmr_data = false
          `;
        } else {
          total = await sql`
            WITH county_fmr_status AS (
              SELECT DISTINCT
                zcm.county_name,
                zcm.state_code,
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM zip_county_mapping z2
                    JOIN fmr_data fd
                      ON fd.year = ${year}
                     AND fd.county_code IS NOT NULL
                     AND fd.county_code = z2.county_fips
                     AND (
                       fd.state_code = z2.state_code
                       OR (z2.state_code = 'DC' AND fd.state_code IN ('MD', 'VA'))
                     )
                    WHERE z2.county_name = zcm.county_name
                      AND z2.state_code = zcm.state_code
                      AND z2.county_fips IS NOT NULL
                  ) THEN true
                  ELSE false
                END as has_fmr_data
              FROM zip_county_mapping zcm
              WHERE zcm.state_code != 'PR'
              GROUP BY zcm.county_name, zcm.state_code
            )
            SELECT COUNT(*) as count
            FROM county_fmr_status
          `;
        }
      }

      return NextResponse.json({
        results: results.rows,
        total: parseInt(total.rows[0].count),
        limit,
        offset
      });
    }

    if (type === 'zip-mappings') {
      const issueType = searchParams.get('issue_type'); // NO_MAPPING, MULTIPLE_MAPPINGS, or null for all
      const exportAll = searchParams.get('export') === 'true';
      const limit = exportAll ? 999999999 : parseInt(searchParams.get('limit') || '100');
      const offset = exportAll ? 0 : parseInt(searchParams.get('offset') || '0');

      let whereClause = '';
      const params: any[] = [];
      let paramIndex = 1;

      if (issueType) {
        whereClause += ' AND zmi.issue_type = $' + paramIndex;
        params.push(issueType);
        paramIndex++;
      }

      const results = await sql.query(
        `SELECT DISTINCT zmi.zip_code, zmi.county_count, zmi.counties, zmi.issue_type
         FROM zip_county_mapping_issues zmi
         INNER JOIN zip_county_mapping zcm ON zmi.zip_code = zcm.zip_code
         WHERE zcm.state_code != 'PR'
         ${whereClause}
         ORDER BY zmi.issue_type, zmi.zip_code
         ${exportAll ? '' : `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`}`,
        exportAll ? params : [...params, limit, offset]
      );

      if (exportAll) {
        // Format as text file
        const lines = [
          'ZIP Code\tIssue Type\tCounty Count\tCounties',
          ...results.rows.map(row => 
            `${row.zip_code}\t${row.issue_type || ''}\t${row.county_count || 0}\t${(row.counties || '').replace(/\t/g, ' ')}`
          )
        ];
        return new NextResponse(lines.join('\n'), {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="zip-mappings-${issueType || 'all'}-${Date.now()}.txt"`,
          },
        });
      }

      const totalWhereClause = issueType ? ' AND zmi.issue_type = $1' : '';
      const totalParams = issueType ? [issueType] : [];
      const total = await sql.query(
        `SELECT COUNT(DISTINCT zmi.zip_code) as count
         FROM zip_county_mapping_issues zmi
         INNER JOIN zip_county_mapping zcm ON zmi.zip_code = zcm.zip_code
         WHERE zcm.state_code != 'PR'${totalWhereClause}`,
        totalParams
      );

      return NextResponse.json({
        results: results.rows,
        total: parseInt(total.rows[0].count),
        limit,
        offset
      });
    }

    if (type === 'invalid-state-codes') {
      const exportAll = searchParams.get('export') === 'true';
      const limit = exportAll ? 999999999 : parseInt(searchParams.get('limit') || '100');
      const offset = exportAll ? 0 : parseInt(searchParams.get('offset') || '0');

      // Valid US state codes (50 states + DC + US territories)
      const validUSStates = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
        'PR', 'VI', 'GU', 'MP', 'AS' // US territories: Puerto Rico, US Virgin Islands, Guam, Northern Mariana Islands, American Samoa
      ];

      // Get cities with invalid state codes
      const invalidCities = await sql.query(
        `SELECT city_name, state_code, state_name, zip_codes
         FROM cities
         WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
         ORDER BY state_code, city_name
         ${exportAll ? '' : `LIMIT $${validUSStates.length + 1} OFFSET $${validUSStates.length + 2}`}`,
        exportAll ? validUSStates : [...validUSStates, limit, offset]
      );

      // Get counties with invalid state codes  
      const invalidCounties = await sql.query(
        `SELECT DISTINCT county_name, state_code, state_name
         FROM zip_county_mapping
         WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
         ORDER BY state_code, county_name
         ${exportAll ? '' : `LIMIT $${validUSStates.length + 1} OFFSET $${validUSStates.length + 2}`}`,
        exportAll ? validUSStates : [...validUSStates, limit, offset]
      );

      // Combine results
      const combinedResults = [
        ...invalidCities.rows.map(row => ({
          type: 'city',
          name: row.city_name,
          state_code: row.state_code,
          state_name: row.state_name,
          zip_codes: row.zip_codes
        })),
        ...invalidCounties.rows.map(row => ({
          type: 'county',
          name: row.county_name,
          state_code: row.state_code,
          state_name: row.state_name,
          zip_codes: null
        }))
      ];

      if (exportAll) {
        const lines = [
          'Type\tName\tState Code\tState Name\tZIP Codes',
          ...combinedResults.map(row => {
            const zipCodes = Array.isArray(row.zip_codes) 
              ? row.zip_codes.join(', ') 
              : (row.zip_codes || 'N/A');
            return `${row.type}\t${row.name}\t${row.state_code}\t${row.state_name || ''}\t${zipCodes}`;
          })
        ];
        return new NextResponse(lines.join('\n'), {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="invalid-state-codes-${Date.now()}.txt"`,
          },
        });
      }

      // Get total count
      const [cityTotal, countyTotal] = await Promise.all([
        sql.query(
          `SELECT COUNT(*) as count
           FROM cities
           WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})`,
          validUSStates
        ),
        sql.query(
          `SELECT COUNT(*) as count
           FROM (
             SELECT DISTINCT county_name, state_code
             FROM zip_county_mapping
             WHERE state_code NOT IN (${validUSStates.map((_, i) => `$${i + 1}`).join(', ')})
           ) as distinct_counties`,
          validUSStates
        )
      ]);

      const total = parseInt(cityTotal.rows[0].count) + parseInt(countyTotal.rows[0].count);

      return NextResponse.json({
        results: combinedResults.slice(offset, offset + limit),
        total,
        limit,
        offset
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    console.error('Test coverage error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch test coverage data',
        details: error?.message || String(error),
        hint: 'This endpoint computes coverage from base tables. Ensure DB tables are populated (FMR/SAFMR/ZIP-county mapping) and try again.'
      },
      { status: 500 }
    );
  }
}

