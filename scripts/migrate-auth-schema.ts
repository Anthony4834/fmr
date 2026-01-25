import { execute } from '../lib/db';

/**
 * Migration script to add new auth-related columns and tables
 * Run this once to update existing database schema
 */
async function migrateAuthSchema() {
  console.log('Starting auth schema migration...');

  try {
    // Add signup_method column to users table
    console.log('Adding signup_method column to users table...');
    await execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'signup_method'
        ) THEN
          ALTER TABLE users ADD COLUMN signup_method VARCHAR(20) CHECK (signup_method IN ('credentials', 'google', 'admin_created'));
          -- Update existing users based on presence of password_hash
          UPDATE users SET signup_method = 'credentials' WHERE password_hash IS NOT NULL AND signup_method IS NULL;
          UPDATE users SET signup_method = 'google' WHERE password_hash IS NULL AND signup_method IS NULL;
        END IF;
      END $$;
    `);
    console.log('✓ signup_method column added');

    // Add type column to verification_tokens table
    console.log('Adding type column to verification_tokens table...');
    await execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'verification_tokens' AND column_name = 'type'
        ) THEN
          ALTER TABLE verification_tokens ADD COLUMN type VARCHAR(20) CHECK (type IN ('email_verification', 'password_reset'));
        END IF;
      END $$;
    `);
    console.log('✓ type column added to verification_tokens');

    // Create verification_attempts table
    console.log('Creating verification_attempts table...');
    await execute(`
      CREATE TABLE IF NOT EXISTS verification_attempts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        success BOOLEAN NOT NULL,
        attempted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ verification_attempts table created');

    // Create indexes for verification_attempts
    console.log('Creating indexes for verification_attempts...');
    await execute(
      "CREATE INDEX IF NOT EXISTS idx_verification_attempts_email ON verification_attempts(email, attempted_at DESC);"
    );
    await execute(
      "CREATE INDEX IF NOT EXISTS idx_verification_attempts_ip ON verification_attempts(ip_address, attempted_at DESC);"
    );
    console.log('✓ indexes created');

    // Ensure role column exists (it might not exist in older schemas)
    console.log('Checking role column in users table...');
    await execute(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'role'
        ) THEN
          ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin'));
        END IF;
      END $$;
    `);
    console.log('✓ role column verified');

    console.log('\n✅ Auth schema migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateAuthSchema()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migrateAuthSchema };
