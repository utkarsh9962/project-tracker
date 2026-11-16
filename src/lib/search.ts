// Fuzzy search over everything in the tracker. Pure functions, no network: the data is loaded once
// (api.searchData) and searched in the browser on every keystroke.
//
// Every word typed has to match something on an item, in any order. A word matches when it is a whole
// word, the start of one, part of one, or a near miss (a typo or two). Matches in the name count more
// than matches in the details, and exact matches count more than near misses.

import { humanize, projectStatusLabel } from "./format";
import type { Assignment, Milestone, Person, Project, Resource, Task, Ticket, TicketAssignment } from "./types";

export type Kind = "project" | "ticket" | "task" | "person" | "milestone" | "resource";

export type SearchData = {
  projects: Project[];
  tasks: Task[];
  tickets: Ticket[];
  people: Person[];
  resources: Resource[];
  milestones: Milestone[];
  projectPeople: Assignment[];
  ticketPeople: TicketAssignment[];
};

type Field = { label: string | null; text: string; weight: number; words: string[]; compact: string; strict: boolean };

export type Entry = {
  kind: Kind;
  id: number;
  title: string;
  // Shown beside the title: the client, the project, the role…
  context: string | null;
  // Status or priority value for a badge.
  badge: string | null;
  badgeLabel: string | null;
  // In-app route, or an outside link for resources.
  to: string;
  url: string | null;
  fields: Field[];
};

export type Hit = Entry & {
  score: number;
  // Set when the match was somewhere other than the title, e.g. { label: "Client", text: "Acme" }.
  why: { label: string; text: string } | null;
};

// Lower case, accents removed, punctuation turned into spaces: "ZST-1234 Café" becomes "zst 1234 cafe".
export function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PRIMARY = 1;
const SECONDARY = 0.7;
const DETAIL = 0.45;

// `strict` fields (status, priority) only match on a whole word or a clear start of one, so "don" finds Don and not everything that is Done.
function field(label: string | null, text: string | null | undefined, weight: number, strict = false): Field | null {
  if (!text) return null;
  const norm = normalize(text);
  if (!norm) return null;
  return { label, text, weight, words: norm.split(" "), compact: norm.replaceAll(" ", ""), strict };
}

const fields = (...list: (Field | null)[]) => list.filter((f): f is Field => f !== null);

