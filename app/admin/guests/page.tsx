import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import GuestsAdminClient from './GuestsAdminClient';

export const metadata: Metadata = {
  title: 'Guest Management | Admin | fmr.fyi',
  description: 'View and manage guest users and conversions',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function GuestsAdminPage({
  searchParams,
}: {
  searchParams: { 
    page?: string; 
    search?: string;
    limit_hit?: string;
    converted?: string;
  };
}) {
  // Require admin access
  const session = await auth();
  if (!session || !session.user || session.user.role !== 'admin') {
    redirect('/');
  }

  const page = parseInt(searchParams.page || '1', 10);
  const search = searchParams.search || '';
  const limitHit = searchParams.limit_hit || '';
  const converted = searchParams.converted || '';

  return (
    <GuestsAdminClient
      initialPage={page}
      initialSearch={search}
      initialLimitHit={limitHit}
      initialConverted={converted}
    />
  );
}
