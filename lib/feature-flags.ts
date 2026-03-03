import { query } from '@/lib/db';

export type RolloutTier = 'admin' | 'users' | 'ga';

const TIER_TO_VALUE: Record<RolloutTier, number> = {
  admin: 1,
  users: 2,
  ga: 3,
};

const VALUE_TO_TIER: Record<number, RolloutTier> = {
  1: 'admin',
  2: 'users',
  3: 'ga',
};

export interface FeatureFlagRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  rollout_tier: number;
  is_archived: boolean;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  rolloutTier: RolloutTier;
  rolloutTierValue: number;
  isArchived: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export type Actor = { role?: string } | null;

/**
 * Actor: admin=1 (most privileged), user=2, guest=3 (least privileged).
 */
export function getActorAccessLevel(actor: Actor): number {
  if (actor?.role === 'admin') return 1;
  if (actor) return 2;
  return 3; // guest
}

/**
 * Feature enabled if is_enabled && rollout_tier >= actorLevel.
 */
export function isFeatureEnabledForLevels(
  isEnabled: boolean,
  rolloutTier: number,
  actorLevel: number
): boolean {
  if (!isEnabled) return false;
  return rolloutTier >= actorLevel;
}

const CACHE_TTL_MS = 60 * 1000;
let cache: {
  flags: Map<string, { isEnabled: boolean; rolloutTier: number }>;
  expiresAt: number;
} | null = null;

export function invalidateCache() {
  cache = null;
}

async function fetchActiveFlags(): Promise<
  Map<string, { isEnabled: boolean; rolloutTier: number }>
> {
  try {
    const rows = await query<{ key: string; is_enabled: boolean; rollout_tier: number }>(
      `SELECT key, is_enabled, rollout_tier FROM feature_flags WHERE is_archived = false`
    );
    const map = new Map<string, { isEnabled: boolean; rolloutTier: number }>();
    for (const r of rows) {
      map.set(r.key, { isEnabled: r.is_enabled, rolloutTier: r.rollout_tier });
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Get active (non-archived) flags. Cached 60s. Never throws.
 */
export async function getFeatureFlags(): Promise<
  Map<string, { isEnabled: boolean; rolloutTier: number }>
> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.flags;
  }
  try {
    const flags = await fetchActiveFlags();
    cache = { flags, expiresAt: now + CACHE_TTL_MS };
    return flags;
  } catch {
    return new Map();
  }
}

/**
 * Check if feature is enabled for actor. Missing flag = allow (backwards compat).
 */
export async function isEnabled(key: string, actor: Actor): Promise<boolean> {
  const flags = await getFeatureFlags();
  const flag = flags.get(key);
  if (flag == null) return true; // missing = allow
  const actorLevel = getActorAccessLevel(actor);
  return isFeatureEnabledForLevels(flag.isEnabled, flag.rolloutTier, actorLevel);
}

/**
 * Get all flags for admin UI (including archived).
 */
export async function getAllForAdmin(): Promise<FeatureFlag[]> {
  try {
    const rows = await query<FeatureFlagRow & { updated_by: string | null }>(
      `SELECT id, key, name, description, is_enabled, rollout_tier, is_archived, version, updated_at, updated_by
       FROM feature_flags ORDER BY key`
    );
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isEnabled: r.is_enabled,
      rolloutTier: (VALUE_TO_TIER[r.rollout_tier] ?? 'admin') as RolloutTier,
      rolloutTierValue: r.rollout_tier,
      isArchived: r.is_archived,
      version: r.version,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    }));
  } catch {
    return [];
  }
}

// Re-export for consumers
export { TIER_TO_VALUE, VALUE_TO_TIER };

// Admin mutations
export async function createFlag(
  body: {
    key: string;
    name?: string;
    description?: string;
    isEnabled?: boolean;
    rolloutTier?: RolloutTier;
  },
  createdBy?: string
): Promise<FeatureFlag | null> {
  try {
    const key = body.key.trim();
    const name = (body.name ?? key).trim();
    const description = body.description?.trim() || null;
    const isEnabled = body.isEnabled ?? false;
    const tier = body.rolloutTier ? TIER_TO_VALUE[body.rolloutTier] : 1;

    const rows = await query<FeatureFlagRow>(
      `INSERT INTO feature_flags (key, name, description, is_enabled, rollout_tier, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id, key, name, description, is_enabled, rollout_tier, is_archived, version, updated_at, updated_by`,
      [key, name, description, isEnabled, tier, createdBy || null]
    );
    const inserted = rows[0];
    if (!inserted) return null;

    await query(
      `INSERT INTO feature_flag_audit (feature_flag_id, action, new_value, changed_by)
       VALUES ($1, 'created', $2, $3)`,
      [
        inserted.id,
        JSON.stringify({ key, name, description, isEnabled, rolloutTier: tier }),
        createdBy || null,
      ]
    );

    return rowToFlag(inserted);
  } catch {
    return null;
  }
}

