import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-semibold text-white">PT</span>
          <h1 className="text-lg font-semibold">Project Tracker</h1>
        </div>
        <Suspense>
          <LoginForm next={searchParams.then((p) => (typeof p.next === "string" ? p.next : "/"))} />
        </Suspense>
      </div>
    </main>
  );
}
