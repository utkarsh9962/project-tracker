import { supabase } from "./supabase";
import { addDays, today } from "./format";
import { PLATFORM_TAGS, type Assignment, type Milestone, type Person, type Priority, type Project, type Resource, type Task, type Ticket } from "./types";

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

// A project with tasks shows progress from them: a done task counts fully, an in-progress task counts half.
// Projects without tasks keep the percentage typed in by hand.
export function taskProgress(project: Pick<Project, "id" | "progress">, tasks: Pick<Task, "project_id" | "status">[]) {
  const mine = tasks.filter((t) => t.project_id === project.id);
  if (mine.length === 0) return project.progress;
  const score = mine.reduce((sum, t) => sum + (t.status === "done" ? 1 : t.status === "in_progress" ? 0.5 : 0), 0);
  return Math.round((score / mine.length) * 100);
}
const withTaskProgress = (projects: Project[], tasks: Pick<Task, "project_id" | "status">[]) =>
  projects.map((p) => ({ ...p, progress: taskProgress(p, tasks) }));

// ---------- Reads ----------

// `keep` narrows everything to the projects picked in the page's filters (null = no project).
export async function getDashboard(keep: (projectId: number | null) => boolean = () => true) {
  const now = today();
  const soon = addDays(now, 7);
  const [allProjects, allTickets, allTasks, taskStates] = await Promise.all([
    run<Project[]>(supabase.from("projects").select("*").neq("status", "done")),
    run<WithProject<Ticket>[]>(supabase.from("tickets").select("*, project:projects(name)").not("status", "in", "(resolved,closed)")),
    run<WithProject<Task>[]>(supabase.from("tasks").select("*, project:projects(name)").neq("status", "done").not("due_date", "is", null).lte("due_date", soon)),
    run<Pick<Task, "project_id" | "status">[]>(supabase.from("tasks").select("project_id, status")),
  ]);
  const projects = withTaskProgress(allProjects.filter((p) => keep(p.id)), taskStates);
  const tickets = allTickets.filter((t) => keep(t.project_id));
  const tasks = allTasks.filter((t) => keep(t.project_id));

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

export async function listProjects() {
  const [projects, tasks, tickets, managers] = await Promise.all([
    run<Project[]>(supabase.from("projects").select("*")),
    run<Pick<Task, "project_id" | "status">[]>(supabase.from("tasks").select("project_id, status")),
    run<Pick<Ticket, "project_id">[]>(supabase.from("tickets").select("project_id").not("status", "in", "(resolved,closed)")),
    run<{ project_id: number; person: Pick<Person, "id" | "name"> }[]>(
      supabase.from("project_people").select("project_id, person:people(id, name)").eq("role", PM_ROLE),
    ),
  ]);
  return projects
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byDue(a, b))
    .map((project) => ({
      project: { ...project, progress: taskProgress(project, tasks) },
      openTasks: tasks.filter((t) => t.project_id === project.id && t.status !== "done").length,
      openTickets: tickets.filter((t) => t.project_id === project.id).length,
      managers: managers.filter((m) => m.project_id === project.id).map((m) => m.person),
    }));
}

const TASK_ORDER = { in_progress: 0, todo: 1, done: 2 } as const;

// Project managers are people whose role is this, assigned to projects with the same role.
export const PM_ROLE = "Project manager";

export async function getProject(id: number) {
  const project = await run<Project | null>(supabase.from("projects").select("*").eq("id", id).maybeSingle());
  if (!project) return null;
  const [tasks, team, tickets, resources, milestones] = await Promise.all([
    run<(Task & { assignee: { name: string } | null })[]>(supabase.from("tasks").select("*, assignee:people(name)").eq("project_id", id).order("id")),
    run<{ role: string | null; person: Person }[]>(supabase.from("project_people").select("role, person:people(*)").eq("project_id", id)),
    run<Ticket[]>(supabase.from("tickets").select("*").eq("project_id", id).order("updated_at", { ascending: false })),
    run<Resource[]>(supabase.from("resources").select("*").eq("project_id", id).order("created_at", { ascending: false })),
    run<Milestone[]>(supabase.from("milestones").select("*").eq("project_id", id).order("id")),
  ]);
  return {
    project: { ...project, progress: taskProgress(project, tasks) },
    tasks: tasks.sort((a, b) => TASK_ORDER[a.status] - TASK_ORDER[b.status] || byDue(a, b)),
    team: team.filter((m) => m.role !== PM_ROLE).sort((a, b) => a.person.name.localeCompare(b.person.name)),
    managers: team.filter((m) => m.role === PM_ROLE).map((m) => m.person).sort((a, b) => a.name.localeCompare(b.name)),
    tickets: tickets.sort(byPriority),
    resources,
    milestones: milestones.sort(byMilestone),
  };
}

