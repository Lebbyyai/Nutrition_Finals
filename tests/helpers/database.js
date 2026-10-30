import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';
import { createApp } from '../../server/app.js';

// Run the entire API suite against real asynchronous libSQL file storage as well
// as built-in SQLite. This exercises cloud-style awaited queries without tokens.
export async function createTestApp(options = {}) {
  if (process.env.TEST_DATABASE_DRIVER !== 'libsql') return createApp(options);
  const client = createClient({ url: !options.dbPath || options.dbPath === ':memory:' ? ':memory:' : pathToFileURL(options.dbPath).href, concurrency: 1 });
  try {
    await client.execute('PRAGMA foreign_keys = ON');
    return await createApp({ ...options, databaseClient: client });
  } catch (error) { client.close(); throw error; }
}
