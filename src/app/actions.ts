"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import {
  PRIORITIES,
  PROJECT_STATUSES,
  RESOURCE_KINDS,
  TASK_STATUSES,
  TICKET_STATUSES,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { createToken, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session-token";

const { projects, tasks, tickets, people, projectPeople, resources } = schema;

// Empty form fields become null so optional columns stay empty instead of "".
const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullish()
  .transform((v) => v ?? null);
const optionalDate = optionalText.refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date");
const optionalId = optionalText.transform((v) => (v ? Number(v) : null));
const requiredText = z.string().trim().min(1, "Required");
// Links must be web, mail or Slack URLs; bare domains get https:// so "jira.example.com/ZST-1" works.
const optionalUrl = optionalText.transform((v, ctx) => {
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    if (["http:", "https:", "mailto:", "slack:"].includes(url.protocol)) return url.toString();
  } catch {}
  ctx.addIssue({ code: "custom", message: "Use a web link (https://...)" });
  return z.NEVER;
});
const id = z.coerce.number().int().positive();

function parse<T extends z.ZodTypeAny>(schema: T, formData: FormData): z.infer<T> {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (!result.success) throw new Error(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}

// ---------- Auth ----------

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD;
  if (!expected) return { error: "APP_PASSWORD is not set on the server." };
  if (password !== expected) return { error: "Wrong password." };
  (await cookies()).set(SESSION_COOKIE, await createToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  const next = String(formData.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- Projects ----------

const projectInput = z.object({
  name: requiredText,
  client: optionalText,
  description: optionalText,
  status: z.enum(PROJECT_STATUSES),
  priority: z.enum(PRIORITIES),
  progress: z.coerce.number().int().min(0).max(100),
  startDate: optionalDate,
  dueDate: optionalDate,
});

export async function createProject(formData: FormData) {
  await requireAuth();
  const db = await getDb();
  const [row] = await db.insert(projects).values(parse(projectInput, formData)).returning({ id: projects.id });
  redirect(`/projects/${row.id}`);
}

export async function updateProject(projectId: number, formData: FormData) {
  await requireAuth();
  const db = await getDb();
  await db.update(projects).set(parse(projectInput, formData)).where(eq(projects.id, projectId));
  redirect(`/projects/${projectId}`);
}

export async function setProjectProgress(projectId: number, formData: FormData) {
  await requireAuth();
  const { progress } = parse(z.object({ progress: z.coerce.number().int().min(0).max(100) }), formData);
  const db = await getDb();
  await db.update(projects).set({ progress }).where(eq(projects.id, projectId));
  refresh();
}

export async function deleteProject(projectId: number) {
  await requireAuth();
  const db = await getDb();
  await db.delete(projects).where(eq(projects.id, projectId));
  redirect("/projects");
}

// ---------- Tasks ----------

export async function createTask(projectId: number, formData: FormData) {
  await requireAuth();
  const input = parse(z.object({ title: requiredText, dueDate: optionalDate, assigneeId: optionalId }), formData);
  const db = await getDb();
  await db.insert(tasks).values({ ...input, projectId });
  refresh();
}

export async function setTaskStatus(taskId: number, formData: FormData) {
  await requireAuth();
  const { status } = parse(z.object({ status: z.enum(TASK_STATUSES) }), formData);
  const db = await getDb();
  await db.update(tasks).set({ status }).where(eq(tasks.id, taskId));
  refresh();
}

export async function deleteTask(taskId: number) {
  await requireAuth();
  const db = await getDb();
  await db.delete(tasks).where(eq(tasks.id, taskId));
  refresh();
}

// ---------- Team ----------

export async function assignPerson(projectId: number, formData: FormData) {
  await requireAuth();
  const input = parse(z.object({ personId: id, role: optionalText }), formData);
  const db = await getDb();
  await db
    .insert(projectPeople)
    .values({ projectId, ...input })
    .onConflictDoUpdate({ target: [projectPeople.projectId, projectPeople.personId], set: { role: input.role } });
  refresh();
}

export async function unassignPerson(projectId: number, personId: number) {
  await requireAuth();
  const db = await getDb();
  await db.delete(projectPeople).where(and(eq(projectPeople.projectId, projectId), eq(projectPeople.personId, personId)));
  refresh();
}

// ---------- Tickets ----------

const ticketInput = z.object({
  key: requiredText.transform((v) => v.toUpperCase()),
  title: requiredText,
  client: optionalText,
  projectId: optionalId,
  priority: z.enum(PRIORITIES),
  status: z.enum(TICKET_STATUSES),
  url: optionalUrl,
  dueDate: optionalDate,
  notes: optionalText,
});

export async function createTicket(formData: FormData) {
  await requireAuth();
  const db = await getDb();
  const [row] = await db.insert(tickets).values(parse(ticketInput, formData)).returning({ id: tickets.id });
  redirect(`/tickets/${row.id}`);
}

export async function updateTicket(ticketId: number, formData: FormData) {
  await requireAuth();
  const db = await getDb();
  await db.update(tickets).set(parse(ticketInput, formData)).where(eq(tickets.id, ticketId));
  redirect(`/tickets/${ticketId}`);
}

export async function setTicketStatus(ticketId: number, formData: FormData) {
  await requireAuth();
  const { status } = parse(z.object({ status: z.enum(TICKET_STATUSES) }), formData);
  const db = await getDb();
  await db.update(tickets).set({ status }).where(eq(tickets.id, ticketId));
  refresh();
}

export async function deleteTicket(ticketId: number) {
  await requireAuth();
  const db = await getDb();
  await db.delete(tickets).where(eq(tickets.id, ticketId));
  redirect("/tickets");
}

// ---------- People ----------

const personInput = z.object({ name: requiredText, role: optionalText, email: optionalText, notes: optionalText });

export async function createPerson(formData: FormData) {
  await requireAuth();
  const db = await getDb();
  await db.insert(people).values(parse(personInput, formData));
  refresh();
}

export async function updatePerson(personId: number, formData: FormData) {
  await requireAuth();
  const db = await getDb();
  await db.update(people).set(parse(personInput, formData)).where(eq(people.id, personId));
  redirect("/people");
}

export async function deletePerson(personId: number) {
  await requireAuth();
  const db = await getDb();
  await db.delete(people).where(eq(people.id, personId));
  redirect("/people");
}

// ---------- Resources ----------

const resourceInput = z.object({
  title: requiredText,
  kind: z.enum(RESOURCE_KINDS),
  url: optionalUrl,
  notes: optionalText,
});

export async function addResource(target: { projectId?: number; ticketId?: number }, formData: FormData) {
  await requireAuth();
  const db = await getDb();
  await db.insert(resources).values({ ...parse(resourceInput, formData), ...target });
  refresh();
}

export async function deleteResource(resourceId: number) {
  await requireAuth();
  const db = await getDb();
  await db.delete(resources).where(eq(resources.id, resourceId));
  refresh();
}
