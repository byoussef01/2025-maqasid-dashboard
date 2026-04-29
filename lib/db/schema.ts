import type Database from "better-sqlite3";

export const DATABASE_SCHEMA_VERSION = 6;

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

CREATE TABLE IF NOT EXISTS category_reporting_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_code TEXT NOT NULL UNIQUE,
  category_type TEXT NOT NULL
    CHECK (category_type IN ('revenue', 'expenditure', 'transfer', 'ignored', 'unknown')),
  description TEXT,
  source TEXT NOT NULL DEFAULT 'system',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS summary_category_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_code TEXT NOT NULL UNIQUE,
  summary_bucket TEXT NOT NULL
    CHECK (summary_bucket IN ('revenue_credit', 'revenue_net', 'expense_net')),
  source TEXT NOT NULL DEFAULT 'workbook',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS summary_named_bucket_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket_key TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  report_type TEXT NOT NULL
    CHECK (report_type IN ('revenue', 'expense')),
  source_cell TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  category_code TEXT NOT NULL,
  summary_bucket TEXT NOT NULL
    CHECK (summary_bucket IN ('revenue_credit', 'revenue_net', 'expense_net')),
  source TEXT NOT NULL DEFAULT 'workbook',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (bucket_key, category_code, summary_bucket)
);

CREATE INDEX IF NOT EXISTS idx_transactions_import_id ON transactions(import_id);
CREATE INDEX IF NOT EXISTS idx_transactions_source_sheet ON transactions(source_sheet);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_clear_date ON transactions(clear_date);
CREATE INDEX IF NOT EXISTS idx_transactions_accounting_category ON transactions(accounting_category);
CREATE INDEX IF NOT EXISTS idx_transactions_program_category ON transactions(program_category);
CREATE INDEX IF NOT EXISTS idx_category_rules_category_code ON category_rules(category_code);
CREATE INDEX IF NOT EXISTS idx_category_reporting_overrides_category_code
  ON category_reporting_overrides(category_code);
CREATE INDEX IF NOT EXISTS idx_summary_category_rules_category_code
  ON summary_category_rules(category_code);
CREATE INDEX IF NOT EXISTS idx_summary_named_bucket_rules_bucket_key
  ON summary_named_bucket_rules(bucket_key);
CREATE INDEX IF NOT EXISTS idx_summary_named_bucket_rules_category_code
  ON summary_named_bucket_rules(category_code);

DROP VIEW IF EXISTS normalized_transactions;

CREATE VIEW normalized_transactions AS
WITH classified AS (
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
    COALESCE(accounts.account_type, 'other') AS account_type,
    COALESCE(override.category_type, accounting_rule.category_type, 'unknown') AS base_reporting_type,
    summary_rule.summary_bucket AS base_summary_bucket,
    CASE
      WHEN COALESCE(accounts.account_type, 'other') = 'credit_card' THEN -t.gross_cents
      ELSE t.gross_cents
    END AS report_amount_cents
  FROM transactions t
  LEFT JOIN accounts
    ON accounts.sheet_name = t.source_sheet
  LEFT JOIN category_rules accounting_rule
    ON accounting_rule.category_code = t.accounting_category
   AND accounting_rule.is_active = 1
  LEFT JOIN category_reporting_overrides override
    ON override.category_code = t.accounting_category
   AND override.is_active = 1
  LEFT JOIN summary_category_rules summary_rule
    ON summary_rule.category_code = t.accounting_category
   AND summary_rule.is_active = 1
  LEFT JOIN category_rules program_rule
    ON program_rule.category_code = t.program_category
   AND program_rule.is_active = 1
),
normalized AS (
  SELECT
    id,
    import_id,
    source_sheet,
    source_row,
    month,
    account,
    source,
    check_number,
    transaction_date,
    clear_date,
    payee,
    gross_cents,
    fee_cents,
    net_cents,
    cleared,
    accounting_category,
    accounting_category_label,
    program_category,
    program_category_label,
    description,
    raw_json,
    created_at,
    account_type,
    CASE
      WHEN accounting_category = '?' THEN 'unknown'
      ELSE base_reporting_type
    END AS reporting_type,
    base_summary_bucket AS summary_bucket,
    report_amount_cents
  FROM classified
)
SELECT
  id,
  import_id,
  source_sheet,
  source_row,
  month,
  account,
  source,
  check_number,
  transaction_date,
  clear_date,
  payee,
  gross_cents,
  fee_cents,
  net_cents,
  cleared,
  accounting_category,
  accounting_category_label,
  program_category,
  program_category_label,
  description,
  raw_json,
  created_at,
  account_type,
  reporting_type,
  summary_bucket,
  report_amount_cents,
  CASE
    WHEN reporting_type = 'revenue'
     AND account_type != 'credit_card'
     AND report_amount_cents > 0
      THEN report_amount_cents
    ELSE 0
  END AS revenue_cents,
  CASE
    WHEN reporting_type = 'expenditure'
     AND report_amount_cents < 0
      THEN -report_amount_cents
    ELSE 0
  END AS expenditure_cents,
  CASE
    WHEN reporting_type = 'revenue'
     AND account_type != 'credit_card'
      THEN report_amount_cents
    WHEN reporting_type = 'expenditure'
      THEN report_amount_cents
    ELSE 0
  END AS normalized_net_cents
