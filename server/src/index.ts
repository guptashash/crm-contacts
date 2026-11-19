import { openDb } from './db.js';
import { createApp } from './app.js';
import { seedDatabase } from './seed.js';

const PORT = Number(process.env.PORT ?? 4000);
const db = openDb();

// Hosting with temporary disks (e.g. a free Render instance) starts with an empty
// database after each restart: fill it with the same deterministic demo data.
const count = () => (db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }).n;
if (count() === 0) {
  console.log('Empty database: seeding demo data…');
  seedDatabase(db, Number(process.env.SEED_COUNT ?? 5000));
}

createApp(db).listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}  (API at /api, ${count()} contacts)`);
});
