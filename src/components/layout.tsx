import { Link, Outlet, useLocation } from "react-router";
import { signOut } from "./auth";
import { BottomNav, TopNav } from "./nav";
import { HeaderSearch } from "./search";
import { buttonClass, cx, Logo } from "./ui";

export function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-dvh pb-28 md:pb-10">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Logo />
            <span className="hidden sm:inline">Project Tracker</span>
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-2">
            <HeaderSearch />
            <Link to="/new" className={cx(buttonClass("primary", true), "rounded-full px-3.5 py-1.5")}>
              + New
            </Link>
            <button type="button" className={cx(buttonClass("ghost", true), "rounded-full px-3 py-1.5")} onClick={signOut}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main key={pathname} className="animate-enter mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
