// The AI assistant: sends the conversation plus a summary of the tracker to the language model
// (through the "assistant" Supabase function, which holds the API key), and turns its answer into
// suggested changes. Nothing is written until the person ticks the changes and presses Apply.
import { supabase } from "./supabase";
import { today } from "./format";
import {
  addResource,
  assignPerson,
  assignTicket,
  createMilestone,
  createTasks,
  createTicket,
  isOpenTicket,
  updateMilestone,
  updateProject,
  updateTasks,
  updateTicket,
} from "./api";
import { PRIORITIES, PROJECT_STATUSES, TASK_STATUSES, TICKET_STATUSES, type Milestone, type Person, type Priority, type Project, type Task, type Ticket, type TicketStatus } from "./types";

// ---------- What the assistant knows about ----------

export type Context = {
  projects: Pick<Project, "id" | "name" | "client" | "status" | "due_date">[];
  people: Pick<Person, "id" | "name" | "role">[];
  tickets: Pick<Ticket, "id" | "key" | "title" | "client" | "project_id" | "priority" | "status" | "due_date">[];
  ticketPeople: { ticket_id: number; person_id: number }[];
  tasks: Pick<Task, "id" | "project_id" | "title" | "status" | "due_date" | "assignee_id">[];
  milestones: Pick<Milestone, "id" | "project_id" | "title" | "due_date" | "done">[];
};

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T[];
}

export async function loadContext(): Promise<Context> {
  const [projects, people, tickets, ticketPeople, tasks, milestones] = await Promise.all([
    rows<Context["projects"][number]>(supabase.from("projects").select("id, name, client, status, due_date").order("name")),
    rows<Context["people"][number]>(supabase.from("people").select("id, name, role").order("name")),
    rows<Context["tickets"][number]>(supabase.from("tickets").select("id, key, title, client, project_id, priority, status, due_date").order("key")),
    rows<Context["ticketPeople"][number]>(supabase.from("ticket_people").select("ticket_id, person_id")),
    rows<Context["tasks"][number]>(supabase.from("tasks").select("id, project_id, title, status, due_date, assignee_id").neq("status", "done")),
    rows<Context["milestones"][number]>(supabase.from("milestones").select("id, project_id, title, due_date, done").eq("done", false)),
  ]);
  return { projects, people, tickets, ticketPeople, tasks, milestones };
}

// Compact lines keep the prompt small: one record per line, fields separated by " | ".
function contextText(ctx: Context) {
  const name = new Map(ctx.people.map((p) => [p.id, p.name]));
  const people = (ticketId: number) => ctx.ticketPeople.filter((tp) => tp.ticket_id === ticketId).map((tp) => name.get(tp.person_id)).filter(Boolean).join(", ");
  // Closed tickets are listed by key only, so the assistant can still recognise them without the bulk.
  const open = ctx.tickets.filter(isOpenTicket);
  const closed = ctx.tickets.filter((t) => !isOpenTicket(t));
  return [
    "PEOPLE (id | name | role)",
    ...ctx.people.map((p) => `${p.id} | ${p.name} | ${p.role ?? ""}`),
    "",
    "PROJECTS (id | name | client | status | target date)",
    ...ctx.projects.map((p) => `${p.id} | ${p.name} | ${p.client ?? ""} | ${p.status} | ${p.due_date ?? ""}`),
    "",
    "OPEN TICKETS (id | key | title | client | project id | priority | status | due | people)",
    ...open.map((t) => `${t.id} | ${t.key} | ${t.title} | ${t.client ?? ""} | ${t.project_id ?? ""} | ${t.priority} | ${t.status} | ${t.due_date ?? ""} | ${people(t.id)}`),
    "",
    "RESOLVED OR CLOSED TICKETS (id:key)",
    closed.map((t) => `${t.id}:${t.key}`).join(", "),
    "",
    "OPEN TASKS (id | project id | title | status | due | assignee)",
    ...ctx.tasks.map((t) => `${t.id} | ${t.project_id} | ${t.title} | ${t.status} | ${t.due_date ?? ""} | ${t.assignee_id ? name.get(t.assignee_id) ?? "" : ""}`),
    "",
    "OPEN MILESTONES (id | project id | title | due)",
    ...ctx.milestones.map((m) => `${m.id} | ${m.project_id} | ${m.title} | ${m.due_date ?? ""}`),
  ].join("\n");
}

