import { Link } from "react-router";
import * as api from "@/lib/api";
import { addDays, formatDate, projectStatusLabel, today } from "@/lib/format";
import type { Milestone, Project } from "@/lib/types";
import { Load } from "@/components/query";
import { ProjectSlicers, useProjectFilter } from "@/components/slicers";
import { Button, cx, Empty, PageHeader, useTitle } from "@/components/ui";

// A calendar with one row per project and a bar from its start to its target date, like a waterfall plan in a spreadsheet.

const BAR: Record<Project["status"], { bar: string; fill: string; text: string }> = {
  active: { bar: "bg-blue-200", fill: "bg-accent", text: "text-white" },
  planning: { bar: "bg-sky-100", fill: "bg-sky-400", text: "text-sky-950" },
  on_hold: { bar: "bg-amber-100", fill: "bg-amber-400", text: "text-amber-950" },
  done: { bar: "bg-emerald-100", fill: "bg-emerald-500", text: "text-white" },
};

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
function addMonths(first: string, n: number) {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const monthName = (first: string, long = true) => new Date(`${first}T00:00:00Z`).toLocaleDateString("en-GB", { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" });
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

// A project's bar runs from its start date (or the day it was added) to its target date.
function span(p: Project) {
  const added = p.created_at.slice(0, 10);
  const start = p.start_date ?? (p.due_date && p.due_date < added ? p.due_date : added);
  return { start, end: p.due_date && p.due_date >= start ? p.due_date : p.due_date ? start : null };
}

export function Timeline() {
  useTitle("Timeline");
  const filter = useProjectFilter();
  const now = today();
  const months = filter.get("span") === "quarter" ? 3 : 1;
  const from = /^\d{4}-\d{2}$/.test(filter.get("from")) ? `${filter.get("from")}-01` : monthStart(now);
  const to = addDays(addMonths(from, months), -1);
  const go = (first: string) => filter.set("from", first === monthStart(now) ? "" : first.slice(0, 7));

  return (
    <>
      <PageHeader
        title="Timeline"
        subtitle="Every project as a bar from its start to its target date, nearest deadline first. Diamonds are milestones."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full bg-hover p-1 text-xs font-medium">
              {[
                { value: "", label: "Month" },
                { value: "quarter", label: "3 months" },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={(months === 3) === (o.value === "quarter")}
                  onClick={() => filter.set("span", o.value)}
                  className={cx("rounded-full px-3 py-1 transition", (months === 3) === (o.value === "quarter") ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Button type="button" variant="secondary" small className="px-3 py-1.5" aria-label="Earlier" onClick={() => go(addMonths(from, -1))}>
              ←
            </Button>
            <span className="min-w-36 text-center text-sm font-semibold">{months === 1 ? monthName(from) : `${monthName(from, false)} – ${monthName(addMonths(from, 2), false)}`}</span>
            <Button type="button" variant="secondary" small className="px-3 py-1.5" aria-label="Later" onClick={() => go(addMonths(from, 1))}>
              →
            </Button>
            <Button type="button" variant="secondary" small className="px-3 py-1.5" disabled={from === monthStart(now)} onClick={() => go(monthStart(now))}>
              Today
            </Button>
          </div>
        }
      />
      <ProjectSlicers filter={filter} />
      <Load queryKey={["timeline"]} fn={api.getTimeline} rows={8}>
        {(all) => {
          const matching = all.filter(({ project: p }) => filter.keep(p.id)).map((r) => ({ ...r, ...span(r.project) }));
          // In view: the bar touches this period. A project with no target date runs on from its start,
          // and an open project past its target date stays in view until today (its red overdue stretch).
          const reach = (r: Row) => (r.end == null ? "9999" : r.project.status !== "done" && r.end < now ? now : r.end);
          // Most urgent first: open projects by target date (overdue ones lead), then open projects with
          // no target date, then completed projects.
          const group = (r: Row) => (r.project.status === "done" ? 2 : r.end == null ? 1 : 0);
          const rows = matching
            .filter((r) => r.start <= to && reach(r) >= from)
            .sort((a, b) => group(a) - group(b) || (a.end ?? "9999").localeCompare(b.end ?? "9999") || a.project.name.localeCompare(b.project.name));
          const outside = matching.length - rows.length;
          if (matching.length === 0) return <Empty>{filter.active ? "No projects match these filters." : "No projects yet."}</Empty>;
          return (
            <>
              {rows.length === 0 ? <Empty>No project runs during this period.</Empty> : <Chart rows={rows} from={from} to={to} months={months} now={now} />}
              <Legend />
              {outside > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {outside} other project{outside === 1 ? " falls" : "s fall"} outside this period. Use the arrows to move.
                </p>
              )}
            </>
          );
        }}
      </Load>
    </>
  );
}

type Row = { project: Project; milestones: Milestone[]; start: string; end: string | null };

function Chart({ rows, from, to, months, now }: { rows: Row[]; from: string; to: string; months: number; now: string }) {
  const count = diff(from, to) + 1;
  const days = Array.from({ length: count }, (_, i) => addDays(from, i));
  const dayWidth = months === 1 ? 30 : 11;
  const pct = (n: number) => `${(n / count) * 100}%`;
  const todayAt = now >= from && now <= to ? diff(from, now) : null;
  const firsts = Array.from({ length: months }, (_, i) => addMonths(from, i));

  return (
    <div className="overflow-x-auto rounded-2xl border border-line/80 bg-surface shadow-xs">
      <div className="grid" style={{ gridTemplateColumns: `minmax(9rem, 15rem) minmax(${count * dayWidth}px, 1fr)` }}>
        {/* Header: months, then days */}
        <div className="sticky left-0 z-20 flex items-end border-r border-b border-line bg-surface px-4 py-2 text-xs font-medium text-muted">Project</div>
        <div className="border-b border-line">
          {months > 1 && (
            <div className="flex border-b border-line/70">
              {firsts.map((first) => (
                <div key={first} className="border-r border-line/70 px-2 py-1 text-xs font-semibold last:border-r-0" style={{ width: pct(diff(first, addDays(addMonths(first, 1), -1)) + 1) }}>
                  {monthName(first)}
                </div>
              ))}
            </div>
          )}
          <div className="flex">
            {days.map((d) => {
              const weekend = weekday(d) === 0 || weekday(d) === 6;
              const show = months === 1 || weekday(d) === 1 || d.endsWith("-01");
              return (
                <div key={d} className={cx("flex-1 py-1.5 text-center text-[11px] leading-tight", weekend ? "bg-hover/70 text-muted/70" : "text-muted", d === now && "bg-accent font-semibold text-white")}>
                  {months === 1 && <div className="text-[9px] uppercase">{"SMTWTFS"[weekday(d)]}</div>}
                  <div className="tabular-nums">{show ? Number(d.slice(8)) : " "}</div>
                </div>
              );
            })}
          </div>
        </div>

        {rows.map(({ project: p, milestones, start, end }, i) => {
          const colours = BAR[p.status];
          const late = p.status !== "done" && end != null && end < now;
          // Clip the bar to the days on screen.
          const first = Math.max(0, diff(from, start));
          const last = Math.min(count - 1, end ? diff(from, end) : count - 1);
          const clippedLeft = start < from;
          const clippedRight = end == null || end > to;
          const lateFrom = late ? Math.max(0, diff(from, end!) + 1) : 0;
          const lateTo = late ? Math.min(count - 1, diff(from, now)) : -1;
          const dates = `${formatDate(start)} to ${end ? formatDate(end) : "no target date"}`;
          return (
            <div key={p.id} className="group contents">
              <Link
                to={`/projects/${p.id}`}
                className={cx("sticky left-0 z-10 flex min-w-0 flex-col justify-center border-r border-line px-4 py-2 transition group-hover:bg-hover", i % 2 ? "bg-[#fbfcfe]" : "bg-surface")}
              >
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="truncate text-[11px] text-muted">{[p.client, end ? `Target ${formatDate(end)}` : "No target date"].filter(Boolean).join(" · ")}</span>
              </Link>
              <div className={cx("relative h-13", i % 2 === 1 && "bg-[#fbfcfe]")}>
                {/* Weekend shading and the today line run behind every bar */}
                <div className="absolute inset-0 flex" aria-hidden>
                  {days.map((d) => (
                    <div key={d} className={cx("flex-1 border-r border-line/40", (weekday(d) === 0 || weekday(d) === 6) && "bg-hover/60", months > 1 && !d.endsWith("-01") && weekday(d) !== 1 && "border-r-0")} />
                  ))}
                </div>
                {todayAt != null && <div aria-hidden className="absolute top-0 bottom-0 w-0.5 bg-accent/70" style={{ left: pct(todayAt + 0.5) }} />}
                {late && lateTo >= lateFrom && (
                  <div
                    title={`Past its target date by ${diff(end!, now)} days`}
                    className="absolute top-1/2 h-6 -translate-y-1/2 rounded-r-full border border-dashed border-red-300 bg-red-50"
                    style={{ left: pct(lateFrom), width: pct(lateTo - lateFrom + 1) }}
                  />
                )}
                {last >= first && (
                  <Link
                    to={`/projects/${p.id}`}
                    title={`${p.name}\n${dates}\n${projectStatusLabel(p.status)} · ${p.progress}%`}
                    className={cx(
                      "absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden shadow-sm transition hover:brightness-95",
                      colours.bar,
                      !clippedLeft && "rounded-l-full",
                      !clippedRight && "rounded-r-full",
                      late && "ring-1 ring-red-400",
                    )}
                    style={{
                      left: pct(first),
                      width: pct(last - first + 1),
                      // A project with no target date fades out instead of ending.
                      ...(end == null ? { maskImage: "linear-gradient(to right, black 55%, transparent)", WebkitMaskImage: "linear-gradient(to right, black 55%, transparent)" } : {}),
                    }}
                  >
                    {/* The name is drawn twice: dark on the bar, and light inside the progress fill, so it reads on both. */}
                    <span className="truncate px-2.5 text-[11px] font-medium text-slate-800">
                      {p.name} · {p.progress}%
                    </span>
                    {p.progress > 0 && (
                      <span aria-hidden className={cx("absolute inset-y-0 left-0 overflow-hidden", colours.fill)} style={{ width: `${Math.min(100, p.progress)}%` }}>
                        <span className={cx("flex h-full items-center", colours.text)} style={{ width: `${10000 / Math.min(100, p.progress)}%` }}>
                          <span className="truncate px-2.5 text-[11px] font-medium">
                            {p.name} · {p.progress}%
                          </span>
                        </span>
                      </span>
                    )}
                  </Link>
                )}
                {milestones
                  .filter((m) => m.due_date && m.due_date >= from && m.due_date <= to)
                  .map((m) => (
                    <span
                      key={m.id}
                      title={`${m.title} · ${formatDate(m.due_date)}${m.done ? " · reached" : ""}`}
                      className={cx(
                        "absolute bottom-0.5 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border border-white shadow-sm",
                        m.done ? "bg-emerald-500" : m.due_date! < now ? "bg-red-500" : "bg-amber-500",
                      )}
                      style={{ left: pct(diff(from, m.due_date!) + 0.5) }}
                    />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["bg-accent", "Active"],
    ["bg-sky-400", "Planning"],
    ["bg-amber-400", "On hold"],
    ["bg-emerald-500", "Completed"],
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([colour, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={cx("h-2.5 w-5 rounded-full", colour)} />
          {label}
        </span>
      ))}
      <span>The darker part of a bar is the progress so far.</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-full border border-dashed border-red-300 bg-red-50" />
        Past target date
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rotate-45 bg-amber-500" />
        Milestone
      </span>
    </div>
  );
}
