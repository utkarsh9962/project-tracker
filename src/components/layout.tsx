import { Link, Outlet, useLocation } from "react-router";
import { signOut } from "./auth";
import { BottomNav, TopNav } from "./nav";
import { HeaderSearch } from "./search";
import { buttonClass, cx, Logo } from "./ui";
import { Sparkle } from "@/pages/assistant";

export function Layout() {
  const { pathname } = useLocation();
  // The timeline is a wide chart, so it gets the whole window.
  const width = pathname.startsWith("/timeline") ? "max-w-[112rem]" : "max-w-6xl";
  return (
    <div className="min-h-dvh pb-28 lg:pb-10">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Logo />
            <span className="hidden sm:inline lg:hidden xl:inline">Project Tracker</span>
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-2">
            <HeaderSearch />
            <Link
              to="/assistant"
              title="AI assistant"
              className={cx(
                buttonClass("ghost", true),
                "rounded-full px-3 py-1.5 text-accent",
                pathname.startsWith("/assistant") && "bg-accent/10",
              )}
            >
              <Sparkle />
              <span className="hidden sm:inline">Assistant</span>
            </Link>
            <Link to="/new" className={cx(buttonClass("primary", true), "rounded-full px-3.5 py-1.5")}>
              + New
            </Link>
            <button type="button" className={cx(buttonClass("ghost", true), "rounded-full px-3 py-1.5")} onClick={signOut}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main key={pathname} className={cx("animate-enter mx-auto px-4 py-8", width)}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
