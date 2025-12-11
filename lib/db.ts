import { sql } from '@vercel/postgres';

export interface DatabaseConfig {
  connectionString?: string;
}

let dbConfig: DatabaseConfig = {};

export function configureDatabase(config: DatabaseConfig) {
  dbConfig = config;
}

export async function query<T = any>(queryText: string, params?: any[]): Promise<T[]> {
  try {
    const result = await sql.query(queryText, params);
    return result.rows as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function execute(queryText: string, params?: any[]): Promise<void> {
  try {
    await sql.query(queryText, params);
  } catch (error) {
    console.error('Database execute error:', error);
    throw error;
  }
}


