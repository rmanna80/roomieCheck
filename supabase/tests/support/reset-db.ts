/**
 * Recreates the test database from scratch: Supabase shim + every migration, in order.
 * Usage: npm run test:db  (runs this, then the test files)
 *
 * Connection: TEST_DATABASE_URL (default: postgres://postgres@localhost:54329/postgres).
 * The test database itself is always named `homepulse_test` on that server.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { adminUrl, TEST_DB_NAME, testDbUrl } from './config';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../migrations');

async function main() {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB_NAME} with (force)`);
  await admin.query(`create database ${TEST_DB_NAME}`);
  await admin.end();

  const db = new pg.Client({ connectionString: testDbUrl() });
  await db.connect();
  // Keep the shim quiet; migrations may emit notices (e.g. pg_cron not available).
  db.on('notice', (n) => {
    if (process.env.VERBOSE) console.log(`NOTICE: ${n.message}`);
  });

  await db.query(readFileSync(path.join(here, 'supabase-shim.sql'), 'utf8'));

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await db.query(sql);
    } catch (err) {
      const e = err as { message: string; position?: string };
      let where = '';
      if (e.position) {
        const pos = Number(e.position);
        const line = sql.slice(0, pos).split('\n').length;
        where = ` (line ${line}: ${sql.split('\n')[line - 1]?.trim()})`;
      }
      console.error(`✗ ${file}: ${e.message}${where}`);
      process.exitCode = 1;
      await db.end();
      return;
    }
    console.log(`✓ ${file}`);
  }
  await db.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
