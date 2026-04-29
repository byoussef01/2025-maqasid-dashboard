import * as XLSX from "xlsx";

import type { AccountType, NormalizedTransaction } from "@/lib/types/finance";

export type SummaryBucket = "revenue_credit" | "revenue_net" | "expense_net";

export type SummaryCategoryRule = {
  categoryCode: string;
  summaryBucket: SummaryBucket;
  helperRow?: number;
  categoriesRow?: number;
};

export type SummaryCategorySets = {
  revenueCredit: Set<string>;
  revenueNet: Set<string>;
  expenseNet: Set<string>;
};

export type SummaryNamedBucketRule = {
  bucketKey: string;
  bucketName: string;
  sectionName: string;
  reportType: "revenue" | "expense";
  sourceCell: string;
  displayOrder: number;
  categoryCode: string;
  summaryBucket: SummaryBucket;
};

export function deriveSummaryCategoryRules(workbook: XLSX.WorkBook): SummaryCategoryRule[] {
  const summarySheet = workbook.Sheets.Summary;
  const categoriesSheet = workbook.Sheets.Categories;

  if (!summarySheet || !categoriesSheet) {
    return [];
  }

  const rules = new Map<string, SummaryCategoryRule>();

  for (const helperRef of collectSummaryHelperRefs(summarySheet, "C75", new Set(["K", "M"]))) {
    const bucket: SummaryBucket = helperRef.startsWith("K") ? "revenue_credit" : "revenue_net";
    const rule = summaryHelperRule(summarySheet, categoriesSheet, helperRef, bucket);
    if (!rule) {
      continue;
    }

    rules.set(`${rule.summaryBucket}:${rule.categoryCode}`, rule);
  }

  for (const helperRef of collectSummaryHelperRefs(summarySheet, "G84", new Set(["R"]))) {
    const rule = summaryHelperRule(summarySheet, categoriesSheet, helperRef, "expense_net");
    if (!rule) {
      continue;
    }

    rules.set(`${rule.summaryBucket}:${rule.categoryCode}`, rule);
  }

  return [...rules.values()].sort((left, right) => {
    const byBucket = left.summaryBucket.localeCompare(right.summaryBucket);
    if (byBucket !== 0) {
      return byBucket;
    }

    return left.categoryCode.localeCompare(right.categoryCode);
  });
}

export function buildSummaryCategorySets(rules: SummaryCategoryRule[]): SummaryCategorySets {
  const sets: SummaryCategorySets = {
    revenueCredit: new Set<string>(),
    revenueNet: new Set<string>(),
    expenseNet: new Set<string>(),
  };

  for (const rule of rules) {
    if (rule.summaryBucket === "revenue_credit") {
      sets.revenueCredit.add(rule.categoryCode);
      continue;
    }

    if (rule.summaryBucket === "revenue_net") {
      sets.revenueNet.add(rule.categoryCode);
      continue;
    }

    sets.expenseNet.add(rule.categoryCode);
  }

  return sets;
}

export function deriveSummaryNamedBucketRules(
  workbook: XLSX.WorkBook,
  summaryCategoryRules: SummaryCategoryRule[],
) {
  const summarySheet = workbook.Sheets.Summary;
  if (!summarySheet) {
    return [] as SummaryNamedBucketRule[];
  }

  const rules = new Map<string, SummaryNamedBucketRule>();
  const helperRowLookup = buildHelperRowLookup(summaryCategoryRules);

  deriveNamedBucketRulesForColumn(summarySheet, helperRowLookup, {
    labelColumn: "B",
    amountColumn: "C",
    helperBucketsByColumn: {
      K: "revenue_credit",
      M: "revenue_net",
    },
    reportType: "revenue",
  }).forEach((rule) => rules.set(ruleIdentity(rule), rule));

  deriveNamedBucketRulesForColumn(summarySheet, helperRowLookup, {
    labelColumn: "F",
    amountColumn: "G",
    helperBucketsByColumn: {
      R: "expense_net",
    },
    reportType: "expense",
  }).forEach((rule) => rules.set(ruleIdentity(rule), rule));

  return [...rules.values()].sort((left, right) => {
    const byType = left.reportType.localeCompare(right.reportType);
    if (byType !== 0) {
      return byType;
    }

    const bySection = left.sectionName.localeCompare(right.sectionName);
    if (bySection !== 0) {
      return bySection;
    }

    const byOrder = left.displayOrder - right.displayOrder;
    if (byOrder !== 0) {
      return byOrder;
    }

    return left.categoryCode.localeCompare(right.categoryCode);
  });
}