FROM normalized;

CREATE TABLE IF NOT EXISTS reporting_transactions (
  transaction_id INTEGER PRIMARY KEY,
  import_id INTEGER NOT NULL,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  month TEXT,
  workbook_month_date TEXT,
  account TEXT NOT NULL,
  source TEXT,
  check_number TEXT,
  transaction_date TEXT,
  clear_date TEXT,
  payee TEXT,
  gross_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  cleared TEXT,
  accounting_category TEXT,
  accounting_category_label TEXT,
  program_category TEXT,
  program_category_label TEXT,
  description TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL,
  account_type TEXT,
  reporting_type TEXT NOT NULL,
  summary_bucket TEXT,
  report_amount_cents INTEGER NOT NULL,
  revenue_cents INTEGER NOT NULL,
  expenditure_cents INTEGER NOT NULL,
  normalized_net_cents INTEGER NOT NULL,
  has_revenue_credit_bucket INTEGER NOT NULL DEFAULT 0,
  has_revenue_net_bucket INTEGER NOT NULL DEFAULT 0,
  has_expense_net_bucket INTEGER NOT NULL DEFAULT 0,
  workbook_revenue_cents INTEGER NOT NULL DEFAULT 0,
  workbook_expenditure_cents INTEGER NOT NULL DEFAULT 0,
  workbook_normalized_net_cents INTEGER NOT NULL DEFAULT 0,
  unknown_revenue_cents INTEGER NOT NULL DEFAULT 0,
  unknown_expenditure_cents INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reporting_transactions_clear_date
  ON reporting_transactions(clear_date);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_transaction_date
  ON reporting_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_workbook_month_date
  ON reporting_transactions(workbook_month_date);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_source_sheet
  ON reporting_transactions(source_sheet);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_reporting_type
  ON reporting_transactions(reporting_type);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_accounting_category
  ON reporting_transactions(accounting_category);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_program_category
  ON reporting_transactions(program_category);

CREATE TABLE IF NOT EXISTS reporting_bucket_entries (
  bucket_key TEXT NOT NULL,
  transaction_id INTEGER NOT NULL,
  source_sheet TEXT NOT NULL,
  transaction_date TEXT,
  clear_date TEXT,
  workbook_month_date TEXT,
  reporting_type TEXT NOT NULL,
  accounting_category TEXT,
  program_category TEXT,
  total_cents INTEGER NOT NULL,
  PRIMARY KEY (bucket_key, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_reporting_bucket_entries_bucket_key
  ON reporting_bucket_entries(bucket_key);
CREATE INDEX IF NOT EXISTS idx_reporting_bucket_entries_clear_date
  ON reporting_bucket_entries(clear_date);
CREATE INDEX IF NOT EXISTS idx_reporting_bucket_entries_transaction_date
  ON reporting_bucket_entries(transaction_date);
CREATE INDEX IF NOT EXISTS idx_reporting_bucket_entries_workbook_month_date
  ON reporting_bucket_entries(workbook_month_date);
CREATE INDEX IF NOT EXISTS idx_reporting_bucket_entries_source_sheet
  ON reporting_bucket_entries(source_sheet);
CREATE INDEX IF NOT EXISTS idx_reporting_bucket_entries_reporting_type
  ON reporting_bucket_entries(reporting_type);
`;

const dropSchemaSql = `
DROP TABLE IF EXISTS reporting_bucket_entries;
DROP TABLE IF EXISTS reporting_transactions;
DROP VIEW IF EXISTS normalized_transactions;
DROP TABLE IF EXISTS summary_category_rules;
DROP TABLE IF EXISTS summary_named_bucket_rules;
DROP TABLE IF EXISTS category_reporting_overrides;
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
  seedDefaultReportingOverrides(db);
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

export function seedDefaultReportingOverrides(db: Database.Database) {
  const seed = db.prepare(
    `INSERT INTO category_reporting_overrides (
      category_code, category_type, description, source, is_active
    )
    VALUES (@categoryCode, @categoryType, @description, 'system', 1)
    ON CONFLICT(category_code) DO UPDATE SET
      category_type = excluded.category_type,
      description = excluded.description,
      source = excluded.source,
      is_active = excluded.is_active`,
  );

  const run = db.transaction(() => {
    for (const override of defaultReportingOverrides) {
      seed.run(override);
    }
  });

  run();
}

const defaultReportingOverrides = [
  {
    categoryCode: "NE-20",
    categoryType: "transfer",
    description: "Credit card payments are balance transfers, not operating expense.",
  },
  {
    categoryCode: "NE-22",
    categoryType: "transfer",
    description: "Internal transfers move funds between accounts and should not count as revenue or expense.",
  },
  {
    categoryCode: "NE-22.1",
    categoryType: "transfer",
    description: "Cash internal transfers move funds between accounts and should not count as revenue or expense.",
  },
] as const;
