import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 300; // 5 minutes max

function isAuthorized(req: NextRequest) {
  // Vercel Cron adds `x-vercel-cron: 1`. We accept that as an internal scheduler signal.
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

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if we're currently rate-limited
    const stateResult = await sql`
      SELECT rate_limit_resume_at, consecutive_rate_limits, total_requests_made, total_successful_scrapes
      FROM rentcast_scraping_state
      ORDER BY id LIMIT 1
    `;

    if (stateResult.rows.length > 0) {
      const state = stateResult.rows[0];
      if (state.rate_limit_resume_at) {
        const resumeAt = new Date(state.rate_limit_resume_at);
        if (resumeAt > new Date()) {
          const waitMs = resumeAt.getTime() - Date.now();
          return NextResponse.json({
            ok: false,
            message: 'Rate limit active',
            resumeAt: resumeAt.toISOString(),
            waitSeconds: Math.ceil(waitMs / 1000),
            stats: {
              totalRequests: state.total_requests_made,
              totalScrapes: state.total_successful_scrapes,
            },
          });
        }
      }
    }

    // Get batch size from query param (default 20 to fit within 5-minute timeout)
    const batchSize = parseInt(req.nextUrl.searchParams.get('limit') || '20', 10);

    // Run the scraper script
    // In Vercel's serverless environment, we process a batch each time
    // The cron runs every 15 minutes, so we process ~20-50 requests per run
    const scriptPath = 'scripts/scrape-rentcast.ts';
    
    return new Promise((resolve) => {
      const proc = spawn('bun', [scriptPath, '--limit', String(batchSize)], {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(
            NextResponse.json({
              ok: true,
              message: 'Scraper completed',
              batchSize,
              output: stdout.slice(-500), // Last 500 chars
            })
          );
        } else {
          resolve(
            NextResponse.json(
              {
                ok: false,
                message: 'Scraper failed',
                code,
                error: stderr.slice(-500),
                output: stdout.slice(-500),
              },
              { status: 500 }
            )
          );
        }
      });

      proc.on('error', (err) => {
        resolve(
          NextResponse.json(
            {
              ok: false,
              message: 'Failed to start scraper',
              error: err.message,
            },
            { status: 500 }
          )
        );
      });
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