export function buildIndex(data: SearchData): Entry[] {
  const projectById = new Map(data.projects.map((p) => [p.id, p]));
  const personById = new Map(data.people.map((p) => [p.id, p]));
  const ticketById = new Map(data.tickets.map((t) => [t.id, t]));
  const names = (ids: number[]) =>
    [...new Set(ids)]
      .map((id) => personById.get(id)?.name)
      .filter(Boolean)
      .join(", ");

  const entries: Entry[] = [];

  for (const p of data.projects) {
    const team = data.projectPeople.filter((a) => a.project_id === p.id);
    const isPm = (a: Assignment) => a.role?.toLowerCase() === "project manager";
    entries.push({
      kind: "project",
      id: p.id,
      title: p.name,
      context: p.client,
      badge: p.status,
      badgeLabel: projectStatusLabel(p.status),
      to: `/projects/${p.id}`,
      url: null,
      fields: fields(
        field(null, p.name, PRIMARY),
        field("Client", p.client, 0.9),
        field("Tag", (p.tags ?? []).join(", "), SECONDARY),
        field("PM", names(team.filter(isPm).map((a) => a.person_id)), SECONDARY),
        field("Team", names(team.filter((a) => !isPm(a)).map((a) => a.person_id)), SECONDARY),
        field("Notes", p.description, DETAIL),
        field("Status", projectStatusLabel(p.status), DETAIL, true),
        field("Priority", humanize(p.priority), DETAIL, true),
      ),
    });
  }

  for (const t of data.tickets) {
    const project = t.project_id == null ? null : projectById.get(t.project_id);
    entries.push({
      kind: "ticket",
      id: t.id,
      title: `${t.key} ${t.title}`,
      context: t.client ?? project?.name ?? null,
      badge: t.status,
      badgeLabel: null,
      to: `/tickets/${t.id}`,
      url: null,
      fields: fields(
        field(null, t.key, PRIMARY),
        field(null, t.title, PRIMARY),
        field("Client", t.client, 0.9),
        field("Working on it", names(data.ticketPeople.filter((a) => a.ticket_id === t.id).map((a) => a.person_id)), SECONDARY),
        field("Project", project?.name, DETAIL),
        field("Notes", t.notes, DETAIL),
        field("Status", humanize(t.status), DETAIL, true),
        field("Priority", humanize(t.priority), DETAIL, true),
      ),
    });
  }

  // The same task given to several people is one row per person; show it once with everyone on it.
  const taskGroups = new Map<string, Task[]>();
  for (const t of data.tasks) {
    const key = JSON.stringify([t.project_id, t.title.trim().toLowerCase(), t.status, t.due_date]);
    taskGroups.set(key, [...(taskGroups.get(key) ?? []), t]);
  }
  for (const group of taskGroups.values()) {
    const t = group[0];
    const project = projectById.get(t.project_id);
    entries.push({
      kind: "task",
      id: t.id,
      title: t.title,
      context: project?.name ?? null,
      badge: t.status,
      badgeLabel: null,
      to: `/projects/${t.project_id}`,
      url: null,
      fields: fields(
        field(null, t.title, PRIMARY),
        field("Assigned to", names(group.flatMap((g) => (g.assignee_id == null ? [] : [g.assignee_id]))), SECONDARY),
        field("Project", project?.name, DETAIL),
        field("Client", project?.client, DETAIL),
        field("Status", humanize(t.status), DETAIL, true),
      ),
    });
  }

  for (const p of data.people) {
    entries.push({
      kind: "person",
      id: p.id,
      title: p.name,
      context: p.role,
      badge: null,
      badgeLabel: null,
      to: `/people/${p.id}`,
      url: null,
      fields: fields(field(null, p.name, PRIMARY), field("Role", p.role, SECONDARY), field("Email", p.email, SECONDARY), field("Notes", p.notes, DETAIL)),
    });
  }

  for (const m of data.milestones) {
    const project = projectById.get(m.project_id);
    entries.push({
      kind: "milestone",
      id: m.id,
      title: m.title,
      context: project?.name ?? null,
      badge: m.done ? "done" : null,
      badgeLabel: null,
      to: `/projects/${m.project_id}`,
      url: null,
      fields: fields(field(null, m.title, PRIMARY), field("Project", project?.name, DETAIL), field("Client", project?.client, DETAIL)),
    });
  }

  for (const r of data.resources) {
    const project = r.project_id == null ? null : projectById.get(r.project_id);
    const ticket = r.ticket_id == null ? null : ticketById.get(r.ticket_id);
    entries.push({
      kind: "resource",
      id: r.id,
      title: r.title,
      context: project?.name ?? ticket?.key ?? null,
      badge: "low",
      badgeLabel: r.kind.toUpperCase(),
      to: r.project_id != null ? `/projects/${r.project_id}` : `/tickets/${r.ticket_id}`,
      url: r.url,
      fields: fields(
        field(null, r.title, PRIMARY),
        field("Notes", r.notes, SECONDARY),
        field("Link", r.url, DETAIL),
        field("Project", project?.name, DETAIL),
        field("Ticket", ticket?.key, DETAIL),
      ),
    });
  }

  return entries;
}

// Edit distance where swapping two neighbouring letters counts as one mistake. Stops caring past `max`.
function distance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      if (d < best) best = d;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

// How many typos a word of this length may have.
const typosAllowed = (length: number) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

