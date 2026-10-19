import { supabase } from "./supabase";
import { addDays, today } from "./format";
import type { Assignment, Person, Priority, Project, Resource, Task, Ticket } from "./types";

// Supabase returns { data, error }; unwrap so callers (and React Query) see thrown errors.
// Row types come from src/lib/types.ts rather than generated database types, hence the cast.
async function run<T = unknown>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

const RANK: Record<Priority, number> = { blocker: 0, critical: 1, high: 2, medium: 3, low: 4 };
const byPriority = (a: { priority: Priority }, b: { priority: Priority }) => RANK[a.priority] - RANK[b.priority];
const byDue = (a: { due_date: string | null }, b: { due_date: string | null }) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");
export const isOpenTicket = (t: Pick<Ticket, "status">) => t.status !== "resolved" && t.status !== "closed";

type WithProject<T> = T & { project: { name: string } | null };

// ---------- Reads ----------

export async function getDashboard() {
  const now = today();
  const soon = addDays(now, 7);
  const [projects, tickets, tasks] = await Promise.all([
    run<Project[]>(supabase.from("projects").select("*").neq("status", "done")),
    run<WithProject<Ticket>[]>(supabase.from("tickets").select("*, project:projects(name)").not("status", "in", "(resolved,closed)")),
    run<WithProject<Task>[]>(supabase.from("tasks").select("*, project:projects(name)").neq("status", "done").not("due_date", "is", null).lte("due_date", soon)),
  ]);

  const activeProjects = projects.filter((p) => p.status === "active" || p.status === "planning").sort((a, b) => byDue(a, b) || byPriority(a, b));
  const openTickets = [...tickets].sort((a, b) => byPriority(a, b) || byDue(a, b) || b.updated_at.localeCompare(a.updated_at));
  const deadlines = [
    ...projects.filter((p) => p.due_date && p.due_date <= soon).map((p) => ({ kind: "Project" as const, id: p.id, title: p.name, due: p.due_date!, href: `/projects/${p.id}`, context: p.client })),
    ...tasks.map((t) => ({ kind: "Task" as const, id: t.id, title: t.title, due: t.due_date!, href: `/projects/${t.project_id}`, context: t.project?.name ?? null })),
    ...openTickets.filter((t) => t.due_date && t.due_date <= soon).map((t) => ({ kind: "Ticket" as const, id: t.id, title: `${t.key} ${t.title}`, due: t.due_date!, href: `/tickets/${t.id}`, context: t.client })),
  ].sort((a, b) => a.due.localeCompare(b.due));

  return {
    activeProjects,
    openTickets,
    deadlines,
    stats: {
      activeProjects: projects.filter((p) => p.status === "active").length,
      openTickets: openTickets.length,
      urgentTickets: openTickets.filter((t) => t.priority === "blocker" || t.priority === "critical" || t.priority === "high").length,
      overdue: deadlines.filter((d) => d.due < now).length,
      dueThisWeek: deadlines.filter((d) => d.due >= now).length,
    },
  };
}

const STATUS_ORDER = { active: 0, planning: 1, on_hold: 2, done: 3 } as const;

export async function listProjects(status: string) {
  let q = supabase.from("projects").select("*");
  if (status !== "all") q = q.eq("status", status);
  const [projects, tasks, tickets] = await Promise.all([
    run<Project[]>(q),
    run<Pick<Task, "project_id">[]>(supabase.from("tasks").select("project_id").neq("status", "done")),
    run<Pick<Ticket, "project_id">[]>(supabase.from("tickets").select("project_id").not("status", "in", "(resolved,closed)")),
  ]);
  return projects
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byDue(a, b))
    .map((project) => ({
      project,
      openTasks: tasks.filter((t) => t.project_id === project.id).length,
      openTickets: tickets.filter((t) => t.project_id === project.id).length,
    }));
}

const TASK_ORDER = { in_progress: 0, todo: 1, done: 2 } as const;

export async function getProject(id: number) {
  const project = await run<Project | null>(supabase.from("projects").select("*").eq("id", id).maybeSingle());
  if (!project) return null;
  const [tasks, team, tickets, resources] = await Promise.all([
    run<(Task & { assignee: { name: string } | null })[]>(supabase.from("tasks").select("*, assignee:people(name)").eq("project_id", id).order("id")),
    run<{ role: string | null; person: Person }[]>(supabase.from("project_people").select("role, person:people(*)").eq("project_id", id)),
    run<Ticket[]>(supabase.from("tickets").select("*").eq("project_id", id).order("updated_at", { ascending: false })),
    run<Resource[]>(supabase.from("resources").select("*").eq("project_id", id).order("created_at", { ascending: false })),
  ]);
  return {
    project,
    tasks: tasks.sort((a, b) => TASK_ORDER[a.status] - TASK_ORDER[b.status] || byDue(a, b)),
    team: team.sort((a, b) => a.person.name.localeCompare(b.person.name)),
    tickets: tickets.sort(byPriority),
    resources,
  };
}

