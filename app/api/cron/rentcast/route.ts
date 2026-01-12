import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 300; // 5 minutes

function isAuthorized(req: NextRequest): boolean {
  const vercelCron = req.headers.get('x-vercel-cron');
  if (vercelCron === '1') return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() === secret;
  }

  const q = req.nextUrl.searchParams.get('secret');
  return q === secret;
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get optional parameters
    const limitParam = req.nextUrl.searchParams.get('limit');
    const bedroomParam = req.nextUrl.searchParams.get('bedroom');
    const resetParam = req.nextUrl.searchParams.get('reset');

    // Build command arguments
    const args: string[] = [];
    if (limitParam) {
      args.push('--limit', limitParam);
    }
    if (bedroomParam) {
      args.push('--bedroom', bedroomParam);
    }
    if (resetParam === 'true') {
      args.push('--reset');
    }

    // Use dynamic import for child_process (Node.js built-in)
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const command = `bun scripts/rentcast-local-scraper.ts ${args.join(' ')}`;
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, POSTGRES_URL: process.env.POSTGRES_URL },
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      output: stdout,
      warnings: stderr,
    });
  } catch (e: any) {
    console.error('[rentcast cron] Error:', e);
    return NextResponse.json(
      { 
        error: String(e?.message || e),
        stderr: e?.stderr,
        stdout: e?.stdout,
      }, 
      { status: 500 }
    );
  }
}
