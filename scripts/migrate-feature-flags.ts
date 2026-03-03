import { configureDatabase, execute, query } from '../lib/db';

const TIER_MAP: Record<string, number> = { off: 0, admin: 1, users: 2, ga: 3 };

/**
 * Migration: feature_flags + feature_flag_audit tables.
 * Migrates from feature_toggles, then drops it.
 * bun scripts/migrate-feature-flags.ts
 */
async function migrate() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const hasNewTable = await query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feature_flags') as exists`
  );

  if (!hasNewTable[0]?.exists) {
    await execute(`
      CREATE TABLE feature_flags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        is_enabled BOOLEAN NOT NULL DEFAULT false,
        rollout_tier SMALLINT NOT NULL DEFAULT 1 CHECK (rollout_tier BETWEEN 1 AND 3),
        is_archived BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by UUID REFERENCES users(id),
        updated_by UUID REFERENCES users(id),
        version INTEGER NOT NULL DEFAULT 1
      );
    `);
    await execute(`
      CREATE INDEX feature_flags_active_idx ON feature_flags (is_archived, key);
    `);
    console.log('✓ feature_flags table created');

    await execute(`
      CREATE TABLE feature_flag_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        feature_flag_id UUID NOT NULL REFERENCES feature_flags(id),
        action TEXT NOT NULL,
        old_value JSONB,
        new_value JSONB,
        changed_by UUID REFERENCES users(id),
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✓ feature_flag_audit table created');
  }

  const hasOldTable = await query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feature_toggles') as exists`
  );

  if (hasOldTable[0]?.exists) {
    const existing = await query<{ key: string; tier: string; description: string | null }>(
      `SELECT key, tier, COALESCE(description, '') as description FROM feature_toggles`
    );

    for (const row of existing) {
      const tierVal = TIER_MAP[row.tier] ?? 3;
      const isEnabled = tierVal > 0;
      const rolloutTier = tierVal > 0 ? tierVal : 1;
      await execute(
        `INSERT INTO feature_flags (key, name, description, is_enabled, rollout_tier, is_archived)
         VALUES ($1, $2, $3, $4, $5, false)
         ON CONFLICT (key) DO NOTHING`,
        [row.key, row.key, row.description || null, isEnabled, rolloutTier]
      );
    }
    console.log(`✓ Migrated ${existing.length} rows from feature_toggles`);

    await execute(`DROP TABLE feature_toggles`);
    console.log('✓ Dropped feature_toggles');
  }

  console.log('✅ Done');
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
