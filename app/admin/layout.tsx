import { auth } from '@/lib/auth';
import { isEnabled } from '@/lib/feature-flags';
import AdminLayoutWrapper from './AdminLayoutWrapper';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = session?.user?.role === 'admin';
  const adminEnabled = await isEnabled('admin_area', session?.user ?? null);

  return (
    <AdminLayoutWrapper isAdmin={isAdmin} adminEnabled={adminEnabled}>
      {children}
    </AdminLayoutWrapper>
  );
}
