/**
 * Migration: Add 'free_forever' tier and move existing users to it.
 * Run once to update existing databases.
 *
 * Usage: npx tsx scripts/migrate-add-free-forever-tier.ts
 * (or: bun run scripts/migrate-add-free-forever-tier.ts)
 */
import { config } from 'dotenv';
import { execute, query } from '../lib/db';

config();

async function migrate() {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }

  const { configureDatabase } = await import('../lib/db');
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  console.log('Starting free_forever tier migration...');

  // 1. Drop existing tier check constraint (name varies; find by table + column)
  await execute(`
    DO $$
    DECLARE
      conname TEXT;
    BEGIN
      SELECT c.conname INTO conname
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey) AND a.attname = 'tier'
      WHERE t.relname = 'users' AND c.contype = 'c';
      IF conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', conname);
        RAISE NOTICE 'Dropped constraint %', conname;
      END IF;
    END $$;
  `);
  console.log('✓ Dropped existing tier constraint');

  // 2. Add new constraint including free_forever
  await execute(`
    ALTER TABLE users ADD CONSTRAINT users_tier_check
    CHECK (tier IN ('free', 'paid', 'free_forever'));
  `);
  console.log('✓ Added tier constraint with free_forever');

  // 3. Move all existing users to free_forever
  const result = await query<{ count: string }>(
    `UPDATE users SET tier = 'free_forever', updated_at = NOW()
     WHERE tier IN ('free', 'paid')
     RETURNING id`
  );
  const count = result.length;
  console.log(`✓ Updated ${count} user(s) to free_forever`);

  console.log('\n✅ Migration completed successfully');
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
