import Link from "next/link";
import type * as React from "react";

import { PageShell } from "@/components/page-shell";
import { StatCard } from "@/components/stat-card";
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
import { getTransactionFilterOptions } from "@/lib/db/queries";
import {
  getByAccountReport,
  getByCategoryReport,
  getExceptionsReport,
  getSummaryReport,
  type ReportDateField,
  type ReportFilters,
} from "@/lib/reports/classification";
import { formatCurrency, formatInteger } from "@/lib/reports/format";
import type { CategoryType } from "@/lib/types/finance";

export const dynamic = "force-dynamic";

const DEFAULT_START_DATE = "2025-09-01";
const DEFAULT_END_DATE = "2025-12-01";
const DEFAULT_DATE_FIELD: ReportDateField = "clear_date";
const REPORTING_TYPES: CategoryType[] = [
  "revenue",
  "expenditure",
  "transfer",
  "ignored",
  "unknown",
];

type SearchParams = Promise<{
  startDate?: string;
  endDate?: string;
  dateField?: ReportDateField;
  account?: string;
  reportingType?: CategoryType | "all";
  accountingCategory?: string;
  programCategory?: string;
}>;

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters: ReportFilters = {
    startDate: params.startDate || DEFAULT_START_DATE,
    endDate: params.endDate || DEFAULT_END_DATE,
    dateField: parseDateField(params.dateField),
    account: cleanAll(params.account),
    reportingType: parseReportingType(params.reportingType),
    accountingCategory: cleanAll(params.accountingCategory),
    programCategory: cleanAll(params.programCategory),
  };
  const options = getTransactionFilterOptions();
  const summary = getSummaryReport(filters);
  const accounts = getByAccountReport(filters);
  const categories = getByCategoryReport(filters);
  const exceptions = getExceptionsReport(filters);

  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Reports</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Exportable reporting views from normalized SQLite transactions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportButton report="normalized" label="normalized_transactions.csv" params={params} />
            <ExportButton report="summary" label="summary_report.csv" params={params} />
            <ExportButton report="accounts" label="by_account_report.csv" params={params} />
            <ExportButton report="categories" label="by_category_report.csv" params={params} />
            <ExportButton report="exceptions" label="exceptions.csv" params={params} />
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>CSV exports use the same selected date range and filters.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 lg:grid-cols-6">
              <Input name="startDate" type="date" defaultValue={filters.startDate} />
              <Input name="endDate" type="date" defaultValue={filters.endDate} />
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
              <div className="flex gap-2 lg:col-span-5">
                <Button type="submit" variant="outline">
                  Apply
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/reports">Reset</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Revenue" value={formatCurrency(summary.revenueCents)} />
          <StatCard label="Total Expenditure" value={formatCurrency(summary.expenditureCents)} />
          <StatCard label="Net" value={formatCurrency(summary.normalizedNetCents)} />
          <StatCard
            label="Transactions"
            value={formatInteger(summary.transactionCount)}
          />
          <StatCard
            label="Unknown Transactions"
            value={formatInteger(summary.unknownTransactionCount)}
            detail={formatCurrency(summary.unknownCents)}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <ReportCard title="By Account Report" description="Revenue and expenditure by account.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Account Type</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenditure</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <EmptyRow colSpan={5} />
                ) : (
                  accounts.map((row) => (
                    <TableRow key={`${row.sourceSheet}-${row.account}`}>
                      <TableCell className="font-medium">{row.account}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.accountType?.replaceAll("_", " ") ?? "other"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(row.revenueCents)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.expenditureCents)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.normalizedNetCents)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ReportCard>

          <ReportCard title="By Category Report" description="Revenue and expenditure by accounting category.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Accounting Category</TableHead>
                  <TableHead>Reporting Type</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenditure</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <EmptyRow colSpan={5} />
                ) : (
                  categories.map((row) => (
                    <TableRow key={`${row.reportingType}-${row.categoryCode}`}>
                      <TableCell>
                        <CategoryLabel code={row.categoryCode} label={row.categoryLabel} />
                      </TableCell>
                      <TableCell>
                        <ReportingBadge type={row.reportingType} />
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(row.revenueCents)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.expenditureCents)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.normalizedNetCents)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ReportCard>
        </section>

        <ReportCard title="Exceptions Report" description="Rows that need review before final reporting.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reason</TableHead>
                <TableHead>Clear Date</TableHead>
                <TableHead>Trans. Date</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Accounting Category</TableHead>
                <TableHead>Reporting Type</TableHead>
                <TableHead className="text-right">Source Row</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exceptions.length === 0 ? (
                <EmptyRow colSpan={9} />
              ) : (
                exceptions.slice(0, 100).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[18rem] whitespace-normal">{row.reason}</TableCell>
                    <TableCell>{row.clearDate || "Missing"}</TableCell>
                    <TableCell>{row.transactionDate || "Missing"}</TableCell>
                    <TableCell className="font-medium">{row.sourceSheet}</TableCell>
                    <TableCell className="max-w-[12rem] truncate">{row.payee || "Unlabeled"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.netCents)}</TableCell>
                    <TableCell>
                      <CategoryLabel
                        code={row.accountingCategory}
                        label={row.accountingCategoryLabel}
                        fallback="Missing"
                      />
                    </TableCell>
                    <TableCell>
                      <ReportingBadge type={row.reportingType} />
                    </TableCell>
                    <TableCell className="text-right">{row.sourceRow}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ReportCard>
      </div>
    </PageShell>
  );
}

function ExportButton({
  report,
  label,
  params,
}: {
  report: string;
  label: string;
  params: Awaited<SearchParams>;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/reports/export?${toSearchParams(params, { report })}`}>{label}</Link>
    </Button>
  );
}

function ReportCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        No rows match the selected filters.
      </TableCell>
    </TableRow>
  );
}

function ReportingBadge({ type }: { type: CategoryType }) {
  return <Badge variant={type === "unknown" ? "secondary" : "outline"}>{type}</Badge>;
}

function CategoryLabel({
  code,
  label,
  fallback = "Uncategorized",
}: {
  code?: string | null;
  label?: string | null;
  fallback?: string;
}) {
  return (
    <div className="flex max-w-[16rem] flex-col gap-1">
      <span className="font-medium">{code || fallback}</span>
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

function parseDateField(value?: string): ReportDateField {
  return value === "transaction_date" || value === "clear_date" ? value : DEFAULT_DATE_FIELD;
}

function cleanAll(value?: string) {
  return value && value !== "all" ? value : undefined;
}

function parseReportingType(value?: string): CategoryType | "all" | undefined {
  return REPORTING_TYPES.includes(value as CategoryType) ? (value as CategoryType) : undefined;
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
