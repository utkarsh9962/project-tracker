import { supabase } from "./supabase";
import { addDays, today } from "./format";
import { matches, type SearchData } from "./search";
import { PLATFORM_TAGS, ticketType, type Activity, type Assignment, type Attachment, type Milestone, type Person, type Priority, type Project, type Resource, type Task, type Team, type Ticket, type TicketAssignment } from "./types";

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

// Work counts as "gone quiet" after this many days without a change; a waiting ticket sooner.
export const QUIET_DAYS = 14;
export const WAITING_DAYS = 7;
export const daysSince = (timestamp: string) => Math.floor((Date.now() - Date.parse(timestamp)) / 86_400_000);
// Days a ticket has sat untouched, or 0 while that is still fine. Tickets nobody has started are left alone.
export function quietTicketDays(t: Pick<Ticket, "status" | "updated_at">) {
  const days = daysSince(t.updated_at);
  if (t.status === "waiting") return days >= WAITING_DAYS ? days : 0;
  return t.status === "in_progress" && days >= QUIET_DAYS ? days : 0;
}

// A project with tasks shows progress from them: a done task counts fully, an in-progress task counts half.
// Projects without tasks keep the percentage typed in by hand.
export function taskProgress(project: Pick<Project, "id" | "progress">, tasks: Pick<Task, "project_id" | "status">[]) {
  const mine = tasks.filter((t) => t.project_id === project.id);
  if (mine.length === 0) return project.progress;
  const score = mine.reduce((sum, t) => sum + (t.status === "done" ? 1 : t.status === "in_progress" ? 0.5 : 0), 0);
  return Math.round((score / mine.length) * 100);
}
// A project that reaches 100% counts as completed, whatever status it was left in.
export function withProgress<P extends Pick<Project, "id" | "progress" | "status">>(project: P, tasks: Pick<Task, "project_id" | "status">[]): P {
  const progress = taskProgress(project, tasks);
  return { ...project, progress, status: progress >= 100 ? "done" : project.status };
}
const withTaskProgress = (projects: Project[], tasks: Pick<Task, "project_id" | "status">[]) => projects.map((p) => withProgress(p, tasks));

// ---------- Reads ----------

