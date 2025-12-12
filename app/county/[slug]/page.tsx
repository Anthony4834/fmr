import { redirect } from 'next/navigation';
import { resolveCountySlugToQuery } from '@/lib/seo-slugs';

export const revalidate = 86400;

export default async function CountySlugPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const q = await resolveCountySlugToQuery(slug);
  if (!q) {
    redirect('/');
  }
  redirect(`/?q=${encodeURIComponent(q)}&type=county`);
}

