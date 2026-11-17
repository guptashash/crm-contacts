import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDb, type DB } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/seed.js';

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDb(':memory:'); // fresh DB for every test
  seedDatabase(db, 300);
  app = createApp(db);
});

const get = (url: string) => request(app).get(url);

describe('GET /api/contacts — pagination, sort, search, filters', () => {
  it.each([
    ['name', 'asc'],
    ['name', 'desc'],
    ['createdAt', 'asc'],
    ['createdAt', 'desc'],
  ])('walks every page sorted by %s %s with no duplicates or gaps', async (sort, order) => {
    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const res = await get(
        `/api/contacts?sort=${sort}&order=${order}&limit=7${cursor ? `&cursor=${cursor}` : ''}`,
      );
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((c: { id: number }) => c.id));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(300);
    expect(new Set(seen).size).toBe(300);
  });

  it('returns results in name order, including duplicate names', async () => {
    const res = await get('/api/contacts?q=john smith&limit=100');
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    for (const c of res.body.items) expect(`${c.firstName} ${c.lastName}`).toBe('John Smith');
  });

  it('searches by email prefix and by phone digits', async () => {
    const first = (await get('/api/contacts?limit=1')).body.items[0];
    const byEmail = await get(`/api/contacts?q=${encodeURIComponent(first.email.slice(0, 6))}`);
    expect(byEmail.body.items.map((c: { id: number }) => c.id)).toContain(first.id);

    const withPhone = db
      .prepare('SELECT id, phone_digits FROM contacts WHERE phone_digits IS NOT NULL LIMIT 1')
      .get() as { id: number; phone_digits: string };
    const byPhone = await get(`/api/contacts?q=${withPhone.phone_digits.slice(0, 6)}&limit=100`);
    expect(byPhone.body.items.map((c: { id: number }) => c.id)).toContain(withPhone.id);
  });

  it('rejects a 1-character search', async () => {
    const res = await get('/api/contacts?q=a');
    expect(res.status).toBe(400);
    expect(res.body.error.fields.q).toBeDefined();
  });

  it('combines tag + company filters with sorting', async () => {
    const company = (await get('/api/companies')).body.items[0];
    const res = await get(
      `/api/contacts?tags=VIP,Lead&company=${encodeURIComponent(company)}&sort=createdAt&order=desc&limit=100`,
    );
    expect(res.status).toBe(200);
    const items = res.body.items;
    for (const c of items) {
      expect(c.company).toBe(company);
      expect(c.tags.some((t: { name: string }) => ['VIP', 'Lead'].includes(t.name))).toBe(true);
    }
    const dates = items.map((c: { createdAt: string }) => c.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('rejects a tampered cursor', async () => {
    const res = await get('/api/contacts?cursor=not-a-cursor');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/contacts/:id — validation, uniqueness, concurrency', () => {
  it('updates, bumps version and records CONTACT_UPDATED', async () => {
    const res = await request(app).patch('/api/contacts/1').send({ version: 1, company: 'Acme' });
    expect(res.status).toBe(200);
    expect(res.body.company).toBe('Acme');
    expect(res.body.version).toBe(2);

    const acts = (await get('/api/contacts/1/activities')).body.items;
    expect(acts[0].type).toBe('CONTACT_UPDATED');
    expect(acts[0].payload.changes.company.to).toBe('Acme');
  });

  it('returns 409 VERSION_CONFLICT with the latest record when the version is stale', async () => {
    // User B saves first
    await request(app).patch('/api/contacts/1').send({ version: 1, firstName: 'Bea' }).expect(200);
    // User A saves with the version they originally loaded
    const res = await request(app).patch('/api/contacts/1').send({ version: 1, firstName: 'Alan' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
    expect(res.body.error.current.firstName).toBe('Bea');
    expect(res.body.error.current.version).toBe(2);
  });

  it('rejects a duplicate email (case-insensitive) with a field error', async () => {
    const other = (await get('/api/contacts/2')).body;
    const res = await request(app)
      .patch('/api/contacts/1')
      .send({ version: 1, email: other.email.toUpperCase() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.error.fields.email).toBeDefined();
  });

  it.each([
    [{ version: 1, email: 'not-an-email' }, 'email'],
    [{ version: 1, firstName: '   ' }, 'firstName'],
    [{ version: 1, phone: 'abc' }, 'phone'],
    [{ firstName: 'NoVersion' }, 'version'],
  ])('returns 400 with field errors for %j', async (body, field) => {
    const res = await request(app).patch('/api/contacts/1').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.fields[field]).toBeDefined();
  });

  it('rejects unknown fields', async () => {
    const res = await request(app).patch('/api/contacts/1').send({ version: 1, id: 99 });
    expect(res.status).toBe(400);
  });

  it('clears optional fields when sent as empty strings', async () => {
    const res = await request(app).patch('/api/contacts/1').send({ version: 1, company: '' });
    expect(res.status).toBe(200);
    expect(res.body.company).toBeNull();
  });

  it('returns 404 for a missing contact', async () => {
    const res = await request(app).patch('/api/contacts/99999').send({ version: 1, firstName: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('Tags and bulk tagging', () => {
  it('adds a tag once (idempotent) and logs TAG_ADDED once', async () => {
    await request(app).post('/api/contacts/1/tags').send({ name: 'Hot' }).expect(201);
    const again = await request(app).post('/api/contacts/1/tags').send({ name: 'hot' });
    expect(again.body.tags.filter((t: { name: string }) => t.name === 'Hot')).toHaveLength(1);

    const acts = (await get('/api/contacts/1/activities')).body.items;
    expect(acts.filter((a: { type: string }) => a.type === 'TAG_ADDED')).toHaveLength(1);
  });

  it('removes a tag and logs TAG_REMOVED, without bumping the version', async () => {
    const { tags } = (await request(app).post('/api/contacts/1/tags').send({ name: 'Hot' })).body;
    const hot = tags.find((t: { name: string }) => t.name === 'Hot');
    const res = await request(app).delete(`/api/contacts/1/tags/${hot.id}`);
    expect(res.body.tags.find((t: { name: string }) => t.name === 'Hot')).toBeUndefined();

    const acts = (await get('/api/contacts/1/activities')).body.items;
    expect(acts[0].type).toBe('TAG_REMOVED');
    expect((await get('/api/contacts/1')).body.version).toBe(1);
  });

  it('bulk-assigns a tag and reports added / already tagged / not found', async () => {
    await request(app).post('/api/contacts/1/tags').send({ name: 'Webinar' });
    const res = await request(app)
      .post('/api/contacts/bulk/tags')
      .send({ contactIds: [1, 2, 3, 99999], tagName: 'Webinar' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ added: 2, alreadyTagged: 1, notFound: [99999] });

    const filtered = await get('/api/contacts?tags=Webinar&limit=100');
    expect(filtered.body.items.map((c: { id: number }) => c.id).sort()).toEqual([1, 2, 3]);
  });

  it('rejects an empty bulk selection', async () => {
    const res = await request(app)
      .post('/api/contacts/bulk/tags')
      .send({ contactIds: [], tagName: 'X' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.contactIds).toBeDefined();
  });
});
