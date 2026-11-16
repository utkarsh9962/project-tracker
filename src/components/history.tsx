import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import * as api from "@/lib/api";
import { formatDate, humanize, projectStatusLabel } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { SETUP_HINT } from "./screenshots";
import { Card, cx } from "./ui";

type Names = { people: Map<number, string>; emails: Map<string, string>; projects: Map<number, string> };

const FIELD_LABELS: Record<string, string> = {
  name: "name",
  title: "title",
  key: "key",
  client: "client",
  status: "status",
  priority: "priority",
  progress: "progress",
  start_date: "start date",
  due_date: "due date",
  assignee_id: "assignee",
  project_id: "project",
  tags: "tags",
  url: "link",
  description: "description",
  notes: "notes",
};
const LONG_TEXT = ["description", "notes"];

function show(entity: Activity["entity"], field: string, value: unknown, names: Names): string {
  if (value == null || value === "") return "none";
  if (field === "status") return entity === "project" ? projectStatusLabel(String(value)) : humanize(String(value));
  if (field === "priority") return humanize(String(value));
  if (field === "progress") return `${value}%`;
  if (field.endsWith("_date")) return formatDate(String(value));
  if (field === "assignee_id") return names.people.get(Number(value)) ?? "someone";
  if (field === "project_id") return names.projects.get(Number(value)) ?? "a project";
  if (Array.isArray(value)) return value.join(", ") || "none";
  return String(value);
}

// "status: To do → Done", one entry per changed field.
function describeChanges(a: Activity, names: Names): string[] {
  return Object.entries(a.changes).map(([field, [before, after]]) => {
    if (a.entity === "milestone" && field === "done") return after ? "marked reached" : "marked not reached";
    const label = field === "due_date" && a.entity === "project" ? "target date" : (FIELD_LABELS[field] ?? humanize(field).toLowerCase());
    if (LONG_TEXT.includes(field)) return `${label} edited`;
    return `${label}: ${show(a.entity, field, before, names)} → ${show(a.entity, field, after, names)}`;
  });
}

function who(a: Activity, names: Names) {
  if (!a.who) return "An import";
  const known = names.emails.get(a.who.toLowerCase());
  if (known) return known;
  const local = a.who.split("@")[0].replace(/[._-]+/g, " ");
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function timeAgo(at: string) {
  const minutes = Math.floor((Date.now() - Date.parse(at)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))}d ago`;
  return formatDate(new Intl.DateTimeFormat("en-CA").format(new Date(at)));
}

const VERBS = { created: "added", updated: "changed", deleted: "deleted" } as const;
const DOTS = { created: "bg-emerald-500", updated: "bg-accent", deleted: "bg-red-500" } as const;

function href(a: Activity) {
  if (a.action === "deleted" && (a.entity === "project" || a.entity === "ticket")) return null;
  if (a.entity === "ticket") return `/tickets/${a.entity_id}`;
  return a.project_id ? `/projects/${a.project_id}` : null;
}

// Who changed what, newest first. With no project or ticket given it lists everything.
export function HistoryList({ projectId, ticketId, pageSize = 15, context = false }: { projectId?: number; ticketId?: number; pageSize?: number; context?: boolean }) {
  const [limit, setLimit] = useState(pageSize);
  const rows = useQuery({ queryKey: ["activity", projectId ?? null, ticketId ?? null, limit], queryFn: () => api.listActivity({ projectId, ticketId, limit: limit + 1 }), placeholderData: (previous) => previous });
  const people = useQuery({ queryKey: ["people-directory"], queryFn: api.peopleDirectory, staleTime: 60_000 }).data;
  const facets = useQuery({ queryKey: ["facets"], queryFn: api.projectFacets }).data;
  const names: Names = {
    people: new Map(people?.map((p) => [p.id, p.name])),
    emails: new Map(people?.flatMap((p) => (p.email ? [[p.email.toLowerCase(), p.name] as const] : []))),
    projects: new Map(facets?.projects.map((p) => [p.id, p.name])),
  };

  if (rows.isPending) return <div className="h-10 animate-pulse rounded-xl bg-line/60" aria-busy="true" />;
  if (rows.isError) return <p className="text-sm text-muted">History couldn’t be loaded. {rows.error.message}</p>;
  if (rows.data == null) return <p className="text-sm text-muted">History isn’t set up yet. {SETUP_HINT}</p>;
  if (rows.data.length === 0) return <p className="text-sm text-muted">No changes recorded yet. Changes made from now on show up here.</p>;

  return (
    <>
      <ol className="space-y-3">
        {rows.data.slice(0, limit).map((a) => {
          const to = href(a);
          const changes = a.action === "updated" ? describeChanges(a, names) : [];
          const project = context && a.entity !== "project" && a.project_id ? names.projects.get(a.project_id) : null;
          return (
            <li key={a.id} className="flex gap-2.5 text-sm">
              <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOTS[a.action])} />
              <div className="min-w-0 flex-1">
                <p className="break-words">
                  <span className="font-medium">{who(a, names)}</span> {VERBS[a.action]} {a.entity}{" "}
                  {to && context ? (
                    <Link to={to} className="font-medium text-accent hover:underline">
                      {a.label}
                    </Link>
                  ) : (
                    <span className="font-medium">{a.label}</span>
                  )}
                  {project && <span className="text-muted"> in {project}</span>}
                </p>
                {changes.length > 0 && <p className="mt-0.5 text-xs break-words text-muted">{changes.join(" · ")}</p>}
              </div>
              <time dateTime={a.at} title={new Date(a.at).toLocaleString()} className="shrink-0 text-xs text-muted">
                {timeAgo(a.at)}
              </time>
            </li>
          );
        })}
      </ol>
      {rows.data.length > limit && (
        <button type="button" className="mt-3 text-xs font-medium text-accent hover:underline" onClick={() => setLimit(limit + pageSize * 2)}>
          Show older changes
        </button>
      )}
    </>
  );
}

export function HistoryCard(props: { projectId?: number; ticketId?: number }) {
  return (
    <Card title="History">
      <HistoryList {...props} pageSize={8} />
    </Card>
  );
}
