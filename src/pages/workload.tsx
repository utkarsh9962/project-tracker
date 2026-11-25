import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import * as api from "@/lib/api";
import { Load } from "@/components/query";
import { Slicer, SlicerBar, useFilters } from "@/components/slicers";
import { TeamCard } from "@/components/team-card";
import type { Team } from "@/lib/types";
import { Badge, cx, Empty, PageHeader, useTitle } from "@/components/ui";

// How much open work each person has. Someone is overloaded or underloaded when their open tasks and tickets
// pass the limits set on this page; the limits are remembered in this browser.
// Non-ZST tickets in Ready for Testing are with QA, not the developer, so they are shown in the QA tab instead.
// The QA team is everyone whose role says QA (or Tester); project managers are those whose role is Project manager.
// Each group has its own tab. The testing queue is shown as a total, not split per tester.
// Within a tab, people are listed team by team (teams are set on the People page), with people in no team last.

const KEY = "workload-limits";
const DEFAULTS = { over: 8, under: 1 };
const QUEUE_SHOWN = 15;

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
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function Workload() {
  useTitle("Workload");
  const filters = useFilters();
  const [limits, setLimits] = useState(readLimits);
  const view = filters.get("view");
  // undefined while loading, null until the teams database update has been run: then the lists aren't grouped.
  const teams = useQuery({ queryKey: ["teams"], queryFn: api.listTeams }).data ?? [];
  const team = filters.get("team");
  const save = (next: typeof limits) => {
    setLimits(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private browsing: the limits simply last until the page is closed.
    }
  };
  const levelFor = (load: number): Level => (load >= limits.over ? "over" : load <= limits.under ? "under" : "ok");

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/people" className="text-muted hover:text-fg">
          ← People
        </Link>
      </div>
      <PageHeader title="Workload" subtitle="Open tasks and open tickets per person, busiest first. Tickets waiting to be tested count for QA, not the developer." />
      <Load queryKey={["workload"]} fn={api.getWorkload} rows={8}>
        {({ rows: everyone, queue }) => {
          if (everyone.length === 0) return <Empty>No people yet. Add them on the People page.</Empty>;
          // The Team filter applies to every tab, so the tab counts follow it.
          const shown = everyone.filter((r) => api.inTeam(teams, r.person.id, team));
          const developers = shown.filter((r) => !r.qa && !r.pm);
          const managers = shown.filter((r) => r.pm);
          const qaTeam = shown.filter((r) => r.qa);
          const overIn = (rows: api.WorkloadRow[]) => rows.filter((r) => levelFor(r.load) === "over").length;
          // Switching tabs drops the load and role filters, which belong to the tab being left.
          const go = (v: string) => filters.update({ view: v, load: "", role: "" });
          const tabs = (
            <div role="tablist" aria-label="Whose workload" className="mb-5 inline-flex flex-wrap gap-1 rounded-3xl border border-line/80 bg-surface p-1 shadow-xs">
              <Tab on={view !== "pm" && view !== "qa"} onClick={() => go("")}>
                Developers <Count n={developers.length} title={`${developers.length} people, ${overIn(developers)} overloaded`} />
              </Tab>
              <Tab on={view === "pm"} onClick={() => go("pm")}>
                Project managers <Count n={managers.length} title={`${managers.length} people, ${overIn(managers)} overloaded`} />
              </Tab>
              <Tab on={view === "qa"} onClick={() => go("qa")}>
                QA workload <Count n={queue.length} tone={queue.length > 0 ? "queue" : undefined} title={`${queue.length} tickets waiting to be tested`} />
              </Tab>
            </div>
          );
          if (view === "qa")
            return (
              <>
                {tabs}
                {teams.length > 0 && (
                  <SlicerBar active={Boolean(team)} onClear={() => filters.clear(["team"])}>
                    <TeamSlicer teams={teams} />
                  </SlicerBar>
                )}
                <QaSection team={qaTeam} teams={teams} queue={queue} limits={limits} />
              </>
            );
          const pmView = view === "pm";
          return (
            <>
              {tabs}
              {!pmView && queue.length > 0 && (
                <button
                  type="button"
                  onClick={() => go("qa")}
                  className="mb-4 flex w-full items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm text-amber-800 transition hover:border-amber-300"
                >
                  <span className="font-semibold tabular-nums">{queue.length}</span> ticket{queue.length === 1 ? " is" : "s are"} waiting for QA and not counted
                  against developers.
                  <span className="ml-auto font-medium">See QA workload →</span>
                </button>
              )}
              <PeopleView
                key={pmView ? "pm" : "dev"}
                all={pmView ? managers : developers}
                empty={
                  team ? (
                    "Nobody in this team is in this tab."
                  ) : pmView ? (
                    <>
                      Nobody is a project manager yet. On the{" "}
                      <Link to="/people" className="underline">
                        People
                      </Link>{" "}
                      page, set their role to {api.PM_ROLE}.
                    </>
                  ) : (
                    "Everyone here is a project manager or on the QA team."
                  )
                }
                showManaging={pmView}
                teams={teams}
                limits={limits}
                save={save}
                levelFor={levelFor}
              />
            </>
          );
        }}
      </Load>
    </>
  );
}

