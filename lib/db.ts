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

function isWebSocketConnectionError(error: any): boolean {
  if (!error) return false;
  const errorMessage = error.message || error.toString() || '';
  const errorType = error.type || '';
  
  return (
    errorType === 'error' ||
    errorMessage.includes('WebSocket connection') ||
    errorMessage.includes('Failed to connect') ||
    errorMessage.includes('wss://') ||
    errorMessage.includes('ws://')
  );
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  operationName: string = 'Database operation'
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Only retry on WebSocket connection errors
      if (!isWebSocketConnectionError(error)) {
        console.error(`${operationName} error:`, error);
        throw error;
      }
      
      // If this was the last attempt, log and throw
      if (attempt === maxRetries) {
        console.error(`${operationName} error after ${maxRetries + 1} attempts:`, error);
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.error(`${operationName} connection error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

export async function query<T = any>(queryText: string, params?: any[]): Promise<T[]> {
  return retryWithBackoff(async () => {
    const client = configuredPool ?? sql;
    const result = await client.query(queryText, params);
    return result.rows as T[];
  }, 3, 1000, 'Database query');
}

export async function execute(queryText: string, params?: any[]): Promise<void> {
  return retryWithBackoff(async () => {
    const client = configuredPool ?? sql;
    await client.query(queryText, params);
  }, 3, 1000, 'Database execute');
}


