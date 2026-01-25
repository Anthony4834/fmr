import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import AdminLayoutWrapper from './AdminLayoutWrapper';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';

  // The promote page is public (uses secret for auth)
  // Other admin pages will check auth individually
  // The wrapper will hide nav for promote page and non-admins
  
  return <AdminLayoutWrapper isAdmin={isAdmin}>{children}</AdminLayoutWrapper>;
}
