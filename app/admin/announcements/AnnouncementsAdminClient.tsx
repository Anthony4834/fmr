'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AnnouncementCard from '@/app/components/AnnouncementCard';

interface Announcement {
  id: string;
  title: string;
  bodyMarkdown: string;
  publishedAt: string;
  isPublished: boolean;
  audience: string;
  sticky?: boolean;
  ttlMinutes?: number | null;
  exclusive?: boolean;
  createdAt: string;
  updatedAt: string;
  readCount?: number;
}

interface ReaderRow {
  userId?: string;
  guestId?: string;
  readAt: string;
  email?: string;
  name?: string;
}

interface Props {
  initialAnnouncements: Announcement[];
}

export default function AnnouncementsAdminClient({
  initialAnnouncements,
}: Props) {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState(initialAnnouncements);

  useEffect(() => {
    setAnnouncements(initialAnnouncements);
  }, [initialAnnouncements]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewAnnouncement, setPreviewAnnouncement] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const nowLocalDatetime = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  };

  const [form, setForm] = useState({
    title: '',
    bodyMarkdown: '',
    audience: 'all',
    publishedAt: nowLocalDatetime(),
    sticky: false,
    ttlMinutes: '' as string | number,
    exclusive: false,
  });
  const [showPreviewInModal, setShowPreviewInModal] = useState(false);
  const [readersAnnouncementId, setReadersAnnouncementId] = useState<string | null>(null);
  const [readers, setReaders] = useState<ReaderRow[]>([]);
  const [readersLoading, setReadersLoading] = useState(false);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const toLocalDatetimeLocal = (iso: string): string => {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  };

  const resetForm = () => {
    setForm({
      title: '',
      bodyMarkdown: '',
      audience: 'all',
      publishedAt: nowLocalDatetime(),
      sticky: false,
      ttlMinutes: '',
      exclusive: false,
    });
    setEditingId(null);
    setShowCreateModal(false);
    setShowPreviewInModal(false);
  };

  const openEdit = (a: Announcement) => {
    setForm({
      title: a.title,
      bodyMarkdown: a.bodyMarkdown,
      audience: a.audience || 'all',
      publishedAt: toLocalDatetimeLocal(a.publishedAt),
      sticky: a.sticky ?? false,
      ttlMinutes: a.ttlMinutes != null ? a.ttlMinutes : '',
      exclusive: a.exclusive ?? false,
    });
    setEditingId(a.id);
  };

  const openReaders = async (id: string) => {
    setReadersAnnouncementId(id);
    setReaders([]);
    setReadersLoading(true);
    try {
      const res = await fetch(`/api/admin/announcements/${id}/readers`);
      const data = await res.json();
      if (res.ok) setReaders(data.readers ?? []);
      else alert(data.error || 'Failed to load readers');
    } catch {
      alert('Failed to load readers');
    } finally {
      setReadersLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          bodyMarkdown: form.bodyMarkdown,
          audience: form.audience,
          published_at: form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined,
          sticky: form.sticky,
          ttlMinutes: form.ttlMinutes === '' ? null : (typeof form.ttlMinutes === 'number' ? form.ttlMinutes : parseInt(String(form.ttlMinutes), 10)),
          exclusive: form.exclusive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to create');
        return;
      }
      resetForm();
      router.refresh();
    } catch {
      alert('Failed to create');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(editingId);
    try {
      const res = await fetch(`/api/admin/announcements/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          bodyMarkdown: form.bodyMarkdown,
          audience: form.audience,
          published_at: form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined,
          sticky: form.sticky,
          ttlMinutes: form.ttlMinutes === '' ? null : (typeof form.ttlMinutes === 'number' ? form.ttlMinutes : parseInt(String(form.ttlMinutes), 10)),
          exclusive: form.exclusive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to update');
        return;
      }
      resetForm();
      router.refresh();
    } catch {
      alert('Failed to update');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to delete');
        return;
      }
      resetForm();
      setPreviewAnnouncement(null);
      router.refresh();
    } catch {
      alert('Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Delete all ${announcements.length} announcement(s)? This cannot be undone.`)) return;
    setDeletingAll(true);
    try {
      const res = await fetch('/api/admin/announcements', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to delete all');
        return;
      }
      resetForm();
      setPreviewAnnouncement(null);
      router.refresh();
    } catch {
      alert('Failed to delete all');
    } finally {
      setDeletingAll(false);
    }
  };

  const renderFormModal = (title: string, onSubmit: (e: React.FormEvent) => void, submitLabel: string, loading: boolean) => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && resetForm()}
    >
      <div className="relative w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              placeholder="Announcement title"
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Body (Markdown)
            </label>
            <textarea
              value={form.bodyMarkdown}
              onChange={(e) => setForm((f) => ({ ...f, bodyMarkdown: e.target.value }))}
              rows={8}
              placeholder="Write your announcement in Markdown..."
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Audience
            </label>
            <select
              value={form.audience}
              onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All</option>
              <option value="logged_in">Logged in only</option>
              <option value="guests">Guests only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Published at
            </label>
            <input
              type="datetime-local"
              value={form.publishedAt}
              onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.sticky}
                onChange={(e) => setForm((f) => ({ ...f, sticky: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Sticky (show until disabled, then respect TTL)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.exclusive}
                onChange={(e) => setForm((f) => ({ ...f, exclusive: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Exclusive (only users/guests created before publish)</span>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              TTL (minutes, optional)
            </label>
            <input
              type="number"
              min={1}
              placeholder="Leave empty for no expiry"
              value={form.ttlMinutes}
              onChange={(e) => setForm((f) => ({ ...f, ttlMinutes: e.target.value }))}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Max time in minutes the announcement is shown (when not sticky).</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setShowPreviewInModal((v) => !v)}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              {showPreviewInModal ? 'Hide preview' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
            >
              {loading ? 'Saving...' : submitLabel}
            </button>
          </div>
          {showPreviewInModal && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Preview (as it will appear on the announcements page)</p>
              <AnnouncementCard
                title={form.title || 'Untitled'}
                body={form.bodyMarkdown || '_No content yet._'}
                publishedAt={form.publishedAt ? new Date(form.publishedAt).toISOString() : new Date().toISOString()}
              />
            </div>
          )}
        </form>
      </div>
    </div>
  );

  const PreviewModal = () => {
    if (!previewAnnouncement) return null;
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
        onClick={() => setPreviewAnnouncement(null)}
      >
        <div
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-800 shadow-xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Preview
            </h2>
            <button
              type="button"
              onClick={() => setPreviewAnnouncement(null)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl leading-none"
            >
              ×
            </button>
          </div>
          <AnnouncementCard
            title={previewAnnouncement.title}
            body={previewAnnouncement.bodyMarkdown}
            publishedAt={previewAnnouncement.publishedAt}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Announcements
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Manage change notes and announcements
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setForm({ title: '', bodyMarkdown: '', audience: 'all', publishedAt: nowLocalDatetime(), sticky: false, ttlMinutes: '', exclusive: false });
              setShowCreateModal(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
          >
            Add announcement
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={announcements.length === 0 || deletingAll || saving !== null || deleting !== null}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
          >
            {deletingAll ? 'Deleting all…' : 'Delete all'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3 whitespace-nowrap">Published</th>
              <th className="px-4 py-3 whitespace-nowrap">Views</th>
              <th className="px-4 py-3 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {announcements.map((a) => (
              <tr key={a.id} className="text-sm">
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900 dark:text-white block truncate max-w-[300px]">
                    {a.title}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  {formatDate(a.publishedAt)}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  {a.readCount ?? 0}
                </td>
                <td className="px-4 py-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => openReaders(a.id)}
                    className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-medium rounded transition-colors"
                  >
                    Readers
                  </button>
                  <button
                    onClick={() => setPreviewAnnouncement(a)}
                    className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-medium rounded transition-colors"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => openEdit(a)}
                    disabled={saving !== null || deleting !== null}
                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(a.id, a.title)}
                    disabled={deleting === a.id || saving !== null}
                    className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium rounded transition-colors disabled:opacity-50"
                  >
                    {deleting === a.id ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {announcements.length === 0 && (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          No announcements yet.
        </p>
      )}

      {showCreateModal && renderFormModal('Add announcement', handleCreate, 'Create', creating)}

      {editingId && renderFormModal('Edit announcement', handleUpdate, 'Save', saving === editingId)}

      <PreviewModal />

      {readersAnnouncementId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onClick={() => setReadersAnnouncementId(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-xl p-6 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Readers
              </h2>
              <button
                type="button"
                onClick={() => setReadersAnnouncementId(null)}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            {readersLoading ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
            ) : readers.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No readers yet.</p>
            ) : (
              <ul className="space-y-2 overflow-y-auto flex-1 min-h-0">
                {readers.map((r, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex flex-wrap gap-x-2 gap-y-0 items-baseline">
                    {r.userId ? (
                      <span className="font-medium">{r.name ?? r.email ?? r.userId}</span>
                    ) : (
                      <span className="font-mono text-xs">Guest {r.guestId?.slice(0, 8)}…</span>
                    )}
                    <span className="text-gray-500 dark:text-gray-400 text-xs">
                      {formatDate(r.readAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
