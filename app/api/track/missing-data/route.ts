import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

type MissingField =
  | 'property_tax_rate'
  | 'mortgage_rate'
  | 'fmr_data'
  | 'fmr_bedroom'
  | 'price'
  | 'bedrooms'
  | 'address'
  | 'zip_code';

const VALID_FIELDS = new Set<MissingField>([
  'property_tax_rate',
  'mortgage_rate',
  'fmr_data',
  'fmr_bedroom',
  'price',
  'bedrooms',
  'address',
  'zip_code',
]);

function validateMissingFields(input: unknown): MissingField[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const fields: MissingField[] = [];
  for (const field of input) {
    if (typeof field === 'string' && VALID_FIELDS.has(field as MissingField)) {
      fields.push(field as MissingField);
    }
  }
  return fields.length > 0 ? fields : null;
}

function sanitizeString(input: unknown, maxLen: number): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  return s ? s.slice(0, maxLen) : null;
}

function sanitizeNumber(input: unknown): number | null {
  if (typeof input === 'number' && isFinite(input)) return input;
  if (typeof input === 'string') {
    const n = parseFloat(input);
    if (isFinite(n)) return n;
  }
  return null;
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS missing_data_events (
      id SERIAL PRIMARY KEY,
      zip_code VARCHAR(10),
      address TEXT,
      bedrooms INTEGER,
      price NUMERIC(14, 2),
      missing_fields TEXT[] NOT NULL,
      source VARCHAR(50),
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_missing_data_zip ON missing_data_events(zip_code);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_missing_data_created ON missing_data_events(created_at DESC);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_missing_data_fields ON missing_data_events USING gin(missing_fields);`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const missingFields = validateMissingFields(body.missingFields);
    if (!missingFields) {
      return NextResponse.json({ ok: false, error: 'missingFields required' }, { status: 400 });
    }

    const zipCode = sanitizeString(body.zipCode, 10);
    const address = sanitizeString(body.address, 500);
    const bedrooms = sanitizeNumber(body.bedrooms);
    const price = sanitizeNumber(body.price);
    const source = sanitizeString(body.source, 50) || 'chrome-extension';
    const userAgent = request.headers.get('user-agent')?.slice(0, 500) || null;

    await ensureTable();
    await sql`
      INSERT INTO missing_data_events (zip_code, address, bedrooms, price, missing_fields, source, user_agent)
      VALUES (${zipCode}, ${address}, ${bedrooms}, ${price}, ${missingFields}, ${source}, ${userAgent})
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Never fail the client because tracking failed.
    console.error('Missing data tracking error:', error);
    return NextResponse.json({ ok: true });
  }
}