function systemPrompt(ctx: Context) {
  return `You are the assistant inside a personal project tracker used by a delivery manager at a software company.
Today is ${today()}. Answer in plain, friendly English.

The person may ask questions about their work, or paste chats, emails or notes (for example from Slack) and ask you to record what they contain.
Answer questions from the data below. When the text asks for things to be recorded or changed, propose changes. Never claim a change is done: the person reviews each change and applies the ones they want.

Reply with ONE JSON object and nothing else:
{"reply": "<your message to the person>", "actions": [<zero or more actions>]}

Allowed actions (use ids from the data; dates as YYYY-MM-DD; leave out fields you don't know):
{"type":"create_ticket","key":"ZST-123","title":"...","client":"...","project_id":1,"priority":"medium","status":"open","due_date":"...","notes":"...","person_ids":[1,2]}
{"type":"update_ticket","ticket_id":1,"title":"...","priority":"high","status":"in_progress","due_date":"...","project_id":1,"add_note":"text appended to the ticket's notes"}
{"type":"assign_ticket","ticket_id":1,"person_id":2}
{"type":"create_task","project_id":1,"title":"...","due_date":"...","assignee_id":2}
{"type":"update_task","task_id":1,"status":"done","due_date":"...","assignee_id":2}
{"type":"add_note","project_id":1,"ticket_id":null,"title":"short title","notes":"the note text"}
{"type":"create_milestone","project_id":1,"title":"...","due_date":"..."}
{"type":"complete_milestone","milestone_id":1}
{"type":"update_project","project_id":1,"status":"active","due_date":"..."}
{"type":"add_person_to_project","project_id":1,"person_id":2}

Values: priority is one of ${PRIORITIES.join(", ")}. Ticket status is one of ${TICKET_STATUSES.join(", ")}. Task status is one of ${TASK_STATUSES.join(", ")}. Project status is one of ${PROJECT_STATUSES.join(", ")}.
Rules:
- A ticket key looks like ZST-123, NET-45, WP-9, MOB-3, CCMS-7 or CMS-2. Only create a ticket when the text gives its key; if the key is missing, ask for it in "reply" instead.
- If a ticket with that key already exists, use update_ticket or assign_ticket rather than create_ticket.
- Match people and projects by name, allowing nicknames, first names and small spelling differences. If it is unclear who or which project is meant, ask instead of guessing.
- Keep "reply" short. When you propose actions, say in one or two sentences what you found.

THE TRACKER'S DATA
${contextText(ctx)}`;
}

// ---------- Talking to the model ----------

export type ChatMessage = { role: "user" | "assistant"; content: string; actions?: Action[]; applied?: Record<number, "done" | string> };

export async function ask(history: ChatMessage[], ctx: Context) {
  const messages = [
    { role: "system" as const, content: systemPrompt(ctx) },
    // Earlier answers go back as the model wrote them, so it remembers what it already proposed.
    ...history.map((m) => ({ role: m.role, content: m.role === "assistant" ? JSON.stringify({ reply: m.content, actions: m.actions ?? [] }) : m.content })),
  ];
  const { data, error } = await supabase.functions.invoke<{ content?: string; error?: string }>("assistant", { body: { messages } });
  if (error) {
    // The function's own message (e.g. "not set up yet") is more useful than the generic one.
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? (/failed to send|fetch/i.test(error.message) ? "The assistant isn't reachable. Has the “assistant” function been added in Supabase?" : error.message));
  }
  if (!data?.content) throw new Error(data?.error ?? "The assistant sent back an empty answer.");
  return parseAnswer(data.content, ctx);
}

