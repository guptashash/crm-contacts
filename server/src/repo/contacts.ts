import type { DB } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { decodeCursor, encodeCursor } from '../cursor.js';
import type { ListQuery, UpdateContactInput } from '../schemas.js';

// ---------- Types returned by the API (camelCase) ----------

export type Tag = { id: number; name: string };

export type Contact = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: Tag[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ActivityType = 'CONTACT_UPDATED' | 'TAG_ADDED' | 'TAG_REMOVED';

type ContactRow = {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

const EDITABLE = ['firstName', 'lastName', 'email', 'phone', 'company'] as const;
type EditableField = (typeof EDITABLE)[number];

const now = () => new Date().toISOString();

// ---------- Helpers ----------

/** Values derived from the editable fields; kept in sync on every write. */
export function derivedColumns(c: {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
}) {
  return {
    email_norm: c.email ? c.email.trim().toLowerCase() : null,
    name_sort: `${c.firstName} ${c.lastName}`.trim().toLowerCase(),
    last_name_lc: c.lastName.trim().toLowerCase(),
    phone_digits: c.phone ? c.phone.replace(/\D/g, '') : null,
    company_lc: c.company ? c.company.trim().toLowerCase() : null,
  };
}

/** Escapes LIKE wildcards so a search for "50%" doesn't match everything. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

function toContact(row: ContactRow, tags: Tag[]): Contact {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    tags,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Loads tags for many contacts in ONE query (avoids an N+1 query per row). */
function tagsFor(db: DB, contactIds: number[]): Map<number, Tag[]> {
  const map = new Map<number, Tag[]>(contactIds.map((id) => [id, []]));
  if (contactIds.length === 0) return map;
  const rows = db
    .prepare(
      `SELECT ct.contact_id AS contactId, t.id, t.name
         FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
        WHERE ct.contact_id IN (${contactIds.map(() => '?').join(',')})
        ORDER BY t.name`,
    )
    .all(...contactIds) as { contactId: number; id: number; name: string }[];
  for (const r of rows) map.get(r.contactId)!.push({ id: r.id, name: r.name });
  return map;
}

function getRow(db: DB, id: number): ContactRow | undefined {
  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as ContactRow | undefined;
}

function logActivity(db: DB, contactId: number, type: ActivityType, payload: unknown) {
  db.prepare(
    'INSERT INTO activities (contact_id, type, payload, created_at) VALUES (?, ?, ?, ?)',
  ).run(contactId, type, JSON.stringify(payload), now());
}

// ---------- Queries ----------

export function getContact(db: DB, id: number): Contact {
  const row = getRow(db, id);
  if (!row) throw notFound('Contact');
  return toContact(row, tagsFor(db, [id]).get(id)!);
}

/**
 * Search + filter + sort + keyset (cursor) pagination, all in SQL.
 * Keyset pagination stays fast on deep pages, unlike OFFSET which scans skipped rows.
 */
export function listContacts(db: DB, q: ListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.q) {
    const term = escapeLike(q.q.toLowerCase()) + '%';
    const or = [
      `c.name_sort LIKE ? ESCAPE '\\'`,
      `c.last_name_lc LIKE ? ESCAPE '\\'`,
      `c.email_norm LIKE ? ESCAPE '\\'`,
    ];
    params.push(term, term, term);
    const digits = q.q.replace(/\D/g, '');
    if (digits.length >= 3) {
      or.push(`c.phone_digits LIKE ?`);
      params.push(digits + '%');
    }
    where.push(`(${or.join(' OR ')})`);
  }

  if (q.company) {
    where.push('c.company_lc = ?');
    params.push(q.company.toLowerCase());
  }

  const tagNames = [...new Set((q.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean))];
  if (tagNames.length > 0) {
    // "has ANY of the selected tags"
    where.push(`EXISTS (
      SELECT 1 FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
       WHERE ct.contact_id = c.id AND t.name IN (${tagNames.map(() => '?').join(',')}))`);
    params.push(...tagNames);
  }

  const sortCol = q.sort === 'name' ? 'c.name_sort' : 'c.created_at';
  const dir = q.order === 'asc' ? 'ASC' : 'DESC';

  if (q.cursor) {
    const cur = decodeCursor(q.cursor);
    // Row-value comparison: continue strictly after the last row we returned.
    where.push(`(${sortCol}, c.id) ${q.order === 'asc' ? '>' : '<'} (?, ?)`);
    params.push(cur.v, cur.id);
  }

  const sql = `
    SELECT c.* FROM contacts c
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${sortCol} ${dir}, c.id ${dir}
    LIMIT ?`;
  // Fetch one extra row: if it exists, there is a next page.
  const rows = db.prepare(sql).all(...params, q.limit + 1) as (ContactRow & { name_sort: string })[];

  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  const tags = tagsFor(db, page.map((r) => r.id));
  const last = page.at(-1);

  return {
    items: page.map((r) => toContact(r, tags.get(r.id)!)),
    nextCursor:
      hasMore && last
        ? encodeCursor({ v: q.sort === 'name' ? last.name_sort : last.created_at, id: last.id })
        : null,
  };
}

// ---------- Update with optimistic locking ----------

/**
 * The client sends the `version` it loaded. If someone saved in between, the
 * version no longer matches and we return 409 with the latest record, so the
 * UI can show a merge screen instead of silently overwriting.
 */
export function updateContact(db: DB, id: number, input: UpdateContactInput): Contact {
  const tx = db.transaction(() => {
    const row = getRow(db, id);
    if (!row) throw notFound('Contact');

    const current = getContact(db, id);
    if (row.version !== input.version) {
      throw new AppError(
        409,
        'VERSION_CONFLICT',
        'This contact was changed by someone else since you opened it.',
        undefined,
        current,
      );
    }

    // Work out what actually changed.
    const next = { ...current };
    const changes: Partial<Record<EditableField, { from: unknown; to: unknown }>> = {};
    for (const f of EDITABLE) {
      if (input[f] === undefined) continue;
      if (input[f] !== current[f]) {
        changes[f] = { from: current[f], to: input[f] };
        (next as Record<string, unknown>)[f] = input[f];
      }
    }
    if (Object.keys(changes).length === 0) return current; // nothing to save, no version bump

    const d = derivedColumns(next);
    const ts = now();
    let result;
    try {
      result = db
        .prepare(
          `UPDATE contacts SET
             first_name = ?, last_name = ?, email = ?, phone = ?, company = ?,
             email_norm = ?, name_sort = ?, last_name_lc = ?, phone_digits = ?, company_lc = ?,
             version = version + 1, updated_at = ?
           WHERE id = ? AND version = ?`,
        )
        .run(
          next.firstName, next.lastName, next.email, next.phone, next.company,
          d.email_norm, d.name_sort, d.last_name_lc, d.phone_digits, d.company_lc,
          ts, id, input.version,
        );
    } catch (e) {
      // The UNIQUE index is the real guarantee: a "check first" query could race.
      if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new AppError(409, 'EMAIL_TAKEN', 'Email is already used by another contact', {
          email: 'This email is already used by another contact',
        });
      }
      throw e;
    }
    if (result.changes === 0) {
      throw new AppError(409, 'VERSION_CONFLICT', 'Contact was modified', undefined, getContact(db, id));
    }

    logActivity(db, id, 'CONTACT_UPDATED', { changes });
    return getContact(db, id);
  });
  return tx();
}

