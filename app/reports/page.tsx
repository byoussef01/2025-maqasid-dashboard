import { Suspense } from "react";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { GetForm } from "@/components/get-form";
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
  getSummaryBucketReport,
  getSummaryBucketSections,
  type ReportDateField,
  type ReportFilters,
  type SortDirection,
  type SummaryBucketSort,
} from "@/lib/reports/classification";
import { formatCurrency, formatInteger } from "@/lib/reports/format";
import type { CategoryType } from "@/lib/types/finance";

export const dynamic = "force-dynamic";

const DEFAULT_START_DATE = "2025-01-01";
const DEFAULT_END_DATE = "2025-12-31";
const DEFAULT_DATE_FIELD: ReportDateField = "workbook_month";
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
  summaryBucketSort?: string | string[];
  summaryBucketSortDir?: string | string[];
  summaryBucketSection?: string | string[];
  showEmptyBuckets?: string | string[];
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
    summaryBucketSort: parseSummaryBucketSort(firstParam(params.summaryBucketSort)),
    summaryBucketSortDir: parseSortDirection(firstParam(params.summaryBucketSortDir)),
    summaryBucketSection: cleanAll(firstParam(params.summaryBucketSection)),
    showEmptyBuckets: parseCheckbox(firstParam(params.showEmptyBuckets)),
  };
  const [options, summary, bucketSections] = await Promise.all([
    getTransactionFilterOptions(),
    getSummaryReport(filters),
    getSummaryBucketSections(),
  ]);

  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Reports</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportButton report="normalized" label="Export Transactions" params={params} />
            <ExportButton report="summary" label="Export Summary" params={params} />
            <ExportButton report="accounts" label="Export Accounts" params={params} />
            <ExportButton report="categories" label="Export Categories" params={params} />
            <ExportButton report="summary-buckets" label="Export Buckets" params={params} />
            <ExportButton report="exceptions" label="Export Exceptions" params={params} />
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <GetForm className="grid gap-3 lg:grid-cols-6">
              <Input name="startDate" type="date" defaultValue={filters.startDate} />
              <Input name="endDate" type="date" defaultValue={filters.endDate} />
              <Select name="dateField" defaultValue={filters.dateField}>
                <option value="clear_date">Clear Date</option>
                <option value="transaction_date">Transaction Date</option>
                <option value="workbook_month">Workbook Month</option>
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
                  <span className="font-medium">Include unknown / uncategorized in totals</span>
                  <span className="text-xs text-muted-foreground">
                    Workbook-mapped unknown buckets like ? are already reflected in totals.
                    Check this to also fold in remaining unknown rows that do not have workbook
                    bucket mappings.
                  </span>
                </span>
              </label>
              <div className="flex gap-2 lg:col-span-6">
                <FilterSubmitButton idleLabel="Apply" pendingLabel="Applying..." />
                <Button asChild variant="ghost">
                  <Link href="/reports">Reset</Link>
                </Button>
              </div>
            </GetForm>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Revenue"
            value={formatCurrency(summary.revenueCents)}
            detail={`${formatInteger(summary.transactionCount)} transactions`}
          />
          <StatCard label="Total Expenditure" value={formatCurrency(summary.expenditureCents)} />
          <StatCard label="Net" value={formatCurrency(summary.normalizedNetCents)} />
          <StatCard
            label="Unknown Transactions"
            value={formatInteger(summary.unknownTransactionCount)}
            detail={formatCurrency(summary.unknownCents)}
          />
        </section>

        <Suspense fallback={<SummaryBucketsFallback />}>
          <SummaryBucketsSection filters={filters} params={params} bucketSections={bucketSections} />
        </Suspense>

        <Suspense fallback={<ReportTablesFallback />}>
          <ReportTablesSection filters={filters} />
        </Suspense>

        <Suspense fallback={<ExceptionsFallback />}>
          <ExceptionsSection filters={filters} />
        </Suspense>
      </div>
    </PageShell>
  );
}