// One group's people (developers, or project managers): load tiles, filters, and a row per person.
function PeopleView({
  all,
  empty,
  showManaging,
  teams,
  limits,
  save,
  levelFor,
}: {
  all: api.WorkloadRow[];
  empty: React.ReactNode;
  showManaging: boolean;
  teams: Team[];
  limits: { over: number; under: number };
  save: (next: { over: number; under: number }) => void;
  levelFor: (n: number) => Level;
}) {
  const filters = useFilters();
  const level = filters.get("load");
  const role = filters.get("role");
  const team = filters.get("team");
  const levelOf = (r: api.WorkloadRow) => levelFor(r.load);
  const teamSlicer = teams.length > 0 && <TeamSlicer teams={teams} />;
  if (all.length === 0)
    return (
      <>
        {team && (
          <SlicerBar active onClear={() => filters.clear(["team"])}>
            {teamSlicer}
          </SlicerBar>
        )}
        <Empty>{empty}</Empty>
      </>
    );
  const roles = [...new Set(all.flatMap((r) => (r.person.role ? [r.person.role] : [])))].sort((a, b) => a.localeCompare(b));
  const rows = all
    .filter((r) => (!level || levelOf(r) === level) && (!role || r.person.role === role))
    .sort((a, b) => b.load - a.load || b.projectIds.length - a.projectIds.length || a.person.name.localeCompare(b.person.name));
  const max = Math.max(limits.over + 2, ...all.map((r) => r.load));
  const counts = { over: all.filter((r) => levelOf(r) === "over").length, under: all.filter((r) => levelOf(r) === "under").length };
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Overloaded" value={counts.over} tone="text-red-600" onClick={() => filters.set("load", level === "over" ? "" : "over")} on={level === "over"} />
        <Tile label="Underloaded" value={counts.under} tone="text-amber-600" onClick={() => filters.set("load", level === "under" ? "" : "under")} on={level === "under"} />
        <Tile label="Balanced" value={all.length - counts.over - counts.under} tone="text-emerald-600" onClick={() => filters.set("load", level === "ok" ? "" : "ok")} on={level === "ok"} />
        {showManaging ? (
          <Tile label="Open projects they manage" value={all.reduce((n, r) => n + r.managing, 0)} />
        ) : (
          <Tile label="Open items in total" value={all.reduce((n, r) => n + r.load, 0)} />
        )}
      </div>

      <SlicerBar active={Boolean(level || role || team)} onClear={() => filters.clear(["load", "role", "team"])}>
        {teamSlicer}
        <Slicer label="Load" value={level} options={(Object.keys(LEVELS) as Level[]).map((l) => ({ value: l, label: LEVELS[l].label }))} onChange={(v) => filters.set("load", v)} />
        {roles.length > 1 && <Slicer label="Role" value={role} options={roles.map((r) => ({ value: r, label: r }))} onChange={(v) => filters.set("role", v)} />}
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <Limit label="Overloaded at" suffix="or more" value={limits.over} min={limits.under + 2} onChange={(over) => save({ ...limits, over })} />
          <Limit label="Underloaded at" suffix="or fewer" value={limits.under} min={0} max={limits.over - 2} onChange={(under) => save({ ...limits, under })} />
        </span>
      </SlicerBar>

      {rows.length === 0 ? (
        <Empty>Nobody matches these filters.</Empty>
      ) : (
        <ByTeam
          teams={teams}
          rows={rows}
          overloaded={(r) => levelOf(r) === "over"}
          render={(r) => (
            <PersonRow key={r.person.id} row={r} max={max} over={limits.over} level={levelOf(r)}>
              {showManaging && r.managing > 0 && <span>PM of {plural(r.managing, "open project")}</span>}
              {r.inTesting > 0 && <span title="Handed over to QA. Not counted in this person's load.">{r.inTesting} in testing</span>}
            </PersonRow>
          )}
        />
      )}
      <Legend>The number on the right is the two added together. Tickets in testing are shown but not counted. The red line marks where overloaded starts.</Legend>
    </>
  );
}

