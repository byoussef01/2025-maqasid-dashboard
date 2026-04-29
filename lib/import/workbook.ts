import * as XLSX from "xlsx";
import fs from "node:fs";

import { getDb, txExecute, withWriteTransaction } from "@/lib/db/client";
import { knownAccountSheets } from "@/lib/db/schema";
import {
  buildSummaryCategorySets,
  deriveSummaryCategoryRules,
  deriveSummaryNamedBucketRules,
  type SummaryCategoryRule,
  type SummaryNamedBucketRule,
  summarySheetExpenseCents,
  summarySheetRevenueCents,
} from "@/lib/reports/summary-formula";
import { ensureReportingCacheSchema, rebuildReportingCache } from "@/lib/reports/cache";
import type {
  AccountType,
  CategoryType,
  NormalizedCategory,
  NormalizedTransaction,
  WorkbookImportResult,
} from "@/lib/types/finance";

type CellValue = string | number | boolean | Date | null | undefined;
type RawRowValue = string | number | boolean | null;
type SheetRow = Record<string, RawRowValue>;
type ParsedSheet = {
  transactions: NormalizedTransaction[];
  skippedRows: number;
  warning?: string;
};
type HeaderMap = Partial<Record<ExpectedHeader, number>>;
type WorkbookFeeAllocationRule = {
  sheetName: string;
  categoryCode: string;
  helperRow: number;
  feeStartRow: number;
  feeEndRow: number;
};

const REQUIRED_HEADER_MARKERS = ["Month", "Account", "Trans. Date", "Clear Date", "Net"];
const HEADER_SCAN_ROWS = 40;
const EXPECTED_HEADERS = [
  "Month",
  "Account",
  "Source",
  "Check #",
  "Trans. Date",
  "Clear Date",
  "Pay to/from",
  "Gross",
  "Fee",
  "Net",
  "Cleared",
  "Accounting Category",
  "Program Category",
  "Description/Memo",
] as const;

type ExpectedHeader = (typeof EXPECTED_HEADERS)[number];

export type ParsedWorkbook = {
  result: WorkbookImportResult;
  transactions: NormalizedTransaction[];
  categories: NormalizedCategory[];
  summaryCategoryRules: SummaryCategoryRule[];
  summaryNamedBucketRules: SummaryNamedBucketRule[];
  countsBySheet: Record<string, number>;
  audit: WorkbookImportAudit;
};

export type WorkbookImportAudit = {
  expectedRevenueCents?: number;
  parsedRevenueCents: number;
  revenueDeltaCents?: number;
  expectedExpenseCents?: number;
  parsedExpenseCents: number;
  expenseDeltaCents?: number;
  expenseHelperMismatches: WorkbookExpenseHelperMismatch[];
};

export type WorkbookExpenseHelperMismatch = {
  sheetName: string;
  categoryCode: string;
  workbookNetCents: number;
  parsedNetCents: number;
  deltaCents: number;
};

export type WorkbookImportSummary = {
  importId: number;
  filename: string;
  totalImportedRows: number;
  countsBySheet: Record<string, number>;
  skippedRows: number;
  warnings: string[];
  audit: WorkbookImportAudit;
};

export async function parseWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { cellDates: true, dense: false });

  return parseWorkbook(workbook, file.name);
}

export function parseWorkbook(workbook: XLSX.WorkBook, fileName: string): ParsedWorkbook {
  const warnings: string[] = [];
  const categories = parseCategories(workbook.Sheets.Categories);
  const summaryCategoryRules = deriveSummaryCategoryRules(workbook);
  const summaryNamedBucketRules = deriveSummaryNamedBucketRules(workbook, summaryCategoryRules);
  const transactions: NormalizedTransaction[] = [];
  const countsBySheet: Record<string, number> = {};
  let skippedRows = 0;

  for (const { sheetName } of knownAccountSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      countsBySheet[sheetName] = 0;
      warnings.push(`Known account sheet "${sheetName}" was not found.`);
      continue;
    }

    const parsed = parseAccountSheet(sheetName, sheet);
    skippedRows += parsed.skippedRows;
    transactions.push(...parsed.transactions);
    countsBySheet[sheetName] = parsed.transactions.length;

    if (parsed.warning) {
      warnings.push(parsed.warning);
    }
  }

  transactions.push(
    ...deriveFeeAllocationTransactions(workbook, transactions, summaryCategoryRules),
  );

  const audit = auditWorkbookSummary(workbook, transactions, summaryCategoryRules);
  warnings.push(...summaryAuditWarnings(audit));

  const accountCount = new Set(transactions.map((transaction) => transaction.accountName)).size;
  const importedAt = new Date().toISOString();

  return {
    result: {
      importedAt,
      fileName,
      sheetCount: workbook.SheetNames.length,
      accountCount,
      transactionCount: transactions.length,
      categoryCount: categories.length,
      skippedRows,
      warnings,
    },
    transactions,
    categories,
    summaryCategoryRules,
    summaryNamedBucketRules,
    countsBySheet,
    audit,
  };
}

