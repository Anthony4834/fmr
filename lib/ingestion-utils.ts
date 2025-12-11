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
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
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

