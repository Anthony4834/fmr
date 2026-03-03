#!/usr/bin/env bun
/**
 * Unlink the Google OAuth account from noreply@fmr.fyi user.
 *
 * Use when: Google sign-in (with ajsg1337@gmail.com) incorrectly linked to noreply@fmr.fyi
 * due to allowDangerousEmailAccountLinking or deleted-user edge case.
 *
 * After running: Next Google sign-in with ajsg1337@gmail.com will create a new user.
 *
 * Run: bun scripts/unlink-google-from-noreply.ts
 */

import dotenv from 'dotenv';
import { configureDatabase, query, execute } from '../lib/db';

dotenv.config();

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL not set');
    process.exit(1);
  }

  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const noreplyUser = await query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE LOWER(email) = 'noreply@fmr.fyi'"
  );

  if (noreplyUser.length === 0) {
    console.log('noreply@fmr.fyi user not found. Nothing to do.');
    process.exit(0);
  }

  const accounts = await query<{ id: string; provider_account_id: string }>(
    "SELECT a.id, a.provider_account_id FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = 'noreply@fmr.fyi' AND a.provider = 'google'"
  );

  if (accounts.length === 0) {
    console.log('No Google account linked to noreply@fmr.fyi. Nothing to do.');
    process.exit(0);
  }

  console.log(`Unlinking Google account (${accounts[0].provider_account_id}) from noreply@fmr.fyi...`);
  await execute('DELETE FROM accounts WHERE id = $1', [accounts[0].id]);
  console.log('Done. Next sign-in with Google (ajsg1337@gmail.com) will create a new user.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