export function summarySheetReportAmountCents(grossCents: number, accountType: AccountType) {
  return accountType === "credit_card" ? -grossCents : grossCents;
}

export function summarySheetRevenueCents(
  transaction: NormalizedTransaction,
  accountType: AccountType,
  summaryRules: SummaryCategoryRule[] | SummaryCategorySets,
) {
  const sets = isSummaryCategorySets(summaryRules)
    ? summaryRules
    : buildSummaryCategorySets(summaryRules);
  const category = transaction.accountingCategory ?? "";
  const amount = summarySheetReportAmountCents(transaction.grossCents, accountType);

  if (sets.revenueCredit.has(category) && amount > 0) {
    return amount;
  }

  if (sets.revenueNet.has(category)) {
    return amount;
  }

  return 0;
}

export function summarySheetExpenseCents(
  transaction: NormalizedTransaction,
  accountType: AccountType,
  summaryRules: SummaryCategoryRule[] | SummaryCategorySets,
) {
  const sets = isSummaryCategorySets(summaryRules)
    ? summaryRules
    : buildSummaryCategorySets(summaryRules);
  const category = transaction.accountingCategory ?? "";

  return sets.expenseNet.has(category)
    ? summarySheetReportAmountCents(transaction.grossCents, accountType)
    : 0;
}

function collectSummaryHelperRefs(
  summarySheet: XLSX.WorkSheet,
  startAddress: string,
  helperColumns: Set<string>,
) {
  const visited = new Set<string>();
  const refs = new Set<string>();

  const visit = (address: string) => {
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress || visited.has(normalizedAddress)) {
      return;
    }

    visited.add(normalizedAddress);

    if (helperColumns.has(addressColumn(normalizedAddress))) {
      refs.add(normalizedAddress);
      return;
    }

    const formula = cellFormula(summarySheet, normalizedAddress);
    if (!formula) {
      return;
    }

    for (const ref of extractSummaryRefs(formula)) {
      visit(ref);
    }
  };

  visit(startAddress);
  return [...refs];
}

function summaryHelperRule(
  summarySheet: XLSX.WorkSheet,
  categoriesSheet: XLSX.WorkSheet,
  helperRef: string,
  summaryBucket: SummaryBucket,
): SummaryCategoryRule | undefined {
  const helperRow = addressRow(helperRef);
  const helperLabelCell = summaryBucket === "expense_net" ? `O${helperRow}` : `J${helperRow}`;
  const categoriesRow =
    categoriesRowFromSummaryHelper(summarySheet, helperLabelCell) ?? Math.max(helperRow - 3, 1);
  const categoryCodeColumn = summaryBucket === "expense_net" ? "M" : "J";
  const categoryCode = normalizeCategoryCode(cellValue(categoriesSheet, `${categoryCodeColumn}${categoriesRow}`));

  if (!categoryCode) {
    return undefined;
  }

  return {
    categoryCode,
    summaryBucket,
    helperRow,
    categoriesRow,
  };
}

