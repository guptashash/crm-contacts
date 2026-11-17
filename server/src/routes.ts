import { Router } from 'express';
import { z } from 'zod';
import type { DB } from './db.js';
import * as repo from './repo/contacts.js';
import {
  addTagSchema,
  bulkTagSchema,
  idParam,
  listQuerySchema,
  updateContactSchema,
} from './schemas.js';

/**
 * Thin HTTP layer: validate input with Zod, call the repo, send JSON.
 * Thrown errors (ZodError, AppError) are handled by errorHandler in errors.ts.
 */
export function contactsRouter(db: DB) {
  const r = Router();

  // List with search, filters, sort and cursor pagination
  r.get('/contacts', (req, res) => {
    const query = listQuerySchema.parse(req.query);
    res.json(repo.listContacts(db, query));
  });

  // Bulk tag assignment (declared before /contacts/:id routes)
  r.post('/contacts/bulk/tags', (req, res) => {
    const body = bulkTagSchema.parse(req.body);
    res.json(repo.bulkAddTag(db, body.contactIds, body.tagName));
  });

  r.get('/contacts/:id', (req, res) => {
    res.json(repo.getContact(db, idParam.parse(req.params.id)));
  });

  // Partial update; body must include the `version` the client loaded
  r.patch('/contacts/:id', (req, res) => {
    const id = idParam.parse(req.params.id);
    const body = updateContactSchema.parse(req.body);
    res.json(repo.updateContact(db, id, body));
  });

  r.post('/contacts/:id/tags', (req, res) => {
    const id = idParam.parse(req.params.id);
    const { name } = addTagSchema.parse(req.body);
    res.status(201).json({ tags: repo.addTag(db, id, name) });
  });

  r.delete('/contacts/:id/tags/:tagId', (req, res) => {
    const id = idParam.parse(req.params.id);
    const tagId = idParam.parse(req.params.tagId);
    res.json({ tags: repo.removeTag(db, id, tagId) });
  });

  r.get('/contacts/:id/activities', (req, res) => {
    const id = idParam.parse(req.params.id);
    const limit = z.coerce.number().int().min(1).max(100).default(20).parse(req.query.limit);
    res.json({ items: repo.listActivities(db, id, limit) });
  });

  r.get('/tags', (_req, res) => {
    res.json({ items: repo.listTags(db) });
  });

  r.get('/companies', (_req, res) => {
    res.json({ items: repo.listCompanies(db) });
  });

  return r;
}
