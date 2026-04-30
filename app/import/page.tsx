import { ImportForm } from "@/components/import-form";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getLatestImport } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const latestImport = await getLatestImport();

  return (
    <PageShell>
      <div className="flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-normal">Import Workbook</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a Google Sheets .xlsx export to replace the current normalized ledger.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Workbook file</CardTitle>
            <CardDescription>
              Uploading a workbook nukes the current imported data in Turso and replaces it with the
              new workbook data in one pass.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import strategy</CardTitle>
            <CardDescription>Current assumptions used to normalize the workbook.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
            <p>
              Known account sheets are parsed as regular worksheet ranges. The importer detects the
              header row by matching Month, Account, Trans. Date, Clear Date, and Net.
            </p>
            <p>
              Rows after the header are normalized into transaction fields, stored as integer cents,
              and preserved with source sheet, source row, and raw row JSON.
            </p>
            <p>
              Temp uploads are deleted after import unless FINANCE_IMPORT_DEBUG=1 is set.
            </p>
            <Separator />
            <p>
              {latestImport
                ? `Last import: ${latestImport.fileName} at ${latestImport.importedAt}`
                : "No workbook has been imported into Turso yet."}
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