function categoriesRowFromSummaryHelper(summarySheet: XLSX.WorkSheet, address: string) {
  const formula = cellFormula(summarySheet, address);
  if (!formula) {
    return undefined;
  }

  const match = formula.match(/(?:^|[=(,+\- ])Categories!\$?[A-Z]{1,3}\$?(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function extractSummaryRefs(formula: string) {
  const refs = new Set<string>();
  const refRegex = /((?:'[^']+'|[A-Za-z0-9_ ]+)!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/g;

  for (const match of formula.matchAll(refRegex)) {
    const sheetPrefix = match[1]?.replace(/!$/, "").replaceAll("'", "").trim();
    if (sheetPrefix && sheetPrefix !== "Summary") {
      continue;
    }

    const start = normalizeAddress(match[2]);
    const end = normalizeAddress(match[3]);
    if (!start) {
      continue;
    }

    if (!end) {
      refs.add(start);
      continue;
    }

    const range = XLSX.utils.decode_range(`${start}:${end}`);
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        refs.add(XLSX.utils.encode_cell({ r: row, c: col }));
      }
    }
  }

  return [...refs];
}

function cellFormula(sheet: XLSX.WorkSheet, address: string) {
  const cell = sheet[address];
  if (!cell) {
    return undefined;
  }

  if (typeof cell.f === "string" && cell.f.trim()) {
    return cell.f.trim();
  }

  if (typeof cell.v === "string" && cell.v.trim().startsWith("=")) {
    return cell.v.trim().slice(1);
  }

  return undefined;
}

function cellValue(sheet: XLSX.WorkSheet, address: string) {
  return sheet[address]?.v;
}

function normalizeCategoryCode(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized = String(value).trim().toUpperCase().replace(/\.+$/, "");
  return normalized === "" || normalized === "0" || normalized === "-" ? "" : normalized;
}

function buildHelperRowLookup(summaryCategoryRules: SummaryCategoryRule[]) {
  const lookup = new Map<string, string>();

  for (const rule of summaryCategoryRules) {
    if (!rule.helperRow) {
      continue;
    }

    lookup.set(`${rule.summaryBucket}:${rule.helperRow}`, rule.categoryCode);
  }

  return lookup;
}

function deriveNamedBucketRulesForColumn(
  summarySheet: XLSX.WorkSheet,
  helperRowLookup: Map<string, string>,
  options: {
    labelColumn: string;
    amountColumn: string;
    helperBucketsByColumn: Partial<Record<string, SummaryBucket>>;
    reportType: "revenue" | "expense";
  },
) {
  const range = XLSX.utils.decode_range(summarySheet["!ref"] ?? `${options.labelColumn}1:${options.amountColumn}1`);
  const rules: SummaryNamedBucketRule[] = [];
  let currentSection = "";

  for (let row = range.s.r + 1; row <= range.e.r + 1; row += 1) {
    const labelAddress = `${options.labelColumn}${row}`;
    const amountAddress = `${options.amountColumn}${row}`;
    const label = literalCellText(summarySheet, labelAddress);
    const amountFormula = cellFormula(summarySheet, amountAddress);
    const amountValue = cellValue(summarySheet, amountAddress);

    if (label && !amountFormula && isBlankLike(amountValue)) {
      currentSection = label;
      continue;
    }

    if (!label || !amountFormula) {
      continue;
    }

    const helperRefs = collectSummaryHelperRefs(
      summarySheet,
      amountAddress,
      new Set(Object.keys(options.helperBucketsByColumn)),
    );
    if (!helperRefs.length) {
      continue;
    }

    const sectionName = inferSectionName(label, currentSection);
    const bucketKey = slugify(`${options.reportType}-${sectionName}-${label}`);

    for (const helperRef of helperRefs) {
      const helperBucket = options.helperBucketsByColumn[addressColumn(helperRef)];
      if (!helperBucket) {
        continue;
      }

      const categoryCode = helperRowLookup.get(`${helperBucket}:${addressRow(helperRef)}`);
      if (!categoryCode) {
        continue;
      }

      rules.push({
        bucketKey,
        bucketName: label,
        sectionName,
        reportType: options.reportType,
        sourceCell: amountAddress,
        displayOrder: row,
        categoryCode,
        summaryBucket: helperBucket,
      });
    }
  }

  return rules;
}

function inferSectionName(label: string, currentSection: string) {
  if (label.startsWith("Total ")) {
    return label.replace(/^Total\s+/, "").trim() || currentSection || label;
  }

  return currentSection || label;
}

function literalCellText(sheet: XLSX.WorkSheet, address: string) {
  const cell = sheet[address];
  if (!cell || cellFormula(sheet, address)) {
    return "";
  }

  return typeof cell.v === "string" ? cell.v.trim() : "";
}

function isBlankLike(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ruleIdentity(rule: SummaryNamedBucketRule) {
  return [
    rule.bucketKey,
    rule.categoryCode,
    rule.summaryBucket,
  ].join(":");
}

function normalizeAddress(address?: string) {
  if (!address) {
    return undefined;
  }

  return address.replace(/\$/g, "").toUpperCase();
}

function addressColumn(address: string) {
  return address.match(/^[A-Z]+/)?.[0] ?? "";
}

function addressRow(address: string) {
  return Number(address.match(/(\d+)$/)?.[1] ?? 0);
}

function isSummaryCategorySets(value: SummaryCategoryRule[] | SummaryCategorySets): value is SummaryCategorySets {
  return "revenueCredit" in value && "revenueNet" in value && "expenseNet" in value;
}