// ---------- Tags ----------
// Tag changes do NOT bump `version`: they're independent, idempotent operations,
// so bumping would cause false conflicts for someone editing the name or email.

function getOrCreateTag(db: DB, name: string): Tag {
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name);
  // `name` column is COLLATE NOCASE, so "vip" finds an existing "VIP".
  return db.prepare('SELECT id, name FROM tags WHERE name = ?').get(name) as Tag;
}

function touch(db: DB, contactId: number, ts: string) {
  db.prepare('UPDATE contacts SET updated_at = ? WHERE id = ?').run(ts, contactId);
}

export function addTag(db: DB, contactId: number, name: string): Tag[] {
  return db.transaction(() => {
    if (!getRow(db, contactId)) throw notFound('Contact');
    const tag = getOrCreateTag(db, name);
    const ts = now();
    const r = db
      .prepare('INSERT OR IGNORE INTO contact_tags (contact_id, tag_id, created_at) VALUES (?, ?, ?)')
      .run(contactId, tag.id, ts);
    if (r.changes > 0) {
      logActivity(db, contactId, 'TAG_ADDED', { tagId: tag.id, tag: tag.name });
      touch(db, contactId, ts);
    }
    return tagsFor(db, [contactId]).get(contactId)!;
  })();
}

export function removeTag(db: DB, contactId: number, tagId: number): Tag[] {
  return db.transaction(() => {
    if (!getRow(db, contactId)) throw notFound('Contact');
    const tag = db.prepare('SELECT id, name FROM tags WHERE id = ?').get(tagId) as Tag | undefined;
    if (!tag) throw notFound('Tag');
    const r = db
      .prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?')
      .run(contactId, tagId);
    if (r.changes > 0) {
      logActivity(db, contactId, 'TAG_REMOVED', { tagId: tag.id, tag: tag.name });
      touch(db, contactId, now());
    }
    return tagsFor(db, [contactId]).get(contactId)!;
  })();
}

/** Adds one tag to many contacts in a single transaction (all or nothing). */
export function bulkAddTag(db: DB, contactIds: number[], tagName: string) {
  return db.transaction(() => {
    const ids = [...new Set(contactIds)];
    const existing = new Set(
      (
        db
          .prepare(`SELECT id FROM contacts WHERE id IN (${ids.map(() => '?').join(',')})`)
          .all(...ids) as { id: number }[]
      ).map((r) => r.id),
    );
    const tag = getOrCreateTag(db, tagName);
    const ts = now();
    const insert = db.prepare(
      'INSERT OR IGNORE INTO contact_tags (contact_id, tag_id, created_at) VALUES (?, ?, ?)',
    );
    let added = 0;
    for (const id of existing) {
      if (insert.run(id, tag.id, ts).changes > 0) {
        added++;
        logActivity(db, id, 'TAG_ADDED', { tagId: tag.id, tag: tag.name, bulk: true });
        touch(db, id, ts);
      }
    }
    return {
      tag,
      added,
      alreadyTagged: existing.size - added,
      notFound: ids.filter((id) => !existing.has(id)),
    };
  })();
}

export function listTags(db: DB): Tag[] {
  return db.prepare('SELECT id, name FROM tags ORDER BY name').all() as Tag[];
}

export function listCompanies(db: DB): string[] {
  // Fine for the demo; at scale this would come from a separate companies table.
  return (
    db
      .prepare(
        `SELECT MIN(company) AS company FROM contacts
          WHERE company_lc IS NOT NULL GROUP BY company_lc ORDER BY company_lc LIMIT 200`,
      )
      .all() as { company: string }[]
  ).map((r) => r.company);
}

// ---------- Activity ----------

export function listActivities(db: DB, contactId: number, limit: number) {
  if (!getRow(db, contactId)) throw notFound('Contact');
  const rows = db
    .prepare(
      `SELECT id, contact_id AS contactId, type, payload, created_at AS createdAt
         FROM activities WHERE contact_id = ?
        ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(contactId, limit) as {
    id: number;
    contactId: number;
    type: ActivityType;
    payload: string;
    createdAt: string;
  }[];
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}
