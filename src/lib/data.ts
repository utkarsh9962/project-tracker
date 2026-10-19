import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNotNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb as connectDb, schema } from "@/db";
import { addDays, today } from "./format";

const { projects, tasks, tickets, people, projectPeople, resources } = schema;

// Reads always hit the database at request time; connection() keeps them out of the build-time prerender.
async function getDb() {
  await connection();
  return connectDb();
}

const OPEN_TICKET = notInArray(tickets.status, ["resolved", "closed"]);

// Most urgent first: critical > high > medium > low.
const priorityRank = (col: typeof tickets.priority | typeof projects.priority) =>
  sql`case ${col} when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;

export async function getDashboard() {
  const db = await getDb();
  const now = today();
  const soon = addDays(now, 7);

  const [activeProjects, openTickets, dueTasks, dueProjects] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(inArray(projects.status, ["active", "planning"]))
      .orderBy(sql`${projects.dueDate} asc nulls last`, priorityRank(projects.priority)),
    db
      .select({ ticket: tickets, projectName: projects.name })
      .from(tickets)
      .leftJoin(projects, eq(tickets.projectId, projects.id))
      .where(OPEN_TICKET)
      .orderBy(priorityRank(tickets.priority), sql`${tickets.dueDate} asc nulls last`, desc(tickets.updatedAt)),
    db
      .select({ task: tasks, projectName: projects.name })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(ne(tasks.status, "done"), isNotNull(tasks.dueDate), lte(tasks.dueDate, soon)))
      .orderBy(asc(tasks.dueDate)),
    db
      .select()
      .from(projects)
      .where(and(ne(projects.status, "done"), isNotNull(projects.dueDate), lte(projects.dueDate, soon)))
      .orderBy(asc(projects.dueDate)),
  ]);

  const dueTickets = openTickets.filter((t) => t.ticket.dueDate && t.ticket.dueDate <= soon);
  const deadlines = [
    ...dueProjects.map((p) => ({ kind: "Project" as const, id: p.id, title: p.name, due: p.dueDate!, href: `/projects/${p.id}`, context: p.client })),
    ...dueTasks.map((t) => ({ kind: "Task" as const, id: t.task.id, title: t.task.title, due: t.task.dueDate!, href: `/projects/${t.task.projectId}`, context: t.projectName })),
    ...dueTickets.map((t) => ({ kind: "Ticket" as const, id: t.ticket.id, title: `${t.ticket.key} ${t.ticket.title}`, due: t.ticket.dueDate!, href: `/tickets/${t.ticket.id}`, context: t.ticket.client })),
  ].sort((a, b) => a.due.localeCompare(b.due));

  return {
    activeProjects,
    openTickets,
    deadlines,
    stats: {
      activeProjects: activeProjects.filter((p) => p.status === "active").length,
      openTickets: openTickets.length,
      urgentTickets: openTickets.filter((t) => t.ticket.priority === "critical" || t.ticket.priority === "high").length,
      overdue: deadlines.filter((d) => d.due < now).length,
      dueThisWeek: deadlines.filter((d) => d.due >= now).length,
    },
  };
}

export async function listProjects(status?: string) {
  const db = await getDb();
  const rows = await db
    .select({
      project: projects,
      openTasks: sql<number>`(select count(*)::int from ${tasks} where ${tasks.projectId} = ${projects.id} and ${tasks.status} <> 'done')`,
      openTickets: sql<number>`(select count(*)::int from ${tickets} where ${tickets.projectId} = ${projects.id} and ${tickets.status} not in ('resolved','closed'))`,
    })
    .from(projects)
    .where(status && status !== "all" ? eq(projects.status, status as never) : undefined)
    .orderBy(sql`case ${projects.status} when 'active' then 0 when 'planning' then 1 when 'on_hold' then 2 else 3 end`, sql`${projects.dueDate} asc nulls last`);
  return rows;
}

export async function getProject(id: number) {
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return null;
  const [projectTasks, team, projectTickets, projectResources] = await Promise.all([
    db
      .select({ task: tasks, assignee: people.name })
      .from(tasks)
      .leftJoin(people, eq(tasks.assigneeId, people.id))
      .where(eq(tasks.projectId, id))
      .orderBy(sql`case ${tasks.status} when 'in_progress' then 0 when 'todo' then 1 else 2 end`, sql`${tasks.dueDate} asc nulls last`, asc(tasks.id)),
    db
      .select({ person: people, role: projectPeople.role })
      .from(projectPeople)
      .innerJoin(people, eq(projectPeople.personId, people.id))
      .where(eq(projectPeople.projectId, id))
      .orderBy(asc(people.name)),
    db.select().from(tickets).where(eq(tickets.projectId, id)).orderBy(priorityRank(tickets.priority), desc(tickets.updatedAt)),
    db.select().from(resources).where(eq(resources.projectId, id)).orderBy(desc(resources.createdAt)),
  ]);
  return { project, tasks: projectTasks, team, tickets: projectTickets, resources: projectResources };
}

export async function listTickets(filter: { status?: string; q?: string }) {
  const db = await getDb();
  const conds = [];
  if (filter.status === "active" || !filter.status) conds.push(OPEN_TICKET);
  else if (filter.status !== "all") conds.push(eq(tickets.status, filter.status as never));
  if (filter.q) {
    const like = `%${filter.q}%`;
    conds.push(or(ilike(tickets.key, like), ilike(tickets.title, like), ilike(tickets.client, like)));
  }
  return db
    .select({ ticket: tickets, projectName: projects.name })
    .from(tickets)
    .leftJoin(projects, eq(tickets.projectId, projects.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(priorityRank(tickets.priority), desc(tickets.updatedAt));
}

export async function getTicket(id: number) {
  const db = await getDb();
  const [row] = await db
    .select({ ticket: tickets, projectName: projects.name })
    .from(tickets)
    .leftJoin(projects, eq(tickets.projectId, projects.id))
    .where(eq(tickets.id, id));
  if (!row) return null;
  const ticketResources = await db.select().from(resources).where(eq(resources.ticketId, id)).orderBy(desc(resources.createdAt));
  return { ...row, resources: ticketResources };
}

export async function listPeople() {
  const db = await getDb();
  const [all, assignments] = await Promise.all([
    db.select().from(people).orderBy(asc(people.name)),
    db
      .select({ personId: projectPeople.personId, role: projectPeople.role, projectId: projects.id, projectName: projects.name, status: projects.status })
      .from(projectPeople)
      .innerJoin(projects, eq(projectPeople.projectId, projects.id))
      .orderBy(asc(projects.name)),
  ]);
  return all.map((person) => ({ person, projects: assignments.filter((a) => a.personId === person.id) }));
}

export async function getPerson(id: number) {
  const db = await getDb();
  const [person] = await db.select().from(people).where(eq(people.id, id));
  return person ?? null;
}

export async function projectOptions() {
  const db = await getDb();
  return db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(asc(projects.name));
}

export async function peopleOptions() {
  const db = await getDb();
  return db.select({ id: people.id, name: people.name }).from(people).orderBy(asc(people.name));
}

export async function search(q: string) {
  const db = await getDb();
  const like = `%${q}%`;
  const [p, t, k, ppl, r] = await Promise.all([
    db.select().from(projects).where(or(ilike(projects.name, like), ilike(projects.client, like), ilike(projects.description, like))).limit(20),
    db.select().from(tasks).where(ilike(tasks.title, like)).limit(20),
    db.select().from(tickets).where(or(ilike(tickets.key, like), ilike(tickets.title, like), ilike(tickets.client, like), ilike(tickets.notes, like))).limit(20),
    db.select().from(people).where(or(ilike(people.name, like), ilike(people.role, like), ilike(people.email, like))).limit(20),
    db.select().from(resources).where(or(ilike(resources.title, like), ilike(resources.url, like), ilike(resources.notes, like))).limit(20),
  ]);
  return { projects: p, tasks: t, tickets: k, people: ppl, resources: r };
}
