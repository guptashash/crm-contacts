import { faker } from '@faker-js/faker';
import { pathToFileURL } from 'node:url';
import { openDb, type DB } from './db.js';
import { derivedColumns } from './repo/contacts.js';

const TAGS = ['Lead', 'Customer', 'VIP', 'Prospect', 'Partner', 'Churned'];

/**
 * Fills the database with deterministic fake data (same output every run).
 * Wipes existing data first.
 */
export function seedDatabase(db: DB, count = 5000) {
  faker.seed(42);
  const companies = Array.from({ length: 25 }, () => faker.company.name());
  const twoYearsAgo = Date.now() - 2 * 365 * 24 * 3600 * 1000;

  const insertContact = db.prepare(`
    INSERT INTO contacts (first_name, last_name, email, phone, company,
      email_norm, name_sort, last_name_lc, phone_digits, company_lc, created_at, updated_at)
    VALUES (@firstName, @lastName, @email, @phone, @company,
      @email_norm, @name_sort, @last_name_lc, @phone_digits, @company_lc, @createdAt, @createdAt)`);
  const insertTag = db.prepare('INSERT INTO tags (name) VALUES (?)');
  const link = db.prepare(
    'INSERT INTO contact_tags (contact_id, tag_id, created_at) VALUES (?, ?, ?)',
  );

  db.transaction(() => {
    db.exec('DELETE FROM activities; DELETE FROM contact_tags; DELETE FROM contacts; DELETE FROM tags;');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('contacts','tags','activities');");

    const tagIds = TAGS.map((t) => Number(insertTag.run(t).lastInsertRowid));

    for (let i = 0; i < count; i++) {
      // A few identical names on purpose, to prove pagination handles ties.
      const dup = i % 500 === 0;
      const firstName = dup ? 'John' : faker.person.firstName();
      const lastName = dup ? 'Smith' : faker.person.lastName();
      const c = {
        firstName,
        lastName,
        // index in the address guarantees uniqueness; ~5% have no email
        email: i % 20 === 7 ? null : `${firstName}.${lastName}.${i}@example.com`.toLowerCase(),
        phone: i % 15 === 3 ? null : faker.phone.number({ style: 'international' }),
        company: i % 10 === 5 ? null : faker.helpers.arrayElement(companies),
      };
      const createdAt = new Date(
        faker.number.int({ min: twoYearsAgo, max: Date.now() }),
      ).toISOString();
      const id = Number(
        insertContact.run({ ...c, ...derivedColumns(c), createdAt }).lastInsertRowid,
      );

      for (const tagId of faker.helpers.arrayElements(tagIds, { min: 0, max: 2 })) {
        link.run(id, tagId, createdAt);
      }
    }
  })();
}

// Run directly: `npm run seed -w server` (optional count: `-- 20000`)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = Number(process.argv[2] ?? 5000);
  const db = openDb();
  console.time('seed');
  seedDatabase(db, count);
  console.timeEnd('seed');
  console.log(`Seeded ${count} contacts.`);
}