function rowToFlag(r: FeatureFlagRow & { updated_by?: string | null }): FeatureFlag {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isEnabled: r.is_enabled,
    rolloutTier: (VALUE_TO_TIER[r.rollout_tier] ?? 'admin') as RolloutTier,
    rolloutTierValue: r.rollout_tier,
    isArchived: r.is_archived,
    version: r.version,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by ?? null,
  };
}

export async function updateFlag(
  id: string,
  body: {
    name?: string;
    description?: string;
    isEnabled?: boolean;
    rolloutTier?: RolloutTier;
  },
  version: number,
  updatedBy?: string
): Promise<{ ok: boolean; flag?: FeatureFlag }> {
  try {
    const updates: string[] = ['updated_at = NOW()', 'updated_by = $2', 'version = version + 1'];
    const params: unknown[] = [id, updatedBy || null];
    let i = 3;

    if (body.name !== undefined) {
      updates.push(`name = $${i++}`);
      params.push(body.name.trim());
    }
    if (body.description !== undefined) {
      updates.push(`description = $${i++}`);
      params.push(body.description?.trim() ?? null);
    }
    if (body.isEnabled !== undefined) {
      updates.push(`is_enabled = $${i++}`);
      params.push(body.isEnabled);
    }
    if (body.rolloutTier !== undefined) {
      updates.push(`rollout_tier = $${i++}`);
      params.push(TIER_TO_VALUE[body.rolloutTier]);
    }
    params.push(version);
    const versionParamIndex = i;

    const rows = await query<FeatureFlagRow & { updated_by: string | null }>(
      `UPDATE feature_flags SET ${updates.join(', ')}
       WHERE id = $1 AND version = $${versionParamIndex}
       RETURNING id, key, name, description, is_enabled, rollout_tier, is_archived, version, updated_at, updated_by`,
      params
    );

    if (rows.length === 0) return { ok: false };

    const updated = rows[0];
    const action = body.isEnabled !== undefined
      ? (body.isEnabled ? 'enabled' : 'disabled')
      : body.rolloutTier !== undefined
        ? 'tier_changed'
        : 'updated';
    await query(
      `INSERT INTO feature_flag_audit (feature_flag_id, action, new_value, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [id, action, JSON.stringify(body), updatedBy || null]
    );

    return { ok: true, flag: rowToFlag(updated) };
  } catch {
    return { ok: false };
  }
}

export async function archiveFlag(
  id: string,
  archivedBy?: string
): Promise<{ ok: boolean; flag?: FeatureFlag }> {
  try {
    const rows = await query<FeatureFlagRow & { updated_by: string | null }>(
      `UPDATE feature_flags SET is_enabled = false, is_archived = true, updated_at = NOW(), updated_by = $2
       WHERE id = $1
       RETURNING id, key, name, description, is_enabled, rollout_tier, is_archived, version, updated_at, updated_by`,
      [id, archivedBy || null]
    );

    if (rows.length === 0) return { ok: false };

    await query(
      `INSERT INTO feature_flag_audit (feature_flag_id, action, new_value, changed_by)
       VALUES ($1, 'archived', '{}', $2)`,
      [id, archivedBy || null]
    );

    return { ok: true, flag: rowToFlag(rows[0]) };
  } catch {
    return { ok: false };
  }
}

export interface AuditEntry {
  id: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string | null;
  changedAt: string;
}

export async function getFlagHistory(id: string): Promise<AuditEntry[]> {
  try {
    const rows = await query<{
      id: string;
      action: string;
      old_value: unknown;
      new_value: unknown;
      changed_by: string | null;
      changed_at: string;
    }>(
      `SELECT id, action, old_value, new_value, changed_by, changed_at
       FROM feature_flag_audit WHERE feature_flag_id = $1 ORDER BY changed_at DESC LIMIT 50`,
      [id]
    );
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      oldValue: r.old_value,
      newValue: r.new_value,
      changedBy: r.changed_by,
      changedAt: r.changed_at,
    }));
  } catch {
    return [];
  }
}

export async function unarchiveFlag(
  id: string,
  unarchivedBy?: string
): Promise<{ ok: boolean; flag?: FeatureFlag }> {
  try {
    const rows = await query<FeatureFlagRow & { updated_by: string | null }>(
      `UPDATE feature_flags SET is_archived = false, updated_at = NOW(), updated_by = $2
       WHERE id = $1
       RETURNING id, key, name, description, is_enabled, rollout_tier, is_archived, version, updated_at, updated_by`,
      [id, unarchivedBy || null]
    );

    if (rows.length === 0) return { ok: false };

    await query(
      `INSERT INTO feature_flag_audit (feature_flag_id, action, new_value, changed_by)
       VALUES ($1, 'unarchived', '{}', $2)`,
      [id, unarchivedBy || null]
    );

    return { ok: true, flag: rowToFlag(rows[0]) };
  } catch {
    return { ok: false };
  }
}
