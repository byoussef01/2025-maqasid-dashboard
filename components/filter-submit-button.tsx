"use client";

import { Loader2 } from "lucide-react";

import { useGetFormPending } from "@/components/get-form";
import { Button } from "@/components/ui/button";

export function FilterSubmitButton({
  idleLabel,
  pendingLabel,
  className,
  size = "default",
  variant = "outline",
}: {
  idleLabel: string;
  pendingLabel?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
}) {
  const isPending = useGetFormPending();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={isPending}
      aria-busy={isPending}
    >
      {isPending ? <Loader2 className="animate-spin" /> : null}
      {isPending ? pendingLabel ?? "Applying..." : idleLabel}
    </Button>
  );
}
