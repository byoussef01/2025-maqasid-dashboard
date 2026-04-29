import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { SignIn } from "@clerk/nextjs";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border bg-card p-8 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-normal">Al-Maqasid Finance</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to access the internal finance dashboard.
          </p>
        </div>
        <SignIn routing="hash" signUpUrl={undefined} />
      </div>
    </main>
  );
}