// Models sometimes wrap the JSON in a code block or add a sentence around it; find the object either way.
export function parseAnswer(content: string, ctx: Context): { reply: string; actions: Action[] } {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(content.slice(start, end + 1)) as { reply?: unknown; actions?: unknown };
      const actions = Array.isArray(parsed.actions) ? parsed.actions.map((a) => clean(a, ctx)).filter((a): a is Action => a !== null) : [];
      return { reply: typeof parsed.reply === "string" ? parsed.reply : "", actions };
    } catch {
      // fall through: treat it as plain text
    }
  }
  return { reply: content.trim(), actions: [] };
}

// ---------- Suggested changes ----------

export type Action =
  | { type: "create_ticket"; key: string; title: string; client?: string | null; project_id?: number | null; priority?: Priority; status?: TicketStatus; due_date?: string | null; notes?: string | null; person_ids?: number[] }
  | { type: "update_ticket"; ticket_id: number; title?: string; priority?: Priority; status?: TicketStatus; due_date?: string | null; project_id?: number | null; add_note?: string }
  | { type: "assign_ticket"; ticket_id: number; person_id: number }
  | { type: "create_task"; project_id: number; title: string; due_date?: string | null; assignee_id?: number | null }
  | { type: "update_task"; task_id: number; status?: Task["status"]; due_date?: string | null; assignee_id?: number | null }
  | { type: "add_note"; project_id?: number | null; ticket_id?: number | null; title: string; notes: string }
  | { type: "create_milestone"; project_id: number; title: string; due_date?: string | null }
  | { type: "complete_milestone"; milestone_id: number }
  | { type: "update_project"; project_id: number; status?: Project["status"]; due_date?: string | null }
  | { type: "add_person_to_project"; project_id: number; person_id: number };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const oneOf = <T extends string>(list: readonly T[], v: unknown) => (list as readonly unknown[]).includes(v) ? (v as T) : undefined;
const pick = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// Keeps only actions that point at things that really exist, with valid values. Anything else is dropped.
function clean(raw: unknown, ctx: Context): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const has = (list: { id: number }[], id: unknown) => typeof id === "number" && list.some((x) => x.id === id);
  const project = (id: unknown) => (has(ctx.projects, id) ? (id as number) : undefined);
  const person = (id: unknown) => (has(ctx.people, id) ? (id as number) : undefined);
  const due = isDate(a.due_date) ? a.due_date : undefined;
  switch (a.type) {
    case "create_ticket": {
      const key = str(a.key)?.toUpperCase();
      const title = str(a.title);
      if (!key || !/^[A-Z]+-\d+$/.test(key) || !title) return null;
      const existing = ctx.tickets.find((t) => t.key.toUpperCase() === key);
      const personIds = Array.isArray(a.person_ids) ? a.person_ids.map(person).filter((id): id is number => id !== undefined) : [];
      // Already tracked: give it to the people named instead of making a duplicate.
      if (existing) return personIds[0] !== undefined ? { type: "assign_ticket", ticket_id: existing.id, person_id: personIds[0] } : null;
      return pick({ type: "create_ticket" as const, key, title, client: str(a.client), project_id: project(a.project_id), priority: oneOf(PRIORITIES, a.priority), status: oneOf(TICKET_STATUSES, a.status), due_date: due, notes: str(a.notes), person_ids: personIds });
    }
    case "update_ticket":
      if (!has(ctx.tickets, a.ticket_id)) return null;
      return pick({ type: "update_ticket" as const, ticket_id: a.ticket_id as number, title: str(a.title), priority: oneOf(PRIORITIES, a.priority), status: oneOf(TICKET_STATUSES, a.status), due_date: due, project_id: project(a.project_id), add_note: str(a.add_note) });
    case "assign_ticket":
      return has(ctx.tickets, a.ticket_id) && person(a.person_id) !== undefined ? { type: "assign_ticket", ticket_id: a.ticket_id as number, person_id: a.person_id as number } : null;
    case "create_task": {
      const title = str(a.title);
      return project(a.project_id) !== undefined && title ? pick({ type: "create_task" as const, project_id: a.project_id as number, title, due_date: due, assignee_id: person(a.assignee_id) }) : null;
    }
    case "update_task":
      return has(ctx.tasks, a.task_id) ? pick({ type: "update_task" as const, task_id: a.task_id as number, status: oneOf(TASK_STATUSES, a.status), due_date: due, assignee_id: person(a.assignee_id) }) : null;
    case "add_note": {
      const notes = str(a.notes);
      const projectId = project(a.project_id);
      const ticketId = has(ctx.tickets, a.ticket_id) ? (a.ticket_id as number) : undefined;
      if (!notes || (projectId === undefined && ticketId === undefined)) return null;
      return pick({ type: "add_note" as const, project_id: projectId ?? null, ticket_id: ticketId ?? null, title: str(a.title) ?? "Note", notes });
    }
    case "create_milestone": {
      const title = str(a.title);
      return project(a.project_id) !== undefined && title ? pick({ type: "create_milestone" as const, project_id: a.project_id as number, title, due_date: due }) : null;
    }
    case "complete_milestone":
      return has(ctx.milestones, a.milestone_id) ? { type: "complete_milestone", milestone_id: a.milestone_id as number } : null;
    case "update_project":
      return project(a.project_id) !== undefined ? pick({ type: "update_project" as const, project_id: a.project_id as number, status: oneOf(PROJECT_STATUSES, a.status), due_date: due }) : null;
    case "add_person_to_project":
      return project(a.project_id) !== undefined && person(a.person_id) !== undefined ? { type: "add_person_to_project", project_id: a.project_id as number, person_id: a.person_id as number } : null;
    default:
      return null;
  }
}

