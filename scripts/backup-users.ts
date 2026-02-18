#!/usr/bin/env node
/**
 * Backup users and accounts to a timestamped JSON file.
 * Fully restorable via scripts/restore-users.ts.
 *
 * Usage: npx tsx scripts/backup-users.ts [--output path]
 *        Default: backups/users-YYYY-MM-DD-HHmmss.json
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { query } from '../lib/db';

config();

const SCHEMA_VERSION = 1;

interface UserRow {
  id: string;
  email: string;
  email_verified: string | null;
  name: string | null;
  image: string | null;
  password_hash: string | null;
  tier: string;
  role: string;
  signup_method: string | null;
  locked_until: string | null;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountRow {
  id: string;
  user_id: string;
  type: string;
  provider: string;
  provider_account_id: string;
  refresh_token_encrypted: string | null;
  access_token_encrypted: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  id_token_encrypted: string | null;
  session_state: string | null;
  created_at: string;
}

interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  users: UserRow[];
  accounts: AccountRow[];
}

async function backupUsers(outputPath: string): Promise<void> {
  const { configureDatabase } = await import('../lib/db');
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('Fetching users...');
  const users = await query<UserRow>(
    `SELECT id, email, email_verified, name, image, password_hash, tier, role,
            signup_method, locked_until, last_seen, created_at, updated_at
     FROM users ORDER BY created_at`
  );
  console.log(`Found ${users.length} user(s)`);

  console.log('Fetching accounts...');
  const accounts = await query<AccountRow>(
    `SELECT id, user_id, type, provider, provider_account_id,
            refresh_token_encrypted, access_token_encrypted, expires_at,
            token_type, scope, id_token_encrypted, session_state, created_at
     FROM accounts ORDER BY user_id, provider`
  );
  console.log(`Found ${accounts.length} account(s)`);

  const payload: BackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    users,
    accounts,
  };

  const absolutePath = outputPath.startsWith('/') || (process.platform === 'win32' && /^[A-Za-z]:/.test(outputPath))
    ? outputPath
    : join(process.cwd(), outputPath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });

  writeFileSync(absolutePath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\nWrote backup to ${absolutePath}`);
}

const args = process.argv.slice(2);
let output = `backups/users-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--output' || args[i] === '-o') && args[i + 1]) {
    output = args[i + 1];
    break;
  }
}

backupUsers(output)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
