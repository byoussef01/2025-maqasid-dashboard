"use client";

import * as React from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CollapsibleCard({
  title,
  description,
  children,
  defaultOpen = false,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <Card className={cn("min-w-0 overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription className="mt-2">{description}</CardDescription> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 sm:hidden"
          onClick={() => setIsOpen((value) => !value)}
          aria-expanded={isOpen}
        >
          {isOpen ? "Hide" : "Show"}
          {isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      </CardHeader>
      <CardContent className={cn("hidden sm:block", isOpen && "block")}>{children}</CardContent>
    </Card>
  );
}