export async function listTickets(filter: { status: string; q: string }) {
  let query = supabase.from("tickets").select("*, project:projects(name)").order("updated_at", { ascending: false });
  if (filter.status === "active") query = query.not("status", "in", "(resolved,closed)");
  else if (filter.status !== "all") query = query.eq("status", filter.status);
  const rows = await run<WithProject<Ticket>[]>(query);
  const q = filter.q.trim().toLowerCase();
  return rows
    .filter((t) => !q || [t.key, t.title, t.client].some((v) => v?.toLowerCase().includes(q)))
    .sort(byPriority);
}

export async function getTicket(id: number) {
  const ticket = await run<WithProject<Ticket> | null>(supabase.from("tickets").select("*, project:projects(name)").eq("id", id).maybeSingle());
  if (!ticket) return null;
  const resources = await run<Resource[]>(supabase.from("resources").select("*").eq("ticket_id", id).order("created_at", { ascending: false }));
  return { ticket, resources };
}

export async function listPeople() {
  const [people, assignments] = await Promise.all([
    run<Person[]>(supabase.from("people").select("*").order("name")),
    run<(Assignment & { project: Pick<Project, "id" | "name" | "status"> })[]>(supabase.from("project_people").select("*, project:projects(id, name, status)")),
  ]);
  return people.map((person) => ({
    person,
    projects: assignments.filter((a) => a.person_id === person.id).sort((a, b) => a.project.name.localeCompare(b.project.name)),
  }));
}

export const getPerson = (id: number) => run<Person | null>(supabase.from("people").select("*").eq("id", id).maybeSingle());
export const projectOptions = () => run<Pick<Project, "id" | "name">[]>(supabase.from("projects").select("id, name").order("name"));
export const peopleOptions = () => run<Pick<Person, "id" | "name">[]>(supabase.from("people").select("id, name").order("name"));

// A personal tracker stays small, so search filters everything client-side.
export async function search(q: string) {
  const needle = q.trim().toLowerCase();
  const has = (...values: (string | null)[]) => values.some((v) => v?.toLowerCase().includes(needle));
  const [projects, tasks, tickets, people, resources] = await Promise.all([
    run<Project[]>(supabase.from("projects").select("*")),
    run<Task[]>(supabase.from("tasks").select("*")),
    run<Ticket[]>(supabase.from("tickets").select("*")),
    run<Person[]>(supabase.from("people").select("*")),
    run<Resource[]>(supabase.from("resources").select("*")),
  ]);
  return {
    projects: projects.filter((p) => has(p.name, p.client, p.description)),
    tasks: tasks.filter((t) => has(t.title)),
    tickets: tickets.filter((t) => has(t.key, t.title, t.client, t.notes)),
    people: people.filter((p) => has(p.name, p.role, p.email)),
    resources: resources.filter((r) => has(r.title, r.url, r.notes)),
  };
}

// ---------- Writes ----------

export type ProjectInput = Omit<Project, "id">;
export type TicketInput = Omit<Ticket, "id" | "updated_at">;
export type PersonInput = Omit<Person, "id">;
export type ResourceInput = Omit<Resource, "id" | "created_at">;

export const createProject = (v: ProjectInput) => run<{ id: number }>(supabase.from("projects").insert(v).select("id").single());
export const updateProject = (id: number, v: Partial<ProjectInput>) => run(supabase.from("projects").update(v).eq("id", id));
export const deleteProject = (id: number) => run(supabase.from("projects").delete().eq("id", id));

export const createTask = (v: Omit<Task, "id" | "status">) => run(supabase.from("tasks").insert(v));
export const updateTask = (id: number, v: Partial<Task>) => run(supabase.from("tasks").update(v).eq("id", id));
export const deleteTask = (id: number) => run(supabase.from("tasks").delete().eq("id", id));

export const assignPerson = (v: Assignment) => run(supabase.from("project_people").upsert(v));
export const unassignPerson = (projectId: number, personId: number) =>
  run(supabase.from("project_people").delete().eq("project_id", projectId).eq("person_id", personId));

export const createTicket = (v: TicketInput) => run<{ id: number }>(supabase.from("tickets").insert(v).select("id").single());
export const updateTicket = (id: number, v: Partial<TicketInput>) => run(supabase.from("tickets").update(v).eq("id", id));
export const deleteTicket = (id: number) => run(supabase.from("tickets").delete().eq("id", id));

export const createPerson = (v: PersonInput) => run(supabase.from("people").insert(v));
export const updatePerson = (id: number, v: PersonInput) => run(supabase.from("people").update(v).eq("id", id));
export const deletePerson = (id: number) => run(supabase.from("people").delete().eq("id", id));

export const addResource = (v: ResourceInput) => run(supabase.from("resources").insert(v));
export const deleteResource = (id: number) => run(supabase.from("resources").delete().eq("id", id));
