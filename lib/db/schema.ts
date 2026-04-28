import type Database from "better-sqlite3";

export const DATABASE_SCHEMA_VERSION = 3;

export type AccountType = "bank" | "cash" | "credit_card" | "processor" | "crm" | "other";

export type KnownAccountSheet = {
  sheetName: string;
  displayName: string;
  accountType: AccountType;
};

export const knownAccountSheets: KnownAccountSheet[] = [
  { sheetName: "NTB Ops", displayName: "NTB Ops", accountType: "bank" },
  { sheetName: "BofA Ops", displayName: "BofA Ops", accountType: "bank" },
  { sheetName: "Cash Transactions", displayName: "Cash Transactions", accountType: "cash" },
  { sheetName: "DonorPerfect 2025", displayName: "DonorPerfect 2025", accountType: "crm" },
  {
    sheetName: "Stripe Checking Acct",
    displayName: "Stripe Checking Acct",
    accountType: "processor",
  },
  { sheetName: "Capital One", displayName: "Capital One", accountType: "credit_card" },
  { sheetName: "BofA Zakat Account", displayName: "BofA Zakat Account", accountType: "bank" },
  { sheetName: "BofA Payroll", displayName: "BofA Payroll", accountType: "bank" },
  { sheetName: "BofA SP", displayName: "BofA SP", accountType: "bank" },
  { sheetName: "NTB Campus", displayName: "NTB Campus", accountType: "bank" },
  { sheetName: "BofA LAO", displayName: "BofA LAO", accountType: "bank" },
  { sheetName: "NTB 3P", displayName: "NTB 3P", accountType: "bank" },
  { sheetName: "NTB Waqf", displayName: "NTB Waqf", accountType: "bank" },
  { sheetName: "NTB LAO", displayName: "NTB LAO", accountType: "bank" },
  { sheetName: "NTB Escrow", displayName: "NTB Escrow", accountType: "bank" },
];

export const createSchemaSql = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_type TEXT NOT NULL DEFAULT 'xlsx',
  row_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'bank'
    CHECK (account_type IN ('bank', 'cash', 'credit_card', 'processor', 'crm', 'other')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  month TEXT,
  account TEXT NOT NULL,
  source TEXT,
  check_number TEXT,
  transaction_date TEXT,
  clear_date TEXT,
  payee TEXT,
  gross_cents INTEGER NOT NULL DEFAULT 0,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  cleared TEXT,
  accounting_category TEXT,
  program_category TEXT,
  description TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS category_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_code TEXT NOT NULL UNIQUE,
  category_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (category_type IN ('revenue', 'expenditure', 'transfer', 'ignored', 'unknown')),
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_transactions_import_id ON transactions(import_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source_sheet ON transactions(source_sheet);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_clear_date ON transactions(clear_date);
CREATE INDEX IF NOT EXISTS idx_transactions_accounting_category ON transactions(accounting_category);
CREATE INDEX IF NOT EXISTS idx_transactions_program_category ON transactions(program_category);
CREATE INDEX IF NOT EXISTS idx_category_rules_category_code ON category_rules(category_code);

DROP VIEW IF EXISTS normalized_transactions;

CREATE VIEW normalized_transactions AS
SELECT
  t.id,
  t.import_id,
  t.source_sheet,
  t.source_row,
  t.month,
  t.account,
  t.source,
  t.check_number,
  t.transaction_date,
  t.clear_date,
  t.payee,
  t.gross_cents,
  t.fee_cents,
  t.net_cents,
  t.cleared,
  t.accounting_category,
  accounting_rule.description AS accounting_category_label,
  t.program_category,
  program_rule.description AS program_category_label,
  t.description,
  t.raw_json,
  t.created_at,
  accounts.account_type,
  COALESCE(accounting_rule.category_type, 'unknown') AS reporting_type,
  CASE
    WHEN COALESCE(accounting_rule.category_type, 'unknown') = 'revenue'
     AND COALESCE(accounts.account_type, 'other') != 'credit_card'
      THEN ABS(t.net_cents)
    ELSE 0
  END AS revenue_cents,
  CASE
    WHEN COALESCE(accounting_rule.category_type, 'unknown') = 'expenditure'
      THEN ABS(t.net_cents)
    ELSE 0
  END AS expenditure_cents,
  (
    CASE
      WHEN COALESCE(accounting_rule.category_type, 'unknown') = 'revenue'
       AND COALESCE(accounts.account_type, 'other') != 'credit_card'
        THEN ABS(t.net_cents)
      ELSE 0
    END
    -
    CASE
      WHEN COALESCE(accounting_rule.category_type, 'unknown') = 'expenditure'
        THEN ABS(t.net_cents)
      ELSE 0
    END
  ) AS normalized_net_cents
FROM transactions t
LEFT JOIN accounts
  ON accounts.sheet_name = t.source_sheet
LEFT JOIN category_rules accounting_rule
  ON accounting_rule.category_code = t.accounting_category
 AND accounting_rule.is_active = 1
LEFT JOIN category_rules program_rule
  ON program_rule.category_code = t.program_category
 AND program_rule.is_active = 1;
`;

const dropSchemaSql = `
DROP VIEW IF EXISTS normalized_transactions;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS category_rules;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS imports;
`;

export function initializeDatabase(db: Database.Database) {
  db.pragma("foreign_keys = ON");

  const currentVersion = Number(db.pragma("user_version", { simple: true }) ?? 0);
  if (currentVersion !== DATABASE_SCHEMA_VERSION) {
    db.exec(dropSchemaSql);
  }

  db.exec(createSchemaSql);
  seedKnownAccountSheets(db);
  db.pragma(`user_version = ${DATABASE_SCHEMA_VERSION}`);
}

export function seedKnownAccountSheets(db: Database.Database) {
  const seed = db.prepare(
    `INSERT INTO accounts (sheet_name, display_name, account_type, is_active)
     VALUES (@sheetName, @displayName, @accountType, 1)
     ON CONFLICT(sheet_name) DO UPDATE SET
       display_name = excluded.display_name,
       account_type = excluded.account_type,
       is_active = excluded.is_active`,
  );

  const run = db.transaction(() => {
    for (const account of knownAccountSheets) {
      seed.run(account);
    }
  });

  run();
}
