export const PROJECT_STATUSES = ["planning", "active", "on_hold", "done"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical", "blocker"] as const;
export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export const TICKET_STATUSES = ["open", "in_progress", "waiting", "resolved", "closed"] as const;
// Suggested platform tags; any other tag can be typed in.
export const PLATFORM_TAGS = [".NET", "Mobile", "WEB", "CMS"] as const;
// Jira projects whose tickets can be linked to a project. The type is the key's prefix (NET-123 is a NET ticket).
export const TICKET_TYPES = ["ZST", "NET", "WP", "MOB", "CCMS", "CMS"] as const;
export const ticketType = (key: string) => key.split("-")[0].toUpperCase();
export const RESOURCE_KINDS = ["link", "doc", "sheet", "pdf", "slack", "email", "jira", "note", "other"] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

// Row shapes as stored in Supabase (snake_case columns).
// team_id is the old one-team-per-person link; teams now come from team_people (see Team.members).
export type Person = { id: number; name: string; role: string | null; email: string | null; notes: string | null; jira_filter: string | null; team_id?: number | null };
// members: the ids of the people in the team. A person can be in several teams.
export type Team = { id: number; name: string; position: number; members: number[] };
export type Project = {
  id: number;
  name: string;
  client: string | null;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};
export type Task = { id: number; project_id: number; title: string; status: TaskStatus; due_date: string | null; assignee_id: number | null; updated_at: string };
export type Ticket = {
  id: number;
  key: string;
  title: string;
  client: string | null;
  project_id: number | null;
  priority: Priority;
  status: TicketStatus;
  url: string | null;
  due_date: string | null;
  notes: string | null;
  updated_at: string;
};
export type Resource = {
  id: number;
  project_id: number | null;
  ticket_id: number | null;
  title: string;
  kind: ResourceKind;
  url: string | null;
  notes: string | null;
  created_at: string;
};
export type Milestone = { id: number; project_id: number; title: string; due_date: string | null; done: boolean; created_at: string };
export type Assignment = { project_id: number; person_id: number; role: string | null };
export type TicketAssignment = { ticket_id: number; person_id: number };

// One line of history, written by database triggers. `changes` holds { field: [before, after] } for an update.
export type Activity = {
  id: number;
  at: string;
  who: string | null;
  entity: "project" | "task" | "ticket" | "milestone";
  entity_id: number;
  label: string;
  project_id: number | null;
  ticket_id: number | null;
  action: "created" | "updated" | "deleted";
  changes: Record<string, [unknown, unknown]>;
};
// A screenshot on a project, one of its tasks, or a ticket. `url` is a short-lived link to the image.
export type Attachment = {
  id: number;
  project_id: number | null;
  task_id: number | null;
  ticket_id: number | null;
  path: string;
  name: string;
  caption: string | null;
  created_at: string;
  url: string | null;
};
