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
  startDate?: string | string[];
  endDate?: string | string[];
  dateField?: string | string[];
  account?: string | string[];
  reportingType?: string | string[];
  accountingCategory?: string | string[];
  programCategory?: string | string[];
  includeUncategorized?: string | string[];
}>;

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters: ReportFilters = {
    startDate: firstParam(params.startDate) || DEFAULT_START_DATE,
    endDate: firstParam(params.endDate) || DEFAULT_END_DATE,
    dateField: parseDateField(firstParam(params.dateField)),
    account: cleanAll(firstParam(params.account)),
    reportingType: parseReportingType(firstParam(params.reportingType)),
    accountingCategory: cleanAllMany(params.accountingCategory),
    programCategory: cleanAllMany(params.programCategory),
    includeUncategorized: parseCheckbox(firstParam(params.includeUncategorized)),
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
              <Select name="account" defaultValue={firstParam(params.account) || "all"}>
                <option value="all">All accounts</option>
                {options.accounts.map((account) => (
                  <option key={account.value} value={account.value}>
                    {account.label}
                  </option>
                ))}
              </Select>
              <Select name="reportingType" defaultValue={firstParam(params.reportingType) || "all"}>
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
                className="lg:col-span-3"
              />
              <ChecklistPicker
                label="Program Categories"
                name="programCategory"
                options={options.programCategories}
                selectedValues={filters.programCategory}
                placeholder="All program categories"
                className="lg:col-span-3"
              />
              <label className="border-input bg-background flex items-start gap-3 rounded-md border p-3 text-sm lg:col-span-6">
                <input
                  type="checkbox"
                  name="includeUncategorized"
                  value="1"
                  defaultChecked={filters.includeUncategorized}
                  className="mt-0.5 size-4 rounded border-input"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">Include uncategorized in revenue and expenditure</span>
                  <span className="text-xs text-muted-foreground">
                    Unknown rows stay listed separately, but their signed amounts are folded into report totals when this is checked.
                  </span>
                </span>
              </label>
              <div className="flex gap-2 lg:col-span-6">
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
  className,
  multiple,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const classes = [
    "border-input bg-background rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    multiple ? "min-h-32 py-2" : "h-9",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <select
      {...props}
      multiple={multiple}
      className={classes}
    >
      {children}
    </select>
  );
}

function parseDateField(value?: string): ReportDateField {
  return value === "transaction_date" || value === "clear_date" ? value : DEFAULT_DATE_FIELD;
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

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanAll(value?: string) {
  return value && value !== "all" ? value : undefined;
}

function cleanAllMany(value?: string | string[]) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const cleaned = values.map((entry) => entry.trim()).filter((entry) => entry && entry !== "all");
  return cleaned.length ? cleaned : undefined;
}

function parseCheckbox(value?: string) {
  return value === "1" || value === "true" || value === "on";
}

function parseReportingType(value?: string): CategoryType | "all" | undefined {
  return REPORTING_TYPES.includes(value as CategoryType) ? (value as CategoryType) : undefined;
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
