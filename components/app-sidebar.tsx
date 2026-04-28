"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  FileSpreadsheetIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  SettingsIcon,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/import", label: "Import Workbook", icon: FileSpreadsheetIcon },
  { href: "/transactions", label: "Transactions", icon: ListFilterIcon },
  { href: "/reports", label: "Reports", icon: BarChart3Icon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex min-h-dvh w-full flex-col border-r bg-card px-3 py-4 md:w-64">
      <div className="px-2">
        <p className="text-sm font-semibold tracking-normal">Al-Maqasid Finance</p>
        <p className="mt-1 text-xs text-muted-foreground">Local workbook dashboard</p>
      </div>
      <Separator className="my-4" />
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground",
              )}
            >
              <Icon />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
        Data stays on this machine in a local SQLite database.
      </div>
    </aside>
  );
}
