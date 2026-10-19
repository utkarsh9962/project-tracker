import {
  date,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ownerId is unused while the app is single-user; it keeps the door open for sharing later.
const ownerId = () => text("owner_id").notNull().default("owner");
const createdAt = () => timestamp("created_at").notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "done"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"] as const;
export const RESOURCE_KINDS = ["link", "doc", "sheet", "pdf", "slack", "email", "jira", "note", "other"] as const;

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  ownerId: ownerId(),
  name: text("name").notNull(),
  role: text("role"),
  email: text("email"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  ownerId: ownerId(),
  name: text("name").notNull(),
  client: text("client"),
  description: text("description"),
  status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
  priority: text("priority", { enum: PRIORITIES }).notNull().default("medium"),
  progress: integer("progress").notNull().default(0),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const projectPeople = pgTable(
  "project_people",
  {
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: text("role"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.personId] })],
);

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
  dueDate: date("due_date"),
  assigneeId: integer("assignee_id").references(() => people.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  ownerId: ownerId(),
  key: text("key").notNull(),
  title: text("title").notNull(),
  client: text("client"),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  priority: text("priority", { enum: PRIORITIES }).notNull().default("medium"),
  status: text("status", { enum: TICKET_STATUSES }).notNull().default("open"),
  url: text("url"),
  dueDate: date("due_date"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "cascade" }),
  ticketId: integer("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: text("kind", { enum: RESOURCE_KINDS }).notNull().default("link"),
  url: text("url"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export type Project = typeof projects.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Resource = typeof resources.$inferSelect;
