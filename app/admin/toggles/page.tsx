import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getAllForAdmin } from '@/lib/feature-flags';
import FeatureFlagsAdminClient from './FeatureFlagsAdminClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Feature Flags | Admin | fmr.fyi',
  robots: { index: false, follow: false },
};

export default async function FeatureFlagsAdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    redirect('/');
  }

  const flags = await getAllForAdmin();

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Feature Flags
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Add, edit, or archive flags. Tier: off | admin | users | ga
        </p>
      </div>
      <FeatureFlagsAdminClient initialFlags={flags} />
    </div>
  );
}