async function SummaryBucketsSection({
  filters,
  params,
  bucketSections,
}: {
  filters: ReportFilters;
  params: Awaited<SearchParams>;
  bucketSections: { sectionName: string }[];
}) {
  const summaryBuckets = await getSummaryBucketReport(filters);

  return (
    <ReportCard
      title="Summary Buckets"
      description="Grouped rollups for major reporting areas."
    >
      <GetForm action="/reports" className="mb-4 flex flex-col gap-3">
        <input type="hidden" name="startDate" value={filters.startDate} />
        <input type="hidden" name="endDate" value={filters.endDate} />
        <input type="hidden" name="dateField" value={filters.dateField} />
        <input type="hidden" name="account" value={firstParam(params.account) || "all"} />
        <input
          type="hidden"
          name="reportingType"
          value={firstParam(params.reportingType) || "all"}
        />
        {(filters.accountingCategory ?? []).map((value) => (
          <input key={`bucket-accounting-${value}`} type="hidden" name="accountingCategory" value={value} />
        ))}
        {(filters.programCategory ?? []).map((value) => (
          <input key={`bucket-program-${value}`} type="hidden" name="programCategory" value={value} />
        ))}
        {filters.includeUncategorized ? (
          <input type="hidden" name="includeUncategorized" value="1" />
        ) : null}
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="flex min-w-[14rem] flex-col gap-2">
            <label className="text-sm font-medium">Bucket Group</label>
            <Select
              name="summaryBucketSection"
              defaultValue={filters.summaryBucketSection ?? "all"}
            >
              <option value="all">All groups</option>
              {bucketSections.map((section) => (
                <option key={section.sectionName} value={section.sectionName}>
                  {section.sectionName}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex min-w-[14rem] flex-col gap-2">
            <label className="text-sm font-medium">Bucket Sort</label>
            <Select
              name="summaryBucketSort"
              defaultValue={filters.summaryBucketSort ?? "type"}
            >
              <option value="type">Sort by type</option>
              <option value="section">Sort by section</option>
              <option value="bucket">Sort by bucket</option>
              <option value="transactions">Sort by transactions</option>
              <option value="total">Sort by total</option>
            </Select>
          </div>
          <div className="flex min-w-[12rem] flex-col gap-2">
            <label className="text-sm font-medium">Direction</label>
            <Select
              name="summaryBucketSortDir"
              defaultValue={filters.summaryBucketSortDir ?? "asc"}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Visibility</label>
            <label className="border-input bg-background flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
              <input
                type="checkbox"
                name="showEmptyBuckets"
                value="1"
                defaultChecked={filters.showEmptyBuckets}
                className="size-4 rounded border-input"
              />
              <span className="font-medium">Show if empty</span>
            </label>
          </div>
        </div>
        <div>
          <FilterSubmitButton
            idleLabel="Apply Bucket View"
            pendingLabel="Updating Buckets..."
            size="sm"
          />
        </div>
      </GetForm>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Section</TableHead>
            <TableHead>Bucket</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Transactions</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaryBuckets.length === 0 ? (
            <EmptyRow colSpan={5} />
          ) : (
            summaryBuckets.map((row) => (
              <TableRow key={`${row.bucketKey}-${row.sourceCell}`}>
                <TableCell className="font-medium">{row.sectionName}</TableCell>
                <TableCell>{row.bucketName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.reportType}</Badge>
                </TableCell>
                <TableCell className="text-right">{formatInteger(row.transactionCount)}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(row.totalCents)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </ReportCard>
  );
}

async function ReportTablesSection({ filters }: { filters: ReportFilters }) {
  const [accounts, categories] = await Promise.all([
    getByAccountReport(filters),
    getByCategoryReport(filters),
  ]);

  return (
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
  );
}

async function ExceptionsSection({ filters }: { filters: ReportFilters }) {
  const exceptions = await getExceptionsReport(filters);

  return (
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
  );
}

function SummaryBucketsFallback() {
  return <ReportCardSkeleton titleWidth="w-40" rows={8} columns={5} />;
}

function ReportTablesFallback() {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <ReportCardSkeleton titleWidth="w-32" rows={7} columns={5} />
      <ReportCardSkeleton titleWidth="w-36" rows={7} columns={5} />
    </section>
  );
}

function ExceptionsFallback() {
  return <ReportCardSkeleton titleWidth="w-40" rows={8} columns={9} />;
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

function ReportCardSkeleton({
  titleWidth,
  rows,
  columns,
}: {
  titleWidth: string;
  rows: number;
  columns: number;
}) {
  return (
    <Card>
      <CardHeader>
        <div className={`h-6 animate-pulse rounded-md bg-muted ${titleWidth}`} />
        <div className="h-4 w-56 animate-pulse rounded-md bg-muted/80" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: columns }).map((__, columnIndex) => (
                <div key={columnIndex} className="h-4 animate-pulse rounded-md bg-muted/80" />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
  return value === "transaction_date" || value === "clear_date" || value === "workbook_month"
    ? value
    : DEFAULT_DATE_FIELD;
}

function parseSummaryBucketSort(value?: string): SummaryBucketSort {
  return value === "section" ||
    value === "bucket" ||
    value === "type" ||
    value === "transactions" ||
    value === "total"
    ? value
    : "type";
}

function parseSortDirection(value?: string): SortDirection {
  return value === "desc" ? "desc" : "asc";
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
