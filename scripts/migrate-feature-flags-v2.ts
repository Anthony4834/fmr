import { configureDatabase, execute, query } from '../lib/db';

/**
 * Migration: Add is_enabled + rollout_tier model.
 * - is_enabled: boolean (off = false)
 * - rollout_tier: 1=admin, 2=users, 3=ga
 * bun scripts/migrate-feature-flags-v2.ts
 */
async function migrate() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  const hasIsEnabled = await query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'feature_flags' AND column_name = 'is_enabled') as exists`
  );

  if (!hasIsEnabled[0]?.exists) {
    await execute(`
      ALTER TABLE feature_flags
        ADD COLUMN is_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN rollout_tier SMALLINT NOT NULL DEFAULT 1 CHECK (rollout_tier BETWEEN 1 AND 3);
    `);

    await execute(`
      UPDATE feature_flags SET
        is_enabled = (enabled_tier > 0),
        rollout_tier = CASE
          WHEN enabled_tier = 0 THEN 1
          ELSE enabled_tier
        END;
    `);

    await execute(`ALTER TABLE feature_flags DROP COLUMN enabled_tier`);
    console.log('✓ Added is_enabled and rollout_tier, migrated data');
  }

  const hasReason = await query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'feature_flag_audit' AND column_name = 'reason') as exists`
  );
  if (!hasReason[0]?.exists) {
    await execute(`ALTER TABLE feature_flag_audit ADD COLUMN reason TEXT NULL`);
    console.log('✓ Added reason to feature_flag_audit');
  }

  console.log('✅ Done');
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
