import { configureDatabase, execute, query } from '../lib/db';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Add role column to users table (migration for existing installations)
 */
async function migrateAddRole() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }

  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('Adding role column to users table...');

  // Add role column if it doesn't exist
  const columnExists = await query<{ count: string }>(`
    SELECT COUNT(*)::text as count FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'role'
  `);

  const count = parseInt(columnExists[0]?.count || '0', 10);
  if (count === 0) {
    await execute(`
      ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))
    `);
    await execute(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    console.log('✓ Added role column to users table');
  } else {
    console.log('✓ Role column already exists');
  }

  console.log('\n✅ Role migration complete!');
}

migrateAddRole().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
