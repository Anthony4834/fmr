import { createPool, sql } from '@vercel/postgres';

export interface DatabaseConfig {
  connectionString?: string;
}

let dbConfig: DatabaseConfig = {};
let configuredPool: ReturnType<typeof createPool> | null = null;

export function configureDatabase(config: DatabaseConfig) {
  dbConfig = config;
  // For scripts/CLI usage, prefer an explicit pool configured with the provided connection string.
  // In Next.js runtime code paths we typically use the default `sql` export directly.
  if (dbConfig.connectionString) {
    configuredPool = createPool({ connectionString: dbConfig.connectionString });
  }
}

export async function query<T = any>(queryText: string, params?: any[]): Promise<T[]> {
  try {
    const client = configuredPool ?? sql;
    const result = await client.query(queryText, params);
    return result.rows as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function execute(queryText: string, params?: any[]): Promise<void> {
  try {
    const client = configuredPool ?? sql;
    await client.query(queryText, params);
  } catch (error) {
    console.error('Database execute error:', error);
    throw error;
  }
}


