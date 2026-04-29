import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import { initializeDatabase } from "./schema";

const dbDir = path.join(process.cwd(), "data");
const dbPath = process.env.FINANCE_DB_PATH ?? path.join(dbDir, "finance.sqlite");

let db: Database.Database | undefined;

export function getLocalDb() {
  if (!db) {
    fs.mkdirSync(dbDir, { recursive: true });
    db = new Database(dbPath);
    initializeDatabase(db);
  }

  return db;
}

export function openLocalDatabase(filePath = dbPath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new Database(filePath);
  initializeDatabase(database);
  return database;
}

export function getLocalDbPath() {
  return dbPath;
}
