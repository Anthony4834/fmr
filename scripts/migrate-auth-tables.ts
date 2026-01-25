import { configureDatabase, execute } from '../lib/db';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create authentication tables for NextAuth.js
 */
async function migrateAuthTables() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }

  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('Creating authentication tables...');

  // Users table (core user identity)
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      email_verified TIMESTAMPTZ,
      name TEXT,
      image TEXT,
      password_hash TEXT,
      tier VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'paid')),
      role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      locked_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Created users table');

  // OAuth accounts with ENCRYPTED tokens
  await execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      provider VARCHAR(50) NOT NULL,
      provider_account_id TEXT NOT NULL,
      refresh_token_encrypted TEXT,
      access_token_encrypted TEXT,
      expires_at INTEGER,
      token_type VARCHAR(50),
      scope TEXT,
      id_token_encrypted TEXT,
      session_state TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_account_id)
    );
  `);
  console.log('✓ Created accounts table');

  // Login attempts for brute-force protection
  await execute(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY,
      identifier VARCHAR(255) NOT NULL,
      identifier_type VARCHAR(10) NOT NULL CHECK (identifier_type IN ('email', 'ip')),
      success BOOLEAN NOT NULL,
      attempted_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✓ Created login_attempts table');

  // Verification tokens (email verification, password reset)
  await execute(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      identifier VARCHAR(255) NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      expires TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (identifier, token_hash)
    );
  `);
  console.log('✓ Created verification_tokens table');

  // Create indexes
  console.log('Creating indexes...');

  await execute(
    "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider, provider_account_id);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier, attempted_at DESC);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_login_attempts_cleanup ON login_attempts(attempted_at);"
  );
  await execute(
    "CREATE INDEX IF NOT EXISTS idx_verification_tokens_identifier ON verification_tokens(identifier);"
  );
  console.log('✓ Created indexes');

  console.log('\n✅ Auth tables migration complete!');
}

migrateAuthTables().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
