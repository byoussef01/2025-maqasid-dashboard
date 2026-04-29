import { getLocalDb, getLocalDbPath } from "../lib/db/local-client";

const db = getLocalDb();

const accountCount = db
  .prepare("SELECT COUNT(*) as count FROM accounts")
  .get() as { count: number };

console.log(`Initialized SQLite database at ${getLocalDbPath()}`);
console.log(`Seeded ${accountCount.count} known account sheet(s).`);
