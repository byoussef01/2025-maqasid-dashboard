import { AppSidebar } from "@/components/app-sidebar";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/20">
      <div className="md:grid md:min-h-dvh md:grid-cols-[16rem_minmax(0,1fr)]">
        <AppSidebar />
        <main className="min-w-0 px-4 py-4 sm:px-6 sm:py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
