import { Link } from "react-router";
import { twMerge } from "tailwind-merge";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { humanize, relativeDue } from "@/lib/format";

// twMerge lets a later class (e.g. w-24) override a default one (w-full).
export function cx(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(" "));
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface p-4 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  // statuses
  planning: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  on_hold: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  done: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  todo: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  in_progress: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200",
  open: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  waiting: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  closed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
  // priorities
  low: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  medium: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  // due dates
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  soon: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  later: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium", TONES[value] ?? TONES.low)}>
      {label ?? humanize(value)}
    </span>
  );
}

export function DueBadge({ date }: { date: string | null | undefined }) {
  const due = relativeDue(date);
  if (!due) return null;
  return <Badge value={due.tone} label={due.label} />;
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${value}% complete`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted">{value}%</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{children}</p>;
}

const buttonStyles = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary: "border border-line bg-surface hover:bg-hover",
  danger: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
  ghost: "text-muted hover:bg-hover hover:text-fg",
};

type Variant = keyof typeof buttonStyles;

export function buttonClass(variant: Variant = "primary", small = false) {
  return cx(
    "inline-flex items-center justify-center gap-1 rounded-lg font-medium transition-colors disabled:opacity-50",
    small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
    buttonStyles[variant],
  );
}

export function Button({ variant, small, className, ...props }: ComponentProps<"button"> & { variant?: Variant; small?: boolean }) {
  return <button className={cx(buttonClass(variant, small), className)} {...props} />;
}

export function LinkButton({ variant, small, className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; small?: boolean }) {
  return <Link className={cx(buttonClass(variant, small), className)} {...props} />;
}

export const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={cx(inputClass, props.className)} />;
}

export function Select({ options, ...props }: ComponentProps<"select"> & { options: readonly (string | { value: string | number; label: string })[] }) {
  return (
    <select {...props} className={cx(inputClass, "pr-8", props.className)}>
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {humanize(o)}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-line/60" />
      ))}
    </div>
  );
}

export { safeHref } from "@/lib/format";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Project Tracker` : "Project Tracker";
  }, [title]);
}
