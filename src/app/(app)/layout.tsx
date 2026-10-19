import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions";
import { BottomNav, TopNav } from "@/components/nav";
import { buttonClass, inputClass, cx } from "@/components/ui";
import { authEnabled } from "@/lib/session-token";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh pb-20 md:pb-8">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white">PT</span>
            <span className="hidden sm:inline">Project Tracker</span>
          </Link>
          <Suspense>
            <TopNav />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            <form action="/search" className="hidden md:block">
              <input name="q" type="search" placeholder="Search everything…" aria-label="Search" className={cx(inputClass, "w-56 py-1.5")} />
            </form>
            <Link href="/new" className={buttonClass("primary", true)}>
              + New
            </Link>
            {authEnabled() && (
              <form action={logout}>
                <button className={buttonClass("ghost", true)}>Log out</button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <Suspense>
        <BottomNav />
      </Suspense>
    </div>
  );
}
