import { NextResponse } from 'next/server';
import { destroyCurrentSession, SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  await destroyCurrentSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return response;
}