// `keep` narrows everything to the projects picked in the page's filters (null = no project).
export async function getDashboard(keep: (projectId: number | null) => boolean = () => true) {
  const now = today();
  const soon = addDays(now, 7);
  const [allProjects, allTickets, allTasks, taskStates] = await Promise.all([
    run<Project[]>(supabase.from("projects").select("*").neq("status", "done")),
    run<WithProject<Ticket>[]>(supabase.from("tickets").select("*, project:projects(name)").not("status", "in", "(resolved,closed)")),
    run<WithProject<Task>[]>(supabase.from("tasks").select("*, project:projects(name)").neq("status", "done").not("due_date", "is", null).lte("due_date", soon)),
    run<Pick<Task, "project_id" | "status" | "updated_at">[]>(supabase.from("tasks").select("project_id, status, updated_at")),
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

  // Gone quiet: open projects where neither the project, its tasks nor its tickets changed for a while,
  // and tickets that are being worked on (or waiting) without any change.
  const latest = new Map<number, string>();
  const touch = (projectId: number | null, at: string) => {
    if (projectId != null && at > (latest.get(projectId) ?? "")) latest.set(projectId, at);
  };
  for (const t of taskStates) touch(t.project_id, t.updated_at);
  for (const t of allTickets) touch(t.project_id, t.updated_at);
  const quiet = [
    ...activeProjects
      .map((p) => ({ p, days: daysSince(latest.get(p.id) && latest.get(p.id)! > p.updated_at ? latest.get(p.id)! : p.updated_at) }))
      .filter(({ days }) => days >= QUIET_DAYS)
      .map(({ p, days }) => ({ kind: "Project" as const, id: p.id, title: p.name, context: p.client, href: `/projects/${p.id}`, days, waiting: false })),
    ...openTickets
      .map((t) => ({ t, days: quietTicketDays(t) }))
      .filter(({ days }) => days > 0)
      .map(({ t, days }) => ({ kind: "Ticket" as const, id: t.id, title: `${t.key} ${t.title}`, context: t.client, href: `/tickets/${t.id}`, days, waiting: t.status === "waiting" })),
  ].sort((a, b) => b.days - a.days);

  return {
    activeProjects,
    openTickets,
    deadlines,
    quiet,
    stats: {
      activeProjects: projects.filter((p) => p.status === "active").length,
      openTickets: openTickets.length,
      urgentTickets: openTickets.filter((t) => t.priority === "blocker" || t.priority === "critical" || t.priority === "high").length,
      overdue: deadlines.filter((d) => d.due < now).length,
      dueThisWeek: deadlines.filter((d) => d.due >= now).length,
    },
  };
}

type TaskKey = Pick<Task, "project_id" | "title" | "status" | "due_date">;

// The same task given to several people is stored once per person; show it once with everyone beside it.
export function groupTasks<T extends TaskKey>(tasks: T[]) {
  const groups = new Map<string, T[]>();
  for (const t of tasks) {
    const key = JSON.stringify([t.project_id, t.title.trim().toLowerCase(), t.status, t.due_date]);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.values()];
}

export async function listProjects() {
  const [projects, tasks, tickets, managers] = await Promise.all([
    run<Project[]>(supabase.from("projects").select("*")),
    run<TaskKey[]>(supabase.from("tasks").select("project_id, title, status, due_date")),
    run<Pick<Ticket, "project_id">[]>(supabase.from("tickets").select("project_id").not("status", "in", "(resolved,closed)")),
    run<{ project_id: number; person: Pick<Person, "id" | "name"> }[]>(
      supabase.from("project_people").select("project_id, person:people(id, name)").eq("role", PM_ROLE),
    ),
  ]);
  // Soonest target date first and undated last; completed projects go to the end.
  return projects
    .map((project) => withProgress(project, tasks))
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || byDue(a, b) || a.name.localeCompare(b.name))
    .map((project) => ({
      project,
      openTasks: groupTasks(tasks.filter((t) => t.project_id === project.id && t.status !== "done")).length,
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
  const [tasks, team, tickets, resources, milestones, attachments] = await Promise.all([
    run<(Task & { assignee: { name: string } | null })[]>(supabase.from("tasks").select("*, assignee:people(name)").eq("project_id", id).order("id")),
    run<{ role: string | null; person: Person }[]>(supabase.from("project_people").select("role, person:people(*)").eq("project_id", id)),
    run<Ticket[]>(supabase.from("tickets").select("*").eq("project_id", id).order("updated_at", { ascending: false })),
    run<Resource[]>(supabase.from("resources").select("*").eq("project_id", id).order("created_at", { ascending: false })),
    run<Milestone[]>(supabase.from("milestones").select("*").eq("project_id", id).order("id")),
    listAttachments("project_id", id),
  ]);
  return {
    project: withProgress(project, tasks),
    tasks: groupTasks(tasks.sort((a, b) => TASK_ORDER[a.status] - TASK_ORDER[b.status] || byDue(a, b))),
    team: team.filter((m) => m.role !== PM_ROLE).sort((a, b) => a.person.name.localeCompare(b.person.name)),
    managers: team.filter((m) => m.role === PM_ROLE).map((m) => m.person).sort((a, b) => a.name.localeCompare(b.name)),
    tickets: tickets.sort(byPriority),
    resources,
    milestones: milestones.sort(byMilestone),
    attachments,
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
  let query = supabase.from("tickets").select("*, project:projects(name), people(id, name)").order("updated_at", { ascending: false });
  if (filter.status === "active") query = query.not("status", "in", "(resolved,closed)");
  else if (filter.status !== "all") query = query.eq("status", filter.status);
  const rows = await run<(WithProject<Ticket> & { people: Pick<Person, "id" | "name">[] })[]>(query);
  return rows
    .filter((t) => matches(filter.q, t.key, t.title, t.client, t.project?.name, ...t.people.map((p) => p.name)))
    .sort(byPriority);
}

export async function getTicket(id: number) {
  const ticket = await run<WithProject<Ticket> | null>(supabase.from("tickets").select("*, project:projects(name)").eq("id", id).maybeSingle());
  if (!ticket) return null;
  const [resources, attachments, people] = await Promise.all([
    run<Resource[]>(supabase.from("resources").select("*").eq("ticket_id", id).order("created_at", { ascending: false })),
    listAttachments("ticket_id", id),
    run<{ person: Pick<Person, "id" | "name" | "role"> }[]>(supabase.from("ticket_people").select("person:people(id, name, role)").eq("ticket_id", id)),
  ]);
  return { ticket, resources, attachments, people: people.map((p) => p.person).sort((a, b) => a.name.localeCompare(b.name)) };
}

// The tickets a person works on, open ones first, most urgent first.
type AssignedTicket = Pick<Ticket, "id" | "key" | "title" | "status" | "priority" | "due_date" | "project_id" | "notes">;
const TICKET_FIELDS = "id, key, title, status, priority, due_date, project_id, notes";
const byTicketUrgency = (a: AssignedTicket, b: AssignedTicket) =>
  Number(!isOpenTicket(a)) - Number(!isOpenTicket(b)) || byPriority(a, b) || byDue(a, b) || a.key.localeCompare(b.key);

export async function listPeople() {
  const [people, assignments, ticketAssignments] = await Promise.all([
    run<Person[]>(supabase.from("people").select("*").order("name")),
    run<(Assignment & { project: Pick<Project, "id" | "name" | "status"> })[]>(supabase.from("project_people").select("*, project:projects(id, name, status)")),
    run<(TicketAssignment & { ticket: AssignedTicket })[]>(supabase.from("ticket_people").select(`*, ticket:tickets(${TICKET_FIELDS})`)),
  ]);
  return people.map((person) => ({
    person,
    projects: assignments.filter((a) => a.person_id === person.id).sort((a, b) => a.project.name.localeCompare(b.project.name)),
    tickets: ticketAssignments
      .filter((a) => a.person_id === person.id)
      .map((a) => a.ticket)
      .sort(byTicketUrgency),
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

// A person's page: every project they are on (or have tasks in), with their open tasks.
export async function getPersonProjects(id: number) {
  const person = await run<Person | null>(supabase.from("people").select("*").eq("id", id).maybeSingle());
  if (!person) return null;
  const [assignments, myTasks, myTickets] = await Promise.all([
    run<Assignment[]>(supabase.from("project_people").select("*").eq("person_id", id)),
    run<Task[]>(supabase.from("tasks").select("*").eq("assignee_id", id)),
    run<{ ticket: AssignedTicket & { client: string | null } }[]>(supabase.from("ticket_people").select(`ticket:tickets(${TICKET_FIELDS}, client)`).eq("person_id", id)),
  ]);
  const ids = [...new Set([...assignments.map((a) => a.project_id), ...myTasks.map((t) => t.project_id)])];
  const [projects, tasks] = ids.length
    ? await Promise.all([
        run<Project[]>(supabase.from("projects").select("*").in("id", ids)),
        run<Pick<Task, "project_id" | "status">[]>(supabase.from("tasks").select("project_id, status").in("project_id", ids)),
      ])
    : [[], []];
  return {
    person,
    tickets: myTickets.map((t) => t.ticket).sort(byTicketUrgency),
    projects: projects
      .map((p) => withProgress(p, tasks))
      .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || byDue(a, b) || a.name.localeCompare(b.name))
      .map((project) => ({
        project,
        role: assignments.find((a) => a.project_id === project.id)?.role ?? null,
        tasks: myTasks.filter((t) => t.project_id === project.id).sort((a, b) => TASK_ORDER[a.status] - TASK_ORDER[b.status] || byDue(a, b)),
      })),
  };
}

export const getPerson = (id: number) => run<Person | null>(supabase.from("people").select("*").eq("id", id).maybeSingle());
export const projectOptions = () => run<Pick<Project, "id" | "name">[]>(supabase.from("projects").select("id, name").order("name"));
export const managerOptions = () => run<Pick<Person, "id" | "name">[]>(supabase.from("people").select("id, name").eq("role", PM_ROLE).order("name"));
export const ticketOptions = () => run<AssignedTicket[]>(supabase.from("tickets").select(TICKET_FIELDS).not("status", "in", "(resolved,closed)").order("key", { ascending: false }));
export const peopleOptions = () => run<Pick<Person, "id" | "name">[]>(supabase.from("people").select("id, name").order("name"));

// Everything search looks through. The tracker stays small, so it is loaded once and searched in the browser (src/lib/search.ts).
export async function searchData(): Promise<SearchData> {
  const [projects, tasks, tickets, people, resources, milestones, projectPeople, ticketPeople] = await Promise.all([
    run<Project[]>(supabase.from("projects").select("*")),
    run<Task[]>(supabase.from("tasks").select("*")),
    run<Ticket[]>(supabase.from("tickets").select("*")),
    run<Person[]>(supabase.from("people").select("*")),
    run<Resource[]>(supabase.from("resources").select("*")),
    run<Milestone[]>(supabase.from("milestones").select("*")),
    run<Assignment[]>(supabase.from("project_people").select("*")),
    run<TicketAssignment[]>(supabase.from("ticket_people").select("*")),
  ]);
  return { projects: withTaskProgress(projects, tasks), tasks, tickets, people, resources, milestones, projectPeople, ticketPeople };
}

// ---------- Timeline, workload, history, screenshots ----------

// Every project with its milestones, for the Timeline page.
export async function getTimeline() {
  const [projects, tasks, milestones] = await Promise.all([
    run<Project[]>(supabase.from("projects").select("*")),
    run<Pick<Task, "project_id" | "status">[]>(supabase.from("tasks").select("project_id, status")),
    run<Milestone[]>(supabase.from("milestones").select("*")),
  ]);
  return withTaskProgress(projects, tasks).map((project) => ({ project, milestones: milestones.filter((m) => m.project_id === project.id) }));
}

// How much open work each person carries: open tasks and open tickets, with what is late or due this week.
// A non-ZST ticket whose Jira status (kept in its "Jira: Major, Ready for Testing" note by the importer) says it is
// waiting to be tested. The developer has handed it over, so it is QA's work, not theirs. ZST support tickets stay
// with whoever has them whatever their status.
const QA_STATUS = /\b(ready for testing|in testing|testing|qa|uat)\b/i;
export const isAwaitingQa = (t: Pick<Ticket, "key" | "status" | "notes">) =>
  isOpenTicket(t) && ticketType(t.key) !== "ZST" && /^jira:/i.test(t.notes ?? "") && QA_STATUS.test((t.notes ?? "").replace(/^jira:/i, ""));
// QA people are the ones whose role says so: "QA", "QA Engineer", "Tester", "Testing"…
export const isQaPerson = (p: Pick<Person, "role">) => /\b(qa|tester|testing|quality)\b/i.test(p.role ?? "");
// Project managers are the people whose role is "Project manager" (or PM), the same role the PM filters use.
export const isPmPerson = (p: Pick<Person, "role">) => /\b(project manager|pm)\b/i.test(p.role ?? "");

type WorkloadTicket = Pick<Ticket, "id" | "key" | "title" | "status" | "notes" | "priority" | "due_date" | "project_id" | "updated_at">;
const WORKLOAD_TICKET = "id, key, title, status, notes, priority, due_date, project_id, updated_at";

export async function getWorkload() {
  const now = today();
  const soon = addDays(now, 7);
  const [people, tasks, ticketPeople, projectPeople, waiting] = await Promise.all([
    run<Person[]>(supabase.from("people").select("*").order("name")),
    run<Pick<Task, "assignee_id" | "due_date" | "project_id">[]>(supabase.from("tasks").select("assignee_id, due_date, project_id").neq("status", "done").not("assignee_id", "is", null)),
    run<{ person_id: number; ticket: WorkloadTicket }[]>(supabase.from("ticket_people").select(`person_id, ticket:tickets(${WORKLOAD_TICKET})`)),
    run<{ person_id: number; role: string | null; project: Pick<Project, "id" | "status"> }[]>(supabase.from("project_people").select("person_id, role, project:projects(id, status)")),
    run<WorkloadTicket[]>(supabase.from("tickets").select(WORKLOAD_TICKET).eq("status", "waiting")),
  ]);
  const developerOf = new Map<number, string[]>();
  for (const { person_id, ticket } of ticketPeople) {
    const name = people.find((p) => p.id === person_id)?.name;
    if (name) developerOf.set(ticket.id, [...(developerOf.get(ticket.id) ?? []), name]);
  }
  const rows = people.map((person) => {
    const myTasks = tasks.filter((t) => t.assignee_id === person.id);
    const open = ticketPeople.filter((t) => t.person_id === person.id && isOpenTicket(t.ticket)).map((t) => t.ticket);
    // Tickets in testing are shown but not counted against anyone: they sit in the QA queue, which isn't split per tester.
    const qa = isQaPerson(person);
    const pm = !qa && isPmPerson(person);
    const myTickets = open.filter((t) => !isAwaitingQa(t));
    const due = [...myTasks, ...myTickets].flatMap((x) => (x.due_date ? [x.due_date] : []));
    return {
      person,
      qa,
      pm,
      // Open projects this person is the PM of.
      managing: projectPeople.filter((a) => a.person_id === person.id && a.role === PM_ROLE && a.project.status !== "done").length,
      projectIds: [...new Set([...projectPeople.filter((a) => a.person_id === person.id && a.project.status !== "done").map((a) => a.project.id), ...myTasks.map((t) => t.project_id)])],
      tasks: myTasks.length,
      tickets: myTickets.length,
      inTesting: open.length - myTickets.length,
      load: myTasks.length + myTickets.length,
      overdue: due.filter((d) => d < now).length,
      dueSoon: due.filter((d) => d >= now && d <= soon).length,
    };
  });
  // Everything waiting to be tested, oldest first: the queue the QA team works from.
  const queue = waiting
    .filter(isAwaitingQa)
    .map((t) => ({ ...t, type: ticketType(t.key), developers: developerOf.get(t.id) ?? [] }))
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  return { rows, queue };
}
export type WorkloadRow = Awaited<ReturnType<typeof getWorkload>>["rows"][number];
export type QaQueueTicket = Awaited<ReturnType<typeof getWorkload>>["queue"][number];

// History and screenshots arrive with a database update (supabase/migrations/20261116000000_history_and_screenshots.sql).
// Until it has been run these return null, and the pages say so instead of failing.
const notSetUp = (message: string) => /does not exist|could not find|schema cache|bucket not found/i.test(message);

export async function listActivity(filter: { projectId?: number; ticketId?: number; limit?: number } = {}): Promise<Activity[] | null> {
  let query = supabase.from("activity").select("*").order("at", { ascending: false }).order("id", { ascending: false }).limit(filter.limit ?? 30);
  if (filter.projectId != null) query = query.eq("project_id", filter.projectId);
  if (filter.ticketId != null) query = query.eq("ticket_id", filter.ticketId);
  const { data, error } = await query;
  if (error && notSetUp(error.message)) return null;
  if (error) throw new Error(error.message);
  return data as Activity[];
}

// Names and emails, to show who made a change and who a task was given to.
export const peopleDirectory = () => run<Pick<Person, "id" | "name" | "email">[]>(supabase.from("people").select("id, name, email"));

const BUCKET = "screenshots";

async function listAttachments(column: "project_id" | "ticket_id", id: number): Promise<Attachment[] | null> {
  const { data, error } = await supabase.from("attachments").select("*").eq(column, id).order("created_at", { ascending: false });
  if (error && notSetUp(error.message)) return null;
  if (error) throw new Error(error.message);
  const rows = data as Omit<Attachment, "url">[];
  if (rows.length === 0) return [];
  // The bucket is private, so each image is shown through a link that works for an hour.
  const signed = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), 3600);
  const urls = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({ ...r, url: urls.get(r.path) ?? null }));
}

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function addScreenshot(target: Pick<Attachment, "project_id" | "task_id" | "ticket_id">, file: File, caption: string | null) {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error("Only images can be added here (PNG, JPG, WebP or GIF).");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("That image is over 5 MB. Crop it or save it smaller, then try again.");
  const path = `${crypto.randomUUID()}.${ext}`;
  const uploaded = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (uploaded.error) throw new Error(notSetUp(uploaded.error.message) ? "Screenshots aren’t set up yet. Run the latest database update in Supabase first." : uploaded.error.message);
  try {
    await run(supabase.from("attachments").insert({ ...target, path, name: file.name || `screenshot.${ext}`, caption }));
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw err;
  }
}
export const updateScreenshot = (id: number, caption: string | null) => run(supabase.from("attachments").update({ caption }).eq("id", id));
export async function deleteScreenshot(a: Pick<Attachment, "id" | "path">) {
  await run(supabase.from("attachments").delete().eq("id", a.id));
  await supabase.storage.from(BUCKET).remove([a.path]);
}
// Before task rows are removed, their screenshots move to a row that stays (see TaskRow). Quietly does nothing before set-up.
export async function moveScreenshots(fromTaskIds: number[], toTaskId: number) {
  if (fromTaskIds.length) await supabase.from("attachments").update({ task_id: toTaskId }).in("task_id", fromTaskIds);
}

// Teams arrive with a database update (supabase/migrations/20261125000000_teams.sql). Until it has been run
// this returns null and People/Workload show everyone in one list, as before.
export async function listTeams(): Promise<Team[] | null> {
  const { data, error } = await supabase.from("teams").select("id, name, position").order("position").order("name");
  if (error) {
    if (notSetUp(error.message)) return null;
    throw new Error(error.message);
  }
  return data as Team[];
}

export const UNASSIGNED = "none";
// Splits rows into one group per team, in the teams' order, with people in no team (or a deleted one) last as "Unassigned".
// Empty teams are kept only when asked, so a new team can be filled from the People page.
export function groupByTeam<R extends { person: Pick<Person, "team_id"> }>(teams: Team[], rows: R[], keepEmpty = false) {
  const known = new Set(teams.map((t) => t.id));
  const groups: { team: Team | null; rows: R[] }[] = teams.map((team) => ({ team, rows: rows.filter((r) => r.person.team_id === team.id) }));
  groups.push({ team: null, rows: rows.filter((r) => r.person.team_id == null || !known.has(r.person.team_id)) });
  return groups.filter((g) => g.rows.length > 0 || (keepEmpty && g.team));
}
// The "Team" filter: a team's id, "none" for Unassigned, or "" for everyone.
export function inTeam(teams: Team[], person: Pick<Person, "team_id">, value: string) {
  if (!value) return true;
  const id = person.team_id;
  if (value === UNASSIGNED) return id == null || !teams.some((t) => t.id === id);
  return id === Number(value);
}

// ---------- Writes ----------

export type ProjectInput = Omit<Project, "id" | "tags" | "created_at" | "updated_at">;
export type TicketInput = Omit<Ticket, "id" | "updated_at">;
export type PersonInput = Omit<Person, "id" | "jira_filter" | "team_id"> & { jira_filter?: string | null; team_id?: number | null };
export type ResourceInput = Omit<Resource, "id" | "created_at">;

export const createProject = (v: ProjectInput) => run<{ id: number }>(supabase.from("projects").insert(v).select("id").single());
export const updateProject = (id: number, v: Partial<Omit<Project, "id">>) =>
  run(supabase.from("projects").update(v.progress != null && v.progress >= 100 ? { ...v, status: "done" } : v).eq("id", id));
export const deleteProject = (id: number) => withImageCleanup("project_id", [id], () => run(supabase.from("projects").delete().eq("id", id)));

// Deleting a project, task or ticket also deletes its screenshots' rows; this removes the image files as well.
async function withImageCleanup<T>(column: "project_id" | "task_id" | "ticket_id", ids: number[], remove: () => Promise<T>): Promise<T> {
  const { data } = await supabase.from("attachments").select("path").in(column, ids);
  const result = await remove();
  const paths = ((data ?? []) as { path: string }[]).map((a) => a.path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  return result;
}

// Keeps a project's saved status in step with its progress: 100% completes it, dropping below reopens it.
async function syncStatus(projectId: number) {
  const [project, tasks] = await Promise.all([
    run<Pick<Project, "id" | "progress" | "status">>(supabase.from("projects").select("id, progress, status").eq("id", projectId).single()),
    run<Pick<Task, "project_id" | "status">[]>(supabase.from("tasks").select("project_id, status").eq("project_id", projectId)),
  ]);
  const progress = taskProgress(project, tasks);
  const status = progress >= 100 ? "done" : project.status === "done" ? "active" : project.status;
  if (status !== project.status) await run(supabase.from("projects").update({ status }).eq("id", projectId));
}

export async function createTasks(v: (Omit<Task, "id" | "status" | "updated_at"> & Partial<Pick<Task, "status">>)[]) {
  if (v.length === 0) return;
  await run(supabase.from("tasks").insert(v));
  await syncStatus(v[0].project_id);
}
export async function updateTasks(ids: number[], v: Partial<Task>) {
  const rows = await run<Pick<Task, "project_id">[]>(supabase.from("tasks").update(v).in("id", ids).select("project_id"));
  if (rows[0]) await syncStatus(rows[0].project_id);
}
export async function deleteTasks(ids: number[]) {
  const rows = await withImageCleanup("task_id", ids, () => run<Pick<Task, "project_id">[]>(supabase.from("tasks").delete().in("id", ids).select("project_id")));
  if (rows[0]) await syncStatus(rows[0].project_id);
}
export async function setProgress(projectId: number, progress: number) {
  await run(supabase.from("projects").update({ progress }).eq("id", projectId));
  await syncStatus(projectId);
}

export const assignPerson = (v: Assignment) => run(supabase.from("project_people").upsert(v));
export const unassignPerson = (projectId: number, personId: number) =>
  run(supabase.from("project_people").delete().eq("project_id", projectId).eq("person_id", personId));

export const assignTicket = (v: TicketAssignment) => run(supabase.from("ticket_people").upsert(v));
export const unassignTicket = (ticketId: number, personId: number) =>
  run(supabase.from("ticket_people").delete().eq("ticket_id", ticketId).eq("person_id", personId));

export const createTicket = (v: TicketInput) => run<{ id: number }>(supabase.from("tickets").insert(v).select("id").single());
export const updateTicket = (id: number, v: Partial<TicketInput>) => run(supabase.from("tickets").update(v).eq("id", id));
export const deleteTicket = (id: number) => withImageCleanup("ticket_id", [id], () => run(supabase.from("tickets").delete().eq("id", id)));
// Bulk edit: the same change on every ticket picked.
export const updateTickets = (ids: number[], v: Partial<TicketInput>) => run(supabase.from("tickets").update(v).in("id", ids));
export const assignTickets = (ids: number[], personId: number) =>
  run(supabase.from("ticket_people").upsert(ids.map((ticket_id) => ({ ticket_id, person_id: personId })), { ignoreDuplicates: true }));

// New ticket made from a person's page: created and given to them in one go.
// If the key is already tracked, that ticket is given to them instead of making a duplicate.
export async function createTicketFor(personId: number, v: TicketInput) {
  const existing = await run<Pick<Ticket, "id">[]>(supabase.from("tickets").select("id").ilike("key", v.key).limit(1));
  const id = existing[0]?.id ?? (await createTicket(v)).id;
  await assignTicket({ ticket_id: id, person_id: personId });
  return { id, existed: Boolean(existing[0]) };
}

// Links a ticket to a project by key, creating it when the key is new.
export async function linkTicket(projectId: number, key: string, title: string) {
  const existing = await run<Pick<Ticket, "id">[]>(supabase.from("tickets").select("id").ilike("key", key).limit(1));
  if (existing[0]) return updateTicket(existing[0].id, { project_id: projectId, ...(title ? { title } : {}) });
  if (!title) throw new Error(`There is no ${key} yet. Add a summary to create it.`);
  return createTicket({ key, title, client: null, project_id: projectId, priority: "medium", status: "open", url: null, due_date: null, notes: null });
}

export const createPerson = (v: PersonInput) => run<{ id: number }>(supabase.from("people").insert(v).select("id").single());
export const updatePerson = (id: number, v: PersonInput) => run(supabase.from("people").update(v).eq("id", id));
export const setJiraFilter = (id: number, url: string | null) => run(supabase.from("people").update({ jira_filter: url }).eq("id", id));
export const setPersonTeam = (id: number, teamId: number | null) => run(supabase.from("people").update({ team_id: teamId }).eq("id", id));
export const setPeopleTeam = (ids: number[], teamId: number | null) => run(supabase.from("people").update({ team_id: teamId }).in("id", ids));
export const createTeam = (name: string) => run(supabase.from("teams").insert({ name, position: Math.floor(Date.now() / 1000) }));
export const renameTeam = (id: number, name: string) => run(supabase.from("teams").update({ name }).eq("id", id));
// The team's people stay, without a team (the database sets their team to empty).
export const deleteTeam = (id: number) => run(supabase.from("teams").delete().eq("id", id));
export const deletePerson = (id: number) => run(supabase.from("people").delete().eq("id", id));

export const addResource = (v: ResourceInput) => run(supabase.from("resources").insert(v));
export const deleteResource = (id: number) => run(supabase.from("resources").delete().eq("id", id));

export type MilestoneInput = Pick<Milestone, "project_id" | "title" | "due_date">;
export const createMilestone = (v: MilestoneInput) => run(supabase.from("milestones").insert(v));
export const updateMilestone = (id: number, v: Partial<Omit<Milestone, "id">>) => run(supabase.from("milestones").update(v).eq("id", id));
export const deleteMilestone = (id: number) => run(supabase.from("milestones").delete().eq("id", id));
