import { dbAll, dbOne } from "@/lib/db/client";
import type { AccountType, CategoryType } from "@/lib/types/finance";

export type ClassifiableTransaction = {
  accountingCategory?: string | null;
  accounting_category?: string | null;
  netCents?: number | null;
  net_cents?: number | null;
  grossCents?: number | null;
  gross_cents?: number | null;
  reportingType?: CategoryType | null;
  reporting_type?: CategoryType | null;
  accountType?: AccountType | null;
  account_type?: AccountType | null;
};

export type ClassifiableAccount = {
  accountType?: AccountType | null;
  account_type?: AccountType | null;
};

export type CategoryRuleLookup =
  | Map<string, CategoryType>
  | Record<string, CategoryType | { categoryType?: CategoryType; category_type?: CategoryType }>;

export type NormalizedClassification = {
  reportingType: CategoryType;
  revenueCents: number;
  expenditureCents: number;
  normalizedNetCents: number;
};

export type ReportDateField = "transaction_date" | "clear_date" | "created_at" | "workbook_month";

export type ReportFilters = {
  startDate?: string;
  endDate?: string;
  dateField?: ReportDateField;
  account?: string;
  reportingType?: CategoryType | "all";
  accountingCategory?: string[];
  programCategory?: string[];
  includeUncategorized?: boolean;
  summaryBucketSort?: SummaryBucketSort;
  summaryBucketSortDir?: SortDirection;
  summaryBucketSection?: string;
  showEmptyBuckets?: boolean;
};

export type SummaryBucketSort = "section" | "bucket" | "type" | "transactions" | "total";
export type SortDirection = "asc" | "desc";

export function classifyTransaction(
  transaction: ClassifiableTransaction,
  account: ClassifiableAccount | undefined,
  categoryRules: CategoryRuleLookup,
): CategoryType {
  void (account?.accountType ?? account?.account_type);
  const categoryCode = normalizeCategoryCode(
    transaction.accountingCategory ?? transaction.accounting_category,
  );
  if (!categoryCode) {
    return "unknown";
  }

  if (categoryCode === "?") {
    return "unknown";
  }

  return lookupCategoryType(categoryRules, categoryCode) ?? "unknown";
}

export function getNormalizedTransaction(
  transaction: ClassifiableTransaction,
): NormalizedClassification {
  const accountType = transaction.accountType ?? transaction.account_type ?? "other";
  const netCents = transaction.netCents ?? transaction.net_cents ?? 0;
  const grossCents = transaction.grossCents ?? transaction.gross_cents ?? netCents;
  const reportAmountCents = accountType === "credit_card" ? -grossCents : grossCents;
  const categoryCode = normalizeCategoryCode(
    transaction.accountingCategory ?? transaction.accounting_category,
  );
  const reportingType =
    categoryCode === "?"
      ? "unknown"
      : (transaction.reportingType ?? transaction.reporting_type ?? "unknown");

  const revenueCents =
    reportingType === "revenue" && accountType !== "credit_card" && reportAmountCents > 0
      ? reportAmountCents
      : 0;
  const expenditureCents =
    reportingType === "expenditure" && reportAmountCents < 0 ? -reportAmountCents : 0;
  const normalizedNetCents =
    reportingType === "revenue" && accountType !== "credit_card"
      ? reportAmountCents
      : reportingType === "expenditure"
        ? reportAmountCents
        : 0;

  return {
    reportingType,
    revenueCents,
    expenditureCents,
    normalizedNetCents,
  };
}

export async function getSummaryReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);
  const metrics = buildReportMetricSql(filters);

  return dbOne<{
    transactionCount: number;
    unknownTransactionCount: number;
    revenueCents: number;
    expenditureCents: number;
    normalizedNetCents: number;
    transferCents: number;
    ignoredCents: number;
    unknownCents: number;
  }>(
      `SELECT
        COUNT(*) as transactionCount,
        COALESCE(SUM(CASE WHEN reporting_type = 'unknown' THEN 1 ELSE 0 END), 0) as unknownTransactionCount,
        COALESCE(SUM(${metrics.revenueExpr}), 0) as revenueCents,
        COALESCE(SUM(${metrics.expenditureExpr}), 0) as expenditureCents,
        COALESCE(SUM(${metrics.normalizedNetExpr}), 0) as normalizedNetCents,
        COALESCE(SUM(CASE WHEN reporting_type = 'transfer' THEN ABS(report_amount_cents) ELSE 0 END), 0) as transferCents,
        COALESCE(SUM(CASE WHEN reporting_type = 'ignored' THEN ABS(report_amount_cents) ELSE 0 END), 0) as ignoredCents,
        COALESCE(SUM(CASE WHEN reporting_type = 'unknown' THEN ABS(report_amount_cents) ELSE 0 END), 0) as unknownCents
       FROM reporting_transactions
       ${whereSql}`,
      params,
    );
}

