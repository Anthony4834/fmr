import { configureDatabase } from '../lib/db';
import { execute } from '../lib/db';

/**
 * Migration script to create guests table for guest tracking
 * Run this once to add the guests table to your database
 */
async function migrateGuestsTable() {
  console.log('Starting guests table migration...');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  try {
    // Create guests table
    console.log('Creating guests table...');
    await execute(`
      CREATE TABLE IF NOT EXISTS guests (
        id SERIAL PRIMARY KEY,
        guest_id UUID UNIQUE NOT NULL,
        ip_hash VARCHAR(64) NOT NULL,
        ua_hash VARCHAR(64) NOT NULL,
        first_seen TIMESTAMPTZ DEFAULT NOW(),
        last_seen TIMESTAMPTZ DEFAULT NOW(),
        request_count INTEGER DEFAULT 0,
        limit_hit_at TIMESTAMPTZ,
        converted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        conversion_reason VARCHAR(50) CHECK (conversion_reason IN ('organic', 'after_limit_hit', 'extension')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ guests table created');

    // Create indexes
    console.log('Creating indexes for guests table...');
    await execute(
      "CREATE INDEX IF NOT EXISTS idx_guests_guest_id ON guests(guest_id);"
    );
    await execute(
      "CREATE INDEX IF NOT EXISTS idx_guests_converted_user_id ON guests(converted_user_id) WHERE converted_user_id IS NOT NULL;"
    );
    await execute(
      "CREATE INDEX IF NOT EXISTS idx_guests_limit_hit_at ON guests(limit_hit_at) WHERE limit_hit_at IS NOT NULL;"
    );
    await execute(
      "CREATE INDEX IF NOT EXISTS idx_guests_last_seen ON guests(last_seen DESC);"
    );
    console.log('✓ indexes created');

    console.log('\n✅ Guests table migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateGuestsTable()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migrateGuestsTable };
