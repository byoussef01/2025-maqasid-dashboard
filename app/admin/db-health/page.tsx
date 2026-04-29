import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dbOne } from "@/lib/db/client";
import { getMaskedTursoHost } from "@/lib/db/turso-config";
import { formatInteger } from "@/lib/reports/format";

export const dynamic = "force-dynamic";

type HealthRow = {
  transactionCount: number;
  accountCount: number;
  importCount: number;
  minClearDate: string | null;
  maxClearDate: string | null;
  minTransactionDate: string | null;
  maxTransactionDate: string | null;
};

export default async function DbHealthPage() {
  const row =
    (await dbOne<HealthRow>(
      `SELECT
        (SELECT COUNT(*) FROM transactions) as transactionCount,
        (SELECT COUNT(*) FROM accounts) as accountCount,
        (SELECT COUNT(*) FROM imports) as importCount,
        (SELECT MIN(clear_date) FROM transactions) as minClearDate,
        (SELECT MAX(clear_date) FROM transactions) as maxClearDate,
        (SELECT MIN(transaction_date) FROM transactions) as minTransactionDate,
        (SELECT MAX(transaction_date) FROM transactions) as maxTransactionDate`,
    )) ?? {
      transactionCount: 0,
      accountCount: 0,
      importCount: 0,
      minClearDate: null,
      maxClearDate: null,
      minTransactionDate: null,
      maxTransactionDate: null,
    };

  return (
    <PageShell>
      <div className="flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-normal">DB Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quick runtime check against the production Turso database.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>Masked runtime host from TURSO_DATABASE_URL.</CardDescription>
          </CardHeader>
          <CardContent className="font-mono text-sm text-muted-foreground">
            {getMaskedTursoHost()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Counts</CardTitle>
            <CardDescription>Current production row counts from Turso.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Metric label="Transactions" value={formatInteger(row.transactionCount)} />
            <Metric label="Accounts" value={formatInteger(row.accountCount)} />
            <Metric label="Imports" value={formatInteger(row.importCount)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Date Coverage</CardTitle>
            <CardDescription>Minimum and maximum imported dates in production.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <RangeCard
              label="Clear Date"
              minValue={row.minClearDate}
              maxValue={row.maxClearDate}
            />
            <RangeCard
              label="Transaction Date"
              minValue={row.minTransactionDate}
              maxValue={row.maxTransactionDate}
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function RangeCard({
  label,
  minValue,
  maxValue,
}: {
  label: string;
  minValue: string | null;
  maxValue: string | null;
}) {
  return (
    <div className="rounded-md border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Min</dt>
          <dd className="font-mono">{minValue ?? "None"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Max</dt>
          <dd className="font-mono">{maxValue ?? "None"}</dd>
        </div>
      </dl>
    </div>
  );
}
