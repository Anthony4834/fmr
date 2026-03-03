'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { FeatureFlag, RolloutTier } from '@/lib/feature-flags';

const ROLLOUT_TIERS: RolloutTier[] = ['admin', 'users', 'ga'];

function StatusBadge({ flag }: { flag: FeatureFlag }) {
  if (flag.isArchived) {
    return (
      <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
        Archived
      </span>
    );
  }
  if (!flag.isEnabled) {
    return (
      <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
        Off
      </span>
    );
  }
  const label = flag.rolloutTier === 'admin' ? 'Admin' : flag.rolloutTier === 'users' ? 'Users' : 'GA';
  const colors =
    flag.rolloutTier === 'ga'
      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
      : flag.rolloutTier === 'users'
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400';
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${colors}`}>{label}</span>
  );
}

function AudienceSwitch({
  value,
  onChange,
  disabled,
  flag,
  onTierClick,
}: {
  value: RolloutTier;
  onChange: (t: RolloutTier) => void;
  disabled?: boolean;
  flag: FeatureFlag;
  onTierClick: (t: RolloutTier) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const activeIndex = ROLLOUT_TIERS.indexOf(value);

  useEffect(() => {
    const btn = buttonRefs.current[activeIndex];
    if (!btn) return;
    setIndicatorStyle({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeIndex, value]);

  const handleClick = (t: RolloutTier) => {
    if (flag.isEnabled) {
      onChange(t);
    } else {
      onTierClick(t);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] shadow-sm overflow-hidden"
    >
      <div
        className="absolute top-0 bottom-0 bg-[var(--bg-hover)] transition-all duration-300 ease-out"
        style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
      />
      {ROLLOUT_TIERS.map((t, i) => (
        <button
          key={t}
          ref={(el) => { buttonRefs.current[i] = el; }}
          type="button"
          onClick={() => handleClick(t)}
          disabled={disabled}
          className={`relative px-2 py-1 text-xs font-medium transition-colors duration-200 capitalize ${
            value === t
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t === 'ga' ? 'GA' : t}
        </button>
      ))}
    </div>
  );
}

function EnabledSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <span className="text-sm text-gray-600 dark:text-gray-400 sr-only sm:not-sr-only">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

interface Props {
  initialFlags: FeatureFlag[];
}

