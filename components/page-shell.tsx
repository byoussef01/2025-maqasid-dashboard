import { AppSidebar } from "@/components/app-sidebar";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[16rem_1fr]">
      <AppSidebar />
      <main className="min-w-0 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