// Open milestones first, then by date (undated last), then in the order they were added.
const byMilestone = (a: Milestone, b: Milestone) => Number(a.done) - Number(b.done) || byDue(a, b) || a.id - b.id;

// Every milestone grouped by project, for the Milestones page. Projects without milestones are left out.
export async function listMilestones() {
  const rows = await run<WithProject<Milestone>[]>(supabase.from("milestones").select("*, project:projects(name)"));
  const groups = new Map<number, { projectId: number; name: string; milestones: Milestone[] }>();
  for (const m of rows) {
    const g = groups.get(m.project_id) ?? { projectId: m.project_id, name: m.project?.name ?? "", milestones: [] };
    g.milestones.push(m);
    groups.set(m.project_id, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, milestones: g.milestones.sort(byMilestone) }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

// What every page's filters need: each project's status, platform tags and PMs.
export async function projectFacets() {
  const [projects, pms] = await Promise.all([
    run<Pick<Project, "id" | "name" | "status" | "tags">[]>(supabase.from("projects").select("id, name, status, tags").order("name")),
    run<{ project_id: number; person: Pick<Person, "id" | "name"> }[]>(supabase.from("project_people").select("project_id, person:people(id, name)").eq("role", PM_ROLE)),
  ]);
  const managers = new Map<number, string>();
  for (const m of pms) managers.set(m.person.id, m.person.name);
  const tags = new Set<string>(PLATFORM_TAGS);
  for (const p of projects) for (const t of p.tags ?? []) tags.add(t);
  return {
    projects: projects.map((p) => ({ ...p, tags: p.tags ?? [], pmIds: pms.filter((m) => m.project_id === p.id).map((m) => m.person.id) })),
    managers: [...managers].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
  };
}
export type ProjectFacets = Awaited<ReturnType<typeof projectFacets>>;

export const getPerson = (id: number) => run<Person | null>(supabase.from("people").select("*").eq("id", id).maybeSingle());
export const projectOptions = () => run<Pick<Project, "id" | "name">[]>(supabase.from("projects").select("id, name").order("name"));
export const managerOptions = () => run<Pick<Person, "id" | "name">[]>(supabase.from("people").select("id, name").eq("role", PM_ROLE).order("name"));
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

export type ProjectInput = Omit<Project, "id" | "tags">;
export type TicketInput = Omit<Ticket, "id" | "updated_at">;
export type PersonInput = Omit<Person, "id">;
export type ResourceInput = Omit<Resource, "id" | "created_at">;

export const createProject = (v: ProjectInput) => run<{ id: number }>(supabase.from("projects").insert(v).select("id").single());
export const updateProject = (id: number, v: Partial<Omit<Project, "id">>) => run(supabase.from("projects").update(v).eq("id", id));
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

export const createPerson = (v: PersonInput) => run<{ id: number }>(supabase.from("people").insert(v).select("id").single());
export const updatePerson = (id: number, v: PersonInput) => run(supabase.from("people").update(v).eq("id", id));
export const deletePerson = (id: number) => run(supabase.from("people").delete().eq("id", id));

export const addResource = (v: ResourceInput) => run(supabase.from("resources").insert(v));
export const deleteResource = (id: number) => run(supabase.from("resources").delete().eq("id", id));

export type MilestoneInput = Pick<Milestone, "project_id" | "title" | "due_date">;
export const createMilestone = (v: MilestoneInput) => run(supabase.from("milestones").insert(v));
export const updateMilestone = (id: number, v: Partial<Omit<Milestone, "id">>) => run(supabase.from("milestones").update(v).eq("id", id));
export const deleteMilestone = (id: number) => run(supabase.from("milestones").delete().eq("id", id));
