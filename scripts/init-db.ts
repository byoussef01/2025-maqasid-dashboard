import { getDb, getDbPath } from "../lib/db/client";

const db = getDb();

const accountCount = db
  .prepare("SELECT COUNT(*) as count FROM accounts")
  .get() as { count: number };

console.log(`Initialized SQLite database at ${getDbPath()}`);
console.log(`Seeded ${accountCount.count} known account sheet(s).`);
