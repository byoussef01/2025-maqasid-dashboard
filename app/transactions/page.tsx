import { FilterSubmitButton } from "@/components/filter-submit-button";
import { FilterCard } from "@/components/filter-card";
import { GetForm } from "@/components/get-form";
import Link from "next/link";
import type * as React from "react";

import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getTransactionFilterOptions,
  getTransactionsPage,
  type SortDirection,
  type TransactionPageFilters,
  type TransactionSort,
} from "@/lib/db/queries";
import { formatCurrency, formatDate, formatInteger } from "@/lib/reports/format";
import type { CategoryType } from "@/lib/types/finance";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const REPORTING_TYPES: CategoryType[] = [
  "revenue",
  "expenditure",
  "transfer",
  "ignored",
  "unknown",
];

type SearchParams = Promise<{
  q?: string;
  startDate?: string;
  endDate?: string;
  dateField?: "clear_date" | "transaction_date";
  account?: string;
  reportingType?: CategoryType | "all";
  accountingCategory?: string | string[];
  programCategory?: string | string[];
  sort?: TransactionSort;
  sortDir?: SortDirection;
  page?: string;
}>;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = positiveInt(params.page, 1);
  const filters: TransactionPageFilters = {
    q: clean(params.q),
    startDate: clean(params.startDate),
    endDate: clean(params.endDate),
    dateField: params.dateField === "transaction_date" ? "transaction_date" : "clear_date",
    account: cleanAll(params.account),
    reportingType: parseReportingType(params.reportingType),
    accountingCategory: cleanAllMany(params.accountingCategory),
    programCategory: cleanAllMany(params.programCategory),
    sort: parseSort(params.sort),
    sortDir: params.sortDir === "asc" ? "asc" : "desc",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
  const [{ rows, total, limit }, options] = await Promise.all([
    getTransactionsPage(filters),
    getTransactionFilterOptions(),
  ]);
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const exportHref = `/transactions/export?${toSearchParams(params, { page: undefined }).toString()}`;

  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Transactions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Server-side search, filtering, sorting, and pagination over normalized Turso rows.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={exportHref}>Export current view to CSV</Link>
          </Button>
        </header>

        <FilterCard>
            <GetForm className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <Input
                name="q"
                placeholder="Search payee, description, source"
                defaultValue={params.q}
                className="lg:col-span-2"
              />
              <Input name="startDate" type="date" defaultValue={params.startDate} />
              <Input name="endDate" type="date" defaultValue={params.endDate} />
              <Select name="dateField" defaultValue={filters.dateField}>
                <option value="clear_date">Clear Date</option>
                <option value="transaction_date">Transaction Date</option>
              </Select>
              <Select name="account" defaultValue={params.account || "all"}>
                <option value="all">All accounts</option>
                {options.accounts.map((account) => (
                  <option key={account.value} value={account.value}>
                    {account.label}
                  </option>
                ))}
              </Select>
              <Select name="reportingType" defaultValue={params.reportingType || "all"}>
                <option value="all">All reporting types</option>
                {REPORTING_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
              <ChecklistPicker
                label="Accounting Categories"
                name="accountingCategory"
                options={options.accountingCategories}
                selectedValues={filters.accountingCategory}
                placeholder="All accounting categories"
                className="lg:col-span-6"
              />
              <ChecklistPicker
                label="Program Categories"
                name="programCategory"
                options={options.programCategories}
                selectedValues={filters.programCategory}
                placeholder="All program categories"
                className="lg:col-span-6"
              />
              <Select name="sort" defaultValue={filters.sort}>
                <option value="clear_date">Sort by clear date</option>
                <option value="transaction_date">Sort by transaction date</option>
                <option value="amount">Sort by amount</option>
                <option value="account">Sort by account</option>
                <option value="category">Sort by category</option>
              </Select>
              <Select name="sortDir" defaultValue={filters.sortDir}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </Select>
              <div className="flex flex-col gap-2 sm:flex-row xl:col-span-4">
                <FilterSubmitButton idleLabel="Apply" pendingLabel="Applying..." />
                <Button asChild variant="ghost">
                  <Link href="/transactions">Reset</Link>
                </Button>
              </div>
            </GetForm>
        </FilterCard>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="gap-3 md:flex md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Normalized Transactions</CardTitle>
              <CardDescription>
                {formatInteger(total)} row(s), page {formatInteger(page)} of {formatInteger(totalPages)}
              </CardDescription>
            </div>
            <Pagination page={page} totalPages={totalPages} params={params} />
          </CardHeader>
          <CardContent>
            <Table className="min-w-[78rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Clear Date</TableHead>
                  <TableHead>Trans. Date</TableHead>
                  <TableHead>Account Sheet</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Accounting Category</TableHead>
                  <TableHead>Program Category</TableHead>
                  <TableHead>Reporting Type</TableHead>
                  <TableHead className="text-right">Source Row</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                      No transactions match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{formatDate(transaction.clearDate)}</TableCell>
                      <TableCell>{formatDate(transaction.transactionDate)}</TableCell>
                      <TableCell className="font-medium">{transaction.sourceSheet}</TableCell>
                      <TableCell className="max-w-[12rem] whitespace-normal">
                        {transaction.payee || "Unlabeled"}
                      </TableCell>
                      <TableCell className="max-w-[18rem] whitespace-normal">
                        {transaction.description || transaction.source || ""}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(transaction.netCents)}
                      </TableCell>
                      <TableCell>
                        <CategoryLabel
                          code={transaction.accountingCategory}
                          label={transaction.accountingCategoryLabel}
                          fallback="Uncategorized"
                        />
                      </TableCell>
                      <TableCell>
                        <CategoryLabel
                          code={transaction.programCategory}
                          label={transaction.programCategoryLabel}
                          fallback="Unassigned"
                        />
                      </TableCell>
                      <TableCell>
                        <ReportingBadge type={transaction.reportingType} />
                      </TableCell>
                      <TableCell className="text-right">{transaction.sourceRow}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function Pagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: Awaited<SearchParams>;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 md:mt-0">
      <Button asChild variant="outline" size="sm" aria-disabled={page <= 1}>
        <Link
          href={`/transactions?${toSearchParams(params, { page: String(Math.max(page - 1, 1)) })}`}
        >
          Previous
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" aria-disabled={page >= totalPages}>
        <Link
          href={`/transactions?${toSearchParams(params, {
            page: String(Math.min(page + 1, totalPages)),
          })}`}
        >
          Next
        </Link>
      </Button>
    </div>
  );
}

