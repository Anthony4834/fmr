#!/usr/bin/env node
/**
 * Restore users and accounts from a backup JSON file produced by scripts/backup-users.ts.
 *
 * Usage: npx tsx scripts/restore-users.ts [--backup-file path] [--dry-run]
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execute } from '../lib/db';

config();

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

async function restoreUsers(backupPath: string, dryRun: boolean): Promise<void> {
  const { configureDatabase } = await import('../lib/db');
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const absolutePath = backupPath.startsWith('/') || (process.platform === 'win32' && /^[A-Za-z]:/.test(backupPath))
    ? backupPath
    : join(process.cwd(), backupPath);
  const raw = readFileSync(absolutePath, 'utf-8');
  const payload = JSON.parse(raw) as BackupPayload;
  if (!payload.schemaVersion || !Array.isArray(payload.users)) {
    throw new Error('Invalid backup file: missing schemaVersion or users');
  }
  const accounts: AccountRow[] = Array.isArray(payload.accounts) ? payload.accounts : [];

  console.log(`Backup from ${payload.exportedAt || 'unknown date'}`);
  console.log(`Users: ${payload.users.length}, Accounts: ${accounts.length}`);
  if (dryRun) {
    console.log('\n[DRY RUN] No changes will be made.\n');
    return;
  }

  for (const u of payload.users) {
    await execute(
      `INSERT INTO users (
        id, email, email_verified, name, image, password_hash, tier, role,
        signup_method, locked_until, last_seen, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        name = EXCLUDED.name,
        image = EXCLUDED.image,
        password_hash = EXCLUDED.password_hash,
        tier = EXCLUDED.tier,
        role = EXCLUDED.role,
        signup_method = EXCLUDED.signup_method,
        locked_until = EXCLUDED.locked_until,
        last_seen = EXCLUDED.last_seen,
        updated_at = EXCLUDED.updated_at`,
      [
        u.id,
        u.email,
        u.email_verified,
        u.name,
        u.image,
        u.password_hash,
        u.tier,
        u.role,
        u.signup_method,
        u.locked_until,
        u.last_seen,
        u.created_at,
        u.updated_at,
      ]
    );
  }
  console.log(`Restored ${payload.users.length} user(s)`);

  const userIds = payload.users.map((u) => u.id);
  if (userIds.length > 0) {
    await execute(
      `DELETE FROM accounts WHERE user_id = ANY($1::uuid[])`,
      [userIds]
    );
  }
  for (const a of accounts) {
    if (!userIds.includes(a.user_id)) continue;
    await execute(
      `INSERT INTO accounts (
        user_id, type, provider, provider_account_id,
        refresh_token_encrypted, access_token_encrypted, expires_at,
        token_type, scope, id_token_encrypted, session_state
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        a.user_id,
        a.type,
        a.provider,
        a.provider_account_id,
        a.refresh_token_encrypted,
        a.access_token_encrypted,
        a.expires_at,
        a.token_type,
        a.scope,
        a.id_token_encrypted,
        a.session_state,
      ]
    );
  }
  console.log(`Restored ${accounts.length} account(s)`);
  console.log('\nRestore completed.');
}

const args = process.argv.slice(2);
let backupFile = '';
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--backup-file' || args[i] === '-f') && args[i + 1]) {
    backupFile = args[i + 1];
    i++;
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  }
}
if (!backupFile) {
  console.error('Usage: npx tsx scripts/restore-users.ts --backup-file <path> [--dry-run]');
  process.exit(1);
}

restoreUsers(backupFile, dryRun)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
