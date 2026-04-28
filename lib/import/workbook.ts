import * as XLSX from "xlsx";
import fs from "node:fs";

import { getDb } from "@/lib/db/client";
import { knownAccountSheets } from "@/lib/db/schema";
import type {
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

const REQUIRED_HEADER_MARKERS = ["Month", "Account", "Trans. Date", "Clear Date", "Net"];
const HEADER_SCAN_ROWS = 40;
const BLANK_ROW_STOP_STRETCH = 25;
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
  countsBySheet: Record<string, number>;
};

export type WorkbookImportSummary = {
  importId: number;
  filename: string;
  totalImportedRows: number;
  countsBySheet: Record<string, number>;
  skippedRows: number;
  warnings: string[];
};

export async function parseWorkbookFile(file: File): Promise<ParsedWorkbook> {
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { cellDates: true, dense: false });

  return parseWorkbook(workbook, file.name);
}

export function parseWorkbook(workbook: XLSX.WorkBook, fileName: string): ParsedWorkbook {
  const warnings: string[] = [];
  const categories = parseCategories(workbook.Sheets.Categories);
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
    countsBySheet,
  };
}

export function importWorkbook(filePath: string, sourceFilename?: string): WorkbookImportSummary {
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

  const db = getDb();

  const run = db.transaction(() => {
    db.exec("DELETE FROM transactions; DELETE FROM category_rules; DELETE FROM imports;");

    const importInfo = db
      .prepare(
        `INSERT INTO imports (filename, imported_at, source_type, row_count, notes)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        parsed.result.fileName,
        parsed.result.importedAt,
        "xlsx",
        parsed.result.transactionCount,
        JSON.stringify({
          countsBySheet: parsed.countsBySheet,
          skippedRows: parsed.result.skippedRows,
          warnings: parsed.result.warnings,
        }),
      );

    const importId = Number(importInfo.lastInsertRowid);
    insertParsedWorkbookRows(importId, parsed.transactions, parsed.categories);
    return importId;
  });

  const importId = run();

  return {
    importId,
    filename: parsed.result.fileName,
    totalImportedRows: parsed.result.transactionCount,
    countsBySheet: parsed.countsBySheet,
    skippedRows: parsed.result.skippedRows,
    warnings: parsed.result.warnings,
  };
}

export function insertParsedWorkbookRows(
  importId: number,
  transactions: NormalizedTransaction[],
  categories: NormalizedCategory[],
) {
  const db = getDb();
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
    insertCategoryRule.run(category.code, category.type, category.name);
  }

  for (const transaction of transactions) {
    upsertAccount.run(
      transaction.sourceSheet,
      transaction.accountName || transaction.sourceSheet,
      inferAccountType(transaction.sourceSheet),
    );
    insertTransaction.run({ importId, ...nullableTransaction(transaction) });
  }
}

function parseAccountSheet(sheetName: string, sheet: XLSX.WorkSheet): ParsedSheet {
  return parseStandardAccountSheet(sheetName, sheet);
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
  let blankStretch = 0;
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");

  for (let rowNumber = headerRow + 1; rowNumber <= range.e.r + 1; rowNumber += 1) {
    const row = readMappedRow(sheet, rowNumber, columnMap);

    if (isFullyBlank(row)) {
      skippedRows += 1;
      blankStretch += 1;
      if (blankStretch >= BLANK_ROW_STOP_STRETCH) {
        break;
      }
      continue;
    }

    blankStretch = 0;

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

    if (!transactionDate && !clearDate && !hasAmount && !payee && !hasCategory) {
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

  categories.push(...categoryPairs(sheet, "J", "K", "revenue", 3, 300));
  categories.push(...categoryPairs(sheet, "M", "N", "expenditure", 3, 300));
  categories.push(...categoryPairs(sheet, "P", "Q", "unknown", 3, 300));
  categories.push(...categoryPairs(sheet, "B", "C", "revenue", 4, 300, "D"));
  categories.push(...categoryPairs(sheet, "F", "G", "expenditure", 4, 300, "H"));

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
  return stringValue(value).trim().toUpperCase();
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
    rawJson: transaction.rawJson ?? "{}",
  };
}

function inferAccountType(sheetName: string) {
  const account = knownAccountSheets.find((known) => known.sheetName === sheetName);
  return account?.accountType ?? "bank";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