// A one-line description of a change, with names instead of ids, plus a link to what it touches.
export function describe(a: Action, ctx: Context): { title: string; details: string[]; href?: string } {
  const person = (id?: number | null) => ctx.people.find((p) => p.id === id)?.name ?? "someone";
  const project = (id?: number | null) => ctx.projects.find((p) => p.id === id)?.name ?? "a project";
  const ticket = (id: number) => ctx.tickets.find((t) => t.id === id);
  const label = (id: number) => {
    const t = ticket(id);
    return t ? `${t.key} ${t.title}` : "a ticket";
  };
  const human = (s: string) => s.replace(/_/g, " ");
  const due = (d?: string | null) => (d ? [`Due ${d}`] : []);
  switch (a.type) {
    case "create_ticket":
      return {
        title: `New ticket ${a.key}: ${a.title}`,
        details: [
          ...(a.person_ids?.length ? [`For ${a.person_ids.map(person).join(", ")}`] : []),
          ...(a.project_id ? [`Project: ${project(a.project_id)}`] : []),
          ...(a.client ? [`Client: ${a.client}`] : []),
          `Priority: ${a.priority ?? "medium"}`,
          ...due(a.due_date),
          ...(a.notes ? [`Notes: ${a.notes}`] : []),
        ],
      };
    case "update_ticket":
      return {
        title: `Update ${label(a.ticket_id)}`,
        href: `/tickets/${a.ticket_id}`,
        details: [
          ...(a.title ? [`Title: ${a.title}`] : []),
          ...(a.status ? [`Status: ${human(a.status)}`] : []),
          ...(a.priority ? [`Priority: ${a.priority}`] : []),
          ...due(a.due_date),
          ...(a.project_id ? [`Project: ${project(a.project_id)}`] : []),
          ...(a.add_note ? [`Add note: ${a.add_note}`] : []),
        ],
      };
    case "assign_ticket":
      return { title: `Give ${label(a.ticket_id)} to ${person(a.person_id)}`, href: `/tickets/${a.ticket_id}`, details: [] };
    case "create_task":
      return { title: `New task in ${project(a.project_id)}: ${a.title}`, href: `/projects/${a.project_id}`, details: [...(a.assignee_id ? [`For ${person(a.assignee_id)}`] : []), ...due(a.due_date)] };
    case "update_task": {
      const t = ctx.tasks.find((x) => x.id === a.task_id);
      return {
        title: `Update task: ${t?.title ?? "a task"}`,
        href: t ? `/projects/${t.project_id}` : undefined,
        details: [...(a.status ? [`Status: ${human(a.status)}`] : []), ...due(a.due_date), ...(a.assignee_id ? [`For ${person(a.assignee_id)}`] : [])],
      };
    }
    case "add_note":
      return {
        title: `Add note “${a.title}” to ${a.ticket_id ? label(a.ticket_id) : project(a.project_id)}`,
        href: a.ticket_id ? `/tickets/${a.ticket_id}` : `/projects/${a.project_id}`,
        details: [a.notes],
      };
    case "create_milestone":
      return { title: `New milestone in ${project(a.project_id)}: ${a.title}`, href: `/projects/${a.project_id}`, details: due(a.due_date) };
    case "complete_milestone": {
      const m = ctx.milestones.find((x) => x.id === a.milestone_id);
      return { title: `Mark milestone done: ${m?.title ?? "a milestone"}`, href: m ? `/projects/${m.project_id}` : undefined, details: [] };
    }
    case "update_project":
      return {
        title: `Update project ${project(a.project_id)}`,
        href: `/projects/${a.project_id}`,
        details: [...(a.status ? [`Status: ${human(a.status)}`] : []), ...(a.due_date ? [`Target date: ${a.due_date}`] : [])],
      };
    case "add_person_to_project":
      return { title: `Add ${person(a.person_id)} to ${project(a.project_id)}`, href: `/projects/${a.project_id}`, details: [] };
  }
}

