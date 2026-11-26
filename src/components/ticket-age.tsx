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

// Its own column on a person's page: the days in bold, the day it was given underneath.
// Always takes the same width, so rows line up whether or not a ticket has an age.
export function TicketAgeCell({ ticket, open }: { ticket: Dated; open: boolean }) {
  const age = open ? ticketAge(ticket) : null;
  const why = !open ? "" : ticketType(ticket.key) === "ZST" ? "ZST tickets don't show an age" : "No assignment date from Jira yet";
  return (
    <div className="w-28 shrink-0 text-right sm:text-left">
      {age ? (
        <div title={describe(age)}>
          <div className={cx("text-sm font-semibold tabular-nums", tone(age.days) === "text-muted" ? "text-fg" : tone(age.days))}>{plural(age.days)}</div>
          <div className="text-xs text-muted">since {shortDate(age.assigned)}</div>
        </div>
      ) : (
        <span title={why} className="text-xs text-muted/60">
          —
        </span>
      )}
    </div>
  );
}