export async function getByAccountReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);
  const metrics = buildReportMetricSql(filters);

  return dbAll<{
    account: string;
    sourceSheet: string;
    accountType: AccountType | null;
    transactionCount: number;
    revenueCents: number;
    expenditureCents: number;
    normalizedNetCents: number;
    unknownCents: number;
  }>(
      `SELECT
        reporting_transactions.source_sheet as account,
        reporting_transactions.source_sheet as sourceSheet,
        reporting_transactions.account_type as accountType,
        COUNT(*) as transactionCount,
        COALESCE(SUM(${metrics.revenueExpr}), 0) as revenueCents,
        COALESCE(SUM(${metrics.expenditureExpr}), 0) as expenditureCents,
        COALESCE(SUM(${metrics.normalizedNetExpr}), 0) as normalizedNetCents,
        COALESCE(SUM(CASE WHEN reporting_type = 'unknown' THEN ABS(report_amount_cents) ELSE 0 END), 0) as unknownCents
       FROM reporting_transactions
       ${whereSql}
       GROUP BY reporting_transactions.source_sheet, reporting_transactions.account_type
       ORDER BY ABS(normalizedNetCents) DESC, account ASC`,
      params,
    );
}

export async function getByCategoryReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);
  const metrics = buildReportMetricSql(filters);

  return dbAll<{
    categoryCode: string;
    categoryLabel: string;
    reportingType: CategoryType;
    transactionCount: number;
    revenueCents: number;
    expenditureCents: number;
    normalizedNetCents: number;
    absoluteNetCents: number;
  }>(
      `SELECT
        COALESCE(accounting_category, '') as categoryCode,
        COALESCE(accounting_category_label, '') as categoryLabel,
        reporting_type as reportingType,
        COUNT(*) as transactionCount,
        COALESCE(SUM(${metrics.revenueExpr}), 0) as revenueCents,
        COALESCE(SUM(${metrics.expenditureExpr}), 0) as expenditureCents,
        COALESCE(SUM(${metrics.normalizedNetExpr}), 0) as normalizedNetCents,
        COALESCE(SUM(ABS(report_amount_cents)), 0) as absoluteNetCents
       FROM reporting_transactions
       ${whereSql}
       GROUP BY COALESCE(accounting_category, ''), COALESCE(accounting_category_label, ''), reporting_type
       ORDER BY reporting_type ASC, ABS(absoluteNetCents) DESC, categoryCode ASC`,
      params,
    );
}

export async function getSummaryBucketReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);
  const scopedJoinFilterSql = scopeWhereSql(whereSql, "entries").replace(
    /^WHERE\s+/,
    "AND ",
  );
  const orderBy = summaryBucketOrderBy(filters.summaryBucketSort, filters.summaryBucketSortDir);
  const bucketClauses: string[] = [];
  const bucketParams: Record<string, string> = {};

  if (filters.summaryBucketSection) {
    bucketClauses.push("buckets.section_name = $summaryBucketSection");
    bucketParams.summaryBucketSection = filters.summaryBucketSection;
  }

  const bucketWhereSql = bucketClauses.length ? `WHERE ${bucketClauses.join(" AND ")}` : "";
  const havingSql = filters.showEmptyBuckets ? "" : "HAVING COALESCE(totalCents, 0) != 0";

  return dbAll<{
    bucketKey: string;
    bucketName: string;
    sectionName: string;
    reportType: "revenue" | "expense";
    sourceCell: string;
    displayOrder: number;
    transactionCount: number;
    totalCents: number;
  }>(
      `SELECT
        buckets.bucket_key as bucketKey,
        buckets.bucket_name as bucketName,
        buckets.section_name as sectionName,
        buckets.report_type as reportType,
        buckets.source_cell as sourceCell,
        buckets.display_order as displayOrder,
        COUNT(DISTINCT entries.transaction_id) as transactionCount,
        COALESCE(SUM(COALESCE(entries.total_cents, 0)), 0) as totalCents
       FROM (
         SELECT
           bucket_key,
           bucket_name,
           section_name,
           report_type,
           source_cell,
           MIN(display_order) as display_order
         FROM summary_named_bucket_rules
         WHERE is_active = 1
         GROUP BY bucket_key, bucket_name, section_name, report_type, source_cell
       ) buckets
       LEFT JOIN reporting_bucket_entries entries
         ON entries.bucket_key = buckets.bucket_key
        ${scopedJoinFilterSql}
       ${bucketWhereSql}
       GROUP BY
         buckets.bucket_key,
         buckets.bucket_name,
         buckets.section_name,
         buckets.report_type,
         buckets.source_cell
       ${havingSql}
       ${orderBy}`,
      { ...params, ...bucketParams },
    );
}

