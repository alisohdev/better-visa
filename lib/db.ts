import { createClient, type Client, type Row } from '@libsql/client';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { jobs } from '@/lib/jobs';

const globalForDb = globalThis as typeof globalThis & { sponsorSignalDb?: Client; sponsorSignalDbReady?: Promise<void> };

function getClient() {
  if (globalForDb.sponsorSignalDb) return globalForDb.sponsorSignalDb;
  const remoteUrl = process.env.TURSO_DATABASE_URL;
  if (process.env.VERCEL && !remoteUrl) throw new Error('TURSO_DATABASE_URL is required on Vercel. Configure a Turso/libSQL SQLite database.');
  const localDir = join(process.cwd(), '.data');
  mkdirSync(localDir, { recursive: true });
  const localPath = join(localDir, 'sponsorsignal.db').replaceAll('\\', '/');
  globalForDb.sponsorSignalDb = createClient({
    url: remoteUrl || `file:${localPath}`,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return globalForDb.sponsorSignalDb;
}

export async function getDb() {
  const client = getClient();
  if (!globalForDb.sponsorSignalDbReady) {
    globalForDb.sponsorSignalDbReady = (async () => {
      await client.execute('PRAGMA foreign_keys = ON');
      await client.batch([
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`,
        `CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          company TEXT NOT NULL,
          role TEXT NOT NULL,
          location TEXT NOT NULL,
          level TEXT NOT NULL,
          salary TEXT NOT NULL,
          match_score INTEGER NOT NULL DEFAULT 0,
          tags_json TEXT NOT NULL DEFAULT '[]',
          logo TEXT NOT NULL DEFAULT '?',
          verified INTEGER NOT NULL DEFAULT 0,
          posted TEXT NOT NULL DEFAULT 'Recently',
          url TEXT NOT NULL,
          source TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS applications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          job_id TEXT NOT NULL,
          job_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved','applied','interview','offer','rejected')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, job_id)
        )`,
        `CREATE INDEX IF NOT EXISTS applications_user_created_idx ON applications(user_id, created_at DESC)`,
      ], 'write');
      await client.batch(jobs.map(job => ({
        sql: `INSERT OR IGNORE INTO jobs (id, company, role, location, level, salary, match_score, tags_json, logo, verified, posted, url, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [job.id, job.company, job.role, job.location, job.level, job.salary, job.match, JSON.stringify(job.tags), job.logo, job.verified ? 1 : 0, job.posted, job.url, job.source ?? null],
      })), 'write');
    })().catch(error => {
      globalForDb.sponsorSignalDbReady = undefined;
      throw error;
    });
  }
  await globalForDb.sponsorSignalDbReady;
  return client;
}

export function dbRow<T>(row: Row): T {
  return row as unknown as T;
}
