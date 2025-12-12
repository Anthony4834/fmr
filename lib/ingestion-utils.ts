import { query, execute } from './db';

export interface IngestionConfig {
  year: number;
  effectiveDate?: Date;
  replaceExisting?: boolean;
}

export interface FMRRecord {
  year: number;
  areaType: 'metropolitan' | 'nonmetropolitan';
  areaName: string;
  stateCode: string;
  countyCode?: string;
  hudAreaCode?: string;
  hudAreaName?: string;
  bedroom0?: number;
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
  effectiveDate?: Date;
}

export interface SAFMRRecord {
  year: number;
  zipCode: string;
  bedroom0?: number;
  bedroom1?: number;
  bedroom2?: number;
  bedroom3?: number;
  bedroom4?: number;
  effectiveDate?: Date;
}

/**
 * Clears existing FMR data for a given year
 */
export async function clearFMRDataForYear(year: number): Promise<void> {
  await execute('DELETE FROM fmr_county_metro WHERE year = $1', [year]);
  await execute('DELETE FROM fmr_data WHERE year = $1', [year]);
  console.log(`Cleared existing FMR data for year ${year}`);
}

/**
 * Clears existing SAFMR data for a given year
 */
export async function clearSAFMRDataForYear(year: number): Promise<void> {
  await execute('DELETE FROM safmr_data WHERE year = $1', [year]);
  console.log(`Cleared existing SAFMR data for year ${year}`);
}

/**
 * Inserts FMR records in batch
 */
export async function insertFMRRecords(records: FMRRecord[]): Promise<void> {
  if (records.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const record of records) {
    placeholders.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    values.push(
      record.year,
      record.areaType,
      record.areaName,
      record.stateCode,
      record.countyCode || null,
      record.bedroom0 || null,
      record.bedroom1 || null,
      record.bedroom2 || null,
      record.bedroom3 || null,
      record.bedroom4 || null,
      record.effectiveDate || null
    );
  }

  const queryText = `
    INSERT INTO fmr_data (
      year, area_type, area_name, state_code, county_code,
      bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
    ) VALUES ${placeholders.join(', ')}
    ON CONFLICT (year, area_name, state_code, area_type) 
    DO UPDATE SET
      county_code = EXCLUDED.county_code,
      bedroom_0 = EXCLUDED.bedroom_0,
      bedroom_1 = EXCLUDED.bedroom_1,
      bedroom_2 = EXCLUDED.bedroom_2,
      bedroom_3 = EXCLUDED.bedroom_3,
      bedroom_4 = EXCLUDED.bedroom_4,
      effective_date = EXCLUDED.effective_date,
      updated_at = CURRENT_TIMESTAMP
  `;

  await execute(queryText, values);
  console.log(`Inserted ${records.length} FMR records`);

  // Also populate the HUD metro mapping table so we can accurately map required SAFMR metro areas
  // to their constituent counties (by FIPS).
  const metroValues: any[] = [];
  const metroPlaceholders: string[] = [];
  let metroParamIndex = 1;

  for (const record of records) {
    if (!record.countyCode || !record.hudAreaName) continue;
    metroPlaceholders.push(
      `($${metroParamIndex++}, $${metroParamIndex++}, $${metroParamIndex++}, $${metroParamIndex++}, $${metroParamIndex++}, $${metroParamIndex++}, $${metroParamIndex++})`
    );
    metroValues.push(
      record.year,
      record.stateCode,
      record.areaName, // county name (we store counties in areaName)
      record.countyCode,
      record.hudAreaCode || null,
      record.hudAreaName,
      record.areaType === 'metropolitan'
    );
  }

  if (metroPlaceholders.length > 0) {
    const metroQueryText = `
      INSERT INTO fmr_county_metro (
        year, state_code, county_name, county_fips, hud_area_code, hud_area_name, is_metro
      ) VALUES ${metroPlaceholders.join(', ')}
      ON CONFLICT (year, state_code, county_fips, hud_area_code)
      DO UPDATE SET
        county_name = EXCLUDED.county_name,
        hud_area_name = EXCLUDED.hud_area_name,
        is_metro = EXCLUDED.is_metro
    `;
    await execute(metroQueryText, metroValues);
  }
}