export async function importWorkbook(
  filePath: string,
  sourceFilename?: string,
): Promise<WorkbookImportSummary> {
  let workbook: XLSX.WorkBook;

  try {
    const bytes = fs.readFileSync(filePath);
    workbook = XLSX.read(bytes, { cellDates: true, dense: false, type: "buffer" });
  } catch (error) {
    throw new Error(`Unable to read workbook: ${errorMessage(error)}`);
  }

  const fileName = sourceFilename ?? filePath.split(/[\\/]/).at(-1) ?? filePath;
  const parsed = parseWorkbook(workbook, fileName);

  if (parsed.result.transactionCount === 0) {
    throw new Error(
      parsed.result.warnings.length
        ? `No transactions were imported. ${parsed.result.warnings.join(" ")}`
        : "No transactions were imported from the workbook.",
    );
  }

  await ensureReportingCacheSchema(getDb());

  const importId = await withWriteTransaction(async (transaction) => {
    await ensureReportingCacheSchema(transaction);
    await txExecute(
      transaction,
      "DELETE FROM transactions; DELETE FROM category_rules; DELETE FROM summary_named_bucket_rules; DELETE FROM summary_category_rules; DELETE FROM imports;",
    );

    const importInfo = await txExecute(transaction, {
      sql: `INSERT INTO imports (filename, imported_at, source_type, row_count, notes)
            VALUES (?, ?, ?, ?, ?)
            RETURNING id`,
      args: [
        parsed.result.fileName,
        parsed.result.importedAt,
        "xlsx",
        parsed.result.transactionCount,
        JSON.stringify({
          countsBySheet: parsed.countsBySheet,
          skippedRows: parsed.result.skippedRows,
          warnings: parsed.result.warnings,
          audit: parsed.audit,
        }),
      ],
    });

    const id = Number((importInfo.rows[0] as Record<string, unknown> | undefined)?.id ?? 0);
    await insertParsedWorkbookRows(
      transaction,
      id,
      parsed.transactions,
      parsed.categories,
      parsed.summaryCategoryRules,
      parsed.summaryNamedBucketRules,
    );
    await rebuildReportingCache(transaction);
    return id;
  });

  return {
    importId,
    filename: parsed.result.fileName,
    totalImportedRows: parsed.result.transactionCount,
    countsBySheet: parsed.countsBySheet,
    skippedRows: parsed.result.skippedRows,
    warnings: parsed.result.warnings,
    audit: parsed.audit,
  };
}

