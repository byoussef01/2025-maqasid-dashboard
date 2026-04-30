"use client";

import { useActionState } from "react";
import { UploadIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  importWorkbookAction,
  type ImportState,
} from "@/lib/import/actions";

const initialImportState: ImportState = {
  ok: false,
  message: "",
  warnings: [],
  errors: [],
};

export function ImportForm() {
  const [state, formAction, isPending] = useActionState(
    importWorkbookAction,
    initialImportState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="workbook" className="text-sm font-medium">
          Google Sheets .xlsx export
        </label>
        <Input id="workbook" name="workbook" type="file" accept=".xlsx" />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={isPending}>
          <UploadIcon data-icon="inline-start" />
          {isPending ? "Importing..." : "Import Workbook"}
        </Button>
        {isPending ? <p className="text-sm text-muted-foreground">Parsing workbook...</p> : null}
      </div>
      <ImportResult state={state} />
    </form>
  );
}

function ImportResult({ state }: { state: ImportState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge variant={state.ok ? "secondary" : "destructive"}>
            {state.ok ? "Imported" : "Failed"}
          </Badge>
          <p className={state.ok ? "text-sm font-medium" : "text-sm font-medium text-destructive"}>
            {state.message}
          </p>
        </div>
        {state.result ? (
          <p className="text-sm text-muted-foreground">
            {state.result.filename} · {state.result.totalImportedRows.toLocaleString()} row(s)
            imported · {state.result.skippedRows.toLocaleString()} row(s) skipped
          </p>
        ) : null}
      </div>

      {state.result ? (
        <>
          <SummaryAudit result={state.result} />
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[28rem] text-sm sm:w-full">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 font-medium">Sheet</th>
                  <th className="py-2 text-right font-medium">Rows Imported</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(state.result.countsBySheet).map(([sheet, count]) => (
                  <tr key={sheet} className="border-b last:border-0">
                    <td className="py-2">{sheet}</td>
                    <td className="py-2 text-right">{count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {state.warnings.length > 0 ? (
        <MessageList title="Warnings" messages={state.warnings} />
      ) : null}
      {state.errors.length > 0 ? <MessageList title="Errors" messages={state.errors} /> : null}
    </div>
  );
}

function SummaryAudit({ result }: { result: NonNullable<ImportState["result"]> }) {
  const { audit } = result;
  const revenueMatches = Math.abs(audit.revenueDeltaCents ?? 0) <= 1;
  const expenseMatches = Math.abs(audit.expenseDeltaCents ?? 0) <= 1;

  return (
    <div className="mt-4 rounded-md border p-3">
      <p className="text-sm font-medium">Summary formula audit</p>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <AuditRow
          label="Revenue C75"
          expected={audit.expectedRevenueCents}
          parsed={audit.parsedRevenueCents}
          delta={audit.revenueDeltaCents}
          matches={revenueMatches}
        />
        <AuditRow
          label="Expenses G84"
          expected={audit.expectedExpenseCents}
          parsed={audit.parsedExpenseCents}
          delta={audit.expenseDeltaCents}
          matches={expenseMatches}
        />
      </div>
    </div>
  );
}

function AuditRow({
  label,
  expected,
  parsed,
  delta,
  matches,
}: {
  label: string;
  expected?: number;
  parsed: number;
  delta?: number;
  matches: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-medium">{label}</span>
        <Badge variant={expected === undefined || matches ? "secondary" : "destructive"}>
          {expected === undefined ? "No workbook value" : matches ? "Matches" : "Mismatch"}
        </Badge>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
        <dt>Workbook</dt>
        <dd className="text-right text-foreground">
          {expected === undefined ? "-" : formatCurrency(expected)}
        </dd>
        <dt>Parsed</dt>
        <dd className="text-right text-foreground">{formatCurrency(parsed)}</dd>
        <dt>Delta</dt>
        <dd className="text-right text-foreground">
          {delta === undefined ? "-" : formatCurrency(delta)}
        </dd>
      </dl>
    </div>
  );
}

function MessageList({ title, messages }: { title: string; messages: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

function formatCurrency(cents: number) {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
