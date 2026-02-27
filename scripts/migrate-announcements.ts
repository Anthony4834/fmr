import { configureDatabase, execute, query } from '../lib/db';

const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

/**
 * Migration script: local-first announcements schema.
 * - announcements: body_markdown, is_published, audience, created_by_user_id
 * - announcements_last_viewed: last_read_at (monotonic cursor), updated_at
 *
 *   bun scripts/migrate-announcements.ts
 *   bun run migrate:announcements
 */
async function migrateAnnouncements() {
  console.log('Migrating announcements tables...');

  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }
  configureDatabase({ connectionString: process.env.POSTGRES_URL });

  try {
    // --- announcements ---
    const annExists = await query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'announcements')`
    );
    if (!annExists[0]?.exists) {
      await execute(`
        CREATE TABLE announcements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          body_markdown TEXT NOT NULL,
          published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          is_published BOOLEAN NOT NULL DEFAULT true,
          audience TEXT NOT NULL DEFAULT 'all',
          created_by_user_id UUID REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      console.log('✓ announcements table created');
    } else {
      const cols = await query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'announcements'`
      );
      const names = new Set(cols.map((r) => r.column_name));

      if (names.has('body') && !names.has('body_markdown')) {
        await execute(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS body_markdown TEXT`);
        await execute(`UPDATE announcements SET body_markdown = body WHERE body_markdown IS NULL`);
        await execute(`ALTER TABLE announcements ALTER COLUMN body_markdown SET NOT NULL`);
        await execute(`ALTER TABLE announcements DROP COLUMN body`);
        console.log('✓ announcements: body -> body_markdown');
      }
      if (!names.has('is_published')) {
        await execute(`ALTER TABLE announcements ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT true`);
        console.log('✓ announcements: is_published added');
      }
      if (!names.has('audience')) {
        await execute(`ALTER TABLE announcements ADD COLUMN audience TEXT NOT NULL DEFAULT 'all'`);
        console.log('✓ announcements: audience added');
      }
      if (!names.has('created_by_user_id')) {
        await execute(
          `ALTER TABLE announcements ADD COLUMN created_by_user_id UUID REFERENCES users(id)`
        );
        console.log('✓ announcements: created_by_user_id added');
      }
      if (!names.has('sticky')) {
        await execute(`ALTER TABLE announcements ADD COLUMN sticky BOOLEAN NOT NULL DEFAULT false`);
        console.log('✓ announcements: sticky added');
      }
      if (!names.has('ttl_minutes')) {
        await execute(`ALTER TABLE announcements ADD COLUMN ttl_minutes INTEGER`);
        console.log('✓ announcements: ttl_minutes added');
      }
      if (!names.has('exclusive')) {
        await execute(`ALTER TABLE announcements ADD COLUMN exclusive BOOLEAN NOT NULL DEFAULT false`);
        console.log('✓ announcements: exclusive added');
      }
    }

    await execute(
      `CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements (is_published, published_at DESC)`
    );

    // --- announcement_reads ---
    const arExists = await query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'announcement_reads')`
    );
    if (!arExists[0]?.exists) {
      await execute(`
        CREATE TABLE announcement_reads (
          announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
          user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          guest_id UUID,
          read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT announcement_reads_one_viewer CHECK (
            (user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL)
          )
        );
      `);
      await execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_announcement_reads_announcement_user ON announcement_reads (announcement_id, user_id) WHERE user_id IS NOT NULL'
      );
      await execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_announcement_reads_announcement_guest ON announcement_reads (announcement_id, guest_id) WHERE guest_id IS NOT NULL'
      );
      await execute(
        'CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id ON announcement_reads (announcement_id)'
      );
      console.log('✓ announcement_reads table created');
    } else {
      // Ensure user_id FK cascades on user delete so users can be deleted
      const fkRows = await query<{ constraint_name: string }>(
        `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_name = 'announcement_reads' AND constraint_type = 'FOREIGN KEY'
         AND constraint_name LIKE '%user_id%'`
      );
      const fkName = fkRows[0]?.constraint_name;
      if (fkName) {
        await execute(`ALTER TABLE announcement_reads DROP CONSTRAINT IF EXISTS ${fkName}`);
        await execute(
          `ALTER TABLE announcement_reads ADD CONSTRAINT announcement_reads_user_id_fkey
           FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`
        );
        console.log('✓ announcement_reads: user_id FK set to ON DELETE CASCADE');
      }
    }

    // --- announcements_last_viewed ---
    const lvExists = await query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'announcements_last_viewed')`
    );
    if (!lvExists[0]?.exists) {
      await execute(`
        CREATE TABLE announcements_last_viewed (
          user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          last_read_at TIMESTAMPTZ NOT NULL DEFAULT $1::timestamptz,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `, [EPOCH_ISO]);
      console.log('✓ announcements_last_viewed table created');
    } else {
      const lvCols = await query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'announcements_last_viewed'`
      );
      const lvNames = new Set(lvCols.map((r) => r.column_name));

      if (!lvNames.has('updated_at')) {
        await execute(
          `ALTER TABLE announcements_last_viewed ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
        );
        console.log('✓ announcements_last_viewed: updated_at added');
      }
      if (lvNames.has('last_viewed_at') && !lvNames.has('last_read_at')) {
        await execute(
          `ALTER TABLE announcements_last_viewed RENAME COLUMN last_viewed_at TO last_read_at`
        );
        await execute(
          `ALTER TABLE announcements_last_viewed ALTER COLUMN last_read_at SET DEFAULT '${EPOCH_ISO}'::timestamptz`
        );
        console.log('✓ announcements_last_viewed: last_viewed_at -> last_read_at');
      }
    }

    console.log('\n✅ Announcements migration completed.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

migrateAnnouncements()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