export async function insertParsedWorkbookRows(
  transaction: Parameters<typeof txExecute>[0],
  importId: number,
  transactions: NormalizedTransaction[],
  categories: NormalizedCategory[],
  summaryCategoryRules: SummaryCategoryRule[],
  summaryNamedBucketRules: SummaryNamedBucketRule[],
) {
  for (const category of categories) {
    await txExecute(transaction, {
      sql: `INSERT OR IGNORE INTO category_rules (
              category_code, category_type, description, is_active
            ) VALUES (?, ?, ?, 1)`,
      args: [category.code, category.type, category.name],
    });
  }

  for (const rule of summaryCategoryRules) {
    await txExecute(transaction, {
      sql: `INSERT OR REPLACE INTO summary_category_rules (
              category_code, summary_bucket, source, is_active
            ) VALUES (?, ?, 'workbook', 1)`,
      args: [rule.categoryCode, rule.summaryBucket],
    });
  }

  for (const rule of summaryNamedBucketRules) {
    await txExecute(transaction, {
      sql: `INSERT OR REPLACE INTO summary_named_bucket_rules (
              bucket_key, bucket_name, section_name, report_type, source_cell, display_order,
              category_code, summary_bucket, source, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workbook', 1)`,
      args: [
        rule.bucketKey,
        rule.bucketName,
        rule.sectionName,
        rule.reportType,
        rule.sourceCell,
        rule.displayOrder,
        rule.categoryCode,
        rule.summaryBucket,
      ],
    });
  }

  for (const transactionRow of transactions) {
    await txExecute(transaction, {
      sql: `INSERT INTO accounts (sheet_name, display_name, account_type, is_active)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(sheet_name) DO UPDATE SET
              display_name = excluded.display_name,
              is_active = 1`,
      args: [
        transactionRow.sourceSheet,
        transactionRow.accountName || transactionRow.sourceSheet,
        inferAccountType(transactionRow.sourceSheet),
      ],
    });
    await txExecute(transaction, {
      sql: `INSERT INTO transactions (
              import_id, source_sheet, source_row, month, account, source, check_number,
              transaction_date, clear_date, payee, gross_cents, fee_cents, net_cents,
              cleared, accounting_category, program_category, description, raw_json
            ) VALUES (
              $importId, $sourceSheet, $sourceRow, $month, $accountName, $source, $checkNumber,
              $transactionDate, $clearDate, $payee, $grossCents, $feeCents, $netCents,
              $cleared, $accountingCategory, $programCategory, $description, $rawJson
            )`,
      args: { importId, ...nullableTransaction(transactionRow) },
    });
  }
}

function parseAccountSheet(sheetName: string, sheet: XLSX.WorkSheet): ParsedSheet {
  return parseStandardAccountSheet(sheetName, sheet);
}

function deriveFeeAllocationTransactions(
  workbook: XLSX.WorkBook,
  transactions: NormalizedTransaction[],
  summaryCategoryRules: SummaryCategoryRule[],
) {
  const rules = detectWorkbookFeeAllocationRules(workbook, summaryCategoryRules);
  if (!rules.length) {
    return [];
  }

  const derived: NormalizedTransaction[] = [];

  for (const rule of rules) {
    const sheetTransactions = transactions.filter(
      (transaction) =>
        transaction.sourceSheet === rule.sheetName &&
        transaction.sourceRow >= rule.feeStartRow &&
        transaction.sourceRow <= rule.feeEndRow &&
        transaction.feeCents !== 0 &&
        !isDerivedTransaction(transaction),
    );

    for (const transaction of sheetTransactions) {
      derived.push({
        ...transaction,
        grossCents: -transaction.feeCents,
        feeCents: 0,
        netCents: -transaction.feeCents,
        direction: directionFor(-transaction.feeCents),
        source: transaction.source ? `${transaction.source} fee allocation` : "Fee allocation",
        accountingCategory: rule.categoryCode,
        programCategory: transaction.programCategory ?? undefined,
        description: transaction.description
          ? `${transaction.description} [Workbook fee allocation]`
          : "Workbook fee allocation",
        rawJson: JSON.stringify({
          kind: "workbook_fee_allocation",
          sourceSheet: rule.sheetName,
          sourceRow: transaction.sourceRow,
          helperRow: rule.helperRow,
          categoryCode: rule.categoryCode,
          feeCents: transaction.feeCents,
          feeStartRow: rule.feeStartRow,
          feeEndRow: rule.feeEndRow,
        }),
      });
    }
  }

  return derived;
}

