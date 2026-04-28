import Link from "next/link";

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
import { getRecentImports, hasTransactions } from "@/lib/db/queries";
import {
  getByAccountReport,
  getByCategoryReport,
  getSummaryReport,
  type ReportDateField,
} from "@/lib/reports/classification";
import { formatCurrency, formatInteger } from "@/lib/reports/format";
import type { AccountType, CategoryType } from "@/lib/types/finance";

export const dynamic = "force-dynamic";

const DEFAULT_START_DATE = "2025-09-01";
const DEFAULT_END_DATE = "2025-12-01";
const DEFAULT_DATE_FIELD: ReportDateField = "clear_date";

type SearchParams = Promise<{
  startDate?: string;
  endDate?: string;
  dateField?: ReportDateField;
}>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const startDate = params.startDate || DEFAULT_START_DATE;
  const endDate = params.endDate || DEFAULT_END_DATE;
  const dateField = parseDateField(params.dateField);
  const filters = { startDate, endDate, dateField };
  const hasData = hasTransactions();

  if (!hasData) {
    return (
      <PageShell>
        <div className="flex min-h-[70dvh] items-center justify-center">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle>Dashboard</CardTitle>
              <CardDescription>
                Import a workbook to populate revenue, expenditure, account, and category reports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/import">Import Workbook</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  const summary = getSummaryReport(filters);
  const accounts = getByAccountReport(filters);
  const categories = getByCategoryReport(filters);
  const recentImports = getRecentImports(5);

  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Reporting from {startDate} through the day before {endDate}.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/import">Import Workbook</Link>
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Date range is start-inclusive and end-exclusive.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-[12rem_12rem_14rem_auto]">
              <label className="flex flex-col gap-2 text-sm font-medium">
                Start Date
                <Input name="startDate" type="date" defaultValue={startDate} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                End Date
                <Input name="endDate" type="date" defaultValue={endDate} />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Date Field
                <select
                  name="dateField"
                  defaultValue={dateField}
                  className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="clear_date">Clear Date</option>
                  <option value="transaction_date">Transaction Date</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button type="submit" variant="outline" className="w-full md:w-auto">
                  Apply
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total Revenue"
            value={formatCurrency(summary.revenueCents)}
            detail={`${formatInteger(summary.transactionCount)} transaction(s) in range`}
          />
          <StatCard
            label="Total Expenditure"
            value={formatCurrency(summary.expenditureCents)}
            detail="Positive expenditure amount"
          />
          <StatCard
            label="Net"
            value={formatCurrency(summary.normalizedNetCents)}
            detail="Revenue less expenditure"
          />
          <StatCard
            label="Unknown / Unclassified"
            value={formatCurrency(summary.unknownCents)}
            detail={`${formatInteger(summary.unknownTransactionCount)} unclassified transaction(s)`}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>By Account</CardTitle>
              <CardDescription>Revenue, expenditure, and net by source account.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Expenditure</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.length === 0 ? (
                    <EmptyTableRow colSpan={5} label="No account activity in this date range." />
                  ) : (
                    accounts.map((account) => (
                      <TableRow key={`${account.sourceSheet}-${account.account}`}>
                        <TableCell className="font-medium">{account.account}</TableCell>
                        <TableCell>
                          <AccountTypeBadge accountType={account.accountType} />
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(account.revenueCents)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(account.expenditureCents)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(account.normalizedNetCents)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>By Category</CardTitle>
              <CardDescription>Accounting category totals using category rules.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Reporting Type</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Expenditure</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length === 0 ? (
                    <EmptyTableRow colSpan={5} label="No category activity in this date range." />
                  ) : (
                    categories.map((category) => (
                      <TableRow key={`${category.reportingType}-${category.categoryCode}`}>
                        <TableCell>
                          <CategoryLabel
                            code={category.categoryCode}
                            label={category.categoryLabel}
                          />
                        </TableCell>
                        <TableCell>
                          <ReportingTypeBadge reportingType={category.reportingType} />
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(category.revenueCents)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(category.expenditureCents)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(category.normalizedNetCents)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Recent Imports</CardTitle>
            <CardDescription>Most recent workbook imports stored in SQLite.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>Imported At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentImports.length === 0 ? (
                  <EmptyTableRow colSpan={4} label="No imports have been recorded yet." />
                ) : (
                  recentImports.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.fileName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.sourceType}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatInteger(item.rowCount)}</TableCell>
                      <TableCell>{item.importedAt}</TableCell>
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

function EmptyTableRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}

function AccountTypeBadge({ accountType }: { accountType: AccountType | null }) {
  return <Badge variant="outline">{accountType?.replaceAll("_", " ") ?? "other"}</Badge>;
}

function ReportingTypeBadge({ reportingType }: { reportingType: CategoryType }) {
  return <Badge variant={reportingType === "unknown" ? "secondary" : "outline"}>{reportingType}</Badge>;
}

function CategoryLabel({ code, label }: { code?: string | null; label?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium">{code || "Uncategorized"}</span>
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
    </div>
  );
}

function parseDateField(value?: string): ReportDateField {
  return value === "transaction_date" || value === "clear_date" ? value : DEFAULT_DATE_FIELD;
}
