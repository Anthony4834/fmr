import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, execute } from '@/lib/db';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours in seconds
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds

// Ensure extension_tokens table exists
async function ensureTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS extension_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_extension_tokens_user_id ON extension_tokens(user_id);
  `);
  
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_extension_tokens_refresh_token_hash ON extension_tokens(refresh_token_hash);
  `);
  
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_extension_tokens_expires_at ON extension_tokens(expires_at);
  `);
}

// Generate a secure random refresh token
function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Hash refresh token for storage
function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Create access token JWT
function createAccessToken(user: { id: string; email: string; tier: string; role: string }): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not configured');
  }

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      tier: user.tier,
      role: user.role,
      type: 'extension_access',
    },
    secret,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    }
  );
}

// Issue new tokens for authenticated user
export async function POST(request: NextRequest) {
  try {
    await ensureTable();

    // Get authenticated user session
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user details from database
    const users = await query<{
      id: string;
      email: string;
      tier: string;
      role: string;
    }>(
      'SELECT id, email, tier, role FROM users WHERE id = $1',
      [session.user.id]
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = users[0];

    // Generate refresh token
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000);

    // Store refresh token in database
    await execute(
      `INSERT INTO extension_tokens (user_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, refreshTokenHash, expiresAt]
    );

    // Create access token
    const accessToken = createAccessToken(user);

    return NextResponse.json({
      accessToken,
      refreshToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error issuing extension token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Refresh access token using refresh token
export async function PUT(request: NextRequest) {
  try {
    await ensureTable();

    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return NextResponse.json(
        { error: 'Refresh token required' },
        { status: 400 }
      );
    }

    const refreshTokenHash = hashRefreshToken(refreshToken);

    // Find token in database
    const tokens = await query<{
      id: string;
      user_id: string;
      expires_at: Date;
    }>(
      `SELECT id, user_id, expires_at FROM extension_tokens
       WHERE refresh_token_hash = $1`,
      [refreshTokenHash]
    );

    if (tokens.length === 0) {
      return NextResponse.json(
        { error: 'Invalid refresh token' },
        { status: 401 }
      );
    }

    const tokenRecord = tokens[0];

    // Check if token is expired
    if (new Date(tokenRecord.expires_at) < new Date()) {
      // Delete expired token
      await execute(
        'DELETE FROM extension_tokens WHERE id = $1',
        [tokenRecord.id]
      );
      return NextResponse.json(
        { error: 'Refresh token expired' },
        { status: 401 }
      );
    }

    // Get user details
    const users = await query<{
      id: string;
      email: string;
      tier: string;
      role: string;
    }>(
      'SELECT id, email, tier, role FROM users WHERE id = $1',
      [tokenRecord.user_id]
    );

    if (users.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = users[0];

    // Update last_used_at
    await execute(
      'UPDATE extension_tokens SET last_used_at = NOW() WHERE id = $1',
      [tokenRecord.id]
    );

    // Create new access token
    const accessToken = createAccessToken(user);

    return NextResponse.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error refreshing extension token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Revoke refresh token (logout)
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return NextResponse.json(
        { error: 'Refresh token required' },
        { status: 400 }
      );
    }

    const refreshTokenHash = hashRefreshToken(refreshToken);

    // Delete token
    await execute(
      'DELETE FROM extension_tokens WHERE refresh_token_hash = $1',
      [refreshTokenHash]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error revoking extension token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
