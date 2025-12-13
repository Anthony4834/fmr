import { sql } from '@vercel/postgres';

export type DashboardInsightsType = 'zip' | 'city' | 'county';

/**
 * Compute the dashboard insights payload (the exact JSON shape consumed by the home dashboard).
 *
 * This is intentionally server-side and is meant to be cached in DB via `dashboard_insights_cache`.
 */
export async function computeDashboardInsights(opts: {
  year: number;
  type: DashboardInsightsType;
}) {
  const { year, type } = opts;

  // Calculate national averages for bedroom transitions (excluding PR)
  // Only use SAFMR data if ZIP is in required_safmr_zips, otherwise use county FMR
  const nationalAverages = await sql`
    WITH zip_fmr_data AS (
      SELECT DISTINCT ON (zcm.zip_code)
        zcm.zip_code,
        COALESCE(
          CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_0 END,
          fd.bedroom_0
        ) as bedroom_0,
        COALESCE(
          CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_1 END,
          fd.bedroom_1
        ) as bedroom_1,
        COALESCE(
          CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_2 END,
          fd.bedroom_2
        ) as bedroom_2,
        COALESCE(
          CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_3 END,
          fd.bedroom_3
        ) as bedroom_3,
        COALESCE(
          CASE WHEN rsz.zip_code IS NOT NULL THEN sd.bedroom_4 END,
          fd.bedroom_4
        ) as bedroom_4
      FROM zip_county_mapping zcm
      LEFT JOIN required_safmr_zips rsz 
        ON zcm.zip_code = rsz.zip_code AND rsz.year = ${year}
      LEFT JOIN safmr_data sd 
        ON zcm.zip_code = sd.zip_code AND sd.year = ${year}
      LEFT JOIN fmr_data fd 
        ON zcm.county_fips = fd.county_code 
        AND zcm.state_code = fd.state_code 
        AND fd.year = ${year}
      WHERE zcm.state_code != 'PR'
      ORDER BY zcm.zip_code
    )
    SELECT 
      AVG(CASE WHEN bedroom_0 IS NOT NULL AND bedroom_1 IS NOT NULL AND bedroom_0 > 0 
        THEN (bedroom_1 - bedroom_0) / bedroom_0 * 100 ELSE NULL END) as avg_jump_0_to_1,
      AVG(CASE WHEN bedroom_1 IS NOT NULL AND bedroom_2 IS NOT NULL AND bedroom_1 > 0 
        THEN (bedroom_2 - bedroom_1) / bedroom_1 * 100 ELSE NULL END) as avg_jump_1_to_2,
      AVG(CASE WHEN bedroom_2 IS NOT NULL AND bedroom_3 IS NOT NULL AND bedroom_2 > 0 
        THEN (bedroom_3 - bedroom_2) / bedroom_2 * 100 ELSE NULL END) as avg_jump_2_to_3,
      AVG(CASE WHEN bedroom_3 IS NOT NULL AND bedroom_4 IS NOT NULL AND bedroom_3 > 0 
        THEN (bedroom_4 - bedroom_3) / bedroom_3 * 100 ELSE NULL END) as avg_jump_3_to_4
    FROM zip_fmr_data
    WHERE (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
           bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
  `;

  const natAvg = nationalAverages.rows[0] as any;
  const nationalAvgJumps: Record<number, number> = {
    0: parseFloat(natAvg.avg_jump_0_to_1) || 0,
    1: parseFloat(natAvg.avg_jump_1_to_2) || 0,
    2: parseFloat(natAvg.avg_jump_2_to_3) || 0,
    3: parseFloat(natAvg.avg_jump_3_to_4) || 0,
  };

  if (type === 'zip') {
    // ZIP CODE LEVEL DATA (excluding PR)
    // Only use SAFMR data if ZIP is in required_safmr_zips, otherwise use county FMR
    const topZips = await sql`
      WITH zip_fmr_data AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0
            ELSE fd.bedroom_0
          END as bedroom_0,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1
            ELSE fd.bedroom_1
          END as bedroom_1,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2
            ELSE fd.bedroom_2
          END as bedroom_2,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3
            ELSE fd.bedroom_3
          END as bedroom_3,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4
            ELSE fd.bedroom_4
          END as bedroom_4
        FROM zip_county_mapping zcm
        LEFT JOIN required_safmr_zips rsz 
          ON zcm.zip_code = rsz.zip_code AND rsz.year = ${year}
        LEFT JOIN safmr_data sd 
          ON zcm.zip_code = sd.zip_code AND sd.year = ${year}
        LEFT JOIN fmr_data fd 
          ON zcm.county_fips = fd.county_code 
          AND zcm.state_code = fd.state_code 
          AND fd.year = ${year}
        WHERE zcm.state_code != 'PR'
        ORDER BY zcm.zip_code, zcm.county_name
      )
      SELECT 
        zip_code,
        bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
        (COALESCE(bedroom_0, 0) + COALESCE(bedroom_1, 0) + COALESCE(bedroom_2, 0) + 
         COALESCE(bedroom_3, 0) + COALESCE(bedroom_4, 0)) / 
        NULLIF((CASE WHEN bedroom_0 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_1 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_2 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_3 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_4 IS NOT NULL THEN 1 ELSE 0 END), 0) as avg_fmr,
        bedroom_1 / 1.0 as rent_per_bedroom_1br,
        bedroom_2 / 2.0 as rent_per_bedroom_2br,
        bedroom_3 / 3.0 as rent_per_bedroom_3br,
        bedroom_4 / 4.0 as rent_per_bedroom_4br
      FROM zip_fmr_data
      WHERE (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
             bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
      ORDER BY avg_fmr DESC
    `;

    // Sort by avg_fmr DESC and limit after deduplication
    const topZipsSorted = topZips.rows
      .sort((a: any, b: any) => parseFloat(b.avg_fmr) - parseFloat(a.avg_fmr))
      .slice(0, 50);

    const bottomZips = await sql`
      WITH zip_fmr_data AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0
            ELSE fd.bedroom_0
          END as bedroom_0,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1
            ELSE fd.bedroom_1
          END as bedroom_1,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2
            ELSE fd.bedroom_2
          END as bedroom_2,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3
            ELSE fd.bedroom_3
          END as bedroom_3,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4
            ELSE fd.bedroom_4
          END as bedroom_4
        FROM zip_county_mapping zcm
        LEFT JOIN required_safmr_zips rsz 
          ON zcm.zip_code = rsz.zip_code AND rsz.year = ${year}
        LEFT JOIN safmr_data sd 
          ON zcm.zip_code = sd.zip_code AND sd.year = ${year}
        LEFT JOIN fmr_data fd 
          ON zcm.county_fips = fd.county_code 
          AND zcm.state_code = fd.state_code 
          AND fd.year = ${year}
        WHERE zcm.state_code != 'PR'
        ORDER BY zcm.zip_code, zcm.county_name
      )
      SELECT 
        zip_code,
        bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
        (COALESCE(bedroom_0, 0) + COALESCE(bedroom_1, 0) + COALESCE(bedroom_2, 0) + 
         COALESCE(bedroom_3, 0) + COALESCE(bedroom_4, 0)) / 
        NULLIF((CASE WHEN bedroom_0 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_1 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_2 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_3 IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN bedroom_4 IS NOT NULL THEN 1 ELSE 0 END), 0) as avg_fmr,
        bedroom_1 / 1.0 as rent_per_bedroom_1br,
        bedroom_2 / 2.0 as rent_per_bedroom_2br,
        bedroom_3 / 3.0 as rent_per_bedroom_3br,
        bedroom_4 / 4.0 as rent_per_bedroom_4br
      FROM zip_fmr_data
      WHERE (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
             bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
      ORDER BY avg_fmr ASC
    `;

    const bottomZipsSorted = bottomZips.rows
      .sort((a: any, b: any) => parseFloat(a.avg_fmr) - parseFloat(b.avg_fmr))
      .slice(0, 50);

    // Get county names and city names for ZIPs
    const topZipCodes = topZipsSorted.map((z: any) => String(z.zip_code));
    const bottomZipCodes = bottomZipsSorted.map((z: any) => String(z.zip_code));
    const allZipCodes = [...new Set([...topZipCodes, ...bottomZipCodes])];

    const zipCountyMap = new Map<string, { countyName: string; stateCode: string; cityName?: string }>();
    if (allZipCodes.length > 0) {
      const placeholders = allZipCodes.map((_, i) => `$${i + 1}`).join(', ');
      const countyMappings = await sql.query(
        `SELECT DISTINCT ON (zip_code) zip_code, county_name, state_code
         FROM zip_county_mapping
         WHERE zip_code IN (${placeholders})
           AND state_code != 'PR'
         ORDER BY zip_code, county_name`,
        allZipCodes
      );

      const cityMappings = await sql`
        SELECT 
          unnest(c.zip_codes)::text as zip_code,
          c.city_name,
          c.state_code
        FROM cities c
        WHERE c.state_code != 'PR'
      `;

      const cityMap = new Map<string, string>();
      (cityMappings.rows as any[]).forEach((row) => {
        const zipCode = String(row.zip_code);
        if (allZipCodes.includes(zipCode)) {
          const key = `${zipCode}-${row.state_code}`;
          if (!cityMap.has(key)) {
            cityMap.set(key, row.city_name);
          }
        }
      });

      (countyMappings.rows as any[]).forEach((row) => {
        const zipCode = String(row.zip_code);
        const key = `${zipCode}-${row.state_code}`;
        zipCountyMap.set(zipCode, {
          countyName: row.county_name,
          stateCode: row.state_code,
          cityName: cityMap.get(key) || undefined,
        });
      });
    }

    // Fallback: fetch any missing ZIPs in one query
    const missingZipCodes = [...new Set([...topZipCodes, ...bottomZipCodes])].filter((z) => !zipCountyMap.has(z));
    if (missingZipCodes.length > 0) {
      const fallbackPlaceholders = missingZipCodes.map((_, i) => `$${i + 1}`).join(', ');
      const fallbackMappings = await sql.query(
        `SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          zcm.county_name,
          zcm.state_code,
          c.city_name
        FROM zip_county_mapping zcm
        LEFT JOIN cities c ON zcm.zip_code = ANY(c.zip_codes) AND zcm.state_code = c.state_code
        WHERE zcm.zip_code IN (${fallbackPlaceholders})
          AND zcm.state_code != 'PR'
        ORDER BY zcm.zip_code, zcm.county_name`,
        missingZipCodes
      );
      (fallbackMappings.rows as any[]).forEach((row) => {
        const zipCode = String(row.zip_code);
        zipCountyMap.set(zipCode, {
          countyName: row.county_name,
          stateCode: row.state_code,
          cityName: row.city_name || undefined,
        });
      });
    }

    // Anomalies for ZIPs (excluding PR)
    // Only use SAFMR data if ZIP is in required_safmr_zips, otherwise use county FMR
    const anomalies = await sql`
      WITH zip_fmr_data AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0
            ELSE fd.bedroom_0
          END as bedroom_0,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1
            ELSE fd.bedroom_1
          END as bedroom_1,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2
            ELSE fd.bedroom_2
          END as bedroom_2,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3
            ELSE fd.bedroom_3
          END as bedroom_3,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4
            ELSE fd.bedroom_4
          END as bedroom_4
        FROM zip_county_mapping zcm
        LEFT JOIN required_safmr_zips rsz 
          ON zcm.zip_code = rsz.zip_code AND rsz.year = ${year}
        LEFT JOIN safmr_data sd 
          ON zcm.zip_code = sd.zip_code AND sd.year = ${year}
        LEFT JOIN fmr_data fd 
          ON zcm.county_fips = fd.county_code 
          AND zcm.state_code = fd.state_code 
          AND fd.year = ${year}
        WHERE zcm.state_code != 'PR'
        ORDER BY zcm.zip_code, zcm.county_name
      )
      SELECT 
        zip_code,
        bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
        CASE WHEN bedroom_0 IS NOT NULL AND bedroom_1 IS NOT NULL AND bedroom_0 > 0 
          THEN (bedroom_1 - bedroom_0) / bedroom_0 * 100 ELSE NULL END as jump_0_to_1_pct,
        CASE WHEN bedroom_1 IS NOT NULL AND bedroom_2 IS NOT NULL AND bedroom_1 > 0 
          THEN (bedroom_2 - bedroom_1) / bedroom_1 * 100 ELSE NULL END as jump_1_to_2_pct,
        CASE WHEN bedroom_2 IS NOT NULL AND bedroom_3 IS NOT NULL AND bedroom_2 > 0 
          THEN (bedroom_3 - bedroom_2) / bedroom_2 * 100 ELSE NULL END as jump_2_to_3_pct,
        CASE WHEN bedroom_3 IS NOT NULL AND bedroom_4 IS NOT NULL AND bedroom_3 > 0 
          THEN (bedroom_4 - bedroom_3) / bedroom_3 * 100 ELSE NULL END as jump_3_to_4_pct,
        CASE WHEN bedroom_0 IS NOT NULL AND bedroom_1 IS NOT NULL 
          THEN bedroom_1 - bedroom_0 ELSE NULL END as jump_0_to_1,
        CASE WHEN bedroom_1 IS NOT NULL AND bedroom_2 IS NOT NULL 
          THEN bedroom_2 - bedroom_1 ELSE NULL END as jump_1_to_2,
        CASE WHEN bedroom_2 IS NOT NULL AND bedroom_3 IS NOT NULL 
          THEN bedroom_3 - bedroom_2 ELSE NULL END as jump_2_to_3,
        CASE WHEN bedroom_3 IS NOT NULL AND bedroom_4 IS NOT NULL 
          THEN bedroom_4 - bedroom_3 ELSE NULL END as jump_3_to_4
      FROM zip_fmr_data
      WHERE (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
             bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
      ORDER BY zip_code
    `;

    const processedAnomalies = (anomalies.rows as any[])
      .map((row) => {
        const jumps = [
          { from: 0, to: 1, pct: parseFloat(row.jump_0_to_1_pct) || null, amount: parseFloat(row.jump_0_to_1) || null, natAvg: nationalAvgJumps[0] },
          { from: 1, to: 2, pct: parseFloat(row.jump_1_to_2_pct) || null, amount: parseFloat(row.jump_1_to_2) || null, natAvg: nationalAvgJumps[1] },
          { from: 2, to: 3, pct: parseFloat(row.jump_2_to_3_pct) || null, amount: parseFloat(row.jump_2_to_3) || null, natAvg: nationalAvgJumps[2] },
          { from: 3, to: 4, pct: parseFloat(row.jump_3_to_4_pct) || null, amount: parseFloat(row.jump_3_to_4) || null, natAvg: nationalAvgJumps[3] },
        ].filter((j) => {
          const pct = j.pct;
          return pct !== null && !isNaN(pct) && isFinite(pct) && 
                 j.natAvg > 0 && isFinite(j.natAvg) &&
                 j.amount !== null && !isNaN(j.amount) && isFinite(j.amount);
        });

        if (jumps.length === 0) return null;

        const maxJump = jumps.reduce((max, jump) => {
          return jump.pct! > max.pct! ? jump : max;
        });

        return {
          zip_code: row.zip_code,
          bedroom_0: parseFloat(row.bedroom_0) || null,
          bedroom_1: parseFloat(row.bedroom_1) || null,
          bedroom_2: parseFloat(row.bedroom_2) || null,
          bedroom_3: parseFloat(row.bedroom_3) || null,
          bedroom_4: parseFloat(row.bedroom_4) || null,
          maxJumpFrom: maxJump.from,
          maxJumpTo: maxJump.to,
          maxJumpPct: maxJump.pct!,
          maxJumpAmount: maxJump.amount!,
          nationalAvg: maxJump.natAvg,
        };
      })
      .filter((a) => a !== null)
      .sort((a: any, b: any) => b.maxJumpPct - a.maxJumpPct)
      .slice(0, 50);

    const anomalyZipCodes = processedAnomalies.map((a: any) => a.zip_code);
    const allAnomalyZipCodes = [...new Set([...allZipCodes, ...anomalyZipCodes])];

    if (allAnomalyZipCodes.length > allZipCodes.length) {
      const additionalZipCodes = anomalyZipCodes.filter((z: string) => !allZipCodes.includes(z));
      if (additionalZipCodes.length > 0) {
        const additionalPlaceholders = additionalZipCodes.map((_, i) => `$${i + 1}`).join(', ');
        const additionalMappings = await sql.query(
          `SELECT DISTINCT ON (zip_code) zip_code, county_name, state_code
           FROM zip_county_mapping
           WHERE zip_code IN (${additionalPlaceholders})
             AND state_code != 'PR'
           ORDER BY zip_code, county_name`,
          additionalZipCodes
        );

        const additionalCityMappings = await sql`
          SELECT 
            unnest(c.zip_codes)::text as zip_code,
            c.city_name,
            c.state_code
          FROM cities c
          WHERE c.state_code != 'PR'
        `;

        const additionalCityMap = new Map<string, string>();
        (additionalCityMappings.rows as any[]).forEach((row) => {
          const zipCode = String(row.zip_code);
          if (additionalZipCodes.includes(zipCode)) {
            const key = `${zipCode}-${row.state_code}`;
            if (!additionalCityMap.has(key)) {
              additionalCityMap.set(key, row.city_name);
            }
          }
        });

        (additionalMappings.rows as any[]).forEach((row) => {
          const zipCode = String(row.zip_code);
          const key = `${zipCode}-${row.state_code}`;
          zipCountyMap.set(zipCode, {
            countyName: row.county_name,
            stateCode: row.state_code,
            cityName: additionalCityMap.get(key) || undefined,
          });
        });
      }
    }

    // Compute rising/falling YoY changes for ZIPs
    // Only use SAFMR data if ZIP is in required_safmr_zips, otherwise use county FMR
    // Optimized: Pre-filter to only ZIPs with data in either year to reduce data transfer
    const prevYear = year - 1;
    const zipYoY = await sql`
      WITH zip_with_data AS (
        SELECT DISTINCT zcm.zip_code
        FROM zip_county_mapping zcm
        WHERE zcm.state_code != 'PR'
          AND (
            EXISTS (
              SELECT 1 FROM required_safmr_zips rsz 
              WHERE rsz.zip_code = zcm.zip_code 
                AND rsz.year = ${year}
            )
            OR EXISTS (
              SELECT 1 FROM safmr_data sd 
              WHERE sd.zip_code = zcm.zip_code 
                AND sd.year = ${year}
            )
            OR EXISTS (
              SELECT 1 FROM fmr_data fd 
              WHERE fd.county_code = zcm.county_fips 
                AND fd.state_code = zcm.state_code 
                AND fd.year = ${year}
            )
            OR EXISTS (
              SELECT 1 FROM required_safmr_zips rsz 
              WHERE rsz.zip_code = zcm.zip_code 
                AND rsz.year = ${prevYear}
            )
            OR EXISTS (
              SELECT 1 FROM safmr_data sd 
              WHERE sd.zip_code = zcm.zip_code 
                AND sd.year = ${prevYear}
            )
            OR EXISTS (
              SELECT 1 FROM fmr_data fd 
              WHERE fd.county_code = zcm.county_fips 
                AND fd.state_code = zcm.state_code 
                AND fd.year = ${prevYear}
            )
          )
      ),
      zip_fmr_curr AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          zcm.county_name,
          zcm.state_code,
          c.city_name,
          CASE 
            WHEN rsz_curr.zip_code IS NOT NULL AND sd_curr.bedroom_0 IS NOT NULL THEN sd_curr.bedroom_0
            ELSE fd_curr.bedroom_0
          END as curr_0,
          CASE 
            WHEN rsz_curr.zip_code IS NOT NULL AND sd_curr.bedroom_1 IS NOT NULL THEN sd_curr.bedroom_1
            ELSE fd_curr.bedroom_1
          END as curr_1,
          CASE 
            WHEN rsz_curr.zip_code IS NOT NULL AND sd_curr.bedroom_2 IS NOT NULL THEN sd_curr.bedroom_2
            ELSE fd_curr.bedroom_2
          END as curr_2,
          CASE 
            WHEN rsz_curr.zip_code IS NOT NULL AND sd_curr.bedroom_3 IS NOT NULL THEN sd_curr.bedroom_3
            ELSE fd_curr.bedroom_3
          END as curr_3,
          CASE 
            WHEN rsz_curr.zip_code IS NOT NULL AND sd_curr.bedroom_4 IS NOT NULL THEN sd_curr.bedroom_4
            ELSE fd_curr.bedroom_4
          END as curr_4
        FROM zip_with_data zwd
        INNER JOIN zip_county_mapping zcm ON zwd.zip_code = zcm.zip_code
        LEFT JOIN cities c ON zcm.zip_code = ANY(c.zip_codes) AND zcm.state_code = c.state_code
        LEFT JOIN required_safmr_zips rsz_curr 
          ON zcm.zip_code = rsz_curr.zip_code AND rsz_curr.year = ${year}
        LEFT JOIN safmr_data sd_curr 
          ON zcm.zip_code = sd_curr.zip_code AND sd_curr.year = ${year}
        LEFT JOIN fmr_data fd_curr 
          ON zcm.county_fips = fd_curr.county_code 
          AND zcm.state_code = fd_curr.state_code 
          AND fd_curr.year = ${year}
        ORDER BY zcm.zip_code, zcm.county_name
      ),
      zip_fmr_prev AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          CASE 
            WHEN rsz_prev.zip_code IS NOT NULL AND sd_prev.bedroom_0 IS NOT NULL THEN sd_prev.bedroom_0
            ELSE fd_prev.bedroom_0
          END as prev_0,
          CASE 
            WHEN rsz_prev.zip_code IS NOT NULL AND sd_prev.bedroom_1 IS NOT NULL THEN sd_prev.bedroom_1
            ELSE fd_prev.bedroom_1
          END as prev_1,
          CASE 
            WHEN rsz_prev.zip_code IS NOT NULL AND sd_prev.bedroom_2 IS NOT NULL THEN sd_prev.bedroom_2
            ELSE fd_prev.bedroom_2
          END as prev_2,
          CASE 
            WHEN rsz_prev.zip_code IS NOT NULL AND sd_prev.bedroom_3 IS NOT NULL THEN sd_prev.bedroom_3
            ELSE fd_prev.bedroom_3
          END as prev_3,
          CASE 
            WHEN rsz_prev.zip_code IS NOT NULL AND sd_prev.bedroom_4 IS NOT NULL THEN sd_prev.bedroom_4
            ELSE fd_prev.bedroom_4
          END as prev_4
        FROM zip_with_data zwd
        INNER JOIN zip_county_mapping zcm ON zwd.zip_code = zcm.zip_code
        LEFT JOIN required_safmr_zips rsz_prev 
          ON zcm.zip_code = rsz_prev.zip_code AND rsz_prev.year = ${prevYear}
        LEFT JOIN safmr_data sd_prev 
          ON zcm.zip_code = sd_prev.zip_code AND sd_prev.year = ${prevYear}
        LEFT JOIN fmr_data fd_prev 
          ON zcm.county_fips = fd_prev.county_code 
          AND zcm.state_code = fd_prev.state_code 
          AND fd_prev.year = ${prevYear}
        ORDER BY zcm.zip_code, zcm.county_name
      )
      SELECT 
        curr.zip_code,
        curr.county_name,
        curr.state_code,
        curr.city_name,
        curr.curr_0, curr.curr_1, curr.curr_2, curr.curr_3, curr.curr_4,
        prev.prev_0, prev.prev_1, prev.prev_2, prev.prev_3, prev.prev_4
      FROM zip_fmr_curr curr
      INNER JOIN zip_fmr_prev prev ON curr.zip_code = prev.zip_code
      WHERE (curr.curr_0 IS NOT NULL OR curr.curr_1 IS NOT NULL OR curr.curr_2 IS NOT NULL OR 
             curr.curr_3 IS NOT NULL OR curr.curr_4 IS NOT NULL)
        AND (prev.prev_0 IS NOT NULL OR prev.prev_1 IS NOT NULL OR prev.prev_2 IS NOT NULL OR 
             prev.prev_3 IS NOT NULL OR prev.prev_4 IS NOT NULL)
      ORDER BY curr.zip_code
    `;

    // Populate county mappings from YoY query results
    (zipYoY.rows as any[]).forEach((row) => {
      const zipCode = String(row.zip_code);
      if (!zipCountyMap.has(zipCode)) {
        zipCountyMap.set(zipCode, {
          countyName: row.county_name,
          stateCode: row.state_code,
          cityName: row.city_name || undefined,
        });
      }
    });

    const zipYoYChanges = (zipYoY.rows as any[])
      .map((row) => {
        const changes = [
          { br: 0, curr: parseFloat(row.curr_0), prev: parseFloat(row.prev_0), pct: null as number | null },
          { br: 1, curr: parseFloat(row.curr_1), prev: parseFloat(row.prev_1), pct: null as number | null },
          { br: 2, curr: parseFloat(row.curr_2), prev: parseFloat(row.prev_2), pct: null as number | null },
          { br: 3, curr: parseFloat(row.curr_3), prev: parseFloat(row.prev_3), pct: null as number | null },
          { br: 4, curr: parseFloat(row.curr_4), prev: parseFloat(row.prev_4), pct: null as number | null },
        ]
          .filter((c) => !isNaN(c.curr) && !isNaN(c.prev) && isFinite(c.curr) && isFinite(c.prev) && c.curr > 0 && c.prev > 0)
          .map((c) => ({ ...c, pct: ((c.curr - c.prev) / c.prev) * 100 }));

        if (changes.length === 0) return null;

        const maxChange = changes.reduce((max, c) => (c.pct! > max.pct! ? c : max));
        const minChange = changes.reduce((min, c) => (c.pct! < min.pct! ? c : min));

        return {
          zipCode: String(row.zip_code),
          cityName: row.city_name || null,
          countyName: row.county_name || null,
          stateCode: row.state_code || null,
          bedroom0: parseFloat(row.curr_0) || null,
          bedroom1: parseFloat(row.curr_1) || null,
          bedroom2: parseFloat(row.curr_2) || null,
          bedroom3: parseFloat(row.curr_3) || null,
          bedroom4: parseFloat(row.curr_4) || null,
          maxYoY: maxChange.pct!,
          maxYoYBedroom: maxChange.br,
          minYoY: minChange.pct!,
          minYoYBedroom: minChange.br,
        };
      })
      .filter((c) => c !== null) as any[];

    const risingZips = [...zipYoYChanges]
      .sort((a, b) => b.maxYoY - a.maxYoY)
      .slice(0, 15)
      .map((z) => ({
        zipCode: z.zipCode,
        cityName: z.cityName,
        countyName: z.countyName,
        stateCode: z.stateCode,
        bedroom0: z.bedroom0,
        bedroom1: z.bedroom1,
        bedroom2: z.bedroom2,
        bedroom3: z.bedroom3,
        bedroom4: z.bedroom4,
        yoyPercent: z.maxYoY,
        yoyBedroom: z.maxYoYBedroom,
      }));

    const fallingZips = [...zipYoYChanges]
      .sort((a, b) => a.minYoY - b.minYoY)
      .slice(0, 15)
      .map((z) => ({
        zipCode: z.zipCode,
        cityName: z.cityName,
        countyName: z.countyName,
        stateCode: z.stateCode,
        bedroom0: z.bedroom0,
        bedroom1: z.bedroom1,
        bedroom2: z.bedroom2,
        bedroom3: z.bedroom3,
        bedroom4: z.bedroom4,
        yoyPercent: z.minYoY,
        yoyBedroom: z.minYoYBedroom,
      }));

    return {
      type: 'zip' as const,
      topZips: topZipsSorted.map((z: any) => {
        const zipCode = String(z.zip_code);
        const mapping = zipCountyMap.get(zipCode);
        return {
          zipCode,
          cityName: mapping?.cityName || null,
          countyName: mapping?.countyName || null,
          stateCode: mapping?.stateCode || null,
          avgFMR: parseFloat(z.avg_fmr) || 0,
          bedroom0: parseFloat(z.bedroom_0) || null,
          bedroom1: parseFloat(z.bedroom_1) || null,
          bedroom2: parseFloat(z.bedroom_2) || 0,
          bedroom3: parseFloat(z.bedroom_3) || null,
          bedroom4: parseFloat(z.bedroom_4) || null,
          rentPerBedroom1BR: parseFloat(z.rent_per_bedroom_1br) || null,
          rentPerBedroom2BR: parseFloat(z.rent_per_bedroom_2br) || null,
          rentPerBedroom3BR: parseFloat(z.rent_per_bedroom_3br) || null,
          rentPerBedroom4BR: parseFloat(z.rent_per_bedroom_4br) || null,
        };
      }),
      bottomZips: bottomZipsSorted.map((z: any) => {
        const zipCode = String(z.zip_code);
        const mapping = zipCountyMap.get(zipCode);
        return {
          zipCode,
          cityName: mapping?.cityName || null,
          countyName: mapping?.countyName || null,
          stateCode: mapping?.stateCode || null,
          avgFMR: parseFloat(z.avg_fmr) || 0,
          bedroom0: parseFloat(z.bedroom_0) || null,
          bedroom1: parseFloat(z.bedroom_1) || null,
          bedroom2: parseFloat(z.bedroom_2) || 0,
          bedroom3: parseFloat(z.bedroom_3) || null,
          bedroom4: parseFloat(z.bedroom_4) || null,
          rentPerBedroom1BR: parseFloat(z.rent_per_bedroom_1br) || null,
          rentPerBedroom2BR: parseFloat(z.rent_per_bedroom_2br) || null,
          rentPerBedroom3BR: parseFloat(z.rent_per_bedroom_3br) || null,
          rentPerBedroom4BR: parseFloat(z.rent_per_bedroom_4br) || null,
        };
      }),
      anomalies: processedAnomalies.map((a: any) => {
        const mapping = zipCountyMap.get(a.zip_code);
        return {
          zipCode: a.zip_code,
          countyName: mapping?.countyName || null,
          stateCode: mapping?.stateCode || null,
          bedroom0: a.bedroom_0,
          bedroom1: a.bedroom_1,
          bedroom2: a.bedroom_2,
          bedroom3: a.bedroom_3,
          bedroom4: a.bedroom_4,
          jumpFrom: a.maxJumpFrom,
          jumpTo: a.maxJumpTo,
          jumpPercent: a.maxJumpPct,
          jumpAmount: a.maxJumpAmount,
          nationalAvg: a.nationalAvg,
        };
      }),
      rising: risingZips,
      falling: fallingZips,
      nationalAverages: nationalAvgJumps,
    };
  }

  if (type === 'city') {
    // CITY LEVEL DATA - aggregate from ZIP codes
    const prevYear = year - 1;
    const validUSStates = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
      'VI', 'GU', 'MP', 'AS'
    ];

    const validUSStatesPlaceholders = validUSStates.map((_, i) => `$${i + 1}`).join(', ');
    // City-level data: aggregate from ZIPs, using SAFMR only if ZIP is in required_safmr_zips, otherwise county FMR
    // Optimized: Pre-filter to only ZIPs with data to reduce data transfer
    const cityData = await sql.query(
      `WITH zip_with_data AS (
        SELECT DISTINCT zcm.zip_code
        FROM zip_county_mapping zcm
        WHERE zcm.state_code != 'PR'
          AND (
            EXISTS (
              SELECT 1 FROM required_safmr_zips rsz 
              WHERE rsz.zip_code = zcm.zip_code AND rsz.year = ${year}
            )
            OR EXISTS (
              SELECT 1 FROM safmr_data sd 
              WHERE sd.zip_code = zcm.zip_code AND sd.year = ${year}
            )
            OR EXISTS (
              SELECT 1 FROM fmr_data fd 
              WHERE fd.county_code = zcm.county_fips 
                AND fd.state_code = zcm.state_code 
                AND fd.year = ${year}
            )
          )
      ),
      zip_fmr_data AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          zcm.county_fips,
          zcm.state_code,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0
            ELSE fd.bedroom_0
          END as bedroom_0,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1
            ELSE fd.bedroom_1
          END as bedroom_1,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2
            ELSE fd.bedroom_2
          END as bedroom_2,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3
            ELSE fd.bedroom_3
          END as bedroom_3,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4
            ELSE fd.bedroom_4
          END as bedroom_4
        FROM zip_with_data zwd
        INNER JOIN zip_county_mapping zcm ON zwd.zip_code = zcm.zip_code
        LEFT JOIN required_safmr_zips rsz 
          ON zcm.zip_code = rsz.zip_code AND rsz.year = ${year}
        LEFT JOIN safmr_data sd 
          ON zcm.zip_code = sd.zip_code AND sd.year = ${year}
        LEFT JOIN fmr_data fd 
          ON zcm.county_fips = fd.county_code 
          AND zcm.state_code = fd.state_code 
          AND fd.year = ${year}
        ORDER BY zcm.zip_code, zcm.county_name
      )
      SELECT 
        c.city_name,
        c.state_code,
        c.state_name,
        c.zip_codes,
        AVG(zfd.bedroom_0) as avg_bedroom_0,
        AVG(zfd.bedroom_1) as avg_bedroom_1,
        AVG(zfd.bedroom_2) as avg_bedroom_2,
        AVG(zfd.bedroom_3) as avg_bedroom_3,
        AVG(zfd.bedroom_4) as avg_bedroom_4,
        COUNT(DISTINCT zfd.zip_code) as zip_count
      FROM cities c
      CROSS JOIN LATERAL unnest(c.zip_codes) AS zip(zip_code)
      JOIN zip_fmr_data zfd ON zfd.zip_code = zip.zip_code
      WHERE c.zip_codes IS NOT NULL 
        AND array_length(c.zip_codes, 1) > 0
        AND c.city_name NOT ILIKE '% County'
        AND c.city_name NOT ILIKE '% Parish'
        AND c.city_name NOT ILIKE '% Borough'
        AND c.state_code IN (${validUSStatesPlaceholders})
        AND (zfd.bedroom_0 IS NOT NULL OR zfd.bedroom_1 IS NOT NULL OR zfd.bedroom_2 IS NOT NULL OR 
             zfd.bedroom_3 IS NOT NULL OR zfd.bedroom_4 IS NOT NULL)
      GROUP BY c.city_name, c.state_code, c.state_name, c.zip_codes
      HAVING COUNT(DISTINCT zfd.zip_code) > 0`,
      validUSStates
    );

    const citiesWithAvg = (cityData.rows as any[]).map((city) => {
      const bedrooms = [
        parseFloat(city.avg_bedroom_0) || null,
        parseFloat(city.avg_bedroom_1) || null,
        parseFloat(city.avg_bedroom_2) || null,
        parseFloat(city.avg_bedroom_3) || null,
        parseFloat(city.avg_bedroom_4) || null,
      ].filter((v) => v !== null) as number[];

      const avgFMR = bedrooms.length > 0 ? bedrooms.reduce((sum, val) => sum + val, 0) / bedrooms.length : 0;

      return {
        cityName: city.city_name,
        stateCode: city.state_code,
        stateName: city.state_name,
        zipCodes: city.zip_codes,
        zipCount: parseInt(city.zip_count) || 0,
        avgFMR,
        bedroom0: parseFloat(city.avg_bedroom_0) || null,
        bedroom1: parseFloat(city.avg_bedroom_1) || null,
        bedroom2: parseFloat(city.avg_bedroom_2) || null,
        bedroom3: parseFloat(city.avg_bedroom_3) || null,
        bedroom4: parseFloat(city.avg_bedroom_4) || null,
      };
    });

    const topCities = [...citiesWithAvg].sort((a, b) => b.avgFMR - a.avgFMR).slice(0, 50);
    const bottomCities = [...citiesWithAvg].sort((a, b) => a.avgFMR - b.avgFMR).slice(0, 50);

    const cityAnomalies = citiesWithAvg
      .map((city) => {
        const jumps = [
          { from: 0, to: 1, pct: city.bedroom0 && city.bedroom1 && city.bedroom0 > 0
            ? ((city.bedroom1 - city.bedroom0) / city.bedroom0 * 100) : null,
            amount: city.bedroom0 && city.bedroom1 ? (city.bedroom1 - city.bedroom0) : null, natAvg: nationalAvgJumps[0] },
          { from: 1, to: 2, pct: city.bedroom1 && city.bedroom2 && city.bedroom1 > 0
            ? ((city.bedroom2 - city.bedroom1) / city.bedroom1 * 100) : null,
            amount: city.bedroom1 && city.bedroom2 ? (city.bedroom2 - city.bedroom1) : null, natAvg: nationalAvgJumps[1] },
          { from: 2, to: 3, pct: city.bedroom2 && city.bedroom3 && city.bedroom2 > 0
            ? ((city.bedroom3 - city.bedroom2) / city.bedroom2 * 100) : null,
            amount: city.bedroom2 && city.bedroom3 ? (city.bedroom3 - city.bedroom2) : null, natAvg: nationalAvgJumps[2] },
          { from: 3, to: 4, pct: city.bedroom3 && city.bedroom4 && city.bedroom3 > 0
            ? ((city.bedroom4 - city.bedroom3) / city.bedroom3 * 100) : null,
            amount: city.bedroom3 && city.bedroom4 ? (city.bedroom4 - city.bedroom3) : null, natAvg: nationalAvgJumps[3] },
        ].filter((j) => j.pct !== null && j.natAvg > 0);

        if (jumps.length === 0) return null;

        const maxJump = jumps.reduce((max, jump) => {
          return jump.pct! > max.pct! ? jump : max;
        });

        return {
          cityName: city.cityName,
          stateCode: city.stateCode,
          bedroom0: city.bedroom0,
          bedroom1: city.bedroom1,
          bedroom2: city.bedroom2,
          bedroom3: city.bedroom3,
          bedroom4: city.bedroom4,
          jumpFrom: maxJump.from,
          jumpTo: maxJump.to,
          jumpPercent: maxJump.pct!,
          jumpAmount: maxJump.amount!,
          nationalAvg: maxJump.natAvg,
        };
      })
      .filter((a) => a !== null)
      .sort((a: any, b: any) => b.jumpPercent - a.jumpPercent)
      .slice(0, 50);

    // Compute rising/falling YoY changes for Cities
    // Fetch previous year city data (using same logic: SAFMR only if ZIP is in required_safmr_zips)
    // Optimized: Pre-filter to only ZIPs with data to reduce data transfer
    const prevYearCityData = await sql.query(
      `WITH zip_with_data_prev AS (
        SELECT DISTINCT zcm.zip_code
        FROM zip_county_mapping zcm
        WHERE zcm.state_code != 'PR'
          AND (
            EXISTS (
              SELECT 1 FROM required_safmr_zips rsz 
              WHERE rsz.zip_code = zcm.zip_code AND rsz.year = ${prevYear}
            )
            OR EXISTS (
              SELECT 1 FROM safmr_data sd 
              WHERE sd.zip_code = zcm.zip_code AND sd.year = ${prevYear}
            )
            OR EXISTS (
              SELECT 1 FROM fmr_data fd 
              WHERE fd.county_code = zcm.county_fips 
                AND fd.state_code = zcm.state_code 
                AND fd.year = ${prevYear}
            )
          )
      ),
      zip_fmr_data_prev AS (
        SELECT DISTINCT ON (zcm.zip_code)
          zcm.zip_code,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_0 IS NOT NULL THEN sd.bedroom_0
            ELSE fd.bedroom_0
          END as bedroom_0,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_1 IS NOT NULL THEN sd.bedroom_1
            ELSE fd.bedroom_1
          END as bedroom_1,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_2 IS NOT NULL THEN sd.bedroom_2
            ELSE fd.bedroom_2
          END as bedroom_2,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_3 IS NOT NULL THEN sd.bedroom_3
            ELSE fd.bedroom_3
          END as bedroom_3,
          CASE 
            WHEN rsz.zip_code IS NOT NULL AND sd.bedroom_4 IS NOT NULL THEN sd.bedroom_4
            ELSE fd.bedroom_4
          END as bedroom_4
        FROM zip_with_data_prev zwd
        INNER JOIN zip_county_mapping zcm ON zwd.zip_code = zcm.zip_code
        LEFT JOIN required_safmr_zips rsz 
          ON zcm.zip_code = rsz.zip_code AND rsz.year = ${prevYear}
        LEFT JOIN safmr_data sd 
          ON zcm.zip_code = sd.zip_code AND sd.year = ${prevYear}
        LEFT JOIN fmr_data fd 
          ON zcm.county_fips = fd.county_code 
          AND zcm.state_code = fd.state_code 
          AND fd.year = ${prevYear}
        ORDER BY zcm.zip_code, zcm.county_name
      )
      SELECT 
        c.city_name,
        c.state_code,
        AVG(zfd.bedroom_0) as avg_bedroom_0,
        AVG(zfd.bedroom_1) as avg_bedroom_1,
        AVG(zfd.bedroom_2) as avg_bedroom_2,
        AVG(zfd.bedroom_3) as avg_bedroom_3,
        AVG(zfd.bedroom_4) as avg_bedroom_4
      FROM cities c
      CROSS JOIN LATERAL unnest(c.zip_codes) AS zip(zip_code)
      JOIN zip_fmr_data_prev zfd ON zfd.zip_code = zip.zip_code
      WHERE c.zip_codes IS NOT NULL 
        AND array_length(c.zip_codes, 1) > 0
        AND c.city_name NOT ILIKE '% County'
        AND c.city_name NOT ILIKE '% Parish'
        AND c.city_name NOT ILIKE '% Borough'
        AND c.state_code IN (${validUSStatesPlaceholders})
        AND (zfd.bedroom_0 IS NOT NULL OR zfd.bedroom_1 IS NOT NULL OR zfd.bedroom_2 IS NOT NULL OR 
             zfd.bedroom_3 IS NOT NULL OR zfd.bedroom_4 IS NOT NULL)
      GROUP BY c.city_name, c.state_code`,
      validUSStates
    );

    const prevYearCityMap = new Map<string, any>();
    (prevYearCityData.rows as any[]).forEach((row) => {
      const key = `${row.city_name}|${row.state_code}`;
      prevYearCityMap.set(key, {
        bedroom0: parseFloat(row.avg_bedroom_0) || null,
        bedroom1: parseFloat(row.avg_bedroom_1) || null,
        bedroom2: parseFloat(row.avg_bedroom_2) || null,
        bedroom3: parseFloat(row.avg_bedroom_3) || null,
        bedroom4: parseFloat(row.avg_bedroom_4) || null,
      });
    });

    const cityYoYComputed = citiesWithAvg
      .map((city) => {
        const key = `${city.cityName}|${city.stateCode}`;
        const prev = prevYearCityMap.get(key);
        if (!prev) return null;

        const changes = [
          { br: 0, curr: city.bedroom0, prev: prev.bedroom0, pct: null as number | null },
          { br: 1, curr: city.bedroom1, prev: prev.bedroom1, pct: null as number | null },
          { br: 2, curr: city.bedroom2, prev: prev.bedroom2, pct: null as number | null },
          { br: 3, curr: city.bedroom3, prev: prev.bedroom3, pct: null as number | null },
          { br: 4, curr: city.bedroom4, prev: prev.bedroom4, pct: null as number | null },
        ]
          .filter((c) => c.curr !== null && c.prev !== null && 
                         typeof c.curr === 'number' && typeof c.prev === 'number' &&
                         isFinite(c.curr) && isFinite(c.prev) && 
                         c.curr > 0 && c.prev > 0)
          .map((c) => ({ ...c, pct: ((c.curr! - c.prev!) / c.prev!) * 100 }));

        if (changes.length === 0) return null;

        const maxChange = changes.reduce((max, c) => (c.pct! > max.pct! ? c : max));
        const minChange = changes.reduce((min, c) => (c.pct! < min.pct! ? c : min));

        return {
          cityName: city.cityName,
          stateCode: city.stateCode,
          stateName: city.stateName,
          bedroom0: city.bedroom0,
          bedroom1: city.bedroom1,
          bedroom2: city.bedroom2,
          bedroom3: city.bedroom3,
          bedroom4: city.bedroom4,
          zipCount: city.zipCount,
          maxYoY: maxChange.pct!,
          maxYoYBedroom: maxChange.br,
          minYoY: minChange.pct!,
          minYoYBedroom: minChange.br,
        };
      })
      .filter((c) => c !== null) as any[];

    const risingCities = [...cityYoYComputed]
      .sort((a, b) => b.maxYoY - a.maxYoY)
      .slice(0, 15)
      .map((c) => ({
        cityName: c.cityName,
        stateCode: c.stateCode,
        stateName: c.stateName,
        bedroom0: c.bedroom0,
        bedroom1: c.bedroom1,
        bedroom2: c.bedroom2,
        bedroom3: c.bedroom3,
        bedroom4: c.bedroom4,
        zipCount: c.zipCount,
        yoyPercent: c.maxYoY,
        yoyBedroom: c.maxYoYBedroom,
      }));

    const fallingCities = [...cityYoYComputed]
      .sort((a, b) => a.minYoY - b.minYoY)
      .slice(0, 15)
      .map((c) => ({
        cityName: c.cityName,
        stateCode: c.stateCode,
        stateName: c.stateName,
        bedroom0: c.bedroom0,
        bedroom1: c.bedroom1,
        bedroom2: c.bedroom2,
        bedroom3: c.bedroom3,
        bedroom4: c.bedroom4,
        zipCount: c.zipCount,
        yoyPercent: c.minYoY,
        yoyBedroom: c.minYoYBedroom,
      }));

    return {
      type: 'city' as const,
      topCities: topCities.map((c) => ({
        cityName: c.cityName,
        stateCode: c.stateCode,
        stateName: c.stateName,
        avgFMR: c.avgFMR,
        bedroom0: c.bedroom0,
        bedroom1: c.bedroom1,
        bedroom2: c.bedroom2,
        bedroom3: c.bedroom3,
        bedroom4: c.bedroom4,
        rentPerBedroom1BR: c.bedroom1 ? c.bedroom1 / 1.0 : null,
        rentPerBedroom2BR: c.bedroom2 ? c.bedroom2 / 2.0 : null,
        rentPerBedroom3BR: c.bedroom3 ? c.bedroom3 / 3.0 : null,
        rentPerBedroom4BR: c.bedroom4 ? c.bedroom4 / 4.0 : null,
        zipCount: c.zipCount,
      })),
      bottomCities: bottomCities.map((c) => ({
        cityName: c.cityName,
        stateCode: c.stateCode,
        stateName: c.stateName,
        avgFMR: c.avgFMR,
        bedroom0: c.bedroom0,
        bedroom1: c.bedroom1,
        bedroom2: c.bedroom2,
        bedroom3: c.bedroom3,
        bedroom4: c.bedroom4,
        rentPerBedroom1BR: c.bedroom1 ? c.bedroom1 / 1.0 : null,
        rentPerBedroom2BR: c.bedroom2 ? c.bedroom2 / 2.0 : null,
        rentPerBedroom3BR: c.bedroom3 ? c.bedroom3 / 3.0 : null,
        rentPerBedroom4BR: c.bedroom4 ? c.bedroom4 / 4.0 : null,
        zipCount: c.zipCount,
      })),
      anomalies: cityAnomalies.map((a: any) => ({
        cityName: a.cityName,
        stateCode: a.stateCode,
        bedroom0: a.bedroom0,
        bedroom1: a.bedroom1,
        bedroom2: a.bedroom2,
        bedroom3: a.bedroom3,
        bedroom4: a.bedroom4,
        jumpFrom: a.jumpFrom,
        jumpTo: a.jumpTo,
        jumpPercent: a.jumpPercent,
        jumpAmount: a.jumpAmount,
        nationalAvg: a.nationalAvg,
      })),
      rising: risingCities,
      falling: fallingCities,
      nationalAverages: nationalAvgJumps,
    };
  }

  // county
  const prevYear = year - 1;
  const topCounties = await sql`
    SELECT 
      area_name,
      state_code,
      bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
      (COALESCE(bedroom_0, 0) + COALESCE(bedroom_1, 0) + COALESCE(bedroom_2, 0) + 
       COALESCE(bedroom_3, 0) + COALESCE(bedroom_4, 0)) / 
      NULLIF((CASE WHEN bedroom_0 IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN bedroom_1 IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN bedroom_2 IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN bedroom_3 IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN bedroom_4 IS NOT NULL THEN 1 ELSE 0 END), 0) as avg_fmr
    FROM fmr_data
    WHERE year = ${year}
      AND state_code != 'PR'
      AND (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
           bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
    ORDER BY avg_fmr DESC
    LIMIT 50
  `;

  const bottomCounties = await sql`
    SELECT 
      area_name,
      state_code,
      bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
      (COALESCE(bedroom_0, 0) + COALESCE(bedroom_1, 0) + COALESCE(bedroom_2, 0) + 
       COALESCE(bedroom_3, 0) + COALESCE(bedroom_4, 0)) / 
      NULLIF((CASE WHEN bedroom_0 IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN bedroom_1 IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN bedroom_2 IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN bedroom_3 IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN bedroom_4 IS NOT NULL THEN 1 ELSE 0 END), 0) as avg_fmr
    FROM fmr_data
    WHERE year = ${year}
      AND state_code != 'PR'
      AND (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
           bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
    ORDER BY avg_fmr ASC
    LIMIT 50
  `;

  const countyAnomalies = await sql`
    SELECT 
      area_name,
      state_code,
      bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4,
      CASE WHEN bedroom_0 IS NOT NULL AND bedroom_1 IS NOT NULL AND bedroom_0 > 0 
        THEN (bedroom_1 - bedroom_0) / bedroom_0 * 100 ELSE NULL END as jump_0_to_1_pct,
      CASE WHEN bedroom_1 IS NOT NULL AND bedroom_2 IS NOT NULL AND bedroom_1 > 0 
        THEN (bedroom_2 - bedroom_1) / bedroom_1 * 100 ELSE NULL END as jump_1_to_2_pct,
      CASE WHEN bedroom_2 IS NOT NULL AND bedroom_3 IS NOT NULL AND bedroom_2 > 0 
        THEN (bedroom_3 - bedroom_2) / bedroom_2 * 100 ELSE NULL END as jump_2_to_3_pct,
      CASE WHEN bedroom_3 IS NOT NULL AND bedroom_4 IS NOT NULL AND bedroom_3 > 0 
        THEN (bedroom_4 - bedroom_3) / bedroom_3 * 100 ELSE NULL END as jump_3_to_4_pct,
      CASE WHEN bedroom_0 IS NOT NULL AND bedroom_1 IS NOT NULL 
        THEN bedroom_1 - bedroom_0 ELSE NULL END as jump_0_to_1,
      CASE WHEN bedroom_1 IS NOT NULL AND bedroom_2 IS NOT NULL 
        THEN bedroom_2 - bedroom_1 ELSE NULL END as jump_1_to_2,
      CASE WHEN bedroom_2 IS NOT NULL AND bedroom_3 IS NOT NULL 
        THEN bedroom_3 - bedroom_2 ELSE NULL END as jump_2_to_3,
      CASE WHEN bedroom_3 IS NOT NULL AND bedroom_4 IS NOT NULL 
        THEN bedroom_4 - bedroom_3 ELSE NULL END as jump_3_to_4
    FROM fmr_data
    WHERE year = ${year}
      AND state_code != 'PR'
      AND (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
           bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
  `;

  const processedCountyAnomalies = (countyAnomalies.rows as any[])
    .map((row) => {
      const jumps = [
        { from: 0, to: 1, pct: parseFloat(row.jump_0_to_1_pct) || null, amount: parseFloat(row.jump_0_to_1) || null, natAvg: nationalAvgJumps[0] },
        { from: 1, to: 2, pct: parseFloat(row.jump_1_to_2_pct) || null, amount: parseFloat(row.jump_1_to_2) || null, natAvg: nationalAvgJumps[1] },
        { from: 2, to: 3, pct: parseFloat(row.jump_2_to_3_pct) || null, amount: parseFloat(row.jump_2_to_3) || null, natAvg: nationalAvgJumps[2] },
        { from: 3, to: 4, pct: parseFloat(row.jump_3_to_4_pct) || null, amount: parseFloat(row.jump_3_to_4) || null, natAvg: nationalAvgJumps[3] },
      ].filter((j) => j.pct !== null && j.natAvg > 0);

      if (jumps.length === 0) return null;

      const maxJump = jumps.reduce((max, jump) => {
        return jump.pct! > max.pct! ? jump : max;
      });

      return {
        areaName: row.area_name,
        stateCode: row.state_code,
        bedroom_0: parseFloat(row.bedroom_0) || null,
        bedroom_1: parseFloat(row.bedroom_1) || null,
        bedroom_2: parseFloat(row.bedroom_2) || null,
        bedroom_3: parseFloat(row.bedroom_3) || null,
        bedroom_4: parseFloat(row.bedroom_4) || null,
        maxJumpFrom: maxJump.from,
        maxJumpTo: maxJump.to,
        maxJumpPct: maxJump.pct!,
        maxJumpAmount: maxJump.amount!,
        nationalAvg: maxJump.natAvg,
      };
    })
    .filter((a) => a !== null)
    .sort((a: any, b: any) => b.maxJumpPct - a.maxJumpPct)
    .slice(0, 50);

  // Compute rising/falling YoY changes for Counties
  const countyYoY = await sql`
    SELECT 
      curr.area_name,
      curr.state_code,
      curr.bedroom_0 as curr_0, curr.bedroom_1 as curr_1, curr.bedroom_2 as curr_2,
      curr.bedroom_3 as curr_3, curr.bedroom_4 as curr_4,
      prev.bedroom_0 as prev_0, prev.bedroom_1 as prev_1, prev.bedroom_2 as prev_2,
      prev.bedroom_3 as prev_3, prev.bedroom_4 as prev_4
    FROM fmr_data curr
    INNER JOIN fmr_data prev ON curr.area_name = prev.area_name 
      AND curr.state_code = prev.state_code 
      AND prev.year = ${prevYear}
    WHERE curr.year = ${year}
      AND curr.state_code != 'PR'
      AND (curr.bedroom_0 IS NOT NULL OR curr.bedroom_1 IS NOT NULL OR curr.bedroom_2 IS NOT NULL OR 
           curr.bedroom_3 IS NOT NULL OR curr.bedroom_4 IS NOT NULL)
      AND (prev.bedroom_0 IS NOT NULL OR prev.bedroom_1 IS NOT NULL OR prev.bedroom_2 IS NOT NULL OR 
           prev.bedroom_3 IS NOT NULL OR prev.bedroom_4 IS NOT NULL)
  `;

  const countyYoYChanges = (countyYoY.rows as any[])
    .map((row) => {
      const changes = [
        { br: 0, curr: parseFloat(row.curr_0), prev: parseFloat(row.prev_0), pct: null as number | null },
        { br: 1, curr: parseFloat(row.curr_1), prev: parseFloat(row.prev_1), pct: null as number | null },
        { br: 2, curr: parseFloat(row.curr_2), prev: parseFloat(row.prev_2), pct: null as number | null },
        { br: 3, curr: parseFloat(row.curr_3), prev: parseFloat(row.prev_3), pct: null as number | null },
        { br: 4, curr: parseFloat(row.curr_4), prev: parseFloat(row.prev_4), pct: null as number | null },
      ]
        .filter((c) => !isNaN(c.curr) && !isNaN(c.prev) && isFinite(c.curr) && isFinite(c.prev) && c.curr > 0 && c.prev > 0)
        .map((c) => ({ ...c, pct: ((c.curr - c.prev) / c.prev) * 100 }));

      if (changes.length === 0) return null;

      const maxChange = changes.reduce((max, c) => (c.pct! > max.pct! ? c : max));
      const minChange = changes.reduce((min, c) => (c.pct! < min.pct! ? c : min));

      return {
        areaName: row.area_name,
        stateCode: row.state_code,
        bedroom0: parseFloat(row.curr_0) || null,
        bedroom1: parseFloat(row.curr_1) || null,
        bedroom2: parseFloat(row.curr_2) || null,
        bedroom3: parseFloat(row.curr_3) || null,
        bedroom4: parseFloat(row.curr_4) || null,
        maxYoY: maxChange.pct!,
        maxYoYBedroom: maxChange.br,
        minYoY: minChange.pct!,
        minYoYBedroom: minChange.br,
      };
    })
    .filter((c) => c !== null) as any[];

  const risingCounties = [...countyYoYChanges]
    .sort((a, b) => b.maxYoY - a.maxYoY)
    .slice(0, 15)
    .map((c) => ({
      areaName: c.areaName,
      stateCode: c.stateCode,
      bedroom0: c.bedroom0,
      bedroom1: c.bedroom1,
      bedroom2: c.bedroom2,
      bedroom3: c.bedroom3,
      bedroom4: c.bedroom4,
      yoyPercent: c.maxYoY,
      yoyBedroom: c.maxYoYBedroom,
    }));

  const fallingCounties = [...countyYoYChanges]
    .sort((a, b) => a.minYoY - b.minYoY)
    .slice(0, 15)
    .map((c) => ({
      areaName: c.areaName,
      stateCode: c.stateCode,
      bedroom0: c.bedroom0,
      bedroom1: c.bedroom1,
      bedroom2: c.bedroom2,
      bedroom3: c.bedroom3,
      bedroom4: c.bedroom4,
      yoyPercent: c.minYoY,
      yoyBedroom: c.minYoYBedroom,
    }));

  return {
    type: 'county' as const,
    topCounties: (topCounties.rows as any[]).map((c) => ({
      areaName: c.area_name,
      stateCode: c.state_code,
      avgFMR: parseFloat(c.avg_fmr) || 0,
      bedroom0: parseFloat(c.bedroom_0) || null,
      bedroom1: parseFloat(c.bedroom_1) || null,
      bedroom2: parseFloat(c.bedroom_2) || null,
      bedroom3: parseFloat(c.bedroom_3) || null,
      bedroom4: parseFloat(c.bedroom_4) || null,
      rentPerBedroom1BR: parseFloat(c.bedroom_1) ? parseFloat(c.bedroom_1) / 1.0 : null,
      rentPerBedroom2BR: parseFloat(c.bedroom_2) ? parseFloat(c.bedroom_2) / 2.0 : null,
      rentPerBedroom3BR: parseFloat(c.bedroom_3) ? parseFloat(c.bedroom_3) / 3.0 : null,
      rentPerBedroom4BR: parseFloat(c.bedroom_4) ? parseFloat(c.bedroom_4) / 4.0 : null,
    })),
    bottomCounties: (bottomCounties.rows as any[]).map((c) => ({
      areaName: c.area_name,
      stateCode: c.state_code,
      avgFMR: parseFloat(c.avg_fmr) || 0,
      bedroom0: parseFloat(c.bedroom_0) || null,
      bedroom1: parseFloat(c.bedroom_1) || null,
      bedroom2: parseFloat(c.bedroom_2) || null,
      bedroom3: parseFloat(c.bedroom_3) || null,
      bedroom4: parseFloat(c.bedroom_4) || null,
      rentPerBedroom1BR: parseFloat(c.bedroom_1) ? parseFloat(c.bedroom_1) / 1.0 : null,
      rentPerBedroom2BR: parseFloat(c.bedroom_2) ? parseFloat(c.bedroom_2) / 2.0 : null,
      rentPerBedroom3BR: parseFloat(c.bedroom_3) ? parseFloat(c.bedroom_3) / 3.0 : null,
      rentPerBedroom4BR: parseFloat(c.bedroom_4) ? parseFloat(c.bedroom_4) / 4.0 : null,
    })),
    anomalies: processedCountyAnomalies.map((a: any) => ({
      areaName: a.areaName,
      stateCode: a.stateCode,
      bedroom0: a.bedroom_0,
      bedroom1: a.bedroom_1,
      bedroom2: a.bedroom_2,
      bedroom3: a.bedroom_3,
      bedroom4: a.bedroom_4,
      jumpFrom: a.maxJumpFrom,
      jumpTo: a.maxJumpTo,
      jumpPercent: a.maxJumpPct,
      jumpAmount: a.maxJumpAmount,
      nationalAvg: a.nationalAvg,
    })),
    rising: risingCounties,
    falling: fallingCounties,
    nationalAverages: nationalAvgJumps,
  };
}