// How well one typed word matches one word of an item: 0 (not at all) to 1 (the same word).
function wordScore(token: string, word: string) {
  if (word === token) return 1;
  if (word.startsWith(token)) return 0.9;
  if (token.length >= 3 && word.includes(token)) return 0.55;
  const max = typosAllowed(token.length);
  // Near misses must start with the same letter, which removes most false matches ("test" vs "best").
  if (max === 0 || word[0] !== token[0]) return 0;
  // Compare with the whole word, and with its beginning so a half-typed word with a typo still matches.
  let best = distance(token, word, max);
  if (word.length > token.length) {
    for (const length of [token.length, token.length + 1]) {
      if (length < word.length) best = Math.min(best, distance(token, word.slice(0, length), max));
    }
  }
  return best > max ? 0 : 0.6 - 0.12 * best;
}

function tokenScore(token: string, f: Field) {
  if (f.strict) return f.words.some((w) => w === token || (token.length >= 4 && w.startsWith(token))) ? 1 : 0;
  let best = 0;
  for (const word of f.words) {
    const s = wordScore(token, word);
    if (s > best) best = s;
    if (best === 1) break;
  }
  // "zst1234" should find "ZST-1234", and "signin" should find "sign in".
  if (best < 0.8 && token.length >= 3 && f.compact.includes(token)) best = 0.8;
  return best;
}

export function search(index: Entry[], query: string): Hit[] {
  const norm = normalize(query);
  if (!norm) return [];
  const tokens = norm.split(" ");
  const compact = norm.replaceAll(" ", "");
  const hits: Hit[] = [];

  for (const entry of index) {
    let total = 0;
    let matched = true;
    let why: Hit["why"] = null;
    let whyScore = 0;
    let inTitle = false;
    for (const token of tokens) {
      let best = 0;
      let bestField: Field | null = null;
      for (const f of entry.fields) {
        const s = tokenScore(token, f) * f.weight;
        if (s > best) {
          best = s;
          bestField = f;
        }
      }
      if (best === 0 || !bestField) {
        matched = false;
        break;
      }
      total += best;
      if (bestField.label === null) inTitle = true;
      else if (best > whyScore) {
        whyScore = best;
        why = { label: bestField.label, text: bestField.text };
      }
    }
    if (!matched) continue;

    let score = total / tokens.length;
    // The words typed appear together, in order, in the name: the strongest signal there is.
    for (const f of entry.fields) {
      if (f.label !== null) continue;
      const joined = f.words.join(" ");
      if (joined === norm) score += 0.6;
      else if (joined.startsWith(norm)) score += 0.4;
      else if (` ${joined}`.includes(` ${norm}`) || f.compact === compact) score += 0.25;
    }
    hits.push({ ...entry, score, why: inTitle && tokens.length === 1 ? null : why });
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  // When something matches well, leave out the weak near misses that would only add noise.
  const top = hits[0]?.score ?? 0;
  return top >= 0.7 ? hits.filter((h) => h.score >= 0.4) : hits;
}

export const KIND_LABELS: Record<Kind, { one: string; many: string }> = {
  project: { one: "Project", many: "Projects" },
  ticket: { one: "Ticket", many: "Tickets" },
  task: { one: "Task", many: "Tasks" },
  person: { one: "Person", many: "People" },
  milestone: { one: "Milestone", many: "Milestones" },
  resource: { one: "Link", many: "Files, links & notes" },
};

// Hits grouped by kind, the group holding the best match first.
export function groupHits(hits: Hit[]) {
  const groups = new Map<Kind, Hit[]>();
  for (const h of hits) groups.set(h.kind, [...(groups.get(h.kind) ?? []), h]);
  return [...groups].map(([kind, list]) => ({ kind, hits: list }));
}

// True when every word typed matches somewhere in the given texts. For the small filter boxes on list pages.
export function matches(query: string, ...texts: (string | null | undefined)[]) {
  const norm = normalize(query);
  if (!norm) return true;
  const fs = fields(...texts.map((t) => field(null, t, 1)));
  return norm.split(" ").every((token) => fs.some((f) => tokenScore(token, f) > 0));
}
