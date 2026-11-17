import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = Database.Database;

/**
 * Opens the SQLite database and creates tables/indexes if they don't exist.
 * Pass ':memory:' in tests for a fresh, isolated database.
 */
export function openDb(file = process.env.DB_FILE ?? 'data/crm.db'): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL'); // better concurrent reads while writing
  db.pragma('foreign_keys = ON');
  // Makes LIKE case-sensitive so `col LIKE 'abc%'` can use an index.
  // We search lowercased columns, so behaviour is still case-insensitive for users.
  db.pragma('case_sensitive_like = ON');

  migrate(db);
  return db;
}

function migrate(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name    TEXT NOT NULL,
      last_name     TEXT NOT NULL DEFAULT '',
      email         TEXT,
      phone         TEXT,
      company       TEXT,
      -- derived columns used for search / sort / uniqueness
      email_norm    TEXT UNIQUE,            -- lower(trim(email)); NULLs allowed many times
      name_sort     TEXT NOT NULL,          -- lower(first || ' ' || last)
      last_name_lc  TEXT NOT NULL,          -- lower(last), so "smith" finds "John Smith"
      phone_digits  TEXT,                   -- digits only, so "98765" finds "+91 98765-43210"
      company_lc    TEXT,
      version       INTEGER NOT NULL DEFAULT 1,  -- optimistic locking
      created_at    TEXT NOT NULL,          -- ISO-8601 UTC (sorts correctly as text)
      updated_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_name_sort  ON contacts(name_sort, id);
    CREATE INDEX IF NOT EXISTS idx_contacts_created    ON contacts(created_at, id);
    CREATE INDEX IF NOT EXISTS idx_contacts_last_name  ON contacts(last_name_lc);
    CREATE INDEX IF NOT EXISTS idx_contacts_phone      ON contacts(phone_digits);
    CREATE INDEX IF NOT EXISTS idx_contacts_company    ON contacts(company_lc);

    CREATE TABLE IF NOT EXISTS tags (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL,
      PRIMARY KEY (contact_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag_id, contact_id);

    CREATE TABLE IF NOT EXISTS activities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      type        TEXT NOT NULL CHECK (type IN ('CONTACT_UPDATED', 'TAG_ADDED', 'TAG_REMOVED')),
      payload     TEXT NOT NULL,          -- JSON: what changed
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id, created_at DESC, id DESC);
  `);
}
