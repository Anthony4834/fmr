import { redirect } from 'next/navigation';

export const revalidate = 86400;

function normalizeZip(input: string): string | null {
  const z = input.trim();
  if (!/^\d{5}$/.test(z)) return null;
  return z;
}

export default async function ZipSlugPage({ params }: { params: { zip: string } }) {
  const { zip } = params;
  const z = normalizeZip(zip);
  if (!z) {
    redirect('/');
  }
  redirect(`/?q=${encodeURIComponent(z)}&type=zip`);
}