export async function getSummaryBucketSections() {
  return dbAll<{ sectionName: string }>(
    `SELECT DISTINCT section_name as sectionName
     FROM summary_named_bucket_rules
     WHERE is_active = 1
     ORDER BY section_name ASC`,
  );
}

export async function getExceptionsReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);

  return dbAll<{
    id: number;
    sourceSheet: string;
    sourceRow: number;
    account: string;
    accountType: AccountType | null;
    transactionDate: string | null;
    clearDate: string | null;
    payee: string | null;
    description: string | null;
    netCents: number;
    accountingCategory: string | null;
    accountingCategoryLabel: string | null;
    programCategory: string | null;
    programCategoryLabel: string | null;
    reportingType: CategoryType;
    rawJson: string | null;
    reason: string;
  }>(
      `SELECT *
       FROM (
        SELECT
          transaction_id as id,
          source_sheet as sourceSheet,
          source_row as sourceRow,
          account,
          account_type as accountType,
          transaction_date as transactionDate,
          clear_date as clearDate,
          payee,
          description,
          net_cents as netCents,
          accounting_category as accountingCategory,
          accounting_category_label as accountingCategoryLabel,
          program_category as programCategory,
          program_category_label as programCategoryLabel,
          reporting_type as reportingType,
          raw_json as rawJson,
          TRIM(
            CASE WHEN (transaction_date IS NULL OR transaction_date = '') AND (clear_date IS NULL OR clear_date = '') THEN 'missing date; ' ELSE '' END ||
            CASE WHEN json_extract(raw_json, '$.Net') IS NULL OR TRIM(CAST(json_extract(raw_json, '$.Net') AS TEXT)) = '' THEN 'missing net; ' ELSE '' END ||
            CASE WHEN accounting_category IS NULL OR accounting_category = '' THEN 'missing accounting category; ' ELSE '' END ||
            CASE WHEN reporting_type = 'unknown' THEN 'unknown category; ' ELSE '' END ||
            CASE
              WHEN (
                ((json_extract(raw_json, '$."Trans. Date"') IS NOT NULL AND TRIM(CAST(json_extract(raw_json, '$."Trans. Date"') AS TEXT)) != '') AND (transaction_date IS NULL OR transaction_date = ''))
                OR
                ((json_extract(raw_json, '$."Clear Date"') IS NOT NULL AND TRIM(CAST(json_extract(raw_json, '$."Clear Date"') AS TEXT)) != '') AND (clear_date IS NULL OR clear_date = ''))
              )
              THEN 'invalid date; '
              ELSE ''
            END ||
            CASE WHEN account_type = 'credit_card' AND reporting_type IN ('unknown', 'revenue') AND net_cents != 0 THEN 'ambiguous credit card transaction; ' ELSE '' END
          ) as reason
       FROM reporting_transactions
        ${whereSql}
       )
       WHERE reason != ''
       ORDER BY COALESCE(clearDate, transactionDate, '') DESC, id DESC
       LIMIT 10000`,
      params,
    );
}

export async function getNormalizedTransactionsReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);
  const metrics = buildReportMetricSql(filters);

  return dbAll<{
    id: number;
    importId: number;
    sourceSheet: string;
    sourceRow: number;
    month: string | null;
    account: string;
    accountType: AccountType | null;
    source: string | null;
    checkNumber: string | null;
    transactionDate: string | null;
    clearDate: string | null;
    payee: string | null;
    grossCents: number;
    feeCents: number;
    netCents: number;
    reportingType: CategoryType;
    revenueCents: number;
    expenditureCents: number;
    normalizedNetCents: number;
    cleared: string | null;
    accountingCategory: string | null;
    accountingCategoryLabel: string | null;
    programCategory: string | null;
    programCategoryLabel: string | null;
    description: string | null;
    rawJson: string | null;
  }>(
      `SELECT
        transaction_id as id,
        import_id as importId,
        source_sheet as sourceSheet,
        source_row as sourceRow,
        month,
        account,
        account_type as accountType,
        source,
        check_number as checkNumber,
        transaction_date as transactionDate,
        clear_date as clearDate,
        payee,
        gross_cents as grossCents,
        fee_cents as feeCents,
        net_cents as netCents,
        reporting_type as reportingType,
        ${metrics.revenueExpr} as revenueCents,
        ${metrics.expenditureExpr} as expenditureCents,
        ${metrics.normalizedNetExpr} as normalizedNetCents,
        cleared,
        accounting_category as accountingCategory,
        accounting_category_label as accountingCategoryLabel,
        program_category as programCategory,
        program_category_label as programCategoryLabel,
        description,
        raw_json as rawJson
       FROM reporting_transactions
       ${whereSql}
       ORDER BY COALESCE(clear_date, transaction_date, '') DESC, transaction_id DESC
       LIMIT 100000`,
      params,
    );
}