function ReportingBadge({ type }: { type: CategoryType }) {
  return <Badge variant={type === "unknown" ? "secondary" : "outline"}>{type}</Badge>;
}

function CategoryLabel({
  code,
  label,
  fallback,
}: {
  code?: string | null;
  label?: string | null;
  fallback: string;
}) {
  return (
    <div className="flex max-w-[14rem] flex-col gap-1">
      <span>{code || fallback}</span>
      {label ? <span className="truncate text-xs text-muted-foreground">{label}</span> : null}
    </div>
  );
}

function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
    </select>
  );
}

type CategoryOption = {
  value: string;
  label: string;
};

function ChecklistPicker({
  label,
  name,
  options,
  selectedValues,
  placeholder,
  className,
}: {
  label: string;
  name: string;
  options: CategoryOption[];
  selectedValues?: string[];
  placeholder: string;
  className?: string;
}) {
  const selected = new Set(selectedValues ?? []);
  const selectedOptions = options.filter((option) => selected.has(option.value));
  const summaryLabel =
    selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length === 1
        ? formatCategoryOption(selectedOptions[0])
        : `${selectedOptions.length} selected`;
  const summaryMeta =
    selectedOptions.length === 0
      ? "All categories"
      : selectedOptions.length === 1
        ? "1 selected"
        : `${selectedOptions.length} selected`;

  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <details className="relative">
        <summary className="border-input bg-background flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <span className={selectedOptions.length === 0 ? "text-muted-foreground" : undefined}>
            {summaryLabel}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{summaryMeta}</span>
        </summary>
        <div className="bg-background absolute z-20 mt-2 w-full rounded-md border p-2 shadow-lg">
          <p className="px-2 pb-2 text-xs text-muted-foreground">
            Leave every box unchecked to include all categories.
          </p>
          <div className="max-h-72 space-y-1 overflow-auto">
            {options.map((option) => (
              <label
                key={`${name}-${option.value}`}
                className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md px-2 py-2"
              >
                <input
                  type="checkbox"
                  name={name}
                  value={option.value}
                  defaultChecked={selected.has(option.value)}
                  className="mt-0.5 size-4 rounded border-input"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">{option.value}</span>
                  {option.label ? (
                    <span className="break-words text-xs text-muted-foreground">{option.label}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}

function clean(value?: string) {
  return value?.trim() || undefined;
}

function cleanAll(value?: string) {
  return value && value !== "all" ? value : undefined;
}

function cleanAllMany(value?: string | string[]) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const cleaned = values.map((entry) => entry.trim()).filter((entry) => entry && entry !== "all");
  return cleaned.length ? cleaned : undefined;
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseReportingType(value?: string): CategoryType | "all" | undefined {
  return REPORTING_TYPES.includes(value as CategoryType) ? (value as CategoryType) : undefined;
}

function parseSort(value?: string): TransactionSort {
  return ["clear_date", "transaction_date", "amount", "account", "category"].includes(value ?? "")
    ? (value as TransactionSort)
    : "clear_date";
}

function formatCategoryOption(category: { value: string; label: string }) {
  return category.label ? `${category.value} - ${category.label}` : category.value;
}

function toSearchParams(
  params: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | string[] | undefined> = {},
) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    for (const entry of values.map((item) => item.trim()).filter((item) => item && item !== "all")) {
      next.append(key, entry);
    }
  }

  return next;
}
