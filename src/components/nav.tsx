"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Home", icon: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/projects", label: "Projects", icon: "M3 7h6l2 2h10v10H3z" },
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

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {ITEMS.slice(0, 4).map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cx(
            "rounded-lg px-3 py-1.5 text-sm font-medium",
            isActive(pathname, item.href) ? "bg-hover text-fg" : "text-muted hover:text-fg",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cx(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive(pathname, item.href) ? "text-accent" : "text-muted",
              )}
            >
              <Icon d={item.icon} />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
