import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { PostgresAdapter } from './auth-adapter';
import { checkLoginAllowed, recordLoginAttempt } from './auth-rate-limit';
import { query } from './db';
import type { NextAuthConfig } from 'next-auth';

// Password requirements
const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

// Extend the session and JWT types to include our custom fields
declare module 'next-auth' {
  interface User {
    tier?: string;
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      tier: string;
      role: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    tier?: string;
    role?: string;
  }
}

const config: NextAuthConfig = {
  adapter: PostgresAdapter(),

  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  pages: {
    signIn: '/', // We use a modal, not a separate page
    error: '/',
  },

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: false,
    }),
    Credentials({
      id: 'credentials',
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Extract IP from request headers
        const forwardedFor = request.headers?.get?.('x-forwarded-for');
        const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';

        // Check rate limiting BEFORE any database lookup
        const { allowed, reason } = await checkLoginAllowed(email, ip);
        if (!allowed) {
          // Throw generic error to prevent enumeration
          throw new Error('Invalid credentials');
        }

        // Look up user
        const users = await query<{
          id: string;
          email: string;
          name: string | null;
          password_hash: string | null;
          email_verified: string | null;
          tier: string;
          role: string;
          image: string | null;
        }>(
          'SELECT id, email, name, password_hash, email_verified, tier, role, image FROM users WHERE LOWER(email) = LOWER($1)',
          [email]
        );

        // SECURITY: Always compare password even if user not found
        // This prevents timing attacks for user enumeration
        const user = users[0];
        const hashToCompare = user?.password_hash || '$2a$12$invalidhashfortimingattackprevention';
        const isValid = await bcrypt.compare(password, hashToCompare);

        if (!user || !user.password_hash || !isValid) {
          await recordLoginAttempt(email, ip, false);
          // Generic error - never reveal if email exists
          throw new Error('Invalid credentials');
        }

        // Check if email is verified for credential users
        // OAuth users (no password_hash) are allowed even without email_verified
        if (!user.email_verified && user.password_hash) {
          await recordLoginAttempt(email, ip, false);
          // Generic error - don't reveal the specific reason
          throw new Error('Invalid credentials');
        }

        await recordLoginAttempt(email, ip, true);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          tier: user.tier,
          role: user.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      // On initial sign in, add user data to token
      if (user) {
        token.id = user.id;
        token.tier = user.tier || 'free';
        token.role = user.role || 'user';
      }

      // For OAuth users, fetch tier and role from database if not present
      if (account && (!token.tier || !token.role)) {
        const users = await query<{ tier: string; role: string }>(
          'SELECT tier, role FROM users WHERE id = $1',
          [token.id]
        );
        if (users[0]) {
          token.tier = users[0].tier || 'free';
          token.role = users[0].role || 'user';
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.tier = (token.tier as string) || 'free';
        session.user.role = (token.role as string) || 'user';
      }
      return session;
    },

    async signIn({ user, account }) {
      // Allow all OAuth sign-ins
      if (account?.provider !== 'credentials') {
        return true;
      }

      // Credentials are validated in authorize()
      return true;
    },
  },

  events: {
    async signIn({ user, account }) {
      // Log successful sign-ins (optional, for monitoring)
      if (process.env.NODE_ENV === 'development') {
        console.log(`User signed in: ${user.email} via ${account?.provider}`);
      }
    },
  },

  // Security settings
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

// Export password utilities for signup
export { PASSWORD_MIN_LENGTH, BCRYPT_ROUNDS };

/**
 * Hash a password using bcrypt with the configured number of rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Validate password meets minimum requirements.
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    };
  }
  return { valid: true };
}
