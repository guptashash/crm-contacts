import { openDb } from './db.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 4000);
const db = openDb();
const count = (db.prepare('SELECT COUNT(*) AS n FROM contacts').get() as { n: number }).n;

createApp(db).listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}/api  (${count} contacts in DB)`);
  if (count === 0) console.log('Database is empty. Run: npm run seed -w server');
});
