import { useState, type ReactNode } from "react";
import { Button, cx } from "./ui";

// Which rows are ticked, for bulk edits. Ids that are no longer on screen drop out of the count.
export function useSelection(visibleIds: number[]) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const ids = visibleIds.filter((id) => picked.has(id));
  return {
    ids,
    has: (id: number) => picked.has(id),
    all: visibleIds.length > 0 && ids.length === visibleIds.length,
    toggle: (group: number[]) =>
      setPicked((old) => {
        const next = new Set(old);
        const on = group.every((id) => next.has(id));
        for (const id of group) (on ? next.delete(id) : next.add(id));
        return next;
      }),
    setAll: (on: boolean) => setPicked(new Set(on ? visibleIds : [])),
    clear: () => setPicked(new Set()),
  };
}

export function RowCheck({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="h-4 w-4 shrink-0 cursor-pointer accent-accent" />;
}

// The bar that slides up once rows are ticked. Each control applies to every ticked row.
export function BulkBar({ count, noun, onClear, children }: { count: number; noun: string; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="animate-enter fixed inset-x-3 bottom-24 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-accent/30 bg-surface px-4 py-3 shadow-xl shadow-slate-900/15 lg:bottom-6" role="region" aria-label="Bulk edit">
      <span className="mr-1 text-sm font-semibold text-accent-strong">
        {count} {noun}
        {count === 1 ? "" : "s"} selected
      </span>
      {children}
      <Button type="button" small variant="ghost" className="ml-auto" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

type Option = { value: string | number; label: string };

// A dropdown that applies its pick straight away, then springs back to its label.
export function BulkSelect({ label, options, onPick }: { label: string; options: Option[]; onPick: (value: string) => Promise<unknown> }) {
  const [pending, setPending] = useState(false);
  return (
    <select
      value=""
      disabled={pending}
      aria-label={label}
      className={cx("max-w-40 cursor-pointer truncate rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-accent disabled:opacity-50")}
      onChange={async (e) => {
        const value = e.target.value;
        if (!value) return;
        setPending(true);
        try {
          await onPick(value);
        } finally {
          setPending(false);
        }
      }}
    >
      <option value="">{pending ? "Saving…" : label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Pick a date for every ticked row, or clear it.
export function BulkDate({ label, onPick }: { label: string; onPick: (date: string | null) => Promise<unknown> }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-0.5 pr-1 pl-3 text-xs font-medium">
      {label}
      <input type="date" aria-label={label} className="cursor-pointer bg-transparent text-xs outline-none" onChange={(e) => e.target.value && void onPick(e.target.value)} />
      <button type="button" className="rounded-full px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg" title="Remove the date" onClick={() => void onPick(null)}>
        Clear
      </button>
    </span>
  );
}
