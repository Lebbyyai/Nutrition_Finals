import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Both drivers expose the same asynchronous operations to the application.
// Cloud mode never keeps a local replica or silently falls back to disk.
export async function openDatabase({ env = process.env, dbPath, client } = {}) {
  const url = env.TURSO_DATABASE_URL?.trim();
  const authToken = env.TURSO_AUTH_TOKEN?.trim();
  const driver = env.DATABASE_DRIVER || (url || authToken ? 'turso' : 'sqlite');
  if (!['sqlite', 'turso'].includes(driver)) throw new Error('DATABASE_DRIVER must be sqlite or turso.');
  if (driver === 'sqlite' && (url || authToken)) throw new Error('Remove Turso credentials or set DATABASE_DRIVER=turso.');
  if (driver === 'turso') {
    if (!url || !authToken) throw new Error('Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to use Turso.');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('TURSO_DATABASE_URL must be a valid Turso database URL.'); }
    if (!['libsql:', 'turso:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Use the libsql://, turso://, or HTTPS database URL supplied by Turso.');
    }
    const { createClient } = parsed.protocol === 'turso:'
      ? await import('@tursodatabase/serverless/compat')
      : await import('@libsql/client/http');
    client = createClient({ url, authToken });
  }
  if (client) return wrapClient(client);

  if (!dbPath) throw new Error('A local database path is required when Turso is not configured.');
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const raw = new DatabaseSync(dbPath);
  return {
    kind: 'sqlite', raw,
    prepare: sql => raw.prepare(sql),
    exec: sql => raw.exec(sql),
    async batch(statements) {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(({ sql, args = [] }) => raw.prepare(sql).run(...args));
        raw.exec('COMMIT');
        return results;
      } catch (error) { raw.exec('ROLLBACK'); throw error; }
    },
    close: () => raw.close(),
  };
}

export function wrapClient(client) {
  // The newer SDK returns arrays with non-enumerable named properties. Build
  // objects from column metadata instead of dropping those fields in JSON.
  const plainRow = (row, columns) => row ? Object.fromEntries(columns.map((column, index) => [column, row[index] === undefined ? row[column] : row[index]])) : undefined;
  const adapter = {
    kind: 'turso',
    prepare(sql) {
      return {
        async get(...args) { const result = await client.execute({ sql, args }); return plainRow(result.rows[0], result.columns); },
        async all(...args) { const result = await client.execute({ sql, args }); return result.rows.map(row => plainRow(row, result.columns)); },
        async run(...args) { const result = await client.execute({ sql, args }); return { changes: result.rowsAffected }; },
      };
    },
    exec: sql => client.executeMultiple(sql),
    batch: statements => client.batch(statements, 'write'),
    close: () => client.close(),
  };
  adapter.raw = adapter;
  return adapter;
}
