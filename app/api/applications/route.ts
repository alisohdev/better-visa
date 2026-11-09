import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDb } from '@/lib/db';

const statuses = ['saved', 'applied', 'interview', 'offer', 'rejected'] as const;
type AppRow = { id: string; job_id: string; job_json: string; status: string; created_at: string; updated_at: string };
const serialize = (row: AppRow) => ({ id: row.id, job_id: row.job_id, job: JSON.parse(row.job_json), status: row.status, created_at: row.created_at, updated_at: row.updated_at });

async function readJson(request: Request) {
  try { return await request.json() as Record<string, unknown>; }
  catch { return null; }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in to manage saved applications.' }, { status: 401 });
  const db = await getDb();
  const { rows } = await db.execute({
    sql: 'SELECT id, job_id, job_json, status, created_at, updated_at FROM applications WHERE user_id = ? ORDER BY created_at DESC',
    args: [user.id],
  });
  return NextResponse.json({ applications: rows.map(row => serialize(row as unknown as AppRow)), mode: 'sqlite' });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in to save roles.' }, { status: 401 });
  const body = await readJson(request);
  if (!body || typeof body.job_id !== 'string' || !body.job_id.trim() || body.job_id.length > 255 || !body.job || typeof body.job !== 'object' || Array.isArray(body.job)) {
    return NextResponse.json({ error: 'A valid job_id and job object are required.' }, { status: 400 });
  }
  const job = body.job as Record<string, unknown>;
  if (typeof job.url !== 'string') return NextResponse.json({ error: 'A valid job URL is required.' }, { status: 400 });
  let url: URL;
  try { url = new URL(job.url); } catch { return NextResponse.json({ error: 'A valid job URL is required.' }, { status: 400 }); }
  if (url.protocol !== 'https:') return NextResponse.json({ error: 'Job links must use HTTPS.' }, { status: 400 });

  const db = await getDb();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO applications (id, user_id, job_id, job_json, status)
      VALUES (?, ?, ?, ?, 'saved')
      ON CONFLICT(user_id, job_id) DO UPDATE SET job_json = excluded.job_json, updated_at = CURRENT_TIMESTAMP`,
    args: [id, user.id, body.job_id.trim(), JSON.stringify(job)],
  });
  const result = await db.execute({
    sql: 'SELECT id, job_id, job_json, status, created_at, updated_at FROM applications WHERE user_id = ? AND job_id = ?',
    args: [user.id, body.job_id.trim()],
  });
  return NextResponse.json({ application: serialize(result.rows[0] as unknown as AppRow) });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in to manage saved applications.' }, { status: 401 });
  const body = await readJson(request);
  if (!body || typeof body.id !== 'string' || !statuses.includes(body.status as typeof statuses[number])) {
    return NextResponse.json({ error: 'A valid id and status are required.' }, { status: 400 });
  }
  const db = await getDb();
  await db.execute({
    sql: 'UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    args: [body.status as string, body.id, user.id],
  });
  const result = await db.execute({
    sql: 'SELECT id, job_id, job_json, status, created_at, updated_at FROM applications WHERE id = ? AND user_id = ?',
    args: [body.id, user.id],
  });
  if (!result.rows[0]) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  return NextResponse.json({ application: serialize(result.rows[0] as unknown as AppRow) });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in to manage saved applications.' }, { status: 401 });
  const body = await readJson(request);
  if (!body || typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  const db = await getDb();
  await db.execute({ sql: 'DELETE FROM applications WHERE id = ? AND user_id = ?', args: [body.id, user.id] });
  return NextResponse.json({ ok: true });
}
