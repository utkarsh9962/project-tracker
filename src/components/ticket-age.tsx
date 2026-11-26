import { daysSinceDate, formatDate, shortDate } from "@/lib/format";
import { ticketType } from "@/lib/types";
import { cx } from "./ui";

// How long a person has had a ticket: the day they were given it in Jira and the days since, e.g. "19 Nov · 7d".
// Only for tickets outside ZST, and only once the import has brought in the date.
// Amber from two weeks, red from a month, so long-running work stands out.
type Dated = { key: string; assigned_on?: string | null; started_on?: string | null };
const WEEKS_2 = 14;
const MONTH = 30;

export function ticketAge(t: Dated) {
  if (ticketType(t.key) === "ZST" || !t.assigned_on) return null;
  return { assigned: t.assigned_on, days: daysSinceDate(t.assigned_on), started: t.started_on ?? null };
}

const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const tone = (days: number) => (days >= MONTH ? "text-red-600" : days >= WEEKS_2 ? "text-amber-700" : "text-muted");

function describe(age: NonNullable<ReturnType<typeof ticketAge>>) {
  const started = age.started ? ` In its current status since ${formatDate(age.started)} (${plural(daysSinceDate(age.started))}).` : "";
  return `Assigned ${formatDate(age.assigned)} in Jira, ${plural(age.days)} ago.${started}`;
}

// Compact, for cards: "19 Nov · 7d".
export function TicketAge({ ticket, className }: { ticket: Dated; className?: string }) {
  const age = ticketAge(ticket);
  if (!age) return null;
  return (
    <span title={describe(age)} className={cx("shrink-0 text-xs whitespace-nowrap tabular-nums", tone(age.days), className)}>
      {shortDate(age.assigned)} · {age.days}d
    </span>
  );
}

// Spelled out, for a person's page: "Assigned 19 Nov · 7 days · in status since 22 Nov".
export function TicketAgeLine({ ticket }: { ticket: Dated }) {
  const age = ticketAge(ticket);
  if (!age) return null;
  return (
    <span title={describe(age)} className="block truncate text-xs text-muted">
      Assigned {shortDate(age.assigned)} · <span className={cx("font-medium", tone(age.days))}>{plural(age.days)}</span>
      {age.started && <> · in current status since {shortDate(age.started)}</>}
    </span>
  );
}
