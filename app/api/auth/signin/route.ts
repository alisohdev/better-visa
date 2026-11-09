import { NextResponse } from 'next/server';
import { createSession, normalizeEmail, SESSION_COOKIE, verifyPassword } from '@/lib/auth';
import { dbRow, getDb } from '@/lib/db';

type Account = { id: string; email: string; password_hash: string };

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  if (!email || typeof body.password !== 'string' || body.password.length > 128) return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
  const db = await getDb();
  const result = await db.execute({ sql: 'SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1', args: [email] });
  const account = result.rows[0] ? dbRow<Account>(result.rows[0]) : null;
  if (!account || !(await verifyPassword(body.password, account.password_hash))) return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 401 });
  const session = await createSession(account.id);
  const response = NextResponse.json({ user: { id: account.id, email: account.email } });
  response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: new Date(session.expiresAt) });
  return response;
}
