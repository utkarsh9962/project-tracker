import { supabase } from "./supabase";
import { isOpenTicket } from "./api";
import { ticketType, type Person, type Priority, type Ticket, type TicketStatus } from "./types";

// Reads a Jira export (Excel or CSV), works out what it would change in the tracker, and applies the rows picked.
// Nothing here writes until apply() is called from the preview.

export type Table = { header: string[]; rows: string[][]; site: string | null; sheet: string | null };

// ---------- Reading the file ----------

// CSV with quoted fields, doubled quotes and line breaks inside quotes, as Jira writes it.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  // Jira uses commas; a file saved from Excel in some regions uses semicolons.
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? undefined : src.indexOf("\n"));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Which column holds what. The first header that matches wins.
const COLUMN_NAMES = {
  key: ["key", "issue key", "ticket", "ticket key", "issue"],
  title: ["summary", "title", "name"],
  status: ["status"],
  priority: ["priority"],
  assignee: ["assignee", "assigned to", "assignees"],
  client: ["customers", "customer", "client", "organizations", "organisation", "organization"],
  due: ["due date", "due", "duedate"],
} as const;
export type Field = keyof typeof COLUMN_NAMES;
export const FIELDS = Object.keys(COLUMN_NAMES) as Field[];
export const FIELD_LABELS: Record<Field, string> = { key: "Ticket key", title: "Summary", status: "Status", priority: "Priority", assignee: "Assignee", client: "Client", due: "Due date" };
export type Mapping = Record<Field, number>; // column index, or -1 when the file doesn't have it

export function guessMapping(header: string[]): Mapping {
  const names = header.map(norm);
  const find = (field: Field) => {
    for (const wanted of COLUMN_NAMES[field]) {
      const i = names.indexOf(wanted);
      if (i !== -1) return i;
    }
    return -1;
  };
  return Object.fromEntries(FIELDS.map((f) => [f, find(f)])) as Mapping;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

// Picks the sheet and header row that look like a list of tickets: the first row naming both a key and a summary.
function findTable(sheets: { sheet: string | null; data: unknown[][] }[]): Omit<Table, "site"> | null {
  for (const { sheet, data } of sheets) {
    for (let i = 0; i < Math.min(data.length, 15); i++) {
      const header = data[i].map(cellText);
      const m = guessMapping(header);
      if (m.key !== -1 && m.title !== -1) {
        return { sheet, header, rows: data.slice(i + 1).map((r) => header.map((_, c) => cellText(r[c]))).filter((r) => r.some(Boolean)) };
      }
    }
  }
  return null;
}

export async function readFile(file: File): Promise<Table> {
  let sheets: { sheet: string | null; data: unknown[][] }[];
  if (/\.(csv|txt)$/i.test(file.name) || file.type === "text/csv") {
    sheets = [{ sheet: null, data: parseCsv(await file.text()) }];
  } else if (/\.xlsx$/i.test(file.name)) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    try {
      sheets = (await readXlsxFile(file)) as { sheet: string; data: unknown[][] }[];
    } catch {
      throw new Error("That Excel file couldn’t be read. Export it from Jira again, or save it as .xlsx.");
    }
  } else {
    throw new Error("Use a Jira export saved as Excel (.xlsx) or CSV (.csv).");
  }
  const table = findTable(sheets);
  if (!table) throw new Error("No list of tickets was found in that file. It needs a header row with a Key column and a Summary column.");
  // Jira's Excel export names the Jira site on its About sheet; ticket links are built from it.
  let site: string | null = null;
  for (const { data } of sheets)
    for (const row of data.slice(0, 20)) {
      const i = row.findIndex((c) => /^jira site:?$/i.test(cellText(c)));
      const value = i === -1 ? "" : cellText(row[i + 1]);
      if (/^https:\/\/[\w.-]+$/i.test(value.replace(/\/$/, ""))) site = value.replace(/\/$/, "");
    }
  return { ...table, site };
}

// ---------- Jira values to tracker values ----------

export function mapPriority(raw: string): Priority {
  const p = norm(raw);
  if (p === "blocker") return "blocker";
  if (p === "critical" || p === "highest" || p === "urgent") return "critical";
  if (p === "high") return "high";
  if (p === "minor" || p === "low" || p === "lowest" || p === "trivial") return "low";
  return "medium"; // Major, Medium, or anything unfamiliar
}