// The QA team's own tasks and tickets, and the tickets waiting to be tested. The queue is not split between testers:
// who tests what isn't recorded anywhere yet, so the page doesn't guess.
function QaSection({ team, teams, queue, limits }: { team: api.WorkloadRow[]; teams: Team[]; queue: api.QaQueueTicket[]; limits: { over: number; under: number } }) {
  const [showAll, setShowAll] = useState(false);
  const byType = new Map<string, number>();
  for (const t of queue) byType.set(t.type, (byType.get(t.type) ?? 0) + 1);
  const types = [...byType].sort((a, b) => b[1] - a[1]);
  // Days since the ticket last changed in the tracker (an import that changes it counts), not since it entered testing in Jira.
  const stale = queue.filter((t) => api.daysSince(t.updated_at) >= api.WAITING_DAYS).length;
  const rows = [...team].sort((a, b) => b.load - a.load || a.person.name.localeCompare(b.person.name));
  const max = Math.max(limits.over + 2, ...team.map((r) => r.load));
  const shown = showAll ? queue : queue.slice(0, QUEUE_SHOWN);

  return (
    <section aria-labelledby="qa-workload">
      <h2 id="qa-workload" className="text-base font-semibold">
        QA workload
      </h2>
      <p className="mb-3 text-sm text-muted">Tickets outside ZST in Ready for Testing in Jira, and the QA team's own work.</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Ready for testing" value={queue.length} tone="text-amber-600" />
        <Tile label={`Unchanged for ${api.WAITING_DAYS}+ days`} value={stale} tone="text-red-600" />
        <Tile label="On the QA team" value={team.length} />
        <div className="rounded-2xl border border-line/80 bg-surface p-4 shadow-xs">
          <div className="flex flex-wrap gap-1.5">
            {types.length === 0 ? <span className="text-2xl font-semibold">0</span> : types.map(([type, n]) => <Badge key={type} value="waiting" label={`${type} ${n}`} />)}
          </div>
          <div className="mt-2 text-xs text-muted">By Jira project</div>
        </div>
      </div>

      <h3 className="mb-2 text-sm font-semibold">QA team&apos;s own tasks and tickets</h3>
      {team.length === 0 ? (
        <Empty>
          Nobody is on the QA team yet. On the{" "}
          <Link to="/people" className="underline">
            People
          </Link>{" "}
          page, set each tester&apos;s role to QA.
        </Empty>
      ) : (
        <ByTeam teams={teams} rows={rows} overloaded={(r) => r.load >= limits.over} render={(r) => <PersonRow key={r.person.id} row={r} max={max} over={limits.over} />} />
      )}
      <Legend>The tickets waiting to be tested aren&apos;t divided between testers here, because who tests what isn&apos;t recorded.</Legend>

      {queue.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold">Testing queue, longest unchanged first</h3>
          <ul className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-xs">
            {shown.map((t) => {
              const days = api.daysSince(t.updated_at);
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Link to={`/tickets/${t.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate text-sm">
                      <span className="font-medium">{t.key}</span> {t.title}
                    </span>
                    <span className="block truncate text-xs text-muted">{t.developers.length ? `Developer: ${t.developers.join(", ")}` : "No developer linked"}</span>
                  </Link>
                  <Badge value={t.priority} />
                  <span className={cx("w-28 shrink-0 text-right text-xs tabular-nums", days >= api.WAITING_DAYS ? "font-medium text-red-600" : "text-muted")}>{days === 0 ? "Changed today" : `${days}d unchanged`}</span>
                </li>
              );
            })}
          </ul>
          {queue.length > QUEUE_SHOWN && (
            <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-sm text-muted hover:text-fg">
              {showAll ? "Show fewer" : `Show all ${queue.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TeamSlicer({ teams }: { teams: Team[] }) {
  const filters = useFilters();
  return (
    <Slicer
      label="Team"
      value={filters.get("team")}
      options={[...teams.map((t) => ({ value: String(t.id), label: t.name })), { value: api.UNASSIGNED, label: "Unassigned" }]}
      onChange={(v) => filters.set("team", v)}
    />
  );
}

// The rows split into one card per team, in the teams' order, busiest first inside each; people in no team come last.
// Someone in two teams is listed in both. Without any teams set up it is one plain list, as before.
function ByTeam({ teams, rows, render, overloaded }: { teams: Team[]; rows: api.WorkloadRow[]; render: (r: api.WorkloadRow) => React.ReactNode; overloaded: (r: api.WorkloadRow) => boolean }) {
  if (teams.length === 0) return <ul className="stagger divide-y divide-line/70 overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-xs">{rows.map(render)}</ul>;
  return (
    <div className="space-y-4">
      {api.groupByTeam(teams, rows).map((g) => {
        const over = g.rows.filter(overloaded).length;
        return (
          <TeamCard
            key={g.team?.id ?? api.UNASSIGNED}
            id={String(g.team?.id ?? api.UNASSIGNED)}
            page="workload"
            name={g.team?.name ?? "Unassigned"}
            muted={!g.team}
            count={g.rows.length}
            summary={
              <>
                {plural(g.rows.reduce((n, r) => n + r.load, 0), "open item")}
                {over > 0 && <span className="font-medium text-red-600"> · {over} overloaded</span>}
              </>
            }
          >
            <ul className="stagger -mx-4 -my-4 divide-y divide-line/70">{g.rows.map(render)}</ul>
          </TeamCard>
        );
      })}
    </div>
  );
}

function PersonRow({ row: r, max, over, level, children }: { row: api.WorkloadRow; max: number; over: number; level?: Level; children?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)_auto]">
      <Link to={`/people/${r.person.id}`} className="min-w-0 hover:underline">
        <span className="block truncate text-sm font-medium">{r.person.name}</span>
        <span className="block truncate text-xs text-muted">{[r.person.role, plural(r.projectIds.length, "open project")].filter(Boolean).join(" · ")}</span>
      </Link>
      <div className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1">
        <div className="relative h-3.5 overflow-hidden rounded-full bg-hover" aria-label={`${r.tasks} open tasks and ${r.tickets} open tickets`}>
          <div className="flex h-full">
            <div className="h-full bg-accent" style={{ width: `${(r.tasks / max) * 100}%` }} />
            <div className="h-full bg-brand-light" style={{ width: `${(r.tickets / max) * 100}%` }} />
          </div>
          <div aria-hidden title="Overloaded from here" className="absolute top-0 bottom-0 w-px bg-red-400" style={{ left: `${(over / max) * 100}%` }} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          <span>
            <span className="font-medium text-fg">{r.tasks}</span> task{r.tasks === 1 ? "" : "s"}
          </span>
          <span>
            <span className="font-medium text-fg">{r.tickets}</span> ticket{r.tickets === 1 ? "" : "s"}
          </span>
          {children}
          {r.overdue > 0 && <span className="font-medium text-red-600">{r.overdue} overdue</span>}
          {r.dueSoon > 0 && <span className="text-amber-700">{r.dueSoon} due this week</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 justify-self-end">
        <span className="text-lg font-semibold tabular-nums">{r.load}</span>
        <span className="w-24 text-right">{level && <Badge value={LEVELS[level].tone} label={LEVELS[level].label} />}</span>
      </div>
    </li>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cx("inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition", on ? "bg-accent text-white shadow-sm" : "text-muted hover:text-fg")}
    >
      {children}
    </button>
  );
}

function Count({ n, tone, title }: { n: number; tone?: "over" | "queue"; title: string }) {
  return (
    <span
      title={title}
      className={cx(
        "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        tone === "queue" ? "bg-amber-100 text-amber-800" : tone === "over" ? "bg-red-100 text-red-700" : "bg-hover text-fg",
      )}
    >
      {n}
    </span>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-full bg-accent" /> Open tasks
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-5 rounded-full bg-brand-light" /> Open tickets
      </span>
      <span>{children}</span>
    </p>
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
