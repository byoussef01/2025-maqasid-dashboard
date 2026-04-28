import { getDb } from "@/lib/db/client";
import type {
  AccountSummary,
  CategoryType,
  DashboardSummary,
  NormalizedCategory,
  NormalizedTransaction,
  TransactionFilters,
  TransactionRecord,
  WorkbookImportResult,
} from "@/lib/types/finance";

type CountRow = { count: number };
type SummaryRow = {
  transactionCount: number | null;
  accountCount: number | null;
  grossTotal: number | null;
  feeTotal: number | null;
  netTotal: number | null;
  creditTotal: number | null;
  debitTotal: number | null;
};

export function replaceWorkbookImport(
  result: WorkbookImportResult,
  transactions: NormalizedTransaction[],
  categories: NormalizedCategory[],
) {
  const db = getDb();

  const run = db.transaction(() => {
    db.exec("DELETE FROM transactions; DELETE FROM category_rules; DELETE FROM imports;");

    const importInfo = db
      .prepare(
        `INSERT INTO imports (filename, imported_at, source_type, row_count, notes)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        result.fileName,
        result.importedAt,
        "xlsx",
        result.transactionCount,
        JSON.stringify({
          sheetCount: result.sheetCount,
          accountCount: result.accountCount,
          categoryCount: result.categoryCount,
          skippedRows: result.skippedRows,
          warnings: result.warnings,
        }),
      );

    const importId = Number(importInfo.lastInsertRowid);

    const upsertAccount = db.prepare(
      `INSERT INTO accounts (sheet_name, display_name, account_type, is_active)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(sheet_name) DO UPDATE SET
         display_name = excluded.display_name,
         is_active = 1`,
    );
    const insertCategoryRule = db.prepare(
      `INSERT OR IGNORE INTO category_rules (
        category_code, category_type, description, is_active
      ) VALUES (?, ?, ?, 1)`,
    );
    const insertTransaction = db.prepare(
      `INSERT INTO transactions (
        import_id, source_sheet, source_row, month, account, source, check_number,
        transaction_date, clear_date, payee, gross_cents, fee_cents, net_cents,
        cleared, accounting_category, program_category, description, raw_json
      ) VALUES (
        @importId, @sourceSheet, @sourceRow, @month, @accountName, @source, @checkNumber,
        @transactionDate, @clearDate, @payee, @grossCents, @feeCents, @netCents,
        @cleared, @accountingCategory, @programCategory, @description, @rawJson
      )`,
    );

    for (const category of categories) {
      insertCategoryRule.run(
        category.code,
        category.type,
        category.name,
      );
    }

    for (const transaction of transactions) {
      upsertAccount.run(
        transaction.sourceSheet,
        transaction.accountName,
        inferAccountType(transaction.sourceSheet),
      );
      insertTransaction.run({ importId, ...nullableTransaction(transaction) });
    }
  });

  run();
}

export function getLatestImport() {
  return getDb()
    .prepare(
      `SELECT
        id,
        filename as fileName,
        imported_at as importedAt,
        source_type as sourceType,
        row_count as rowCount,
        notes
       FROM imports
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get() as
    | {
        id: number;
        fileName: string;
        importedAt: string;
        sourceType: string;
        rowCount: number;
        notes: string | null;
      }
    | undefined;
}

export function getRecentImports(limit = 5) {
  return getDb()
    .prepare(
      `SELECT
        id,
        filename as fileName,
        imported_at as importedAt,
        source_type as sourceType,
        row_count as rowCount,
        notes
       FROM imports
       ORDER BY imported_at DESC, id DESC
       LIMIT @limit`,
    )
    .all({ limit }) as {
    id: number;
    fileName: string;
    importedAt: string;
    sourceType: string;
    rowCount: number;
    notes: string | null;
  }[];
}

export function getDashboardSummary(): DashboardSummary {
  const row = getDb()
    .prepare(
      `SELECT
        COUNT(*) as transactionCount,
        COUNT(DISTINCT account) as accountCount,
        COALESCE(SUM(gross_cents), 0) as grossTotal,
        COALESCE(SUM(fee_cents), 0) as feeTotal,
        COALESCE(SUM(normalized_net_cents), 0) as netTotal,
        COALESCE(SUM(revenue_cents), 0) as creditTotal,
        COALESCE(SUM(expenditure_cents), 0) as debitTotal
       FROM normalized_transactions
       WHERE reporting_type != 'ignored'`,
    )
    .get() as SummaryRow;

  return {
    transactionCount: row.transactionCount ?? 0,
    accountCount: row.accountCount ?? 0,
    grossTotal: row.grossTotal ?? 0,
    feeTotal: row.feeTotal ?? 0,
    netTotal: row.netTotal ?? 0,
    creditTotal: row.creditTotal ?? 0,
    debitTotal: row.debitTotal ?? 0,
  };
}

export function getAccountSummaries(): AccountSummary[] {
  return getDb()
    .prepare(
      `SELECT
        account as accountName,
        COUNT(*) as transactionCount,
        COALESCE(SUM(normalized_net_cents), 0) as netTotal,
        COALESCE(SUM(revenue_cents), 0) as creditTotal,
        COALESCE(SUM(expenditure_cents), 0) as debitTotal
       FROM normalized_transactions
       WHERE reporting_type != 'ignored'
       GROUP BY account
       ORDER BY ABS(netTotal) DESC, account ASC`,
    )
    .all() as AccountSummary[];
}

export function getTransactions(filters: TransactionFilters = {}): TransactionRecord[] {
  const clauses: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.q) {
    clauses.push("(payee LIKE @q OR description LIKE @q OR source LIKE @q OR raw_json LIKE @q)");
    params.q = `%${filters.q}%`;
  }

  if (filters.account) {
    clauses.push("account = @account");
    params.account = filters.account;
  }

  if (filters.category) {
    clauses.push("(accounting_category = @category OR program_category = @category)");
    params.category = filters.category;
  }

  if (filters.direction && filters.direction !== "all") {
    clauses.push("reporting_type = @direction");
    params.direction = filters.direction;
  }

  params.limit = filters.limit ?? 100;

  return getDb()
    .prepare(
      `SELECT
        id,
        import_id as importId,
        account as accountName,
        source_sheet as sourceSheet,
        source_row as sourceRow,
        month,
        source,
        check_number as checkNumber,
        transaction_date as transactionDate,
        clear_date as clearDate,
        payee,
        gross_cents as grossCents,
        fee_cents as feeCents,
        net_cents as netCents,
        account_type as accountType,
        reporting_type as direction,
        reporting_type as reportingType,
        revenue_cents as revenueCents,
        expenditure_cents as expenditureCents,
        normalized_net_cents as normalizedNetCents,
        cleared,
        accounting_category as accountingCategory,
        accounting_category_label as accountingCategoryLabel,
        program_category as programCategory,
        program_category_label as programCategoryLabel,
        description,
        raw_json as rawJson
       FROM normalized_transactions
       ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
       ORDER BY COALESCE(transaction_date, clear_date, '') DESC, id DESC
       LIMIT @limit`,
    )
    .all(params) as TransactionRecord[];
}

export type TransactionSort = "clear_date" | "transaction_date" | "amount" | "account" | "category";
export type SortDirection = "asc" | "desc";

export type TransactionPageFilters = {
  q?: string;
  startDate?: string;
  endDate?: string;
  dateField?: "clear_date" | "transaction_date";
  account?: string;
  reportingType?: CategoryType | "all";
  accountingCategory?: string[];
  programCategory?: string[];
  sort?: TransactionSort;
  sortDir?: SortDirection;
  limit?: number;
  offset?: number;
};

export function getTransactionsPage(filters: TransactionPageFilters = {}) {
  const { whereSql, params } = transactionWhere(filters);
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 250);
  const offset = Math.max(filters.offset ?? 0, 0);
  const orderBy = transactionOrderBy(filters.sort, filters.sortDir);

  const totalRow = getDb()
    .prepare(`SELECT COUNT(*) as count FROM normalized_transactions ${whereSql}`)
    .get(params) as CountRow;

  const rows = getDb()
    .prepare(
      `SELECT
        id,
        import_id as importId,
        account as accountName,
        source_sheet as sourceSheet,
        source_row as sourceRow,
        month,
        source,
        check_number as checkNumber,
        transaction_date as transactionDate,
        clear_date as clearDate,
        payee,
        gross_cents as grossCents,
        fee_cents as feeCents,
        net_cents as netCents,
        account_type as accountType,
        reporting_type as direction,
        reporting_type as reportingType,
        revenue_cents as revenueCents,
        expenditure_cents as expenditureCents,
        normalized_net_cents as normalizedNetCents,
        cleared,
        accounting_category as accountingCategory,
        accounting_category_label as accountingCategoryLabel,
        program_category as programCategory,
        program_category_label as programCategoryLabel,
        description,
        raw_json as rawJson
       FROM normalized_transactions
       ${whereSql}
       ${orderBy}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit, offset }) as TransactionRecord[];

  return {
    rows,
    total: totalRow.count,
    limit,
    offset,
  };
}

export function getTransactionsForExport(filters: TransactionPageFilters = {}) {
  const { whereSql, params } = transactionWhere(filters);
  const orderBy = transactionOrderBy(filters.sort, filters.sortDir);

  return getDb()
    .prepare(
      `SELECT
        id,
        import_id as importId,
        account as accountName,
        source_sheet as sourceSheet,
        source_row as sourceRow,
        month,
        source,
        check_number as checkNumber,
        transaction_date as transactionDate,
        clear_date as clearDate,
        payee,
        gross_cents as grossCents,
        fee_cents as feeCents,
        net_cents as netCents,
        account_type as accountType,
        reporting_type as direction,
        reporting_type as reportingType,
        revenue_cents as revenueCents,
        expenditure_cents as expenditureCents,
        normalized_net_cents as normalizedNetCents,
        cleared,
        accounting_category as accountingCategory,
        accounting_category_label as accountingCategoryLabel,
        program_category as programCategory,
        program_category_label as programCategoryLabel,
        description,
        raw_json as rawJson
       FROM normalized_transactions
       ${whereSql}
       ${orderBy}
       LIMIT 100000`,
    )
    .all(params) as TransactionRecord[];
}

export function getTransactionFilterOptions() {
  const db = getDb();

  return {
    accounts: (
      db
        .prepare(
          `SELECT sheet_name as value, display_name as label
           FROM accounts
           WHERE is_active = 1
           ORDER BY display_name ASC`,
        )
        .all() as { value: string; label: string }[]
    ),
    accountingCategories: (
      db
        .prepare(
          `SELECT
             accounting_category as value,
             MAX(COALESCE(accounting_category_label, '')) as label
           FROM normalized_transactions
           WHERE accounting_category IS NOT NULL AND accounting_category != ''
           GROUP BY accounting_category
           ORDER BY accounting_category ASC`,
        )
        .all() as { value: string; label: string }[]
    ),
    programCategories: (
      db
        .prepare(
          `SELECT
             program_category as value,
             MAX(COALESCE(program_category_label, '')) as label
           FROM normalized_transactions
           WHERE program_category IS NOT NULL AND program_category != ''
           GROUP BY program_category
           ORDER BY program_category ASC`,
        )
        .all() as { value: string; label: string }[]
    ),
  };
}

export function getAccounts(): string[] {
  return (
    getDb()
      .prepare("SELECT display_name FROM accounts WHERE is_active = 1 ORDER BY display_name ASC")
      .all() as { display_name: string }[]
  ).map((row) => row.display_name);
}

function transactionWhere(filters: TransactionPageFilters) {
  const clauses: string[] = [];
  const params: Record<string, string | number> = {};
  const dateField = filters.dateField === "transaction_date" ? "transaction_date" : "clear_date";

  if (filters.q) {
    clauses.push(
      "(payee LIKE @q OR description LIKE @q OR source LIKE @q OR raw_json LIKE @q OR account LIKE @q)",
    );
    params.q = `%${filters.q}%`;
  }

  if (filters.startDate) {
    clauses.push(`${dateField} >= @startDate`);
    params.startDate = filters.startDate;
  }

  if (filters.endDate) {
    clauses.push(`${dateField} < @endDate`);
    params.endDate = filters.endDate;
  }

  if (filters.account) {
    clauses.push("source_sheet = @account");
    params.account = filters.account;
  }

  if (filters.reportingType && filters.reportingType !== "all") {
    clauses.push("reporting_type = @reportingType");
    params.reportingType = filters.reportingType;
  }

  addMultiValueClause(
    clauses,
    params,
    "accounting_category",
    "accountingCategory",
    filters.accountingCategory,
  );
  addMultiValueClause(
    clauses,
    params,
    "program_category",
    "programCategory",
    filters.programCategory,
  );

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function addMultiValueClause(
  clauses: string[],
  params: Record<string, string | number>,
  column: string,
  paramPrefix: string,
  values?: string[],
) {
  if (!values?.length) {
    return;
  }

  const uniqueValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (!uniqueValues.length) {
    return;
  }

  const placeholders = uniqueValues.map((value, index) => {
    const key = `${paramPrefix}${index}`;
    params[key] = value;
    return `@${key}`;
  });

  clauses.push(`${column} IN (${placeholders.join(", ")})`);
}

function transactionOrderBy(sort: TransactionSort = "clear_date", sortDir: SortDirection = "desc") {
  const direction = sortDir === "asc" ? "ASC" : "DESC";
  const columnBySort: Record<TransactionSort, string> = {
    clear_date: "COALESCE(clear_date, '')",
    transaction_date: "COALESCE(transaction_date, '')",
    amount: "normalized_net_cents",
    account: "source_sheet",
    category: "COALESCE(accounting_category, '')",
  };

  return `ORDER BY ${columnBySort[sort] ?? columnBySort.clear_date} ${direction}, id DESC`;
}

export function getCategories() {
  return getDb()
    .prepare(
      `SELECT
        category_code as code,
        description as name,
        category_type as type,
        NULL as notes
       FROM category_rules
       ORDER BY category_type, category_code`,
    )
    .all() as NormalizedCategory[];
}

export function getCategoryBreakdown(type: "accounting" | "program") {
  const column = type === "accounting" ? "accounting_category" : "program_category";

  return getDb()
    .prepare(
      `SELECT ${column} as category,
        COUNT(*) as transactionCount,
        COALESCE(SUM(normalized_net_cents), 0) as netTotal
       FROM normalized_transactions
       WHERE ${column} IS NOT NULL AND ${column} != '' AND reporting_type != 'ignored'
       GROUP BY ${column}
       ORDER BY ABS(netTotal) DESC, category ASC`,
    )
    .all() as { category: string; transactionCount: number; netTotal: number }[];
}

export function hasTransactions() {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM transactions").get() as CountRow;
  return row.count > 0;
}

function nullableTransaction(transaction: NormalizedTransaction) {
  return {
    ...transaction,
    month: transaction.month ?? deriveMonth(transaction.transactionDate ?? transaction.clearDate),
    source: transaction.source ?? null,
    checkNumber: transaction.checkNumber ?? null,
    transactionDate: transaction.transactionDate ?? null,
    clearDate: transaction.clearDate ?? null,
    payee: transaction.payee ?? null,
    cleared: transaction.cleared ?? null,
    accountingCategory: transaction.accountingCategory ?? null,
    programCategory: transaction.programCategory ?? null,
    description: transaction.description ?? null,
    rawJson:
      transaction.rawJson ??
      JSON.stringify({
        externalId: transaction.externalId,
        direction: transaction.direction,
      }),
  };
}

function deriveMonth(date?: string) {
  return date ? date.slice(0, 7) : null;
}

function inferAccountType(accountName: string) {
  const knownTypes = new Map<string, string>([
    ["Cash Transactions", "cash"],
    ["DonorPerfect 2025", "crm"],
    ["Stripe Checking Acct", "processor"],
    ["Stripe 2025", "processor"],
    ["Paypal", "processor"],
    ["Capital One", "credit_card"],
  ]);

  return knownTypes.get(accountName) ?? "bank";
}

export function mapCategoryRuleType(type: string): CategoryType {
  if (type === "expense" || type === "expenditure") {
    return "expenditure";
  }

  if (type === "revenue" || type === "transfer" || type === "ignored" || type === "unknown") {
    return type;
  }

  return "unknown";
}
