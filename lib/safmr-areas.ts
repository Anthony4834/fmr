import { sql } from '@vercel/postgres';

/**
 * Checks if a ZIP code is in a required SAFMR area using the lookup table
 */
export async function isZipInRequiredSAFMRArea(zipCode: string, year?: number): Promise<boolean> {
  const targetYear = year || 2026;
  
  const result = await sql`
    SELECT 1
    FROM required_safmr_zips
    WHERE zip_code = ${zipCode} AND year = ${targetYear}
    LIMIT 1
  `;

  return result.rows.length > 0;
}

/**
 * Checks if a metropolitan area name (from FMR data) is in the required SAFMR areas
 * This is now a simple lookup - check if any ZIPs in the area are in the required list
 */
export async function isMetroAreaRequiredSAFMR(areaName: string, zipCodes: string[], year?: number): Promise<boolean> {
  if (!zipCodes || zipCodes.length === 0) {
    return false;
  }
  
  const targetYear = year || 2026;

  // Use parameterized query to safely pass arrays (keeps TypeScript happy too)
  const result = await sql.query(
    `SELECT zip_code
     FROM required_safmr_zips
     WHERE zip_code = ANY($1)
       AND year = $2
     LIMIT 1`,
    [zipCodes, targetYear]
  );

  return result.rows.length > 0;
}


