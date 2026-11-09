import { NextResponse } from 'next/server';
import { createSession, hashPassword, isValidPassword, newUserId, normalizeEmail, SESSION_COOKIE } from '@/lib/auth';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const email = normalizeEmail(body.email);
  if (!email || !isValidPassword(body.password)) return NextResponse.json({ error: 'Enter a valid email and a password with at least 8 characters.' }, { status: 400 });
  const db = await getDb();
  const userId = newUserId();
  try {
    await db.execute({ sql: 'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)', args: [userId, email, await hashPassword(body.password)] });
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    return NextResponse.json({ error: 'Could not create your account.' }, { status: 500 });
  }
  const session = await createSession(userId);
  const response = NextResponse.json({ user: { id: userId, email } }, { status: 201 });
  response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', expires: new Date(session.expiresAt) });
  return response;
}
