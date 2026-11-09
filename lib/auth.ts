import { cookies } from 'next/headers';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { dbRow, getDb } from '@/lib/db';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'sponsorsignal_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export type AppUser = { id: string; email: string };
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltHex, hashHex] = encoded.split(':');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createSession(userId: string) {
  const db = await getDb();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_MS;
  await db.execute({
    sql: 'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    args: [hashToken(token), userId, expiresAt],
  });
  await db.execute({ sql: 'DELETE FROM sessions WHERE expires_at <= ?', args: [Date.now()] });
  return { token, expiresAt };
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ? LIMIT 1`,
    args: [hashToken(token), Date.now()],
  });
  return result.rows[0] ? dbRow<AppUser>(result.rows[0]) : null;
}

export async function destroyCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;
  const db = await getDb();
  await db.execute({ sql: 'DELETE FROM sessions WHERE token_hash = ?', args: [hashToken(token)] });
}

export function newUserId() { return randomUUID(); }
export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}
