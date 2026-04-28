import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDbPath } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-normal">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local persistence and import defaults for this internal tool.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Local database</CardTitle>
            <CardDescription>SQLite is used directly by the Next.js server runtime.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="font-mono text-xs text-muted-foreground">{getDbPath()}</div>
            <p className="text-muted-foreground">
              Set FINANCE_DB_PATH to point at a different local SQLite file.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
