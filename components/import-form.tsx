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
      <div className="flex items-center gap-3">
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
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
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
      ) : null}

      {state.warnings.length > 0 ? (
        <MessageList title="Warnings" messages={state.warnings} />
      ) : null}
      {state.errors.length > 0 ? <MessageList title="Errors" messages={state.errors} /> : null}
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
