import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './db.js';
import { contactsRouter } from './routes.js';
import { errorHandler } from './errors.js';

// The built React app (client/dist). Present in production after `npm run build`.
const CLIENT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');

/** Builds the Express app. Kept separate from index.ts so tests can use it without a port. */
export function createApp(db: DB, { serveClient = existsSync(CLIENT_DIST) } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', contactsRouter(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);

  // In production one server hosts both: the API above, and the React app here.
  // Any other GET returns index.html so client-side routes like /contacts/42 work on refresh.
  if (serveClient) {
    app.use(express.static(CLIENT_DIST, { maxAge: '1h', index: false }));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(resolve(CLIENT_DIST, 'index.html'));
    });
  }
  return app;
}
