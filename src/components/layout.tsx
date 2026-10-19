import { Link, Outlet, useNavigate } from "react-router";
import { signOut } from "./auth";
import { BottomNav, TopNav } from "./nav";
import { buttonClass, cx, inputClass } from "./ui";

export function Layout() {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh pb-20 md:pb-8">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white">PT</span>
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
              <input name="q" type="search" placeholder="Search everything…" aria-label="Search" className={cx(inputClass, "w-56 py-1.5")} />
            </form>
            <Link to="/new" className={buttonClass("primary", true)}>
              + New
            </Link>
            <button type="button" className={buttonClass("ghost", true)} onClick={signOut}>
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
