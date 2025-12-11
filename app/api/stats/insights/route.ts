import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'zip'; // zip, city, county

    // Calculate national averages for bedroom transitions (excluding PR)
    const nationalAverages = await sql`
      SELECT 
        AVG(CASE WHEN bedroom_0 IS NOT NULL AND bedroom_1 IS NOT NULL AND bedroom_0 > 0 
          THEN (bedroom_1 - bedroom_0) / bedroom_0 * 100 ELSE NULL END) as avg_jump_0_to_1,
        AVG(CASE WHEN bedroom_1 IS NOT NULL AND bedroom_2 IS NOT NULL AND bedroom_1 > 0 
          THEN (bedroom_2 - bedroom_1) / bedroom_1 * 100 ELSE NULL END) as avg_jump_1_to_2,
        AVG(CASE WHEN bedroom_2 IS NOT NULL AND bedroom_3 IS NOT NULL AND bedroom_2 > 0 
          THEN (bedroom_3 - bedroom_2) / bedroom_2 * 100 ELSE NULL END) as avg_jump_2_to_3,
        AVG(CASE WHEN bedroom_3 IS NOT NULL AND bedroom_4 IS NOT NULL AND bedroom_3 > 0 
          THEN (bedroom_4 - bedroom_3) / bedroom_3 * 100 ELSE NULL END) as avg_jump_3_to_4
      FROM safmr_data sd
      INNER JOIN zip_county_mapping zcm ON sd.zip_code = zcm.zip_code
      WHERE sd.year = 2026
        AND zcm.state_code != 'PR'
    `;

    const natAvg = nationalAverages.rows[0];
    const nationalAvgJumps = {
      0: parseFloat(natAvg.avg_jump_0_to_1) || 0,
      1: parseFloat(natAvg.avg_jump_1_to_2) || 0,
      2: parseFloat(natAvg.avg_jump_2_to_3) || 0,
      3: parseFloat(natAvg.avg_jump_3_to_4) || 0,
    };

    if (type === 'zip') {
      // ZIP CODE LEVEL DATA (excluding PR)
      // Use DISTINCT ON to handle ZIPs that span multiple counties
      const topZips = await sql`
        SELECT DISTINCT ON (sd.zip_code)
          sd.zip_code,
          sd.bedroom_0, sd.bedroom_1, sd.bedroom_2, sd.bedroom_3, sd.bedroom_4,
          (COALESCE(sd.bedroom_0, 0) + COALESCE(sd.bedroom_1, 0) + COALESCE(sd.bedroom_2, 0) + 
           COALESCE(sd.bedroom_3, 0) + COALESCE(sd.bedroom_4, 0)) / 
          NULLIF((CASE WHEN sd.bedroom_0 IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN sd.bedroom_1 IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN sd.bedroom_2 IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN sd.bedroom_3 IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN sd.bedroom_4 IS NOT NULL THEN 1 ELSE 0 END), 0) as avg_fmr,
          -- Calculate rent per bedroom
          sd.bedroom_1 / 1.0 as rent_per_bedroom_1br,
          sd.bedroom_2 / 2.0 as rent_per_bedroom_2br,
          sd.bedroom_3 / 3.0 as rent_per_bedroom_3br,
          sd.bedroom_4 / 4.0 as rent_per_bedroom_4br
        FROM safmr_data sd
        INNER JOIN zip_county_mapping zcm ON sd.zip_code = zcm.zip_code
        WHERE sd.year = 2026
          AND zcm.state_code != 'PR'
          AND (sd.bedroom_0 IS NOT NULL OR sd.bedroom_1 IS NOT NULL OR sd.bedroom_2 IS NOT NULL OR 
               sd.bedroom_3 IS NOT NULL OR sd.bedroom_4 IS NOT NULL)
        ORDER BY sd.zip_code, avg_fmr DESC
      `;
      
      // Sort by avg_fmr DESC and limit after deduplication
      const topZipsSorted = topZips.rows
        .sort((a, b) => parseFloat(b.avg_fmr) - parseFloat(a.avg_fmr))
        .slice(0, 50);

      // Use DISTINCT ON to handle ZIPs that span multiple counties
      const bottomZips = await sql`
        SELECT DISTINCT ON (sd.zip_code)
          sd.zip_code,
          sd.bedroom_0, sd.bedroom_1, sd.bedroom_2, sd.bedroom_3, sd.bedroom_4,
          (COALESCE(sd.bedroom_0, 0) + COALESCE(sd.bedroom_1, 0) + COALESCE(sd.bedroom_2, 0) + 
           COALESCE(sd.bedroom_3, 0) + COALESCE(sd.bedroom_4, 0)) / 
          NULLIF((CASE WHEN sd.bedroom_0 IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN sd.bedroom_1 IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN sd.bedroom_2 IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN sd.bedroom_3 IS NOT NULL THEN 1 ELSE 0 END +
                  CASE WHEN sd.bedroom_4 IS NOT NULL THEN 1 ELSE 0 END), 0) as avg_fmr,
          sd.bedroom_1 / 1.0 as rent_per_bedroom_1br,
          sd.bedroom_2 / 2.0 as rent_per_bedroom_2br,
          sd.bedroom_3 / 3.0 as rent_per_bedroom_3br,
          sd.bedroom_4 / 4.0 as rent_per_bedroom_4br
        FROM safmr_data sd
        INNER JOIN zip_county_mapping zcm ON sd.zip_code = zcm.zip_code
        WHERE sd.year = 2026
          AND zcm.state_code != 'PR'
          AND (sd.bedroom_0 IS NOT NULL OR sd.bedroom_1 IS NOT NULL OR sd.bedroom_2 IS NOT NULL OR 
               sd.bedroom_3 IS NOT NULL OR sd.bedroom_4 IS NOT NULL)
        ORDER BY sd.zip_code, avg_fmr ASC
      `;
      
      // Sort by avg_fmr ASC and limit after deduplication
      const bottomZipsSorted = bottomZips.rows
        .sort((a, b) => parseFloat(a.avg_fmr) - parseFloat(b.avg_fmr))
        .slice(0, 50);

      // Get county names and city names for ZIPs
      // Ensure ZIP codes are strings for consistent matching
      const topZipCodes = topZipsSorted.map(z => String(z.zip_code));
      const bottomZipCodes = bottomZipsSorted.map(z => String(z.zip_code));
      const allZipCodes = [...new Set([...topZipCodes, ...bottomZipCodes])];

      const zipCountyMap = new Map<string, { countyName: string; stateCode: string; cityName?: string }>();
      if (allZipCodes.length > 0) {
        // Get county mappings (excluding PR)
        const countyMappings = await sql`
          SELECT DISTINCT ON (zip_code) zip_code, county_name, state_code
          FROM zip_county_mapping
          WHERE zip_code = ANY(${allZipCodes})
            AND state_code != 'PR'
          ORDER BY zip_code, county_name
        `;
        
        // Get city names - unnest all cities and filter (excluding PR)
        const cityMappings = await sql`
          SELECT 
            unnest(c.zip_codes)::text as zip_code,
            c.city_name,
            c.state_code
          FROM cities c
          WHERE c.state_code != 'PR'
        `;
        
        const cityMap = new Map<string, string>();
        cityMappings.rows.forEach(row => {
          const zipCode = String(row.zip_code);
          if (allZipCodes.includes(zipCode)) {
            const key = `${zipCode}-${row.state_code}`;
            if (!cityMap.has(key)) {
              cityMap.set(key, row.city_name);
            }
          }
        });
        
        countyMappings.rows.forEach(row => {
          const zipCode = String(row.zip_code);
          const key = `${zipCode}-${row.state_code}`;
          zipCountyMap.set(zipCode, {
            countyName: row.county_name,
            stateCode: row.state_code,
            cityName: cityMap.get(key) || null,
          });
        });
      }

      // Fallback: fetch any missing ZIPs in one query
      const missingZipCodes = [...new Set([...topZipCodes, ...bottomZipCodes])].filter(
        z => !zipCountyMap.has(z)
      );
      if (missingZipCodes.length > 0) {
        const fallbackMappings = await sql`
          SELECT DISTINCT ON (zcm.zip_code)
            zcm.zip_code,
            zcm.county_name,
            zcm.state_code,
            c.city_name
          FROM zip_county_mapping zcm
          LEFT JOIN cities c ON zcm.zip_code = ANY(c.zip_codes) AND zcm.state_code = c.state_code
          WHERE zcm.zip_code = ANY(${missingZipCodes})
            AND zcm.state_code != 'PR'
          ORDER BY zcm.zip_code, zcm.county_name
        `;
        fallbackMappings.rows.forEach(row => {
          const zipCode = String(row.zip_code);
          zipCountyMap.set(zipCode, {
            countyName: row.county_name,
            stateCode: row.state_code,
            cityName: row.city_name || null,
          });
        });
      }

      // Anomalies for ZIPs (excluding PR)
      // Use DISTINCT ON to handle ZIPs that span multiple counties
      const anomalies = await sql`
        SELECT DISTINCT ON (sd.zip_code)
          sd.zip_code,
          sd.bedroom_0, sd.bedroom_1, sd.bedroom_2, sd.bedroom_3, sd.bedroom_4,
          CASE WHEN sd.bedroom_0 IS NOT NULL AND sd.bedroom_1 IS NOT NULL AND sd.bedroom_0 > 0 
            THEN (sd.bedroom_1 - sd.bedroom_0) / sd.bedroom_0 * 100 ELSE NULL END as jump_0_to_1_pct,
          CASE WHEN sd.bedroom_1 IS NOT NULL AND sd.bedroom_2 IS NOT NULL AND sd.bedroom_1 > 0 
            THEN (sd.bedroom_2 - sd.bedroom_1) / sd.bedroom_1 * 100 ELSE NULL END as jump_1_to_2_pct,
          CASE WHEN sd.bedroom_2 IS NOT NULL AND sd.bedroom_3 IS NOT NULL AND sd.bedroom_2 > 0 
            THEN (sd.bedroom_3 - sd.bedroom_2) / sd.bedroom_2 * 100 ELSE NULL END as jump_2_to_3_pct,
          CASE WHEN sd.bedroom_3 IS NOT NULL AND sd.bedroom_4 IS NOT NULL AND sd.bedroom_3 > 0 
            THEN (sd.bedroom_4 - sd.bedroom_3) / sd.bedroom_3 * 100 ELSE NULL END as jump_3_to_4_pct,
          CASE WHEN sd.bedroom_0 IS NOT NULL AND sd.bedroom_1 IS NOT NULL 
            THEN sd.bedroom_1 - sd.bedroom_0 ELSE NULL END as jump_0_to_1,
          CASE WHEN sd.bedroom_1 IS NOT NULL AND sd.bedroom_2 IS NOT NULL 
            THEN sd.bedroom_2 - sd.bedroom_1 ELSE NULL END as jump_1_to_2,
          CASE WHEN sd.bedroom_2 IS NOT NULL AND sd.bedroom_3 IS NOT NULL 
            THEN sd.bedroom_3 - sd.bedroom_2 ELSE NULL END as jump_2_to_3,
          CASE WHEN sd.bedroom_3 IS NOT NULL AND sd.bedroom_4 IS NOT NULL 
            THEN sd.bedroom_4 - sd.bedroom_3 ELSE NULL END as jump_3_to_4
        FROM safmr_data sd
        INNER JOIN zip_county_mapping zcm ON sd.zip_code = zcm.zip_code
        WHERE sd.year = 2026
          AND zcm.state_code != 'PR'
          AND (sd.bedroom_0 IS NOT NULL OR sd.bedroom_1 IS NOT NULL OR sd.bedroom_2 IS NOT NULL OR 
               sd.bedroom_3 IS NOT NULL OR sd.bedroom_4 IS NOT NULL)
        ORDER BY sd.zip_code
      `;

      const processedAnomalies = anomalies.rows
        .map(row => {
          const jumps = [
            { from: 0, to: 1, pct: parseFloat(row.jump_0_to_1_pct) || null, amount: parseFloat(row.jump_0_to_1) || null, natAvg: nationalAvgJumps[0] },
            { from: 1, to: 2, pct: parseFloat(row.jump_1_to_2_pct) || null, amount: parseFloat(row.jump_1_to_2) || null, natAvg: nationalAvgJumps[1] },
            { from: 2, to: 3, pct: parseFloat(row.jump_2_to_3_pct) || null, amount: parseFloat(row.jump_2_to_3) || null, natAvg: nationalAvgJumps[2] },
            { from: 3, to: 4, pct: parseFloat(row.jump_3_to_4_pct) || null, amount: parseFloat(row.jump_3_to_4) || null, natAvg: nationalAvgJumps[3] },
          ].filter(j => j.pct !== null && j.natAvg > 0);

          if (jumps.length === 0) return null;

          const maxDeviation = jumps.reduce((max, jump) => {
            const deviation = Math.abs(jump.pct! - jump.natAvg);
            const maxDev = Math.abs(max.pct! - max.natAvg);
            return deviation > maxDev ? jump : max;
          });

          const deviation = maxDeviation.pct! - maxDeviation.natAvg;
          if (Math.abs(deviation) > maxDeviation.natAvg * 0.5) {
            return {
              zip_code: row.zip_code,
              bedroom_0: parseFloat(row.bedroom_0) || null,
              bedroom_1: parseFloat(row.bedroom_1) || null,
              bedroom_2: parseFloat(row.bedroom_2) || null,
              bedroom_3: parseFloat(row.bedroom_3) || null,
              bedroom_4: parseFloat(row.bedroom_4) || null,
              maxJumpFrom: maxDeviation.from,
              maxJumpTo: maxDeviation.to,
              maxJumpPct: maxDeviation.pct!,
              maxJumpAmount: maxDeviation.amount!,
              nationalAvg: maxDeviation.natAvg,
              deviationFromNatAvg: deviation,
            };
          }
          return null;
        })
        .filter(a => a !== null)
        .sort((a, b) => Math.abs(b!.deviationFromNatAvg) - Math.abs(a!.deviationFromNatAvg))
        .slice(0, 50);

      const anomalyZipCodes = processedAnomalies.map(a => a!.zip_code);
      const allAnomalyZipCodes = [...new Set([...allZipCodes, ...anomalyZipCodes])];

      if (allAnomalyZipCodes.length > allZipCodes.length) {
        const additionalZipCodes = anomalyZipCodes.filter(z => !allZipCodes.includes(z));
        if (additionalZipCodes.length > 0) {
          const additionalMappings = await sql`
            SELECT DISTINCT ON (zip_code) zip_code, county_name, state_code
            FROM zip_county_mapping
            WHERE zip_code = ANY(${additionalZipCodes})
              AND state_code != 'PR'
            ORDER BY zip_code, county_name
          `;

          const additionalCityMappings = await sql`
            SELECT 
              unnest(c.zip_codes)::text as zip_code,
              c.city_name,
              c.state_code
            FROM cities c
            WHERE c.state_code != 'PR'
          `;

          const additionalCityMap = new Map<string, string>();
          additionalCityMappings.rows.forEach(row => {
            const zipCode = String(row.zip_code);
            if (additionalZipCodes.includes(zipCode)) {
              const key = `${zipCode}-${row.state_code}`;
              if (!additionalCityMap.has(key)) {
                additionalCityMap.set(key, row.city_name);
              }
            }
          });

          additionalMappings.rows.forEach(row => {
            const zipCode = String(row.zip_code);
            const key = `${zipCode}-${row.state_code}`;
            zipCountyMap.set(zipCode, {
              countyName: row.county_name,
              stateCode: row.state_code,
              cityName: additionalCityMap.get(key) || null,
            });
          });
        }
      }

      return NextResponse.json({
        type: 'zip',
        topZips: topZips.rows.map(z => {
          const zipCode = String(z.zip_code);
          const mapping = zipCountyMap.get(zipCode);
          return {
            zipCode: zipCode,
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
        bottomZips: bottomZipsSorted.map(z => {
          const zipCode = String(z.zip_code);
          const mapping = zipCountyMap.get(zipCode);
          return {
            zipCode: zipCode,
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
        anomalies: processedAnomalies.map(a => {
          const mapping = zipCountyMap.get(a!.zip_code);
          return {
            zipCode: a!.zip_code,
            countyName: mapping?.countyName || null,
            stateCode: mapping?.stateCode || null,
            bedroom0: a!.bedroom_0,
            bedroom1: a!.bedroom_1,
            bedroom2: a!.bedroom_2,
            bedroom3: a!.bedroom_3,
            bedroom4: a!.bedroom_4,
            jumpFrom: a!.maxJumpFrom,
            jumpTo: a!.maxJumpTo,
            jumpPercent: a!.maxJumpPct,
            jumpAmount: a!.maxJumpAmount,
            nationalAvg: a!.nationalAvg,
            deviationFromNatAvg: a!.deviationFromNatAvg,
          };
        }),
        nationalAverages: nationalAvgJumps,
      });
    }

    if (type === 'city') {
      // CITY LEVEL DATA - aggregate from ZIP codes
      // Filter to only valid US state codes to exclude international/invalid data
      // Only exclude entries that END with " County", " Parish", or " Borough" (not contain)
      // This allows city names that might contain these words (e.g., "New York County" area)
      const validUSStates = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
        'VI', 'GU', 'MP', 'AS' // US territories: US Virgin Islands, Guam, Northern Mariana Islands, American Samoa (PR excluded)
      ];
      
      const cityData = await sql`
        SELECT 
          c.city_name,
          c.state_code,
          c.state_name,
          c.zip_codes,
          AVG(sd.bedroom_0) as avg_bedroom_0,
          AVG(sd.bedroom_1) as avg_bedroom_1,
          AVG(sd.bedroom_2) as avg_bedroom_2,
          AVG(sd.bedroom_3) as avg_bedroom_3,
          AVG(sd.bedroom_4) as avg_bedroom_4,
          COUNT(DISTINCT sd.zip_code) as zip_count
        FROM cities c
        CROSS JOIN LATERAL unnest(c.zip_codes) AS zip(zip_code)
        JOIN safmr_data sd ON sd.zip_code = zip.zip_code AND sd.year = 2026
        WHERE c.zip_codes IS NOT NULL 
          AND array_length(c.zip_codes, 1) > 0
          AND c.city_name NOT ILIKE '% County'
          AND c.city_name NOT ILIKE '% Parish'
          AND c.city_name NOT ILIKE '% Borough'
          AND c.state_code = ANY(${validUSStates})
        GROUP BY c.city_name, c.state_code, c.state_name, c.zip_codes
        HAVING COUNT(DISTINCT sd.zip_code) > 0
      `;

      const citiesWithAvg = cityData.rows.map(city => {
        const bedrooms = [
          parseFloat(city.avg_bedroom_0) || null,
          parseFloat(city.avg_bedroom_1) || null,
          parseFloat(city.avg_bedroom_2) || null,
          parseFloat(city.avg_bedroom_3) || null,
          parseFloat(city.avg_bedroom_4) || null,
        ].filter(v => v !== null) as number[];
        
        const avgFMR = bedrooms.length > 0 
          ? bedrooms.reduce((sum, val) => sum + val, 0) / bedrooms.length 
          : 0;

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

      // Calculate anomalies for cities
      const cityAnomalies = citiesWithAvg
        .map(city => {
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
          ].filter(j => j.pct !== null && j.natAvg > 0);

          if (jumps.length === 0) return null;

          const maxDeviation = jumps.reduce((max, jump) => {
            const deviation = Math.abs(jump.pct! - jump.natAvg);
            const maxDev = Math.abs(max.pct! - max.natAvg);
            return deviation > maxDev ? jump : max;
          });

          const deviation = maxDeviation.pct! - maxDeviation.natAvg;
          if (Math.abs(deviation) > maxDeviation.natAvg * 0.5) {
            return {
              cityName: city.cityName,
              stateCode: city.stateCode,
              bedroom0: city.bedroom0,
              bedroom1: city.bedroom1,
              bedroom2: city.bedroom2,
              bedroom3: city.bedroom3,
              bedroom4: city.bedroom4,
              jumpFrom: maxDeviation.from,
              jumpTo: maxDeviation.to,
              jumpPercent: maxDeviation.pct!,
              jumpAmount: maxDeviation.amount!,
              nationalAvg: maxDeviation.natAvg,
              deviationFromNatAvg: deviation,
            };
          }
          return null;
        })
        .filter(a => a !== null)
        .sort((a, b) => Math.abs(b!.deviationFromNatAvg) - Math.abs(a!.deviationFromNatAvg))
        .slice(0, 50);

      return NextResponse.json({
        type: 'city',
        topCities: topCities.map(c => ({
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
        bottomCities: bottomCities.map(c => ({
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
        anomalies: cityAnomalies.map(a => ({
          cityName: a!.cityName,
          stateCode: a!.stateCode,
          bedroom0: a!.bedroom0,
          bedroom1: a!.bedroom1,
          bedroom2: a!.bedroom2,
          bedroom3: a!.bedroom3,
          bedroom4: a!.bedroom4,
          jumpFrom: a!.jumpFrom,
          jumpTo: a!.jumpTo,
          jumpPercent: a!.jumpPercent,
          jumpAmount: a!.jumpAmount,
          nationalAvg: a!.nationalAvg,
          deviationFromNatAvg: a!.deviationFromNatAvg,
        })),
        nationalAverages: nationalAvgJumps,
      });
    }

    if (type === 'county') {
      // COUNTY LEVEL DATA (excluding PR)
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
        WHERE year = 2026
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
        WHERE year = 2026
          AND state_code != 'PR'
          AND (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
               bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
        ORDER BY avg_fmr ASC
        LIMIT 50
      `;

      // Calculate anomalies for counties (excluding PR)
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
        WHERE year = 2026
          AND state_code != 'PR'
          AND (bedroom_0 IS NOT NULL OR bedroom_1 IS NOT NULL OR bedroom_2 IS NOT NULL OR 
               bedroom_3 IS NOT NULL OR bedroom_4 IS NOT NULL)
      `;

      const processedCountyAnomalies = countyAnomalies.rows
        .map(row => {
          const jumps = [
            { from: 0, to: 1, pct: parseFloat(row.jump_0_to_1_pct) || null, amount: parseFloat(row.jump_0_to_1) || null, natAvg: nationalAvgJumps[0] },
            { from: 1, to: 2, pct: parseFloat(row.jump_1_to_2_pct) || null, amount: parseFloat(row.jump_1_to_2) || null, natAvg: nationalAvgJumps[1] },
            { from: 2, to: 3, pct: parseFloat(row.jump_2_to_3_pct) || null, amount: parseFloat(row.jump_2_to_3) || null, natAvg: nationalAvgJumps[2] },
            { from: 3, to: 4, pct: parseFloat(row.jump_3_to_4_pct) || null, amount: parseFloat(row.jump_3_to_4) || null, natAvg: nationalAvgJumps[3] },
          ].filter(j => j.pct !== null && j.natAvg > 0);

          if (jumps.length === 0) return null;

          const maxDeviation = jumps.reduce((max, jump) => {
            const deviation = Math.abs(jump.pct! - jump.natAvg);
            const maxDev = Math.abs(max.pct! - max.natAvg);
            return deviation > maxDev ? jump : max;
          });

          const deviation = maxDeviation.pct! - maxDeviation.natAvg;
          if (Math.abs(deviation) > maxDeviation.natAvg * 0.5) {
            return {
              areaName: row.area_name,
              stateCode: row.state_code,
              bedroom_0: parseFloat(row.bedroom_0) || null,
              bedroom_1: parseFloat(row.bedroom_1) || null,
              bedroom_2: parseFloat(row.bedroom_2) || null,
              bedroom_3: parseFloat(row.bedroom_3) || null,
              bedroom_4: parseFloat(row.bedroom_4) || null,
              maxJumpFrom: maxDeviation.from,
              maxJumpTo: maxDeviation.to,
              maxJumpPct: maxDeviation.pct!,
              maxJumpAmount: maxDeviation.amount!,
              nationalAvg: maxDeviation.natAvg,
              deviationFromNatAvg: deviation,
            };
          }
          return null;
        })
        .filter(a => a !== null)
        .sort((a, b) => Math.abs(b!.deviationFromNatAvg) - Math.abs(a!.deviationFromNatAvg))
        .slice(0, 50);

      return NextResponse.json({
        type: 'county',
        topCounties: topCounties.rows.map(c => ({
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
        bottomCounties: bottomCounties.rows.map(c => ({
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
        anomalies: processedCountyAnomalies.map(a => ({
          areaName: a!.areaName,
          stateCode: a!.stateCode,
          bedroom0: a!.bedroom_0,
          bedroom1: a!.bedroom_1,
          bedroom2: a!.bedroom_2,
          bedroom3: a!.bedroom_3,
          bedroom4: a!.bedroom_4,
          jumpFrom: a!.maxJumpFrom,
          jumpTo: a!.maxJumpTo,
          jumpPercent: a!.maxJumpPct,
          jumpAmount: a!.maxJumpAmount,
          nationalAvg: a!.nationalAvg,
          deviationFromNatAvg: a!.deviationFromNatAvg,
        })),
        nationalAverages: nationalAvgJumps,
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}
