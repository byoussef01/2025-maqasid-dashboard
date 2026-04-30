"use client";

import * as React from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function FilterCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Filters</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 sm:hidden"
          onClick={() => setIsOpen((value) => !value)}
          aria-expanded={isOpen}
          aria-controls="filter-card-content"
        >
          {isOpen ? "Hide" : "Show"}
          {isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      </CardHeader>
      <CardContent
        id="filter-card-content"
        className={cn("hidden sm:block", isOpen && "block")}
      >
        {children}
      </CardContent>
    </Card>
  );
}
