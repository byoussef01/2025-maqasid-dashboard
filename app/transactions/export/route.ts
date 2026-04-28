import { NextRequest } from "next/server";

import { getTransactionsForExport, type TransactionSort } from "@/lib/db/queries";
import type { CategoryType } from "@/lib/types/finance";

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const transactions = getTransactionsForExport({
    q: params.get("q") ?? undefined,
    startDate: params.get("startDate") ?? undefined,
    endDate: params.get("endDate") ?? undefined,
    dateField: params.get("dateField") === "transaction_date" ? "transaction_date" : "clear_date",
    account: cleanAll(params.get("account")),
    reportingType: parseReportingType(params.get("reportingType")),
    accountingCategory: cleanAll(params.get("accountingCategory")),
    programCategory: cleanAll(params.get("programCategory")),
    sort: parseSort(params.get("sort")),
    sortDir: params.get("sortDir") === "asc" ? "asc" : "desc",
  });

  const headers = [
    "id",
    "date",
    "clear_date",
    "account",
    "source",
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
    "source_sheet",
    "source_row",
    "raw_json",
  ];

  const body = [
    headers.join(","),
    ...transactions.map((transaction) =>
      [
        transaction.id,
        transaction.transactionDate,
        transaction.clearDate,
        transaction.accountName,
        transaction.source,
        transaction.payee,
        transaction.grossCents,
        transaction.feeCents,
        transaction.netCents,
        transaction.reportingType,
        transaction.revenueCents,
        transaction.expenditureCents,
        transaction.normalizedNetCents,
        transaction.cleared,
        transaction.accountingCategory,
        transaction.accountingCategoryLabel,
        transaction.programCategory,
        transaction.programCategoryLabel,
        transaction.description,
        transaction.sourceSheet,
        transaction.sourceRow,
        transaction.rawJson,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions.csv"`,
    },
  });
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function cleanAll(value: string | null) {
  return value && value !== "all" ? value : undefined;
}

function parseReportingType(value: string | null): CategoryType | "all" | undefined {
  const valid = ["revenue", "expenditure", "transfer", "ignored", "unknown"];
  return valid.includes(value ?? "") ? (value as CategoryType) : undefined;
}

function parseSort(value: string | null): TransactionSort | undefined {
  const valid = ["clear_date", "transaction_date", "amount", "account", "category"];
  return valid.includes(value ?? "") ? (value as TransactionSort) : undefined;
}