/**
 * Inserts SAFMR records in batch
 */
export async function insertSAFMRRecords(records: SAFMRRecord[]): Promise<void> {
  if (records.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIndex = 1;

  for (const record of records) {
    placeholders.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    values.push(
      record.year,
      record.zipCode,
      record.bedroom0 || null,
      record.bedroom1 || null,
      record.bedroom2 || null,
      record.bedroom3 || null,
      record.bedroom4 || null,
      record.effectiveDate || null
    );
  }

  const queryText = `
    INSERT INTO safmr_data (
      year, zip_code, bedroom_0, bedroom_1, bedroom_2, bedroom_3, bedroom_4, effective_date
    ) VALUES ${placeholders.join(', ')}
    ON CONFLICT (year, zip_code)
    DO UPDATE SET
      bedroom_0 = EXCLUDED.bedroom_0,
      bedroom_1 = EXCLUDED.bedroom_1,
      bedroom_2 = EXCLUDED.bedroom_2,
      bedroom_3 = EXCLUDED.bedroom_3,
      bedroom_4 = EXCLUDED.bedroom_4,
      effective_date = EXCLUDED.effective_date,
      updated_at = CURRENT_TIMESTAMP
  `;

  await execute(queryText, values);
  console.log(`Inserted ${records.length} SAFMR records`);
}

/**
 * Gets the current year (defaults to October-based FMR year)
 * FMRs are effective October 1, so for dates before October, use previous year
 */
export function getCurrentFMRYear(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  
  // If before October, use previous year's FMRs
  if (month < 10) {
    return year - 1;
  }
  return year;
}

/**
 * Normalizes a ZIP code (removes dashes, ensures 5 digits)
 */
export function normalizeZipCode(zip: string): string {
  return zip.replace(/[-\s]/g, '').substring(0, 5);
}

/**
 * Normalizes state code to uppercase 2-letter code
 */
export function normalizeStateCode(state: string): string {
  return state.trim().toUpperCase().substring(0, 2);
}

/**
 * Normalizes a county FIPS code to 5 digits.
 *
 * HUD's FMR CSV sometimes uses 9-digit "FIPS-like" values (e.g. 010019999),
 * where the first 5 digits are the county FIPS and the trailing 4 are filler.
 * We store the 5-digit county FIPS so it can join to zip_county_mapping.county_fips.
 */
export function normalizeCountyFips(fips: string): string | undefined {
  const digits = (fips || '').replace(/\D/g, '');
  if (!digits) return undefined;

  // Common HUD FMR CSV format:
  // - metro/non-metro rows often have a "FIPS-like" code with a trailing 99999 suffix
  //   e.g. "100199999" => state_fips="1", county="001", suffix="99999" => "01001"
  //   e.g. "3602999999" => state_fips="36", county="029", suffix="99999" => "36029"
  // Detect by trailing 99999 (or length >= 9) and reconstruct.
  if (digits.length >= 9) {
    const withoutSuffix = digits.slice(0, -5);
    if (withoutSuffix.length >= 4) {
      const county3 = withoutSuffix.slice(-3);
      const state = withoutSuffix.slice(0, -3).padStart(2, '0');
      return `${state}${county3}`;
    }
  }

  // If it's already a plain county FIPS (5 digits), keep it.
  if (digits.length === 5) return digits;

  // If it's state+county without suffix (4 or 5 digits), left-pad.
  if (digits.length < 5) return digits.padStart(5, '0');

  // Fallback: take last 5 (more reliable than first 5 for some HUD encodings)
  return digits.slice(-5);
}

