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
  accountingCategory?: string;
  programCategory?: string;
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
    accountingCategory: cleanAll(params.accountingCategory),
    programCategory: cleanAll(params.programCategory),
    sort: parseSort(params.sort),
    sortDir: params.sortDir === "asc" ? "asc" : "desc",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
  const { rows, total, limit } = getTransactionsPage(filters);
  const options = getTransactionFilterOptions();
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const exportHref = `/transactions/export?${toSearchParams(params, { page: undefined }).toString()}`;

  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Transactions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Server-side search, filtering, sorting, and pagination over normalized SQLite rows.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={exportHref}>Export current view to CSV</Link>
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Use the form to narrow the current server-side result set.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 lg:grid-cols-6">
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
              <Select name="accountingCategory" defaultValue={params.accountingCategory || "all"}>
                <option value="all">All accounting categories</option>
                {options.accountingCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
              <Select name="programCategory" defaultValue={params.programCategory || "all"}>
                <option value="all">All program categories</option>
                {options.programCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
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
              <div className="flex gap-2">
                <Button type="submit" variant="outline">
                  Apply
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/transactions">Reset</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="md:flex md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Normalized Transactions</CardTitle>
              <CardDescription>
                {formatInteger(total)} row(s), page {formatInteger(page)} of {formatInteger(totalPages)}
              </CardDescription>
            </div>
            <Pagination page={page} totalPages={totalPages} params={params} />
          </CardHeader>
          <CardContent>
            <Table>
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
                      <TableCell className="max-w-[12rem] truncate">
                        {transaction.payee || "Unlabeled"}
                      </TableCell>
                      <TableCell className="max-w-[18rem] truncate">
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
    <div className="mt-3 flex gap-2 md:mt-0">
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

function clean(value?: string) {
  return value?.trim() || undefined;
}

function cleanAll(value?: string) {
  return value && value !== "all" ? value : undefined;
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

function toSearchParams(
  params: Record<string, string | undefined>,
  overrides: Record<string, string | undefined> = {},
) {
  const next = new URLSearchParams();

  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value && value !== "all") {
      next.set(key, value);
    }
  }

  return next;
}
