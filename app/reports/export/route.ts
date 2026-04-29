import { NextRequest } from "next/server";

import {
  getByAccountReport,
  getByCategoryReport,
  getExceptionsReport,
  getNormalizedTransactionsReport,
  getSummaryReport,
  getSummaryBucketReport,
  type ReportDateField,
  type ReportFilters,
} from "@/lib/reports/classification";
import type { CategoryType } from "@/lib/types/finance";

type ReportName = "normalized" | "summary" | "accounts" | "categories" | "summary-buckets" | "exceptions";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const report = parseReport(params.get("report"));
  const filters = parseFilters(params);
  const { filename, headers, rows } = await reportCsv(report, filters);
  const body = [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function reportCsv(report: ReportName, filters: ReportFilters) {
  switch (report) {
    case "summary": {
      const row = await getSummaryReport(filters);
      return {
        filename: "summary_report.csv",
        headers: [
          "transaction_count",
          "unknown_transaction_count",
          "revenue_cents",
          "expenditure_cents",
          "normalized_net_cents",
          "transfer_cents",
          "ignored_cents",
          "unknown_cents",
        ],
        rows: [
          [
            row.transactionCount,
            row.unknownTransactionCount,
            row.revenueCents,
            row.expenditureCents,
            row.normalizedNetCents,
            row.transferCents,
            row.ignoredCents,
            row.unknownCents,
          ],
        ],
      };
    }
    case "accounts": {
      const rows = await getByAccountReport(filters);
      return {
        filename: "by_account_report.csv",
        headers: [
          "account",
          "source_sheet",
          "account_type",
          "transaction_count",
          "revenue_cents",
          "expenditure_cents",
          "normalized_net_cents",
          "unknown_cents",
        ],
        rows: rows.map((row) => [
          row.account,
          row.sourceSheet,
          row.accountType,
          row.transactionCount,
          row.revenueCents,
          row.expenditureCents,
          row.normalizedNetCents,
          row.unknownCents,
        ]),
      };
    }
    case "categories": {
      const rows = await getByCategoryReport(filters);
      return {
        filename: "by_category_report.csv",
        headers: [
          "accounting_category",
          "accounting_category_label",
          "reporting_type",
          "transaction_count",
          "revenue_cents",
          "expenditure_cents",
          "normalized_net_cents",
          "absolute_net_cents",
        ],
        rows: rows.map((row) => [
          row.categoryCode,
          row.categoryLabel,
          row.reportingType,
          row.transactionCount,
          row.revenueCents,
          row.expenditureCents,
          row.normalizedNetCents,
          row.absoluteNetCents,
        ]),
      };
    }
    case "summary-buckets": {
      const rows = await getSummaryBucketReport(filters);
      return {
        filename: "summary_buckets.csv",
        headers: [
          "section_name",
          "bucket_name",
          "report_type",
          "source_cell",
          "display_order",
          "transaction_count",
          "total_cents",
        ],
        rows: rows.map((row) => [
          row.sectionName,
          row.bucketName,
          row.reportType,
          row.sourceCell,
          row.displayOrder,
          row.transactionCount,
          row.totalCents,
        ]),
      };
    }
    case "exceptions": {
      const rows = await getExceptionsReport(filters);
      return {
        filename: "exceptions.csv",
        headers: [
          "id",
          "reason",
          "source_sheet",
          "source_row",
          "account",
          "account_type",
          "transaction_date",
          "clear_date",
          "payee",
          "description",
          "net_cents",
          "accounting_category",
          "accounting_category_label",
          "program_category",
          "program_category_label",
          "reporting_type",
          "raw_json",
        ],
        rows: rows.map((row) => [
          row.id,
          row.reason,
          row.sourceSheet,
          row.sourceRow,
          row.account,
          row.accountType,
          row.transactionDate,
          row.clearDate,
          row.payee,
          row.description,
          row.netCents,
          row.accountingCategory,
          row.accountingCategoryLabel,
          row.programCategory,
          row.programCategoryLabel,
          row.reportingType,
          row.rawJson,
        ]),
      };
    }
    case "normalized":
    default: {
      const rows = await getNormalizedTransactionsReport(filters);
      return {
        filename: "normalized_transactions.csv",
        headers: [
          "id",
          "import_id",
          "source_sheet",
          "source_row",
          "month",
          "account",
          "account_type",
          "source",
          "check_number",
          "transaction_date",
          "clear_date",
          "payee",
          "gross_cents",
          "fee_cents",
          "net_cents",
          "reporting_type",
          "revenue_cents",
          "expenditure_cents",
          "normalized_net_cents",
          "cleared",
          "accounting_category",
          "accounting_category_label",
          "program_category",
          "program_category_label",
          "description",
          "raw_json",
        ],
        rows: rows.map((row) => [
          row.id,
          row.importId,
          row.sourceSheet,
          row.sourceRow,
          row.month,
          row.account,
          row.accountType,
          row.source,
          row.checkNumber,
          row.transactionDate,
          row.clearDate,
          row.payee,
          row.grossCents,
          row.feeCents,
          row.netCents,
          row.reportingType,
          row.revenueCents,
          row.expenditureCents,
          row.normalizedNetCents,
          row.cleared,
          row.accountingCategory,
          row.accountingCategoryLabel,
          row.programCategory,
          row.programCategoryLabel,
          row.description,
          row.rawJson,
        ]),
      };
    }
  }
}

function parseFilters(params: URLSearchParams): ReportFilters {
  return {
    startDate: params.get("startDate") ?? undefined,
    endDate: params.get("endDate") ?? undefined,
    dateField: parseDateField(params.get("dateField")),
    account: cleanAll(params.get("account")),
    reportingType: parseReportingType(params.get("reportingType")),
    accountingCategory: cleanAllMany(params.getAll("accountingCategory")),
    programCategory: cleanAllMany(params.getAll("programCategory")),
    includeUncategorized: parseCheckbox(params.get("includeUncategorized")),
    summaryBucketSort: parseSummaryBucketSort(params.get("summaryBucketSort")),
    summaryBucketSortDir: params.get("summaryBucketSortDir") === "desc" ? "desc" : "asc",
    summaryBucketSection: cleanAll(params.get("summaryBucketSection")),
    showEmptyBuckets: parseCheckbox(params.get("showEmptyBuckets")),
  };
}

function parseSummaryBucketSort(value: string | null) {
  const valid = ["section", "bucket", "type", "transactions", "total"];
  return valid.includes(value ?? "") ? (value as ReportFilters["summaryBucketSort"]) : undefined;
}

function parseReport(value: string | null): ReportName {
  if (
    value === "summary" ||
    value === "accounts" ||
    value === "categories" ||
    value === "summary-buckets" ||
    value === "exceptions"
  ) {
    return value;
  }

  return "normalized";
}

function parseDateField(value: string | null): ReportDateField | undefined {
  return value === "transaction_date" ||
    value === "clear_date" ||
    value === "created_at" ||
    value === "workbook_month"
    ? value
    : undefined;
}

function cleanAll(value: string | null) {
  return value && value !== "all" ? value : undefined;
}

function cleanAllMany(values: string[]) {
  const cleaned = values.map((value) => value.trim()).filter((value) => value && value !== "all");
  return cleaned.length ? cleaned : undefined;
}

function parseCheckbox(value: string | null) {
  return value === "1" || value === "true" || value === "on";
}

function parseReportingType(value: string | null): CategoryType | "all" | undefined {
  const valid = ["revenue", "expenditure", "transfer", "ignored", "unknown"];
  return valid.includes(value ?? "") ? (value as CategoryType) : undefined;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
