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
  return false;
}

const DIGITS_ONLY = /^\d+$/;

export async function GET(req: NextRequest): Promise<Response> {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limitParam = req.nextUrl.searchParams.get('limit');
    const bedroomParam = req.nextUrl.searchParams.get('bedroom');
    const resetParam = req.nextUrl.searchParams.get('reset');

    const args: string[] = [];
    if (limitParam != null && limitParam !== '') {
      if (!DIGITS_ONLY.test(limitParam)) {
        return NextResponse.json({ error: 'Invalid limit parameter' }, { status: 400 });
      }
      args.push('--limit', limitParam);
    }
    if (bedroomParam != null && bedroomParam !== '') {
      if (!DIGITS_ONLY.test(bedroomParam)) {
        return NextResponse.json({ error: 'Invalid bedroom parameter' }, { status: 400 });
      }
      args.push('--bedroom', bedroomParam);
    }
    if (resetParam === 'true') {
      args.push('--reset');
    }

    const { spawn } = await import('child_process');
    const proc = spawn('bun', ['scripts/rentcast-local-scraper.ts', ...args], {
      env: { ...process.env, POSTGRES_URL: process.env.POSTGRES_URL || '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout?.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr?.on('data', (c: Buffer) => errChunks.push(c));

    await new Promise<void>((resolve, reject) => {
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Process exited with code ${code}`))));
    });

    const stdout = Buffer.concat(chunks).toString('utf8');
    const stderr = Buffer.concat(errChunks).toString('utf8');

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      output: stdout,
      warnings: stderr,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[rentcast cron] Error:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