export default function FeatureFlagsAdminClient({ initialFlags }: Props) {
  const router = useRouter();
  const [flags, setFlags] = useState<FeatureFlag[]>(initialFlags);
  const [showArchived, setShowArchived] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [historyFlag, setHistoryFlag] = useState<FeatureFlag | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictKey, setConflictKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refresh = async () => {
    try {
      const res = await fetch('/api/admin/feature-flags');
      if (res.ok) {
        const data = await res.json();
        setFlags(data);
      }
    } catch {
      // ignore
    }
    router.refresh();
  };

  const update = async (
    flag: FeatureFlag,
    updates: Partial<Pick<FeatureFlag, 'name' | 'description' | 'isEnabled' | 'rolloutTier'>>
  ) => {
    setError(null);
    setConflictKey(null);
    const prev = [...flags];
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { version: flag.version, ...updates };
      const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 409) {
        setConflictKey(flag.key);
        setError('This feature was updated by someone else. Reloaded latest state.');
        refresh();
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Failed');
        setFlags(prev);
        return;
      }
      setFlags((f) => f.map((x) => (x.id === flag.id ? data : x)));
      showToast('Saved');
      refresh();
    } catch {
      setError('Failed to update');
      setFlags(prev);
    } finally {
      setSaving(false);
    }
  };

  const archive = async (flag: FeatureFlag) => {
    if (!confirm(`Archive "${flag.key}"? It can be restored later.`)) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}/archive`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed');
        return;
      }
      setFlags((f) => f.map((x) => (x.id === flag.id ? data : x)));
      showToast('Archived');
      refresh();
    } catch {
      setError('Failed to archive');
    } finally {
      setSaving(false);
    }
  };

  const unarchive = async (flag: FeatureFlag) => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/feature-flags/${flag.id}/unarchive`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed');
        return;
      }
      setFlags((f) => f.map((x) => (x.id === flag.id ? data : x)));
      showToast('Unarchived');
      refresh();
    } catch {
      setError('Failed to unarchive');
    } finally {
      setSaving(false);
    }
  };

  const handleTierClickWhileDisabled = (flag: FeatureFlag, t: RolloutTier) => {
    update(flag, { isEnabled: true, rolloutTier: t });
  };

  const displayed = showArchived ? flags : flags.filter((f) => !f.isArchived);

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2 bg-gray-900 text-white text-sm rounded shadow-lg">
          {toast}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
          {conflictKey && (
            <button
              type="button"
              onClick={() => { setError(null); setConflictKey(null); refresh(); }}
              className="ml-2 underline"
            >
              Refresh
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => { setEditingFlag(null); setDrawerOpen(true); }}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Create feature
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded"
          />
          Show archived
        </label>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Feature
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Enabled
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Audience
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Updated
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {displayed.map((flag) => (
                <tr
                  key={flag.id}
                  className={flag.isArchived ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50' : ''}
                >
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{flag.name}</div>
                      <div className="text-xs font-mono text-gray-500 dark:text-gray-400">
                        {flag.key}
                      </div>
                      {flag.description && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {flag.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {!flag.isArchived && (
                      <EnabledSwitch
                        checked={flag.isEnabled}
                        onChange={(v) => update(flag, { isEnabled: v })}
                        disabled={saving}
                        label={`Enable ${flag.name}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!flag.isArchived && (
                      <AudienceSwitch
                        value={flag.rolloutTier}
                        onChange={(t) => update(flag, { rolloutTier: t })}
                        disabled={saving}
                        flag={flag}
                        onTierClick={(t) => handleTierClickWhileDisabled(flag, t)}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge flag={flag} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {new Date(flag.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {flag.isArchived ? (
                      <button
                        onClick={() => unarchive(flag)}
                        disabled={saving}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Unarchive
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingFlag(flag); setDrawerOpen(true); }}
                          className="text-sm text-gray-600 dark:text-gray-400 hover:underline mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setHistoryFlag(flag)}
                          className="text-sm text-gray-600 dark:text-gray-400 hover:underline mr-3"
                        >
                          History
                        </button>
                        <button
                          onClick={() => archive(flag)}
                          disabled={saving}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Archive
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {displayed.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            No flags yet. Create one to get started.
          </div>
        )}
      </div>

      {drawerOpen && (
        <FeatureDrawer
          flag={editingFlag}
          onClose={() => { setDrawerOpen(false); setEditingFlag(null); }}
          onSave={() => { setDrawerOpen(false); setEditingFlag(null); refresh(); }}
          setError={setError}
        />
      )}
      {historyFlag && (
        <HistoryModal
          flag={historyFlag}
          onClose={() => setHistoryFlag(null)}
        />
      )}
    </div>
  );
}

function HistoryModal({ flag, onClose }: { flag: FeatureFlag; onClose: () => void }) {
  const [history, setHistory] = useState<Array<{ id: string; action: string; oldValue: unknown; newValue: unknown; changedBy: string | null; changedAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/feature-flags/${flag.id}/history`)
      .then((r) => r.json())
      .then((data) => { setHistory(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [flag.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          History: {flag.name}
        </h2>
        <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mb-4">{flag.key}</p>
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-500">No history yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="text-sm py-2 border-b border-gray-200 dark:border-gray-700 last:border-0"
              >
                <span className="font-medium capitalize">{h.action}</span>
                <span className="text-gray-500 dark:text-gray-400 mx-2">
                  {new Date(h.changedAt).toLocaleString()}
                </span>
                {h.changedBy && (
                  <span className="text-gray-400 dark:text-gray-500 text-xs">by {h.changedBy}</span>
                )}
                {h.newValue && typeof h.newValue === 'object' && Object.keys(h.newValue as object).length > 0 && (
                  <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
                    {JSON.stringify(h.newValue, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 rounded border border-gray-300 dark:border-gray-600"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function FeatureDrawer({
  flag,
  onClose,
  onSave,
  setError,
}: {
  flag: FeatureFlag | null;
  onClose: () => void;
  onSave: () => void;
  setError: (s: string | null) => void;
}) {
  const [name, setName] = useState(flag?.name ?? '');
  const [key, setKey] = useState(flag?.key ?? '');
  const [description, setDescription] = useState(flag?.description ?? '');
  const [isEnabled, setIsEnabled] = useState(flag?.isEnabled ?? false);
  const [rolloutTier, setRolloutTier] = useState<RolloutTier>(flag?.rolloutTier ?? 'admin');
  const [saving, setSaving] = useState(false);
  const isEdit = !!flag;

  useEffect(() => {
    if (flag) {
      setName(flag.name);
      setKey(flag.key);
      setDescription(flag.description ?? '');
      setIsEnabled(flag.isEnabled);
      setRolloutTier(flag.rolloutTier);
    } else {
      setName('');
      setKey('');
      setDescription('');
      setIsEnabled(false);
      setRolloutTier('admin');
    }
  }, [flag]);

  const save = async () => {
    if (isEdit) {
      setSaving(true);
      try {
        const res = await fetch(`/api/admin/feature-flags/${flag.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: flag.version,
            name: name.trim(),
            description: description.trim() || '',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed');
          return;
        }
        onSave();
      } catch {
        setError('Failed to update');
      } finally {
        setSaving(false);
      }
    } else {
      if (!key.trim()) {
        setError('Key is required');
        return;
      }
      setSaving(true);
      try {
        const res = await fetch('/api/admin/feature-flags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: key.trim(),
            name: name.trim() || key.trim(),
            description: description.trim() || undefined,
            isEnabled,
            rolloutTier,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed');
          return;
        }
        onSave();
      } catch {
        setError('Failed to create');
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-800 shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {isEdit ? 'Edit feature' : 'Create feature'}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Key
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g. new_checkout"
                disabled={isEdit}
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
              />
            </div>
            {!isEdit && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Enabled
                  </label>
                  <EnabledSwitch
                    checked={isEnabled}
                    onChange={setIsEnabled}
                    label="Enabled by default"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Audience
                  </label>
                  <div className="flex gap-2">
                    {ROLLOUT_TIERS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setRolloutTier(t)}
                        className={`px-3 py-1.5 rounded text-sm font-medium ${
                          rolloutTier === t
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {t === 'ga' ? 'GA' : t}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mt-6 flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
