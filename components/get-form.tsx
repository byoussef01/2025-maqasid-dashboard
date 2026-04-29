"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

const GetFormPendingContext = React.createContext(false);

export function GetForm({
  action,
  className,
  children,
}: {
  action?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = React.useTransition();

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const form = event.currentTarget;
      const formData = new FormData(form);
      const params = new URLSearchParams();

      for (const [key, value] of formData.entries()) {
        if (typeof value !== "string") {
          continue;
        }

        if (!value) {
          continue;
        }

        params.append(key, value);
      }

      const target = action ?? pathname;
      const href = params.size ? `${target}?${params.toString()}` : target;

      startTransition(() => {
        router.push(href);
      });
    },
    [action, pathname, router],
  );

  return (
    <GetFormPendingContext.Provider value={isPending}>
      <form className={className} onSubmit={handleSubmit}>
        {children}
      </form>
    </GetFormPendingContext.Provider>
  );
}

export function useGetFormPending() {
  return React.useContext(GetFormPendingContext);
}
