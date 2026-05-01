import type { Client, InStatement, Transaction } from "@libsql/client";

type SqlExecutor = Pick<Client, "execute" | "executeMultiple"> | Pick<Transaction, "execute" | "executeMultiple">;

export const reportingCacheSchemaSql = `
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
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_source_sheet_clear_date
  ON reporting_transactions(source_sheet, clear_date);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_source_sheet_transaction_date
  ON reporting_transactions(source_sheet, transaction_date);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_source_sheet_workbook_month_date
  ON reporting_transactions(source_sheet, workbook_month_date);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_reporting_type
  ON reporting_transactions(reporting_type);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_reporting_type_clear_date
  ON reporting_transactions(reporting_type, clear_date);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_reporting_type_transaction_date
  ON reporting_transactions(reporting_type, transaction_date);
CREATE INDEX IF NOT EXISTS idx_reporting_transactions_reporting_type_workbook_month_date
  ON reporting_transactions(reporting_type, workbook_month_date);
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
CREATE INDEX IF NOT EXISTS idx_reporting_bucket_entries_bucket_key_clear_date
  ON reporting_bucket_entries(bucket_key, clear_date);
CREATE INDEX IF NOT EXISTS idx_reporting_bucket_entries_bucket_key_transaction_date
  ON reporting_bucket_entries(bucket_key, transaction_date);
CREATE INDEX IF NOT EXISTS idx_reporting_bucket_entries_bucket_key_workbook_month_date
  ON reporting_bucket_entries(bucket_key, workbook_month_date);
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

export async function ensureReportingCacheSchema(executor: SqlExecutor) {
  await executor.executeMultiple(reportingCacheSchemaSql);
}

export async function rebuildReportingCache(executor: SqlExecutor) {
  await executor.executeMultiple(`
    DELETE FROM reporting_bucket_entries;
    DELETE FROM reporting_transactions;
  `);

  await execute(executor, {
    sql: `
      INSERT INTO reporting_transactions (
        transaction_id,
        import_id,
        source_sheet,
        source_row,
        month,
        workbook_month_date,
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
        revenue_cents,
        expenditure_cents,
        normalized_net_cents,
        has_revenue_credit_bucket,
        has_revenue_net_bucket,
        has_expense_net_bucket,
        workbook_revenue_cents,
        workbook_expenditure_cents,
        workbook_normalized_net_cents,
        unknown_revenue_cents,
        unknown_expenditure_cents
      )
      SELECT
        normalized.id,
        normalized.import_id,
        normalized.source_sheet,
        normalized.source_row,
        normalized.month,
        CASE
          WHEN TRIM(COALESCE(normalized.month, '')) GLOB '2025-[0-9][0-9]' THEN TRIM(normalized.month) || '-01'
          WHEN TRIM(COALESCE(normalized.month, '')) GLOB '[0-9]'
            OR TRIM(COALESCE(normalized.month, '')) GLOB '[0-9][0-9]'
            THEN printf('2025-%02d-01', CAST(TRIM(normalized.month) AS INTEGER))
          ELSE NULL
        END AS workbook_month_date,
        normalized.account,
        normalized.source,
        normalized.check_number,
        normalized.transaction_date,
        normalized.clear_date,
        normalized.payee,
        normalized.gross_cents,
        normalized.fee_cents,
        normalized.net_cents,
        normalized.cleared,
        normalized.accounting_category,
        normalized.accounting_category_label,
        normalized.program_category,
        normalized.program_category_label,
        normalized.description,
        normalized.raw_json,
        normalized.created_at,
        normalized.account_type,
        normalized.reporting_type,
        normalized.summary_bucket,
        normalized.report_amount_cents,
        normalized.revenue_cents,
        normalized.expenditure_cents,
        normalized.normalized_net_cents,
        CASE WHEN EXISTS (
          SELECT 1 FROM summary_named_bucket_rules bucket_rule
          WHERE bucket_rule.category_code = normalized.accounting_category
            AND bucket_rule.summary_bucket = 'revenue_credit'
            AND bucket_rule.is_active = 1
        ) THEN 1 ELSE 0 END AS has_revenue_credit_bucket,
        CASE WHEN EXISTS (
          SELECT 1 FROM summary_named_bucket_rules bucket_rule
          WHERE bucket_rule.category_code = normalized.accounting_category
            AND bucket_rule.summary_bucket = 'revenue_net'
            AND bucket_rule.is_active = 1
        ) THEN 1 ELSE 0 END AS has_revenue_net_bucket,
        CASE WHEN EXISTS (
          SELECT 1 FROM summary_named_bucket_rules bucket_rule
          WHERE bucket_rule.category_code = normalized.accounting_category
            AND bucket_rule.summary_bucket = 'expense_net'
            AND bucket_rule.is_active = 1
        ) THEN 1 ELSE 0 END AS has_expense_net_bucket,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM summary_named_bucket_rules bucket_rule
            WHERE bucket_rule.category_code = normalized.accounting_category
              AND bucket_rule.summary_bucket = 'revenue_credit'
              AND bucket_rule.is_active = 1
          ) AND normalized.report_amount_cents > 0
            THEN normalized.report_amount_cents
          WHEN EXISTS (
            SELECT 1 FROM summary_named_bucket_rules bucket_rule
            WHERE bucket_rule.category_code = normalized.accounting_category
              AND bucket_rule.summary_bucket = 'revenue_net'
              AND bucket_rule.is_active = 1
          )
            THEN normalized.report_amount_cents
          ELSE 0
        END AS workbook_revenue_cents,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM summary_named_bucket_rules bucket_rule
            WHERE bucket_rule.category_code = normalized.accounting_category
              AND bucket_rule.summary_bucket = 'expense_net'
              AND bucket_rule.is_active = 1
          )
            THEN normalized.report_amount_cents
          ELSE 0
        END AS workbook_expenditure_cents,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM summary_named_bucket_rules bucket_rule
            WHERE bucket_rule.category_code = normalized.accounting_category
              AND bucket_rule.summary_bucket = 'revenue_credit'
              AND bucket_rule.is_active = 1
          ) AND normalized.report_amount_cents > 0
            THEN normalized.report_amount_cents
          WHEN EXISTS (
            SELECT 1 FROM summary_named_bucket_rules bucket_rule
            WHERE bucket_rule.category_code = normalized.accounting_category
              AND bucket_rule.summary_bucket = 'revenue_net'
              AND bucket_rule.is_active = 1
          )
            THEN normalized.report_amount_cents
          WHEN EXISTS (
            SELECT 1 FROM summary_named_bucket_rules bucket_rule
            WHERE bucket_rule.category_code = normalized.accounting_category
              AND bucket_rule.summary_bucket = 'expense_net'
              AND bucket_rule.is_active = 1
          )
            THEN normalized.report_amount_cents
          ELSE 0
        END AS workbook_normalized_net_cents,
        CASE
          WHEN normalized.reporting_type = 'unknown'
            AND normalized.report_amount_cents > 0
            AND NOT EXISTS (
              SELECT 1 FROM summary_named_bucket_rules bucket_rule
              WHERE bucket_rule.category_code = normalized.accounting_category
                AND bucket_rule.is_active = 1
            )
            THEN normalized.report_amount_cents
          ELSE 0
        END AS unknown_revenue_cents,
        CASE
          WHEN normalized.reporting_type = 'unknown'
            AND normalized.report_amount_cents < 0
            AND NOT EXISTS (
              SELECT 1 FROM summary_named_bucket_rules bucket_rule
              WHERE bucket_rule.category_code = normalized.accounting_category
                AND bucket_rule.is_active = 1
            )
            THEN normalized.report_amount_cents
          ELSE 0
        END AS unknown_expenditure_cents
      FROM normalized_transactions normalized
    `,
  });

  await execute(executor, {
    sql: `
      INSERT INTO reporting_bucket_entries (
        bucket_key,
        transaction_id,
        source_sheet,
        transaction_date,
        clear_date,
        workbook_month_date,
        reporting_type,
        accounting_category,
        program_category,
        total_cents
      )
      SELECT
        buckets.bucket_key,
        report.transaction_id,
        report.source_sheet,
        report.transaction_date,
        report.clear_date,
        report.workbook_month_date,
        report.reporting_type,
        report.accounting_category,
        report.program_category,
        CASE
          WHEN buckets.summary_bucket = 'revenue_credit' AND report.report_amount_cents > 0
            THEN report.report_amount_cents
          WHEN buckets.summary_bucket = 'revenue_net'
            THEN report.report_amount_cents
          WHEN buckets.summary_bucket = 'expense_net'
            THEN report.report_amount_cents
          ELSE 0
        END AS total_cents
      FROM (
        SELECT DISTINCT
          bucket_key,
          category_code,
          summary_bucket
        FROM summary_named_bucket_rules
        WHERE is_active = 1
      ) buckets
      JOIN reporting_transactions report
        ON report.accounting_category = buckets.category_code
      WHERE CASE
        WHEN buckets.summary_bucket = 'revenue_credit' AND report.report_amount_cents > 0
          THEN report.report_amount_cents
        WHEN buckets.summary_bucket = 'revenue_net'
          THEN report.report_amount_cents
        WHEN buckets.summary_bucket = 'expense_net'
          THEN report.report_amount_cents
        ELSE 0
      END != 0
    `,
  });
}

async function execute(executor: SqlExecutor, statement: InStatement) {
  return executor.execute(statement);
}
