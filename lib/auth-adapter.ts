import type { Adapter, AdapterUser, AdapterAccount, AdapterSession, VerificationToken } from 'next-auth/adapters';
import { query, execute } from './db';
import { encryptIfPresent, decryptIfPresent } from './encryption';
import { createHash } from 'crypto';

/**
 * Custom NextAuth adapter for Postgres with encrypted OAuth tokens.
 * Uses the existing db.ts query functions.
 */
export function PostgresAdapter(): Adapter {
  return {
    async createUser(user) {
      // OAuth users are created without password_hash, so set signup_method to 'google'
      // (This will be updated if it's a different provider when account is linked)
      const result = await query<AdapterUser>(
        `INSERT INTO users (email, email_verified, name, image, signup_method)
         VALUES (LOWER($1), $2, $3, $4, 'google')
         RETURNING id, email, email_verified as "emailVerified", name, image`,
        [user.email, user.emailVerified, user.name, user.image]
      );
      return result[0];
    },

    async getUser(id) {
      const result = await query<AdapterUser>(
        `SELECT id, email, email_verified as "emailVerified", name, image, tier
         FROM users WHERE id = $1`,
        [id]
      );
      return result[0] || null;
    },

    async getUserByEmail(email) {
      const result = await query<AdapterUser>(
        `SELECT id, email, email_verified as "emailVerified", name, image, tier
         FROM users WHERE LOWER(email) = LOWER($1)`,
        [email]
      );
      return result[0] || null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const result = await query<AdapterUser>(
        `SELECT u.id, u.email, u.email_verified as "emailVerified", u.name, u.image, u.tier
         FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE a.provider = $1 AND a.provider_account_id = $2`,
        [provider, providerAccountId]
      );
      return result[0] || null;
    },

    async updateUser(user) {
      const result = await query<AdapterUser>(
        `UPDATE users 
         SET name = COALESCE($2, name),
             email = COALESCE(LOWER($3), email),
             email_verified = COALESCE($4, email_verified),
             image = COALESCE($5, image),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, email, email_verified as "emailVerified", name, image, tier`,
        [user.id, user.name, user.email, user.emailVerified, user.image]
      );
      return result[0];
    },

    async deleteUser(userId) {
      await execute('DELETE FROM users WHERE id = $1', [userId]);
    },

    async linkAccount(account) {
      // Encrypt sensitive tokens before storage
      const encryptedRefreshToken = encryptIfPresent(account.refresh_token);
      const encryptedAccessToken = encryptIfPresent(account.access_token);
      const encryptedIdToken = encryptIfPresent(account.id_token);

      await execute(
        `INSERT INTO accounts (
           user_id, type, provider, provider_account_id,
           refresh_token_encrypted, access_token_encrypted, 
           expires_at, token_type, scope, id_token_encrypted, session_state
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          account.userId,
          account.type,
          account.provider,
          account.providerAccountId,
          encryptedRefreshToken,
          encryptedAccessToken,
          account.expires_at,
          account.token_type,
          account.scope,
          encryptedIdToken,
          account.session_state,
        ]
      );

      // Update signup_method based on provider (if not already set)
      const providerSignupMethod = account.provider === 'google' ? 'google' : account.provider;
      await execute(
        `UPDATE users 
         SET signup_method = COALESCE(signup_method, $1)
         WHERE id = $2 AND signup_method IS NULL`,
        [providerSignupMethod, account.userId]
      );

      return account as AdapterAccount;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await execute(
        'DELETE FROM accounts WHERE provider = $1 AND provider_account_id = $2',
        [provider, providerAccountId]
      );
    },

    // Session methods - we use JWT strategy, but these are required by the adapter interface
    async createSession(session) {
      // Not used with JWT strategy
      return session as AdapterSession;
    },

    async getSessionAndUser(sessionToken) {
      // Not used with JWT strategy
      return null;
    },

    async updateSession(session) {
      // Not used with JWT strategy
      return session as AdapterSession;
    },

    async deleteSession(sessionToken) {
      // Not used with JWT strategy
    },

    async createVerificationToken(token) {
      // Hash the token before storing (we only store the hash)
      const tokenHash = createHash('sha256').update(token.token).digest('hex');
      
      await execute(
        `INSERT INTO verification_tokens (identifier, token_hash, expires)
         VALUES ($1, $2, $3)
         ON CONFLICT (identifier, token_hash) DO UPDATE SET expires = $3`,
        [token.identifier, tokenHash, token.expires]
      );

      return token;
    },

    async useVerificationToken({ identifier, token }) {
      // Hash the provided token to look it up
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const result = await query<VerificationToken>(
        `DELETE FROM verification_tokens 
         WHERE identifier = $1 AND token_hash = $2
         RETURNING identifier, token_hash as token, expires`,
        [identifier, tokenHash]
      );

      if (result.length === 0) return null;

      // Return with the original token (not the hash)
      return {
        identifier: result[0].identifier,
        token: token,
        expires: result[0].expires,
      };
    },
  };
}

/**
 * Get decrypted OAuth tokens for a user's account.
 * Only call this when you actually need to use the tokens.
 */
export async function getDecryptedAccountTokens(
  userId: string,
  provider: string
): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
} | null> {
  const result = await query<{
    access_token_encrypted: string | null;
    refresh_token_encrypted: string | null;
    id_token_encrypted: string | null;
  }>(
    `SELECT access_token_encrypted, refresh_token_encrypted, id_token_encrypted
     FROM accounts 
     WHERE user_id = $1 AND provider = $2`,
    [userId, provider]
  );

  if (result.length === 0) return null;

  return {
    accessToken: decryptIfPresent(result[0].access_token_encrypted),
    refreshToken: decryptIfPresent(result[0].refresh_token_encrypted),
    idToken: decryptIfPresent(result[0].id_token_encrypted),
  };
}

/**
 * Update encrypted OAuth tokens for an account.
 * Call this when tokens are refreshed.
 */
export async function updateAccountTokens(
  userId: string,
  provider: string,
  tokens: {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    expiresAt?: number;
  }
): Promise<void> {
  const updates: string[] = [];
  const values: (string | number | null)[] = [userId, provider];
  let paramIndex = 3;

  if (tokens.accessToken !== undefined) {
    updates.push(`access_token_encrypted = $${paramIndex++}`);
    values.push(encryptIfPresent(tokens.accessToken));
  }

  if (tokens.refreshToken !== undefined) {
    updates.push(`refresh_token_encrypted = $${paramIndex++}`);
    values.push(encryptIfPresent(tokens.refreshToken));
  }

  if (tokens.idToken !== undefined) {
    updates.push(`id_token_encrypted = $${paramIndex++}`);
    values.push(encryptIfPresent(tokens.idToken));
  }

  if (tokens.expiresAt !== undefined) {
    updates.push(`expires_at = $${paramIndex++}`);
    values.push(tokens.expiresAt);
  }

  if (updates.length === 0) return;

  await execute(
    `UPDATE accounts SET ${updates.join(', ')} WHERE user_id = $1 AND provider = $2`,
    values
  );
}
