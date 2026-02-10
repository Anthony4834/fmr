import dotenv from 'dotenv';
import { configureDatabase, execute } from '../lib/db';

dotenv.config();

/**
 * Migration: add last_seen column to users table (for tracking user activity).
 * Run once: npx tsx scripts/migrate-users-last-seen.ts
 */
async function migrate() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('Adding last_seen to users table (if missing)...');
  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'last_seen'
      ) THEN
        ALTER TABLE users ADD COLUMN last_seen TIMESTAMPTZ;
        RAISE NOTICE 'Column users.last_seen added.';
      ELSE
        RAISE NOTICE 'Column users.last_seen already exists.';
      END IF;
    END $$;
  `);
  console.log('Done.');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
