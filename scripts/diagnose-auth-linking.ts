#!/usr/bin/env bun
/**
 * Diagnose auth account linking - helps understand why Gmail might log in as noreply@.
 *
 * Run: bun scripts/diagnose-auth-linking.ts
 *
 * Checks:
 * 1. users table for ajsg1337@gmail.com and noreply@fmr.fyi
 * 2. accounts table - which Google provider_account_id is linked to which user
 * 3. Whether allowDangerousEmailAccountLinking could have caused incorrect linking
 *
 * With allowDangerousEmailAccountLinking: false, the ONLY way two different emails
 * share a user is if they have the same Google provider_account_id (same Google account).
 * Google can return different emails (noreply@ vs gmail) for the same account when
 * the account has multiple aliases (e.g. Google Workspace).
 */

import dotenv from 'dotenv';
import { configureDatabase, query } from '../lib/db';

dotenv.config();

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL not set');
    process.exit(1);
  }

  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const emails = ['ajsg1337@gmail.com', 'noreply@fmr.fyi'];

  console.log('=== Auth Account Linking Diagnostic ===\n');

  // 1. Check users
  console.log('1. Users with these emails:');
  for (const email of emails) {
    const users = await query<{ id: string; email: string; signup_method: string; created_at: string }>(
      'SELECT id, email, signup_method, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (users.length) {
      console.log(`   ${email}:`);
      console.log(`     id: ${users[0].id}`);
      console.log(`     signup_method: ${users[0].signup_method}`);
      console.log(`     created_at: ${users[0].created_at}`);
    } else {
      console.log(`   ${email}: NOT FOUND`);
    }
  }

  // 2. Check accounts (Google OAuth links)
  console.log('\n2. Google OAuth accounts:');
  const accounts = await query<{
    id: string;
    provider_account_id: string;
    user_id: string;
    email: string;
  }>(
    `SELECT a.id, a.provider_account_id, a.user_id, u.email
     FROM accounts a
     JOIN users u ON u.id = a.user_id
     WHERE a.provider = 'google'
     ORDER BY a.created_at DESC`
  );

  for (const acc of accounts) {
    const isTarget =
      acc.email?.toLowerCase() === 'ajsg1337@gmail.com' ||
      acc.email?.toLowerCase() === 'noreply@fmr.fyi';
    const marker = isTarget ? ' <--' : '';
    console.log(
      `   provider_account_id: ${acc.provider_account_id} -> user ${acc.email} (${acc.user_id})${marker}`
    );
  }

  // 3. Key insight
  console.log('\n3. Analysis:');
  const gmailUser = await query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE LOWER(email) = 'ajsg1337@gmail.com'"
  );
  const noreplyUser = await query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE LOWER(email) = 'noreply@fmr.fyi'"
  );

  if (gmailUser.length && noreplyUser.length && gmailUser[0].id !== noreplyUser[0].id) {
    const gmailAccounts = await query<{ provider_account_id: string }>(
      'SELECT provider_account_id FROM accounts WHERE user_id = $1 AND provider = $2',
      [gmailUser[0].id, 'google']
    );
    const noreplyAccounts = await query<{ provider_account_id: string }>(
      'SELECT provider_account_id FROM accounts WHERE user_id = $1 AND provider = $2',
      [noreplyUser[0].id, 'google']
    );

    if (
      gmailAccounts.length &&
      noreplyAccounts.length &&
      gmailAccounts[0].provider_account_id === noreplyAccounts[0].provider_account_id
    ) {
      console.log('   BUG: Same Google provider_account_id linked to BOTH users!');
      console.log('   This should not happen with allowDangerousEmailAccountLinking: false.');
      console.log('   Check if it was ever set to true, or if DB was manually modified.');
    } else {
      console.log('   Two separate users with separate Google accounts. No linking.');
    }
  } else if (gmailUser.length === 0 && noreplyUser.length) {
    console.log('   ajsg1337@gmail.com has no user record. noreply@fmr.fyi exists.');
    console.log('   When you "sign in with Google", Google returns the email from your');
    console.log('   selected account. If your Google account has noreply@fmr.fyi as');
    console.log('   primary/alias, Google returns noreply@ — same identity, different email.');
    console.log('   Fix: Use a Google account whose primary email is ajsg1337@gmail.com');
    console.log('   OR block system emails in signIn callback (noreply@, etc).');
  } else if (noreplyUser.length) {
    console.log('   noreply@fmr.fyi user exists. Your Google account may have noreply@');
    console.log('   as its primary/alias — Google returns that email during OAuth.');
  }

  // 4. Check for OTHER potentially affected accounts
  // If allowDangerousEmailAccountLinking was ever true: credentials/admin_created users
  // could have had a Google account linked to them (instead of creating a new user).
  // That means someone signing in with Google got merged with an existing account.
  console.log('\n4. Potentially affected accounts (credentials/admin_created + Google linked):');
  const linkedCredentials = await query<{
    email: string;
    signup_method: string;
    created_at: string;
    provider_account_id: string;
  }>(
    `SELECT u.email, u.signup_method, u.created_at, a.provider_account_id
     FROM users u
     JOIN accounts a ON a.user_id = u.id
     WHERE a.provider = 'google'
       AND u.signup_method IN ('credentials', 'admin_created')
     ORDER BY u.created_at ASC`
  );

  if (linkedCredentials.length === 0) {
    console.log('   None found. All Google-linked users were created via Google sign-up.');
  } else {
    console.log(
      `   Found ${linkedCredentials.length} user(s) who signed up with email/password (or admin)`
    );
    console.log('   but have a Google account linked. This can happen if allowDangerousEmailAccountLinking');
    console.log('   was ever true — the Google sign-in linked to the existing user by email.');
    for (const u of linkedCredentials) {
      console.log(`   - ${u.email} (signup: ${u.signup_method}, created: ${u.created_at})`);
    }
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
