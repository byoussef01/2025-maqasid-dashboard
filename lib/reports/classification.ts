import { getDb } from "@/lib/db/client";
import type { AccountType, CategoryType } from "@/lib/types/finance";

export type ClassifiableTransaction = {
  accountingCategory?: string | null;
  accounting_category?: string | null;
  netCents?: number | null;
  net_cents?: number | null;
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

export type ReportDateField = "transaction_date" | "clear_date" | "created_at";

export type ReportFilters = {
  startDate?: string;
  endDate?: string;
  dateField?: ReportDateField;
  account?: string;
  reportingType?: CategoryType | "all";
  accountingCategory?: string;
  programCategory?: string;
};

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

  return lookupCategoryType(categoryRules, categoryCode) ?? "unknown";
}

export function getNormalizedTransaction(
  transaction: ClassifiableTransaction,
): NormalizedClassification {
  const reportingType =
    transaction.reportingType ?? transaction.reporting_type ?? "unknown";
  const accountType = transaction.accountType ?? transaction.account_type ?? "other";
  const netCents = transaction.netCents ?? transaction.net_cents ?? 0;
  const absoluteNetCents = Math.abs(netCents);

  const revenueCents =
    reportingType === "revenue" && accountType !== "credit_card" ? absoluteNetCents : 0;
  const expenditureCents = reportingType === "expenditure" ? absoluteNetCents : 0;

  return {
    reportingType,
    revenueCents,
    expenditureCents,
    normalizedNetCents: revenueCents - expenditureCents,
  };
}

export function getSummaryReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);

  return getDb()
    .prepare(
      `SELECT
        COUNT(*) as transactionCount,
        COALESCE(SUM(CASE WHEN reporting_type = 'unknown' THEN 1 ELSE 0 END), 0) as unknownTransactionCount,
        COALESCE(SUM(revenue_cents), 0) as revenueCents,
        COALESCE(SUM(expenditure_cents), 0) as expenditureCents,
        COALESCE(SUM(normalized_net_cents), 0) as normalizedNetCents,
        COALESCE(SUM(CASE WHEN reporting_type = 'transfer' THEN ABS(net_cents) ELSE 0 END), 0) as transferCents,
        COALESCE(SUM(CASE WHEN reporting_type = 'ignored' THEN ABS(net_cents) ELSE 0 END), 0) as ignoredCents,
        COALESCE(SUM(CASE WHEN reporting_type = 'unknown' THEN ABS(net_cents) ELSE 0 END), 0) as unknownCents
       FROM normalized_transactions
       ${whereSql}`,
    )
    .get(params) as {
    transactionCount: number;
    unknownTransactionCount: number;
    revenueCents: number;
    expenditureCents: number;
    normalizedNetCents: number;
    transferCents: number;
    ignoredCents: number;
    unknownCents: number;
  };
}

export function getByAccountReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);

  return getDb()
    .prepare(
      `SELECT
        account,
        source_sheet as sourceSheet,
        account_type as accountType,
        COUNT(*) as transactionCount,
        COALESCE(SUM(revenue_cents), 0) as revenueCents,
        COALESCE(SUM(expenditure_cents), 0) as expenditureCents,
        COALESCE(SUM(normalized_net_cents), 0) as normalizedNetCents,
        COALESCE(SUM(CASE WHEN reporting_type = 'unknown' THEN ABS(net_cents) ELSE 0 END), 0) as unknownCents
       FROM normalized_transactions
       ${whereSql}
       GROUP BY account, source_sheet, account_type
       ORDER BY ABS(normalizedNetCents) DESC, account ASC`,
    )
    .all(params) as {
    account: string;
    sourceSheet: string;
    accountType: AccountType | null;
    transactionCount: number;
    revenueCents: number;
    expenditureCents: number;
    normalizedNetCents: number;
    unknownCents: number;
  }[];
}

export function getByCategoryReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);

  return getDb()
    .prepare(
      `SELECT
        COALESCE(accounting_category, '') as categoryCode,
        COALESCE(accounting_category_label, '') as categoryLabel,
        reporting_type as reportingType,
        COUNT(*) as transactionCount,
        COALESCE(SUM(revenue_cents), 0) as revenueCents,
        COALESCE(SUM(expenditure_cents), 0) as expenditureCents,
        COALESCE(SUM(normalized_net_cents), 0) as normalizedNetCents,
        COALESCE(SUM(ABS(net_cents)), 0) as absoluteNetCents
       FROM normalized_transactions
       ${whereSql}
       GROUP BY COALESCE(accounting_category, ''), COALESCE(accounting_category_label, ''), reporting_type
       ORDER BY reporting_type ASC, ABS(absoluteNetCents) DESC, categoryCode ASC`,
    )
    .all(params) as {
    categoryCode: string;
    categoryLabel: string;
    reportingType: CategoryType;
    transactionCount: number;
    revenueCents: number;
    expenditureCents: number;
    normalizedNetCents: number;
    absoluteNetCents: number;
  }[];
}

export function getExceptionsReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);

  return getDb()
    .prepare(
      `SELECT *
       FROM (
        SELECT
          id,
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
        FROM normalized_transactions
        ${whereSql}
       )
       WHERE reason != ''
       ORDER BY COALESCE(clearDate, transactionDate, '') DESC, id DESC
       LIMIT 10000`,
    )
    .all(params) as {
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
  }[];
}

export function getNormalizedTransactionsReport(filters: ReportFilters = {}) {
  const { whereSql, params } = reportWhere(filters);

  return getDb()
    .prepare(
      `SELECT
        id,
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
       ORDER BY COALESCE(clear_date, transaction_date, '') DESC, id DESC
       LIMIT 100000`,
    )
    .all(params) as {
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
  }[];
}

function reportWhere(filters: ReportFilters) {
  const dateField = filters.dateField ?? "transaction_date";
  assertDateField(dateField);

  const clauses: string[] = [];
  const params: Record<string, string> = {};

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

  if (filters.accountingCategory) {
    clauses.push("accounting_category = @accountingCategory");
    params.accountingCategory = filters.accountingCategory;
  }

  if (filters.programCategory) {
    clauses.push("program_category = @programCategory");
    params.programCategory = filters.programCategory;
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function assertDateField(dateField: string): asserts dateField is ReportDateField {
  if (!["transaction_date", "clear_date", "created_at"].includes(dateField)) {
    throw new Error(`Unsupported report date field: ${dateField}`);
  }
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