function reportWhere(filters: ReportFilters) {
  const dateField = filters.dateField ?? "transaction_date";
  assertDateField(dateField);
  const dateExpression = reportDateExpression(dateField);

  const clauses: string[] = [];
  const params: Record<string, string> = {};

  if (filters.startDate) {
    clauses.push(`${dateExpression} >= $startDate`);
    params.startDate = filters.startDate;
  }

  if (filters.endDate) {
    clauses.push(`${dateExpression} < $endDate`);
    params.endDate = filters.endDate;
  }

  if (filters.account) {
    clauses.push("source_sheet = $account");
    params.account = filters.account;
  }

  if (filters.reportingType && filters.reportingType !== "all") {
    clauses.push("reporting_type = $reportingType");
    params.reportingType = filters.reportingType;
  }

  addMultiValueClause(clauses, params, "accounting_category", "accountingCategory", filters.accountingCategory);
  addMultiValueClause(clauses, params, "program_category", "programCategory", filters.programCategory);

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function buildReportMetricSql(filters: ReportFilters) {
  const summaryRevenueExpr = "workbook_revenue_cents";
  const summaryExpenditureExpr = "workbook_expenditure_cents";
  const summaryNetExpr = "workbook_normalized_net_cents";

  if (!filters.includeUncategorized) {
    return {
      revenueExpr: summaryRevenueExpr,
      expenditureExpr: summaryExpenditureExpr,
      normalizedNetExpr: summaryNetExpr,
    };
  }

  const unknownRevenueExpr = "unknown_revenue_cents";
  const unknownExpenditureExpr = "unknown_expenditure_cents";
  const unknownNetExpr = `(${unknownRevenueExpr} + ${unknownExpenditureExpr})`;

  return {
    revenueExpr: `(${summaryRevenueExpr} + ${unknownRevenueExpr})`,
    expenditureExpr: `(${summaryExpenditureExpr} + ${unknownExpenditureExpr})`,
    normalizedNetExpr: `(${summaryNetExpr} + ${unknownNetExpr})`,
  };
}

function addMultiValueClause(
  clauses: string[],
  params: Record<string, string>,
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
    return `$${key}`;
  });

  clauses.push(`${column} IN (${placeholders.join(", ")})`);
}

function scopeWhereSql(whereSql: string, tableName: string) {
  if (!whereSql) {
    return "";
  }

  return whereSql.replaceAll(
    /\b(source_sheet|reporting_type|accounting_category|program_category|transaction_date|clear_date|created_at|month|workbook_month_date)\b/g,
    `${tableName}.$1`,
  );
}

function summaryBucketOrderBy(
  sort: SummaryBucketSort = "type",
  direction: SortDirection = "asc",
) {
  const dir = direction === "desc" ? "DESC" : "ASC";

  switch (sort) {
    case "section":
      return `ORDER BY buckets.section_name ${dir}, MIN(buckets.display_order) ASC, buckets.bucket_name ASC`;
    case "bucket":
      return `ORDER BY buckets.bucket_name ${dir}, buckets.section_name ASC, MIN(buckets.display_order) ASC`;
    case "transactions":
      return `ORDER BY transactionCount ${dir}, buckets.report_type ASC, MIN(buckets.display_order) ASC`;
    case "total":
      return `ORDER BY ABS(totalCents) ${dir}, buckets.report_type ASC, MIN(buckets.display_order) ASC`;
    case "type":
    default:
      return `ORDER BY buckets.report_type ${dir}, MIN(buckets.display_order) ASC, buckets.bucket_name ASC`;
  }
}

function assertDateField(dateField: string): asserts dateField is ReportDateField {
  if (!["transaction_date", "clear_date", "created_at", "workbook_month"].includes(dateField)) {
    throw new Error(`Unsupported report date field: ${dateField}`);
  }
}

function reportDateExpression(dateField: ReportDateField) {
  return dateField === "workbook_month" ? "workbook_month_date" : dateField;
}

function normalizeCategoryCode(value?: string | null) {
  return value?.trim().toUpperCase() ?? "";
}

function lookupCategoryType(categoryRules: CategoryRuleLookup, categoryCode: string) {
  if (categoryRules instanceof Map) {
    return categoryRules.get(categoryCode);
  }

  const rule = categoryRules[categoryCode];
  if (!rule) {
    return undefined;
  }

  if (typeof rule === "string") {
    return rule;
  }

  return rule.categoryType ?? rule.category_type;
}
