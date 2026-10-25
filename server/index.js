import { existsSync } from 'node:fs';
import { createApp } from './app.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const app = await createApp();
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Savor Care is ready at http://localhost:${port}`);
});
function shutdown() {
  server.close(() => { app.locals.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
