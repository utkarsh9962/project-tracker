import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import * as api from "@/lib/api";
import { projectStatusLabel } from "@/lib/format";
import { PROJECT_STATUSES } from "@/lib/types";
import { cx } from "./ui";

type Option = { value: string; label: string };

// Filters live in the URL (?status=active&pm=3&tag=CMS) so a filtered view can be bookmarked or shared.
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const get = (key: string) => params.get(key) ?? "";
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const clear = (keys: readonly string[]) => {
    const next = new URLSearchParams(params);
    for (const k of keys) next.delete(k);
    setParams(next, { replace: true });
  };
  return { get, set, clear };
}

// Project-level filters shared by every page: project status, PM and platform tag.
export function useProjectFilter({ statusKey = "status" }: { statusKey?: string } = {}) {
  const filters = useFilters();
  const facets = useQuery({ queryKey: ["facets"], queryFn: api.projectFacets }).data;
  const status = filters.get(statusKey);
  const pm = Number(filters.get("pm")) || 0;
  const tag = filters.get("tag");
  const active = Boolean(status || pm || tag);
  const byId = new Map(facets?.projects.map((p) => [p.id, p]));
  // Work with no project (e.g. an unlinked ZST) only shows while no project filter is set.
  const keep = (projectId: number | null) => {
    if (!active) return true;
    const p = projectId == null ? undefined : byId.get(projectId);
    if (!p) return false;
    return (!status || p.status === status) && (!pm || p.pmIds.includes(pm)) && (!tag || p.tags.includes(tag));
  };
  return { ...filters, facets, statusKey, status, pm, tag, active, keep, ready: !active || Boolean(facets), key: [status, pm, tag, Boolean(facets)] };
}

export function SlicerBar({ children, active, onClear }: { children: ReactNode; active: boolean; onClear: () => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {children}
      {active && (
        <button type="button" onClick={onClear} className="px-2 text-xs font-medium text-accent hover:underline">
          Clear filters
        </button>
      )}
    </div>
  );
}

// A compact dropdown: "Status  All ▾". Highlighted while something other than All is picked.
export function Slicer({ label, value, options, onChange, allLabel = "All" }: { label: string; value: string | number; options: Option[]; onChange: (v: string) => void; allLabel?: string }) {
  const on = Boolean(value);
  return (
    <label
      className={cx(
        "relative inline-flex items-center gap-1.5 rounded-full border py-1 pr-7 pl-3 text-xs transition-colors duration-200",
        on ? "border-accent/40 bg-accent/10 text-accent-strong" : "border-line bg-surface text-muted hover:border-slate-300",
      )}
    >
      <span className={on ? "text-accent-strong/70" : ""}>{label}</span>
      <select
        value={String(value || "")}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="max-w-44 cursor-pointer appearance-none truncate bg-transparent font-medium text-fg outline-none"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-2 h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

// Any page-specific dropdowns (children) first, then the Status / PM / Platform ones.
export function ProjectSlicers({
  filter,
  children,
  extraKeys = [],
  statusLabel = "Status",
  showStatus = true,
}: {
  filter: ReturnType<typeof useProjectFilter>;
  children?: ReactNode;
  extraKeys?: string[];
  statusLabel?: string;
  showStatus?: boolean;
}) {
  const { facets } = filter;
  const extraActive = extraKeys.some((k) => filter.get(k));
  return (
    <SlicerBar active={filter.active || extraActive} onClear={() => filter.clear([filter.statusKey, "pm", "tag", ...extraKeys])}>
      {children}
      {showStatus && (
        <Slicer label={statusLabel} value={filter.status} options={PROJECT_STATUSES.map((s) => ({ value: s, label: projectStatusLabel(s) }))} onChange={(v) => filter.set(filter.statusKey, v)} />
      )}
      <Slicer label="PM" value={filter.pm} options={(facets?.managers ?? []).map((m) => ({ value: String(m.id), label: m.name }))} onChange={(v) => filter.set("pm", v)} />
      <Slicer label="Platform" value={filter.tag} options={(facets?.tags ?? []).map((t) => ({ value: t, label: t }))} onChange={(v) => filter.set("tag", v)} />
    </SlicerBar>
  );
}
