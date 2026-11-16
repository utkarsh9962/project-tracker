import { groupTasks, isOpenTicket, PM_ROLE, searchData } from "./api";
import { humanize, projectStatusLabel, today } from "./format";

// Excel exports. Everything is loaded once and laid out as plain sheets: a bold header row, then one row per item.
type Cell = string | number | Date | null | undefined;
type Sheet = { name: string; header: string[]; widths: number[]; rows: Cell[][] };

const date = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`) : null);

async function download(fileName: string, sheets: Sheet[]) {
  // Loaded only when an export is asked for, so it doesn't slow the first page down.
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(
    sheets.map((s) => ({
      sheet: s.name,
      stickyRowsCount: 1,
      dateFormat: "dd mmm yyyy",
      columns: s.widths.map((width) => ({ width })),
      data: [
        s.header.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#DCE9F7" })),
        ...s.rows.map((row) => row.map((value) => (value instanceof Date ? { value, type: Date } : typeof value === "string" && value.includes("\n") ? { value, wrap: true } : (value ?? null)))),
      ],
    })),
  ).toFile(`${fileName} ${today()}.xlsx`);
}

// Projects with the people on each one. `only` keeps the export to the projects currently shown on the page.
export async function exportProjects(only?: Set<number>) {
  const d = await searchData();
  const person = new Map(d.people.map((p) => [p.id, p]));
  const projects = d.projects.filter((p) => !only || only.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(projects.map((p) => p.id));
  const name = new Map(projects.map((p) => [p.id, p.name]));
  const team = (projectId: number) => d.projectPeople.filter((a) => a.project_id === projectId && person.has(a.person_id));
  const openTasksOf = (projectId: number, personId: number) => d.tasks.filter((t) => t.project_id === projectId && t.assignee_id === personId && t.status !== "done");
  const names = (list: { person_id: number }[]) => list.map((a) => person.get(a.person_id)!.name).sort().join(", ");

  await download("Projects", [
    {
      name: "Projects",
      header: ["Project", "Client", "Status", "Priority", "Progress %", "Start date", "Target date", "Platform", "Project managers", "People", "People count", "Open tasks", "Open tickets", "Description"],
      widths: [38, 24, 12, 10, 11, 13, 13, 16, 26, 50, 12, 11, 12, 60],
      rows: projects.map((p) => {
        const members = team(p.id);
        return [
          p.name,
          p.client,
          projectStatusLabel(p.status),
          humanize(p.priority),
          p.progress,
          date(p.start_date),
          date(p.due_date),
          p.tags.join(", "),
          names(members.filter((a) => a.role === PM_ROLE)),
          names(members.filter((a) => a.role !== PM_ROLE)),
          members.length,
          groupTasks(d.tasks.filter((t) => t.project_id === p.id && t.status !== "done")).length,
          d.tickets.filter((t) => t.project_id === p.id && isOpenTicket(t)).length,
          p.description,
        ];
      }),
    },
    {
      name: "People by project",
      header: ["Project", "Client", "Project status", "Target date", "Person", "Their role", "Role on project", "Email", "Open tasks", "Open task list"],
      widths: [38, 24, 14, 13, 26, 20, 20, 30, 11, 70],
      rows: projects.flatMap((p) =>
        team(p.id)
          .map((a) => ({ a, who: person.get(a.person_id)! }))
          .sort((x, y) => x.who.name.localeCompare(y.who.name))
          .map(({ a, who }) => {
            const open = openTasksOf(p.id, who.id);
            return [p.name, p.client, projectStatusLabel(p.status), date(p.due_date), who.name, who.role, a.role, who.email, open.length, open.map((t) => t.title).join("\n")];
          }),
      ),
    },
    {
      name: "Tasks",
      header: ["Project", "Task", "Status", "Due date", "Assigned to"],
      widths: [38, 60, 13, 13, 26],
      rows: d.tasks
        .filter((t) => ids.has(t.project_id))
        .sort((a, b) => name.get(a.project_id)!.localeCompare(name.get(b.project_id)!) || a.id - b.id)
        .map((t) => [name.get(t.project_id), t.title, humanize(t.status), date(t.due_date), t.assignee_id ? person.get(t.assignee_id)?.name : null]),
    },
    {
      name: "Milestones",
      header: ["Project", "Milestone", "Date", "Reached"],
      widths: [38, 60, 13, 10],
      rows: d.milestones
        .filter((m) => ids.has(m.project_id))
        .sort((a, b) => name.get(a.project_id)!.localeCompare(name.get(b.project_id)!) || (a.due_date ?? "9").localeCompare(b.due_date ?? "9"))
        .map((m) => [name.get(m.project_id), m.title, date(m.due_date), m.done ? "Yes" : "No"]),
    },
    {
      name: "Links and notes",
      header: ["Project", "Title", "Type", "Link", "Notes"],
      widths: [38, 40, 10, 50, 70],
      rows: d.resources
        .filter((r) => r.project_id != null && ids.has(r.project_id))
        .sort((a, b) => name.get(a.project_id!)!.localeCompare(name.get(b.project_id!)!))
        .map((r) => [name.get(r.project_id!), r.title, r.kind, r.url, r.notes]),
    },
  ]);
}

// People with the projects, tasks and tickets each one is on.
export async function exportPeople(only?: Set<number>) {
  const d = await searchData();
  const people = d.people.filter((p) => !only || only.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const project = new Map(d.projects.map((p) => [p.id, p]));
  const ticket = new Map(d.tickets.map((t) => [t.id, t]));
  const projectsOf = (personId: number) =>
    d.projectPeople
      .filter((a) => a.person_id === personId && project.has(a.project_id))
      .map((a) => ({ a, p: project.get(a.project_id)! }))
      .sort((x, y) => Number(x.p.status === "done") - Number(y.p.status === "done") || x.p.name.localeCompare(y.p.name));
  const tasksOf = (personId: number) => d.tasks.filter((t) => t.assignee_id === personId && project.has(t.project_id));
  const ticketsOf = (personId: number) => d.ticketPeople.filter((a) => a.person_id === personId && ticket.has(a.ticket_id)).map((a) => ticket.get(a.ticket_id)!);

  await download("People", [
    {
      name: "People",
      header: ["Person", "Role", "Email", "Open projects", "Open tasks", "Open tickets", "Open projects list", "Open tickets list"],
      widths: [26, 20, 30, 13, 11, 12, 70, 40],
      rows: people.map((who) => {
        const open = projectsOf(who.id).filter(({ p }) => p.status !== "done");
        const tickets = ticketsOf(who.id).filter(isOpenTicket);
        return [who.name, who.role, who.email, open.length, tasksOf(who.id).filter((t) => t.status !== "done").length, tickets.length, open.map(({ p }) => p.name).join("\n"), tickets.map((t) => t.key).join(", ")];
      }),
    },
    {
      name: "Projects by person",
      header: ["Person", "Role", "Project", "Client", "Role on project", "Project status", "Progress %", "Target date", "Their open tasks", "Their open task list"],
      widths: [26, 20, 38, 24, 20, 14, 11, 13, 15, 70],
      rows: people.flatMap((who) =>
        projectsOf(who.id).map(({ a, p }) => {
          const open = tasksOf(who.id).filter((t) => t.project_id === p.id && t.status !== "done");
          return [who.name, who.role, p.name, p.client, a.role, projectStatusLabel(p.status), p.progress, date(p.due_date), open.length, open.map((t) => t.title).join("\n")];
        }),
      ),
    },
    {
      name: "Tasks by person",
      header: ["Person", "Project", "Task", "Status", "Due date"],
      widths: [26, 38, 60, 13, 13],
      rows: people.flatMap((who) =>
        tasksOf(who.id)
          .sort((a, b) => project.get(a.project_id)!.name.localeCompare(project.get(b.project_id)!.name) || a.id - b.id)
          .map((t) => [who.name, project.get(t.project_id)!.name, t.title, humanize(t.status), date(t.due_date)]),
      ),
    },
    {
      name: "Tickets by person",
      header: ["Person", "Ticket", "Summary", "Client", "Project", "Priority", "Status", "Due date"],
      widths: [26, 12, 60, 24, 38, 10, 13, 13],
      rows: people.flatMap((who) =>
        ticketsOf(who.id)
          .sort((a, b) => a.key.localeCompare(b.key))
          .map((t) => [who.name, t.key, t.title, t.client, t.project_id ? project.get(t.project_id)?.name : null, humanize(t.priority), humanize(t.status), date(t.due_date)]),
      ),
    },
  ]);
}
