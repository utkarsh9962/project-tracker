import { useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Home", icon: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/projects", label: "Projects", icon: "M3 7h6l2 2h10v10H3z" },
  { href: "/milestones", label: "Milestones", icon: "M5 21V4M5 4h12l-2.5 4L17 12H5" },
  { href: "/tickets", label: "ZSTs", icon: "M4 6h16v4a2 2 0 000 4v4H4v-4a2 2 0 000-4z" },
  { href: "/people", label: "People", icon: "M16 19v-1a4 4 0 00-8 0v1M12 11a3 3 0 100-6 3 3 0 000 6zM20 19v-1a3 3 0 00-3-3M17 5a3 3 0 010 6" },
  { href: "/search", label: "Search", icon: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

// Segmented control whose white pill slides to the active section.
export function TopNav() {
  const { pathname } = useLocation();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const active = ITEMS.slice(0, 5).findIndex((item) => isActive(pathname, item.href));

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[active];
      setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    // Web fonts can arrive after the first paint and change link widths.
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  return (
    <nav className="relative hidden items-center rounded-full bg-hover p-1 md:flex">
      {pill && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 rounded-full bg-surface shadow-sm ring-1 ring-black/5 transition-all duration-300 ease-(--ease-out)"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {ITEMS.slice(0, 5).map((item, i) => (
        <Link
          key={item.href}
          ref={(el) => {
            refs.current[i] = el;
          }}
          to={item.href}
          className={cx(
            "relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200",
            i === active ? "text-fg" : "text-muted hover:text-fg",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-3 bottom-3 z-20 mb-[env(safe-area-inset-bottom)] rounded-2xl border border-line/70 bg-white/85 shadow-lg shadow-slate-900/5 backdrop-blur-xl md:hidden">
      <ul className="grid grid-cols-6">
        {ITEMS.map((item) => {
          const on = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                to={item.href}
                className={cx(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors duration-200",
                  on ? "text-accent" : "text-muted",
                )}
              >
                <span className={cx("transition-transform duration-300 ease-(--ease-out)", on && "-translate-y-0.5 scale-110")}>
                  <Icon d={item.icon} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
