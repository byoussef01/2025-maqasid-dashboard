"use client";

import { UserButton } from "@clerk/nextjs";
import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3Icon,
  FileSpreadsheetIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  SettingsIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur md:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open navigation menu"
            onClick={() => setIsOpen(true)}
          >
            <MenuIcon />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-normal">Al-Maqasid Finance</p>
            <p className="truncate text-xs text-muted-foreground">Internal finance dashboard</p>
          </div>
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "size-8",
              },
            }}
          />
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-foreground/15 backdrop-blur-[1px]"
            onClick={() => setIsOpen(false)}
          />
          <aside className="relative flex h-full w-[18rem] max-w-[85vw] flex-col border-r bg-card px-3 py-4 shadow-lg">
            <div className="flex items-start justify-between gap-3 px-2">
              <div>
                <p className="text-sm font-semibold tracking-normal">Al-Maqasid Finance</p>
                <p className="mt-1 text-xs text-muted-foreground">Internal finance dashboard</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close navigation menu"
                onClick={() => setIsOpen(false)}
              >
                <XIcon />
              </Button>
            </div>
            <Separator className="my-4" />
            <SidebarNav pathname={pathname} onNavigate={() => setIsOpen(false)} />
            <div className="mt-auto rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
              Approved users can sign in with Clerk and access protected routes.
            </div>
          </aside>
        </div>
      ) : null}

      <aside className="hidden h-dvh flex-col border-r bg-card px-3 py-4 md:sticky md:top-0 md:flex md:w-64">
        <div className="flex items-start justify-between gap-3 px-2">
          <div>
            <p className="text-sm font-semibold tracking-normal">Al-Maqasid Finance</p>
            <p className="mt-1 text-xs text-muted-foreground">Internal finance dashboard</p>
          </div>
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "size-8",
              },
            }}
          />
        </div>
        <Separator className="my-4" />
        <SidebarNav pathname={pathname} />
        <div className="mt-auto rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
          Approved users can sign in with Clerk and access protected routes.
        </div>
      </aside>
    </>
  );
}

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex h-10 items-center gap-2 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              isActive && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