function parseStandardAccountSheet(sheetName: string, sheet: XLSX.WorkSheet): ParsedSheet {
  const headerRow = findHeaderRow(sheet, REQUIRED_HEADER_MARKERS, HEADER_SCAN_ROWS);

  if (!headerRow) {
    return {
      transactions: [],
      skippedRows: 0,
      warning: `No standard transaction header row was found in "${sheetName}".`,
    };
  }

  const columnMap = buildColumnMap(sheet, headerRow);
  const transactions: NormalizedTransaction[] = [];
  let skippedRows = 0;
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");

  for (let rowNumber = headerRow + 1; rowNumber <= range.e.r + 1; rowNumber += 1) {
    const row = readMappedRow(sheet, rowNumber, columnMap);

    if (isFullyBlank(row)) {
      skippedRows += 1;
      continue;
    }

    const transactionDate = toIsoDate(row["Trans. Date"]);
    const clearDate = toIsoDate(row["Clear Date"]);
    const payee = stringValue(row["Pay to/from"]);
    const accountingCategory = normalizeCategoryCode(row["Accounting Category"]);
    const programCategory = normalizeCategoryCode(row["Program Category"]);
    const grossCents = parseMoneyCents(row.Gross);
    const feeCents = parseMoneyCents(row.Fee);
    const netCents = transactionAmountCents(row, grossCents, feeCents);
    const hasAmount = grossCents !== 0 || feeCents !== 0 || netCents !== 0;
    const hasCategory = Boolean(accountingCategory || programCategory);
    const hasTransactionSignal = Boolean(
      transactionDate ||
        clearDate ||
        payee ||
        stringValue(row.Source) ||
        stringValue(row["Check #"]) ||
        stringValue(row["Description/Memo"]) ||
        hasCategory,
    );

    if (!transactionDate && !clearDate && !hasAmount && !payee && !hasCategory) {
      skippedRows += 1;
      continue;
    }

    // Formula workbooks often carry footer/helper balances beneath the transaction area.
    // Skip amount-only rows with no transaction identifiers so SQLite mirrors the workbook tables.
    if (!hasTransactionSignal) {
      skippedRows += 1;
      continue;
    }

    const accountName = accountNameFrom(row.Account, sheetName);

    transactions.push({
      accountName,
      sourceSheet: sheetName,
      sourceRow: rowNumber,
      month: stringValue(row.Month) || deriveMonth(transactionDate ?? clearDate),
      source: stringValue(row.Source),
      checkNumber: stringValue(row["Check #"]),
      transactionDate,
      clearDate,
      payee,
      grossCents,
      feeCents,
      netCents,
      direction: directionFor(netCents),
      cleared: stringValue(row.Cleared),
      accountingCategory,
      programCategory,
      description: stringValue(row["Description/Memo"]),
      rawJson: JSON.stringify(row),
    });
  }

  return { transactions, skippedRows };
}