export function mapStatus(raw: string, title: string): TicketStatus {
  const s = norm(raw);
  if (/^(closed|cancell?ed|won'?t (do|fix)|rejected|declined|duplicate)$/.test(s)) return "closed";
  if (/^(done|resolved|fixed|completed?|released|deployed)$/.test(s)) return "resolved";
  if (/on hold/i.test(title) || /(testing|\bqa\b|\buat\b|waiting|on hold|blocked|pending|review)/.test(s)) return "waiting";
  if (/(in progress|in development|in dev|developing|implementing)/.test(s)) return "in_progress";
  return "open"; // Prioritization, Backlog, Selected for Development, To Do…
}

function toDate(raw: string): string | null {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Jira's CSV style: 27/Oct/26 9:15 AM
  const m = raw.match(/^(\d{1,2})[/ -]([A-Za-z]{3})[a-z]*[/ -](\d{2,4})/);
  if (m) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase());
    if (month !== -1) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// ---------- Matching Jira assignees to People ----------

const letters = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function distance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

// Exact name first; otherwise the one person whose name is a letter or two off ("Don Drzal" for "Don Drazal").
export function matchPerson(name: string, people: Pick<Person, "id" | "name">[]): Pick<Person, "id" | "name"> | null {
  const wanted = letters(name);
  if (!wanted) return null;
  const exact = people.find((p) => letters(p.name) === wanted);
  if (exact) return exact;
  if (wanted.length < 8) return null;
  const close = people.filter((p) => distance(letters(p.name), wanted) <= 2);
  return close.length === 1 ? close[0] : null;
}

// ---------- Working out the changes ----------

export type ExistingTicket = Ticket & { people: { id: number }[] };
type Values = Pick<Ticket, "title" | "client" | "priority" | "status" | "due_date" | "url" | "notes">;
export type Change = { field: string; from: string; to: string };
export type PlanRow =
  | { kind: "new"; key: string; values: Values; assign: Pick<Person, "id" | "name">[] }
  | { kind: "changed"; key: string; id: number; title: string; patch: Partial<Values>; changes: Change[]; assign: Pick<Person, "id" | "name">[] }
  | { kind: "missing"; key: string; id: number; title: string; status: TicketStatus };
export type Plan = { rows: PlanRow[]; unchanged: number; skipped: number; unmatched: { name: string; tickets: number }[]; duplicates: number };

const JIRA_NOTE = /^jira:/i;
const label = (v: string | null) => (v == null || v === "" ? "none" : v.replace(/_/g, " "));

export function buildPlan(table: Table, mapping: Mapping, existing: ExistingTicket[], people: Pick<Person, "id" | "name">[]): Plan {
  const at = (row: string[], field: Field) => (mapping[field] === -1 ? "" : (row[mapping[field]] ?? "").trim());
  const byKey = new Map(existing.map((t) => [t.key.toUpperCase(), t]));
  // Ticket links follow the Jira site named in the file, or failing that the links already saved.
  const site = table.site ?? existing.map((t) => t.url?.match(/^(https:\/\/[^/]+)\/browse\//)?.[1]).find(Boolean) ?? null;
  const seen = new Set<string>();
  const rows: PlanRow[] = [];
  const unmatched = new Map<string, number>();
  let unchanged = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const row of table.rows) {
    const key = at(row, "key").toUpperCase().replace(/\s+/g, "");
    const title = at(row, "title");
    if (!/^[A-Z][A-Z0-9]*-\d+$/.test(key) || !title) {
      skipped++;
      continue;
    }
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);

    const rawPriority = at(row, "priority");
    const rawStatus = at(row, "status");
    const old = byKey.get(key);
    const jiraNote = [rawPriority, rawStatus].filter(Boolean).join(", ");
    const assign: Pick<Person, "id" | "name">[] = [];
    for (const name of at(row, "assignee").split(/[;\n]/).map((n) => n.trim()).filter(Boolean)) {
      const person = matchPerson(name, people);
      if (!person) unmatched.set(name, (unmatched.get(name) ?? 0) + 1);
      else if (!old?.people.some((p) => p.id === person.id) && !assign.some((p) => p.id === person.id)) assign.push(person);
    }

    if (!old) {
      rows.push({
        kind: "new",
        key,
        assign,
        values: {
          title,
          // Without a client column, "Durango (CMS) DRO: …" still gives the client.
          client: at(row, "client") || title.match(/^([^(:]{2,60}?)\s*\(/)?.[1].trim() || null,
          priority: rawPriority ? mapPriority(rawPriority) : "medium",
          status: mapStatus(rawStatus, title),
          due_date: toDate(at(row, "due")),
          url: site ? `${site}/browse/${key}` : null,
          notes: jiraNote ? `Jira: ${jiraNote}` : null,
        },
      });
      continue;
    }

    const patch: Partial<Values> = {};
    const changes: Change[] = [];
    const set = <K extends keyof Values>(field: K, value: Values[K], name: string) => {
      if ((old[field] ?? null) === (value ?? null)) return;
      patch[field] = value;
      changes.push({ field: name, from: label(old[field]), to: label(value) });
    };
    set("title", title, "Summary");
    if (at(row, "client")) set("client", at(row, "client"), "Client");
    if (rawPriority) set("priority", mapPriority(rawPriority), "Priority");
    if (mapping.status !== -1) set("status", mapStatus(rawStatus, title), "Status");
    if (mapping.due !== -1 && toDate(at(row, "due"))) set("due_date", toDate(at(row, "due")), "Due date");
    if (!old.url && site) patch.url = `${site}/browse/${key}`;
    // The "Jira: Major, In Progress" line is kept up to date, but notes you typed yourself are never replaced.
    if (jiraNote && (!old.notes || JIRA_NOTE.test(old.notes)) && old.notes !== `Jira: ${jiraNote}`) {
      patch.notes = `Jira: ${jiraNote}`;
      if (changes.length === 0 && old.notes) changes.push({ field: "In Jira", from: old.notes.replace(JIRA_NOTE, "").trim(), to: jiraNote });
    }
    for (const p of assign) changes.push({ field: "Working on it", from: "", to: p.name });
    if (changes.length === 0 && Object.keys(patch).length === 0) unchanged++;
    else if (changes.length === 0) {
      // Only a link or a first Jira note to fill in: worth saving, not worth a line in the preview.
      rows.push({ kind: "changed", key, id: old.id, title, patch, changes: [{ field: "Details", from: "", to: "Jira link and note filled in" }], assign });
    } else rows.push({ kind: "changed", key, id: old.id, title, patch, changes, assign });
  }

  // Open here, absent from the file: probably finished in Jira. Only ticket types the file covers are considered,
  // and only keys at or above the lowest number in the file, since exports usually start from a certain ticket.
  const lowest = new Map<string, number>();
  for (const key of seen) {
    const n = Number(key.split("-")[1]);
    lowest.set(ticketType(key), Math.min(lowest.get(ticketType(key)) ?? Infinity, n));
  }
  for (const t of existing) {
    const key = t.key.toUpperCase();
    const from = lowest.get(ticketType(key));
    if (from != null && isOpenTicket(t) && !seen.has(key) && Number(key.split("-")[1]) >= from) rows.push({ kind: "missing", key: t.key, id: t.id, title: t.title, status: t.status });
  }

  return { rows, unchanged, skipped, duplicates, unmatched: [...unmatched].map(([name, tickets]) => ({ name, tickets })).sort((a, b) => b.tickets - a.tickets) };
}

// ---------- Saving ----------

export async function loadExisting() {
  const [tickets, people] = await Promise.all([supabase.from("tickets").select("*, people(id)"), supabase.from("people").select("id, name").order("name")]);
  const error = tickets.error ?? people.error;
  if (error) throw new Error(error.message);
  return { tickets: tickets.data as ExistingTicket[], people: people.data as Pick<Person, "id" | "name">[] };
}

const check = <T extends { error: { message: string } | null }>(result: T) => {
  if (result.error) throw new Error(result.error.message);
  return result;
};

export async function apply(rows: PlanRow[], onProgress: (done: number, total: number) => void) {
  const created = rows.filter((r) => r.kind === "new");
  const changed = rows.filter((r) => r.kind === "changed");
  const missing = rows.filter((r) => r.kind === "missing");
  const total = rows.length;
  let done = 0;
  const assignments: { ticket_id: number; person_id: number }[] = [];

  if (created.length) {
    const inserted = check(await supabase.from("tickets").insert(created.map((r) => ({ key: r.key, project_id: null, ...r.values }))).select("id, key"));
    const ids = new Map((inserted.data as { id: number; key: string }[]).map((t) => [t.key, t.id]));
    for (const r of created) for (const p of r.assign) assignments.push({ ticket_id: ids.get(r.key)!, person_id: p.id });
    onProgress((done += created.length), total);
  }
  // A few at a time, so a long list neither crawls nor floods the database.
  for (let i = 0; i < changed.length; i += 8) {
    const batch = changed.slice(i, i + 8);
    await Promise.all(batch.filter((r) => Object.keys(r.patch).length > 0).map(async (r) => check(await supabase.from("tickets").update(r.patch).eq("id", r.id))));
    for (const r of batch) for (const p of r.assign) assignments.push({ ticket_id: r.id, person_id: p.id });
    onProgress((done += batch.length), total);
  }
  if (assignments.length) check(await supabase.from("ticket_people").upsert(assignments, { ignoreDuplicates: true }));
  if (missing.length) {
    check(await supabase.from("tickets").update({ status: "resolved" }).in("id", missing.map((r) => r.id)));
    onProgress((done += missing.length), total);
  }
  return { created: created.length, changed: changed.length, resolved: missing.length };
}