// Writes one change. Returns a link to what was created or changed, when there is one.
export async function apply(a: Action): Promise<string | undefined> {
  switch (a.type) {
    case "create_ticket": {
      const { id } = await createTicket({
        key: a.key,
        title: a.title,
        client: a.client ?? null,
        project_id: a.project_id ?? null,
        priority: a.priority ?? "medium",
        status: a.status ?? "open",
        url: null,
        due_date: a.due_date ?? null,
        notes: a.notes ?? null,
      });
      for (const person_id of a.person_ids ?? []) await assignTicket({ ticket_id: id, person_id });
      return `/tickets/${id}`;
    }
    case "update_ticket": {
      const { ticket_id, add_note, type: _type, ...fields } = a;
      if (add_note) {
        const { data } = await supabase.from("tickets").select("notes").eq("id", ticket_id).single();
        const before = (data as { notes: string | null } | null)?.notes;
        Object.assign(fields, { notes: before ? `${before}\n\n${today()}: ${add_note}` : `${today()}: ${add_note}` });
      }
      await updateTicket(ticket_id, fields);
      return `/tickets/${ticket_id}`;
    }
    case "assign_ticket":
      await assignTicket({ ticket_id: a.ticket_id, person_id: a.person_id });
      return `/tickets/${a.ticket_id}`;
    case "create_task":
      await createTasks([{ project_id: a.project_id, title: a.title, due_date: a.due_date ?? null, assignee_id: a.assignee_id ?? null }]);
      return `/projects/${a.project_id}`;
    case "update_task": {
      const { task_id, type: _type, ...fields } = a;
      await updateTasks([task_id], fields);
      return undefined;
    }
    case "add_note":
      await addResource({ project_id: a.project_id ?? null, ticket_id: a.ticket_id ?? null, title: a.title, kind: "note", url: null, notes: a.notes });
      return a.ticket_id ? `/tickets/${a.ticket_id}` : `/projects/${a.project_id}`;
    case "create_milestone":
      await createMilestone({ project_id: a.project_id, title: a.title, due_date: a.due_date ?? null });
      return `/projects/${a.project_id}`;
    case "complete_milestone":
      await updateMilestone(a.milestone_id, { done: true });
      return undefined;
    case "update_project": {
      const { project_id, type: _type, ...fields } = a;
      await updateProject(project_id, fields);
      return `/projects/${project_id}`;
    }
    case "add_person_to_project":
      await assignPerson({ project_id: a.project_id, person_id: a.person_id, role: null });
      return `/projects/${a.project_id}`;
  }
}
