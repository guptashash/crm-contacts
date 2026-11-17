import express from 'express';
import cors from 'cors';
import type { DB } from './db.js';
import { contactsRouter } from './routes.js';
import { errorHandler } from './errors.js';

/** Builds the Express app. Kept separate from index.ts so tests can use it without a port. */
export function createApp(db: DB) {
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
  return app;
}
