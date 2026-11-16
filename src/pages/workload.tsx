import { useState } from "react";
import { Link } from "react-router";
import * as api from "@/lib/api";
import { Load } from "@/components/query";
import { Slicer, SlicerBar, useFilters } from "@/components/slicers";
import { Badge, cx, Empty, PageHeader, useTitle } from "@/components/ui";

// How much open work each person has. Someone is overloaded or underloaded when their open tasks and tickets
// pass the limits set on this page; the limits are remembered in this browser.

const KEY = "workload-limits";
const DEFAULTS = { over: 8, under: 1 };

function readLimits() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { over: Number(saved.over) || DEFAULTS.over, under: Number.isFinite(saved.under) ? Number(saved.under) : DEFAULTS.under };
  } catch {
    return DEFAULTS;
  }
}

type Level = "over" | "under" | "ok";
const LEVELS: Record<Level, { label: string; tone: string }> = {
  over: { label: "Overloaded", tone: "overdue" },
  under: { label: "Underloaded", tone: "soon" },
  ok: { label: "Balanced", tone: "resolved" },
};

export function Workload() {
  useTitle("Workload");
  const filters = useFilters();
  const [limits, setLimits] = useState(readLimits);
  const level = filters.get("load");
  const role = filters.get("role");
  const save = (next: typeof limits) => {
    setLimits(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private browsing: the limits simply last until the page is closed.
    }
  };
  const levelOf = (r: api.WorkloadRow): Level => (r.load >= limits.over ? "over" : r.load <= limits.under ? "under" : "ok");

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/people" className="text-muted hover:text-fg">
          ← People
        </Link>
      </div>
      <PageHeader title="Workload" subtitle="Open tasks and open tickets per person, busiest first." />
      <Load queryKey={["workload"]} fn={api.getWorkload} rows={8}>
        {(all) => {
          const roles = [...new Set(all.flatMap((r) => (r.person.role ? [r.person.role] : [])))].sort((a, b) => a.localeCompare(b));
          const rows = all
            .filter((r) => (!level || levelOf(r) === level) && (!role || r.person.role === role))
            .sort((a, b) => b.load - a.load || b.projectIds.length - a.projectIds.length || a.person.name.localeCompare(b.person.name));
          const max = Math.max(limits.over + 2, ...all.map((r) => r.load));
          const counts = { over: all.filter((r) => levelOf(r) === "over").length, under: all.filter((r) => levelOf(r) === "under").length };
          if (all.length === 0) return <Empty>No people yet. Add them on the People page.</Empty>;
          return (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Overloaded" value={counts.over} tone="text-red-600" onClick={() => filters.set("load", level === "over" ? "" : "over")} on={level === "over"} />
                <Tile label="Underloaded" value={counts.under} tone="text-amber-600" onClick={() => filters.set("load", level === "under" ? "" : "under")} on={level === "under"} />
                <Tile label="Balanced" value={all.length - counts.over - counts.under} tone="text-emerald-600" onClick={() => filters.set("load", level === "ok" ? "" : "ok")} on={level === "ok"} />
                <Tile label="Open items in total" value={all.reduce((n, r) => n + r.load, 0)} />
              </div>

              <SlicerBar active={Boolean(level || role)} onClear={() => filters.clear(["load", "role"])}>
                <Slicer label="Load" value={level} options={(Object.keys(LEVELS) as Level[]).map((l) => ({ value: l, label: LEVELS[l].label }))} onChange={(v) => filters.set("load", v)} />
                <Slicer label="Role" value={role} options={roles.map((r) => ({ value: r, label: r }))} onChange={(v) => filters.set("role", v)} />
                <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <Limit label="Overloaded at" suffix="or more" value={limits.over} min={limits.under + 2} onChange={(over) => save({ ...limits, over })} />
                  <Limit label="Underloaded at" suffix="or fewer" value={limits.under} min={0} max={limits.over - 2} onChange={(under) => save({ ...limits, under })} />
                </span>
              </SlicerBar>

              {rows.length === 0 ? (
                <Empty>Nobody matches these filters.</Empty>
              ) : (
                <ul className="stagger divide-y divide-line/70 overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-xs">
                  {rows.map((r) => {
                    const l = levelOf(r);
                    return (
                      <li key={r.person.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto]">
                        <Link to={`/people/${r.person.id}`} className="min-w-0 hover:underline">
                          <span className="block truncate text-sm font-medium">{r.person.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {[r.person.role, `${r.projectIds.length} open project${r.projectIds.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                          </span>
                        </Link>
                        <div className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
                          <div className="relative h-3.5 overflow-hidden rounded-full bg-hover" aria-label={`${r.tasks} open tasks and ${r.tickets} open tickets`}>
                            <div className="flex h-full">
                              <div className="h-full bg-accent" style={{ width: `${(r.tasks / max) * 100}%` }} />
                              <div className="h-full bg-brand-light" style={{ width: `${(r.tickets / max) * 100}%` }} />
                            </div>
                            <div aria-hidden title="Overloaded from here" className="absolute top-0 bottom-0 w-px bg-red-400" style={{ left: `${(limits.over / max) * 100}%` }} />
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                            <span>
                              <span className="font-medium text-fg">{r.tasks}</span> task{r.tasks === 1 ? "" : "s"}
                            </span>
                            <span>
                              <span className="font-medium text-fg">{r.tickets}</span> ticket{r.tickets === 1 ? "" : "s"}
                            </span>
                            {r.overdue > 0 && <span className="font-medium text-red-600">{r.overdue} overdue</span>}
                            {r.dueSoon > 0 && <span className="text-amber-700">{r.dueSoon} due this week</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 justify-self-end">
                          <span className="text-lg font-semibold tabular-nums">{r.load}</span>
                          <span className="w-24 text-right">
                            <Badge value={LEVELS[l].tone} label={LEVELS[l].label} />
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-5 rounded-full bg-accent" /> Open tasks
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-5 rounded-full bg-brand-light" /> Open tickets
                </span>
                <span>The number on the right is the two added together. The red line marks where overloaded starts.</span>
              </p>
            </>
          );
        }}
      </Load>
    </>
  );
}

function Tile({ label, value, tone, onClick, on }: { label: string; value: number; tone?: string; onClick?: () => void; on?: boolean }) {
  const body = (
    <>
      <div className={cx("text-2xl font-semibold", value > 0 && tone)}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </>
  );
  const className = cx("rounded-2xl border border-line/80 bg-surface p-4 text-left shadow-xs transition", on && "border-accent/50 ring-4 ring-accent/10");
  return onClick ? (
    <button type="button" aria-pressed={on} onClick={onClick} className={cx(className, "hover:-translate-y-0.5 hover:shadow-md")}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Limit({ label, suffix, value, min, max, onChange }: { label: string; suffix: string; value: number; min: number; max?: number; onChange: (n: number) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5">
      {label}
      <input
        type="number"
        defaultValue={value}
        min={min}
        max={max}
        aria-label={`${label} how many open items`}
        className="w-14 rounded-lg border border-line bg-surface px-2 py-1 text-center text-xs font-medium text-fg outline-none focus:border-accent"
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (e.target.value !== "" && n >= min && (max == null || n <= max)) onChange(n);
        }}
      />
      {suffix}
    </label>
  );
}
