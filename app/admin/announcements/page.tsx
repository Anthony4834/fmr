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
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, title, body_markdown, published_at, is_published, audience, created_at, updated_at
     FROM announcements
     ORDER BY published_at DESC`
  );

  const announcements = rows.map((r) => ({
    id: r.id,
    title: r.title,
    bodyMarkdown: r.body_markdown,
    publishedAt: r.published_at,
    isPublished: r.is_published,
    audience: r.audience,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return (
    <AnnouncementsAdminClient initialAnnouncements={announcements} />
  );
}
