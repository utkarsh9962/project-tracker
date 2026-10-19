import { Link, Outlet, useNavigate } from "react-router";
import { signOut } from "./auth";
import { BottomNav, TopNav } from "./nav";
import { buttonClass, cx, inputClass, Logo } from "./ui";

export function Layout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh pb-20 md:pb-8">
      <header className="sticky top-0 z-20 bg-linear-to-r from-brand-deep to-accent text-white shadow-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Logo />
            <span className="hidden sm:inline">Project Tracker</span>
          </Link>
          <TopNav />
          <div className="ml-auto flex items-center gap-2">
            <form
              className="hidden md:block"
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get("q");
                navigate(`/search?q=${encodeURIComponent(String(q ?? ""))}`);
              }}
            >
              <input name="q" type="search" placeholder="Search everything…" aria-label="Search" className={cx(inputClass, "w-56 border-white/30 bg-white/95 py-1.5 text-fg")} />
            </form>
            <Link to="/new" className={cx(buttonClass("primary", true), "bg-white text-accent-strong hover:bg-white/90")}>
              + New
            </Link>
            <button type="button" className={cx(buttonClass("ghost", true), "text-white/85 hover:bg-white/15 hover:text-white")} onClick={signOut}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
