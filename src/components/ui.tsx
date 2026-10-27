import { Link } from "react-router";
import { twMerge } from "tailwind-merge";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { formatDate, humanize, projectStatusLabel, relativeDue } from "@/lib/format";

// twMerge lets a later class (e.g. w-24) override a default one (w-full).
export function cx(...classes: (string | false | null | undefined)[]) {
  return twMerge(classes.filter(Boolean).join(" "));
}

export function PageHeader({ title, aside, subtitle, actions }: { title: ReactNode; aside?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[1.75rem] font-semibold tracking-tight">{title}</h1>
          {aside}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-line/80 bg-surface p-5 shadow-xs", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  // statuses
  planning: "bg-sky-50 text-sky-700",
  active: "bg-emerald-50 text-emerald-700",
  on_hold: "bg-amber-50 text-amber-700",
  done: "bg-slate-100 text-slate-600",
  todo: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-50 text-blue-700",
  open: "bg-sky-50 text-sky-700",
  waiting: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
  // priorities
  low: "bg-slate-100 text-slate-500",
  medium: "bg-sky-50 text-sky-700",
  high: "bg-orange-50 text-orange-700",
  critical: "bg-red-50 text-red-700",
  blocker: "bg-red-600 text-white",
  // due dates
  overdue: "bg-red-50 text-red-700",
  soon: "bg-amber-50 text-amber-700",
  later: "bg-slate-100 text-slate-500",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[value] ?? TONES.low)}>
      {label ?? humanize(value)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge value={status} label={projectStatusLabel(status)} />;
}

// A date as a chip, coloured when it is overdue or close. Muted once the work is finished.
export function DateChip({ date, done = false }: { date: string | null | undefined; done?: boolean }) {
  const due = relativeDue(date);
  if (!date || !due) return null;
  return (
    <span title={due.label} className={cx("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", TONES[done ? "later" : due.tone])}>
      {formatDate(date)}
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
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover">
        <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-(--ease-out)" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted">{value}%</span>
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <img src="./logo.png" alt="Quicket" className={cx("h-7 w-auto shrink-0", className)} />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line px-3 py-8 text-center text-sm text-muted">{children}</p>;
}

const buttonStyles = {
  primary: "bg-accent text-white shadow-sm shadow-accent/20 hover:bg-accent-strong",
  secondary: "border border-line bg-surface hover:border-slate-300 hover:bg-hover",
  danger: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
  ghost: "text-muted hover:bg-hover hover:text-fg",
};

type Variant = keyof typeof buttonStyles;

export function buttonClass(variant: Variant = "primary", small = false) {
  return cx(
    "inline-flex items-center justify-center gap-1 rounded-xl font-medium transition duration-200 active:scale-[0.97] disabled:opacity-50",
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
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10";

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
        <div key={i} className="h-14 animate-pulse rounded-2xl bg-line/60" />
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
