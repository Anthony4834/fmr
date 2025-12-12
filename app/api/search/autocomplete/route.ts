import { NextRequest, NextResponse } from 'next/server';
import { searchAutocomplete } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q') || '';
    const type = searchParams.get('type') as 'zip' | 'city' | 'county' | 'all' | null;

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchAutocomplete(q, type || 'all');

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Autocomplete error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch autocomplete results' },
      { status: 500 }
    );
  }
}


