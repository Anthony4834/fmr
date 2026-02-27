import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import AnnouncementsAdminClient from './AnnouncementsAdminClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Announcements | Admin | fmr.fyi',
  description: 'Manage announcements',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AnnouncementsAdminPage() {
  const session = await auth();
  if (!session || !session.user || session.user.role !== 'admin') {
    redirect('/');
  }

  const rows = await query<{
    id: string;
    title: string;
    body_markdown: string;
    published_at: string;
    is_published: boolean;
    audience: string;
    sticky: boolean;
    ttl_minutes: number | null;
    exclusive: boolean;
    created_at: string;
    updated_at: string;
    read_count: string;
  }>(
    `SELECT a.id, a.title, a.body_markdown, a.published_at, a.is_published, a.audience,
            a.sticky, a.ttl_minutes, a.exclusive, a.created_at, a.updated_at,
            (SELECT COUNT(*)::int FROM announcement_reads ar WHERE ar.announcement_id = a.id) AS read_count
     FROM announcements a
     ORDER BY a.published_at DESC`
  );

  const announcements = rows.map((r) => ({
    id: r.id,
    title: r.title,
    bodyMarkdown: r.body_markdown,
    publishedAt: r.published_at,
    isPublished: r.is_published,
    audience: r.audience,
    sticky: r.sticky,
    ttlMinutes: r.ttl_minutes,
    exclusive: r.exclusive,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    readCount: Number(r.read_count),
  }));

  return (
    <AnnouncementsAdminClient initialAnnouncements={announcements} />
  );
}
