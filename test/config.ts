import { buildConfig, getPayload } from 'payload';
import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { randomUUID } from 'node:crypto';
import { collections, plugins } from '../collections';

/**
 * Initialise a Payload instance against a throwaway SQLite database so the
 * tests run locally WITHOUT a Supabase connection string. Each call gets a
 * unique filename so multiple test files can run in parallel without clashing
 * (files are gitignored via `test-payload.db*`).
 */
export async function initTestPayload() {
  const dbFile = `test-payload-${randomUUID()}.db`;

  const config = await buildConfig({
    secret: 'test-secret',
    collections,
    admin: { user: 'users' },
    db: sqliteAdapter({ client: { url: `file:./${dbFile}` } }),
    plugins,
  });

  return getPayload({ config });
}
