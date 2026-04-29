import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMaskedDbHost } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="flex max-w-4xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-normal">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Runtime connection details and import defaults for this internal tool.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Runtime database</CardTitle>
            <CardDescription>Turso/libSQL is used directly by the Next.js server runtime.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="font-mono text-xs text-muted-foreground">{getMaskedDbHost()}</div>
            <p className="text-muted-foreground">
              The runtime reads TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on the server only.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