function parseCategories(sheet?: XLSX.WorkSheet): NormalizedCategory[] {
  if (!sheet) {
    return [];
  }

  const categories: NormalizedCategory[] = [];

  // The Summary sheet's reporting formulas point at these lists for accounting categories.
  categories.push(...categoryPairs(sheet, "J", "K", "revenue", 3, 300));
  categories.push(...categoryPairs(sheet, "M", "N", "expenditure", 3, 300));

  // Program categories are labels for reporting filters; they should not classify revenue/expense.
  categories.push(...categoryPairs(sheet, "P", "Q", "unknown", 3, 300));

  const seen = new Set<string>();
  return categories.filter((category) => {
    const key = `${category.type}:${category.code}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function auditWorkbookSummary(
  workbook: XLSX.WorkBook,
  transactions: NormalizedTransaction[],
  summaryCategoryRules: SummaryCategoryRule[],
): WorkbookImportAudit {
  const expectedRevenueCents = summaryCellMoneyCents(workbook.Sheets.Summary, "C75");
  const expectedExpenseCents = summaryCellMoneyCents(workbook.Sheets.Summary, "G84");
  const summaryCategorySets = buildSummaryCategorySets(summaryCategoryRules);
  let parsedRevenueCents = 0;
  let parsedExpenseCents = 0;

  for (const transaction of transactions) {
    const accountType = inferAccountType(transaction.sourceSheet);
    parsedRevenueCents += summarySheetRevenueCents(transaction, accountType, summaryCategorySets);
    parsedExpenseCents += summarySheetExpenseCents(transaction, accountType, summaryCategorySets);
  }

  const expenseHelperMismatches = auditWorkbookExpenseHelpers(
    workbook,
    transactions,
    summaryCategoryRules,
  );

  return {
    expectedRevenueCents,
    parsedRevenueCents,
    revenueDeltaCents:
      expectedRevenueCents === undefined ? undefined : parsedRevenueCents - expectedRevenueCents,
    expectedExpenseCents,
    parsedExpenseCents,
    expenseDeltaCents:
      expectedExpenseCents === undefined ? undefined : parsedExpenseCents - expectedExpenseCents,
    expenseHelperMismatches,
  };
}

function summaryAuditWarnings(audit: WorkbookImportAudit) {
  const warnings: string[] = [];

  if (audit.expectedRevenueCents === undefined || audit.expectedExpenseCents === undefined) {
    warnings.push(
      "Summary audit could not read cached workbook totals from Summary!C75 and Summary!G84. Re-export from Google Sheets after recalculation if you want an import-time formula check.",
    );
    return warnings;
  }

  if (Math.abs(audit.revenueDeltaCents ?? 0) > 1) {
    warnings.push(
      `Summary audit mismatch for C75 revenue: workbook ${formatAuditCurrency(audit.expectedRevenueCents)}, parsed ${formatAuditCurrency(audit.parsedRevenueCents)}, delta ${formatAuditCurrency(audit.revenueDeltaCents ?? 0)}.`,
    );
  }

  if (Math.abs(audit.expenseDeltaCents ?? 0) > 1) {
    warnings.push(
      `Summary audit mismatch for G84 expenses: workbook ${formatAuditCurrency(audit.expectedExpenseCents)}, parsed ${formatAuditCurrency(audit.parsedExpenseCents)}, delta ${formatAuditCurrency(audit.expenseDeltaCents ?? 0)}.`,
    );
  }

  for (const mismatch of audit.expenseHelperMismatches.slice(0, 10)) {
    warnings.push(
      `Expense helper mismatch for ${mismatch.sheetName} ${mismatch.categoryCode}: workbook ${formatAuditCurrency(mismatch.workbookNetCents)}, parsed ${formatAuditCurrency(mismatch.parsedNetCents)}, delta ${formatAuditCurrency(mismatch.deltaCents)}.`,
    );
  }

  return warnings;
}

function auditWorkbookExpenseHelpers(
  workbook: XLSX.WorkBook,
  transactions: NormalizedTransaction[],
  summaryCategoryRules: SummaryCategoryRule[],
): WorkbookExpenseHelperMismatch[] {
  const expenseCategoryRows = summaryCategoryRules
    .filter(
      (rule): rule is SummaryCategoryRule & { categoriesRow: number } =>
        rule.summaryBucket === "expense_net" && typeof rule.categoriesRow === "number",
    )
    .map((rule) => ({ code: rule.categoryCode, row: rule.categoriesRow }));
  if (expenseCategoryRows.length === 0) {
    return [];
  }

  const summaryCategorySets = buildSummaryCategorySets(summaryCategoryRules);
  const parsedBySheetAndCategory = new Map<string, number>();

  for (const transaction of transactions) {
    if (!transaction.accountingCategory) {
      continue;
    }

    const accountType = inferAccountType(transaction.sourceSheet);
    const amount = summarySheetExpenseCents(transaction, accountType, summaryCategorySets);
    if (amount === 0) {
      continue;
    }

    const key = `${transaction.sourceSheet}::${transaction.accountingCategory}`;
    parsedBySheetAndCategory.set(key, (parsedBySheetAndCategory.get(key) ?? 0) + amount);
  }

  const mismatches: WorkbookExpenseHelperMismatch[] = [];

  for (const { sheetName } of knownAccountSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const headerRow = findHeaderRow(sheet, REQUIRED_HEADER_MARKERS, HEADER_SCAN_ROWS);
    if (!headerRow) {
      continue;
    }

    const helperColumns = findExpenseHelperColumns(sheet, headerRow);
    if (!helperColumns) {
      continue;
    }

    const accountType = inferAccountType(sheetName);

    for (const { code: categoryCode, row } of expenseCategoryRows) {
      const rowNumber = headerRow + row - 2;
      const rawNet = cellValue(
        sheet,
        XLSX.utils.encode_cell({ r: rowNumber - 1, c: helperColumns.netCol }),
      );
      const workbookNet = summaryCellMoneyCentsFromValue(rawNet);
      if (workbookNet === undefined) {
        continue;
      }

      const workbookContribution = accountType === "credit_card" ? -workbookNet : workbookNet;
      const parsedNet =
        parsedBySheetAndCategory.get(`${sheetName}::${categoryCode}`) ?? 0;
      const delta = parsedNet - workbookContribution;

      if (Math.abs(delta) > 1) {
        mismatches.push({
          sheetName,
          categoryCode,
          workbookNetCents: workbookContribution,
          parsedNetCents: parsedNet,
          deltaCents: delta,
        });
      }
    }
  }

  return mismatches.sort((left, right) => Math.abs(right.deltaCents) - Math.abs(left.deltaCents));
}

function detectWorkbookFeeAllocationRules(
  workbook: XLSX.WorkBook,
  summaryCategoryRules: SummaryCategoryRule[],
) {
  const rules: WorkbookFeeAllocationRule[] = [];

  for (const { sheetName } of knownAccountSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const headerRow = findHeaderRow(sheet, REQUIRED_HEADER_MARKERS, HEADER_SCAN_ROWS);
    if (!headerRow) {
      continue;
    }

    const helperColumns = findExpenseHelperColumns(sheet, headerRow);
    if (!helperColumns) {
      continue;
    }

    for (const rule of summaryCategoryRules) {
      if (rule.summaryBucket !== "expense_net" || typeof rule.categoriesRow !== "number") {
        continue;
      }

      const helperRow = headerRow + rule.categoriesRow - 2;
      const debitAddress = XLSX.utils.encode_cell({
        r: helperRow - 1,
        c: helperColumns.netCol - 1,
      });
      const debitFormula = cellFormula(sheet, debitAddress);
      const feeRange = debitFormula ? referencedFeeRange(sheet, debitFormula, sheetName) : undefined;

      if (!debitFormula || !feeRange) {
        continue;
      }

      rules.push({
        sheetName,
        categoryCode: rule.categoryCode,
        helperRow,
        feeStartRow: feeRange.startRow,
        feeEndRow: feeRange.endRow,
      });
    }
  }

  return rules;
}

function findExpenseHelperColumns(sheet: XLSX.WorkSheet, headerRow: number) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const value = normalizeHeaderName(
      stringValue(cellValue(sheet, XLSX.utils.encode_cell({ r: headerRow - 1, c: col }))),
    );
    if (value === "Expense Category") {
      return {
        categoryCol: col,
        netCol: col + 3,
      };
    }
  }

  return undefined;
}

function summaryCellMoneyCents(sheet: XLSX.WorkSheet | undefined, address: string) {
  if (!sheet) {
    return undefined;
  }

  return summaryCellMoneyCentsFromValue(cellValue(sheet, address));
}

function summaryCellMoneyCentsFromValue(value: CellValue) {
  if (value === null || value === undefined || value === "" || value instanceof Date) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return undefined;
  }

  return parseMoneyCents(value);
}

function referencedFeeRange(sheet: XLSX.WorkSheet, formula: string, sheetName: string) {
  const normalized = formula.replace(/\s+/g, "");
  if (/\[\[#Totals\],\[Fee\]\]/i.test(normalized)) {
    const feeTotalFormula = feeTotalColumnFormula(sheet);
    if (!feeTotalFormula) {
      return undefined;
    }

    const match = feeTotalFormula.match(/SUM\(\$?[A-Z]{1,3}\$?(\d+):\$?[A-Z]{1,3}\$?(\d+)\)/i);
    if (!match) {
      return undefined;
    }

    return {
      startRow: Number(match[1]),
      endRow: Number(match[2]),
    };
  }

  const referenceAddress = feeReferenceAddress(formula, sheetName);
  if (!referenceAddress) {
    return undefined;
  }

  const referencedFormula = cellFormula(sheet, referenceAddress);
  if (!referencedFormula) {
    return undefined;
  }

  const match = referencedFormula.match(/SUM\(\$?[A-Z]{1,3}\$?(\d+):\$?[A-Z]{1,3}\$?(\d+)\)/i);
  if (!match) {
    return undefined;
  }

  return {
    startRow: Number(match[1]),
    endRow: Number(match[2]),
  };
}

function feeTotalColumnFormula(sheet: XLSX.WorkSheet) {
  const headerRow = findHeaderRow(sheet, REQUIRED_HEADER_MARKERS, HEADER_SCAN_ROWS);
  if (!headerRow) {
    return undefined;
  }

  const columnMap = buildColumnMap(sheet, headerRow);
  const feeCol = columnMap.Fee;
  if (feeCol === undefined) {
    return undefined;
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  for (let row = range.e.r + 1; row >= headerRow + 1; row -= 1) {
    const address = XLSX.utils.encode_cell({ r: row - 1, c: feeCol });
    const formula = cellFormula(sheet, address);
    if (formula && /SUM\(/i.test(formula)) {
      return formula;
    }
  }

  return undefined;
}

function feeReferenceAddress(formula: string, sheetName: string) {
  const normalized = formula.replace(/\s+/g, "");
  const match = normalized.match(/-(?:'([^']+)'!)?\$?([A-Z]{1,3})\$?(\d+)$/i);
  if (!match) {
    return undefined;
  }

  const referencedSheet = match[1];
  if (referencedSheet && referencedSheet !== sheetName) {
    return undefined;
  }

  return `${match[2]}${match[3]}`;
}

function categoryPairs(
  sheet: XLSX.WorkSheet,
  codeColumn: string,
  nameColumn: string,
  type: CategoryType,
  startRow: number,
  endRow: number,
  notesColumn?: string,
) {
  const categories: NormalizedCategory[] = [];

  for (let row = startRow; row <= endRow; row += 1) {
    const code = normalizeCategoryCode(cellValue(sheet, `${codeColumn}${row}`));
    const name = stringValue(cell(sheet, `${nameColumn}${row}`));

    if (!code || !name || code.toLowerCase() === "notes") {
      continue;
    }

    categories.push({
      code,
      name,
      type,
      notes: notesColumn ? stringValue(cell(sheet, `${notesColumn}${row}`)) : undefined,
    });
  }

  return categories;
}

function findHeaderRow(sheet: XLSX.WorkSheet, markers: string[], maxRows: number) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const endRow = Math.min(maxRows, range.e.r + 1);

  for (let row = 1; row <= endRow; row += 1) {
    const values = rowValues(sheet, row).map(normalizeHeaderName);
    if (markers.every((marker) => values.includes(marker))) {
      return row;
    }
  }

  return undefined;
}

function buildColumnMap(sheet: XLSX.WorkSheet, headerRow: number): HeaderMap {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const columnMap: HeaderMap = {};

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const header = normalizeHeaderName(
      stringValue(cellValue(sheet, XLSX.utils.encode_cell({ r: headerRow - 1, c: col }))),
    );
    if (isExpectedHeader(header)) {
      columnMap[header] = col;
    }
  }

  return columnMap;
}

function readMappedRow(sheet: XLSX.WorkSheet, rowNumber: number, columnMap: HeaderMap): SheetRow {
  const row = {} as SheetRow;

  for (const header of EXPECTED_HEADERS) {
    const col = columnMap[header];
    row[header] =
      col === undefined
        ? null
        : serializeCellValue(cellValue(sheet, XLSX.utils.encode_cell({ r: rowNumber - 1, c: col })));
  }

  return row;
}

function rowValues(sheet: XLSX.WorkSheet, row: number) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  const values: string[] = [];

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    values.push(stringValue(cellValue(sheet, XLSX.utils.encode_cell({ r: row - 1, c: col }))));
  }

  return values;
}

function cell(sheet: XLSX.WorkSheet, address: string): CellValue {
  return cellValue(sheet, address);
}

function cellFormula(sheet: XLSX.WorkSheet, address: string) {
  const worksheetCell = sheet[address];
  if (!worksheetCell) {
    return undefined;
  }

  if (typeof worksheetCell.f === "string" && worksheetCell.f.trim()) {
    return worksheetCell.f.trim();
  }

  if (typeof worksheetCell.v === "string" && worksheetCell.v.trim().startsWith("=")) {
    return worksheetCell.v.trim().slice(1);
  }

  return undefined;
}

function cellValue(sheet: XLSX.WorkSheet, address: string): CellValue {
  const value = sheet[address]?.v as CellValue;
  return value ?? null;
}

function stringValue(value: CellValue) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseMoneyCents(value: RawRowValue) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100);
  }

  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const isParentheticalNegative = /^\(.*\)$/.test(trimmed);
  const isExplicitNegative = trimmed.includes("-");
  const numericText = trimmed.replace(/[$,\s()]/g, "").replace("-", "");
  const parsed = Number(numericText);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  const sign = isParentheticalNegative || isExplicitNegative ? -1 : 1;
  return Math.round(parsed * 100) * sign;
}

function transactionAmountCents(row: SheetRow, grossCents: number, feeCents: number) {
  const clearedCents = parseMoneyCents(row.Cleared);
  if (clearedCents !== 0 || hasMoneyValue(row.Cleared)) {
    return clearedCents;
  }

  const netCents = parseMoneyCents(row.Net);
  if (netCents !== 0 || hasMoneyValue(row.Net)) {
    return netCents;
  }

  if (grossCents !== 0 || feeCents !== 0) {
    return grossCents - feeCents;
  }

  return 0;
}

function hasMoneyValue(value: RawRowValue) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return trimmed !== "" && Number.isFinite(Number(trimmed.replace(/[$,\s()]/g, "").replace("-", "")));
}

function toIsoDate(value: CellValue) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return undefined;
}

function directionFor(netCents: number): CategoryType {
  if (netCents > 0) {
    return "revenue";
  }

  if (netCents < 0) {
    return "expenditure";
  }

  return "unknown";
}

function deriveMonth(date?: string) {
  return date ? date.slice(0, 7) : undefined;
}

function normalizeHeaderName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const aliases = new Map<string, ExpectedHeader>([
    ["Check Number", "Check #"],
    ["Check No.", "Check #"],
    ["Check No", "Check #"],
    ["Description", "Description/Memo"],
    ["Memo", "Description/Memo"],
  ]);

  return aliases.get(normalized) ?? normalized;
}

function isExpectedHeader(header: string): header is ExpectedHeader {
  return EXPECTED_HEADERS.includes(header as ExpectedHeader);
}

function normalizeCategoryCode(value: RawRowValue | CellValue) {
  const normalized = stringValue(value).trim().toUpperCase().replace(/\.+$/, "");
  return normalized === "" || normalized === "0" || normalized === "-" ? "" : normalized;
}

function isFullyBlank(row: SheetRow) {
  return Object.values(row).every(
    (value) => value === null || value === undefined || String(value).trim() === "",
  );
}

function serializeCellValue(value: CellValue): RawRowValue {
  if (value instanceof Date) {
    return toIsoDate(value) ?? value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return null;
}

function accountNameFrom(value: RawRowValue, fallback: string) {
  const accountName = stringValue(value);
  return accountName && accountName !== "0" ? accountName : fallback;
}

function nullableTransaction(transaction: NormalizedTransaction) {
  return {
    sourceSheet: transaction.sourceSheet,
    sourceRow: transaction.sourceRow,
    accountName: transaction.accountName,
    grossCents: transaction.grossCents,
    feeCents: transaction.feeCents,
    netCents: transaction.netCents,
    month: transaction.month ?? deriveMonth(transaction.transactionDate ?? transaction.clearDate) ?? null,
    source: transaction.source ?? null,
    checkNumber: transaction.checkNumber ?? null,
    transactionDate: transaction.transactionDate ?? null,
    clearDate: transaction.clearDate ?? null,
    payee: transaction.payee ?? null,
    cleared: transaction.cleared ?? null,
    accountingCategory: transaction.accountingCategory ?? null,
    programCategory: transaction.programCategory ?? null,
    description: transaction.description ?? null,
    rawJson: transaction.rawJson ?? "{}",
  };
}

function isDerivedTransaction(transaction: NormalizedTransaction) {
  return transaction.rawJson?.includes("\"kind\":\"workbook_fee_allocation\"") ?? false;
}

function inferAccountType(sheetName: string): AccountType {
  const account = knownAccountSheets.find((known) => known.sheetName === sheetName);
  return account?.accountType ?? "bank";
}

function formatAuditCurrency(cents: number) {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
