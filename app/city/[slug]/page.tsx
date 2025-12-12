import { redirect } from 'next/navigation';
import { resolveCitySlugToQuery } from '@/lib/seo-slugs';

export const revalidate = 86400;

export default async function CitySlugPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const q = await resolveCitySlugToQuery(slug);
  if (!q) {
    redirect('/');
  }
  redirect(`/?q=${encodeURIComponent(q)}&type=city`);
}

