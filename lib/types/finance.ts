export type CategoryType = "revenue" | "expenditure" | "transfer" | "ignored" | "unknown";
export type AccountType = "bank" | "cash" | "credit_card" | "processor" | "crm" | "other";

export type TransactionDirection = CategoryType;

export type NormalizedCategory = {
  code: string;
  name: string;
  type: CategoryType;
  notes?: string;
};

export type NormalizedTransaction = {
  accountName: string;
  sourceSheet: string;
  sourceRow: number;
  month?: string;
  source?: string;
  checkNumber?: string;
  transactionDate?: string;
  clearDate?: string;
  payee?: string;
  grossCents: number;
  feeCents: number;
  netCents: number;
  direction: TransactionDirection;
  cleared?: string;
  accountingCategory?: string;
  accountingCategoryLabel?: string;
  programCategory?: string;
  programCategoryLabel?: string;
  description?: string;
  externalId?: string;
  rawJson?: string;
};

export type WorkbookImportResult = {
  importedAt: string;
  fileName: string;
  sheetCount: number;
  accountCount: number;
  transactionCount: number;
  categoryCount: number;
  skippedRows: number;
  warnings: string[];
};

export type DashboardSummary = {
  transactionCount: number;
  accountCount: number;
  grossTotal: number;
  feeTotal: number;
  netTotal: number;
  creditTotal: number;
  debitTotal: number;
};

export type AccountSummary = {
  accountName: string;
  transactionCount: number;
  netTotal: number;
  creditTotal: number;
  debitTotal: number;
};

export type TransactionRecord = NormalizedTransaction & {
  id: number;
  importId: number;
  accountType?: AccountType;
  reportingType: CategoryType;
  revenueCents: number;
  expenditureCents: number;
  normalizedNetCents: number;
};

export type TransactionFilters = {
  q?: string;
  account?: string;
  category?: string;
  direction?: TransactionDirection | "all";
  limit?: number;
};
