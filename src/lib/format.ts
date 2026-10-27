// Dates are stored as YYYY-MM-DD strings; compare them as strings.
// Your local date as YYYY-MM-DD, so deadlines flip at your midnight.
export function today(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function relativeDue(date: string | null | undefined): { label: string; tone: "overdue" | "soon" | "later" } | null {
  if (!date) return null;
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { label: `${-days}d overdue`, tone: "overdue" };
  if (days === 0) return { label: "Due today", tone: "soon" };
  if (days === 1) return { label: "Due tomorrow", tone: "soon" };
  if (days <= 7) return { label: `Due in ${days}d`, tone: "soon" };
  return { label: formatDate(date), tone: "later" };
}

export function humanize(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A finished project reads as "Completed"; tasks keep "Done".
export function projectStatusLabel(status: string): string {
  return status === "done" ? "Completed" : humanize(status);
}

const LINK_SCHEMES = ["http:", "https:", "mailto:", "slack:"];

// Turns user input into a safe link: bare domains get https://, anything else non-web is rejected.
export function normalizeUrl(input: string): { ok: true; url: string | null } | { ok: false } {
  const v = input.trim();
  if (!v) return { ok: true, url: null };
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return LINK_SCHEMES.includes(url.protocol) ? { ok: true, url: url.toString() } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// Only render links we trust as navigable (blocks javascript: and similar).
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return LINK_SCHEMES.includes(u.protocol) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
