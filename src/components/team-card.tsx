import { useState, type ReactNode } from "react";
import { cx } from "./ui";

// A team as a card that opens and closes. Collapsed it is just the heading line (name, count, summary);
// open it shows `actions` and the team's people. Which teams are closed is remembered in this browser, per page.
export function TeamCard({ id, page, name, muted, count, summary, actions, children }: { id: string; page: string; name: string; muted?: boolean; count: number; summary?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const key = `team-closed:${page}:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(key) !== "1";
    } catch {
      return true;
    }
  });
  const toggle = () => {
    setOpen(!open);
    try {
      if (open) localStorage.setItem(key, "1");
      else localStorage.removeItem(key);
    } catch {
      // Private browsing: it simply isn't remembered.
    }
  };
  return (
    <section className="overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-xs transition hover:shadow-sm">
      <button type="button" aria-expanded={open} onClick={toggle} className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition hover:bg-hover/60">
        <span aria-hidden className={cx("inline-block w-3 text-muted transition", open && "rotate-90")}>
          ›
        </span>
        <h2 className={cx("text-base font-semibold", muted && "text-muted")}>{name}</h2>
        <span className="rounded-full bg-hover px-2 py-0.5 text-xs font-semibold tabular-nums">{count}</span>
        {summary && <span className="ml-auto truncate text-xs text-muted">{summary}</span>}
      </button>
      {open && (
        <div className="animate-enter border-t border-line/70 p-4">
          {actions && <div className="mb-3 flex flex-wrap items-center gap-2">{actions}</div>}
          {children}
        </div>
      )}
    </section>
  );
}
