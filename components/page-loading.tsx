import { PageShell } from "@/components/page-shell";

export function SectionLoading({
  title,
  showStats = false,
  tableCount = 2,
}: {
  title: string;
  showStats?: boolean;
  tableCount?: number;
}) {
  return (
    <PageShell>
      <div className="flex flex-col gap-6">
        <header className="space-y-3">
          <span className="sr-only">Loading {title}</span>
          <div className="h-9 w-56 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded-md bg-muted/80" />
        </header>

        <section className="rounded-xl border bg-card p-6">
          <div className="mb-4 h-7 w-24 animate-pulse rounded-md bg-muted" />
          <div className="grid gap-3 md:grid-cols-4">
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          </div>
        </section>

        {showStats ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-xl border bg-card p-6">
                <div className="h-4 w-28 animate-pulse rounded-md bg-muted" />
                <div className="mt-4 h-8 w-36 animate-pulse rounded-md bg-muted" />
                <div className="mt-3 h-4 w-24 animate-pulse rounded-md bg-muted/80" />
              </div>
            ))}
          </section>
        ) : null}

        <section className={`grid gap-4 ${tableCount > 1 ? "xl:grid-cols-2" : ""}`}>
          {Array.from({ length: tableCount }).map((_, index) => (
            <div key={index} className="rounded-xl border bg-card p-6">
              <div className="mb-5 h-6 w-40 animate-pulse rounded-md bg-muted" />
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="grid grid-cols-5 gap-3">
                    <div className="col-span-2 h-4 animate-pulse rounded-md bg-muted/80" />
                    <div className="h-4 animate-pulse rounded-md bg-muted/80" />
                    <div className="h-4 animate-pulse rounded-md bg-muted/80" />
                    <div className="h-4 animate-pulse rounded-md bg-muted/80" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
