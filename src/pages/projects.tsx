import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import * as api from "@/lib/api";
import { formatDate, humanize, relativeDue } from "@/lib/format";
import { PROJECT_STATUSES, TASK_STATUSES, type Task } from "@/lib/types";
import { opt, optId, pct } from "@/lib/values";
import { AutoSubmitSelect, ConfirmButton, Form, SubmitButton, useMutate } from "@/components/client";
import { ProjectForm } from "@/components/forms/project-form";
import { MilestonesCard } from "@/components/forms/milestones";
import { ResourcesCard } from "@/components/forms/resources";
import { Load } from "@/components/query";
import { ProjectSlicers, useProjectFilter } from "@/components/slicers";
import { Badge, Button, Card, cx, DueBadge, Empty, Input, LinkButton, PageHeader, Progress, Select, useTitle } from "@/components/ui";

export function Projects() {
  useTitle("Projects");
  const filter = useProjectFilter();
  return (
    <>
      <PageHeader title="Projects" actions={<LinkButton to="/projects/new">New project</LinkButton>} />
      <ProjectSlicers filter={filter} />
      <Load queryKey={["projects"]} fn={api.listProjects}>
        {(all) => {
          const rows = all.filter(
            ({ project: p, managers }) =>
              (!filter.status || p.status === filter.status) && (!filter.pm || managers.some((m) => m.id === filter.pm)) && (!filter.tag || p.tags.includes(filter.tag)),
          );
          return rows.length === 0 ? (
            <Empty>{filter.active ? "No projects match these filters." : "No projects yet."}</Empty>
          ) : (
            <ul className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
              {rows.map(({ project: p, openTasks, openTickets, managers }) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="block rounded-2xl border border-line/80 bg-surface p-5 shadow-xs transition duration-200 ease-(--ease-out) hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        {p.client && <div className="truncate text-sm text-muted">{p.client}</div>}
                        {managers.length > 0 && <div className="truncate text-xs text-accent-strong">PM · {managers.map((m) => m.name).join(", ")}</div>}
                      </div>
                      <Badge value={p.status} />
                    </div>
                    <div className="mt-3">
                      <Progress value={p.progress} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Badge value={p.priority} />
                      <DueBadge date={p.due_date} />
                      {p.tags.map((t) => (
                        <TagBadge key={t} tag={t} />
                      ))}
                      <span className="ml-auto">
                        {openTasks} open task{openTasks === 1 ? "" : "s"} · {openTickets} ZST{openTickets === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          );
        }}
      </Load>
    </>
  );
}

export function NewProject() {
  useTitle("New project");
  const navigate = useNavigate();
  const mutate = useMutate();
  return (
    <>
      <PageHeader title="New project" />
      <ProjectForm
        cancelTo="/projects"
        onSave={async (v) => {
          let id = 0;
          await mutate(async () => (id = (await api.createProject(v)).id));
          navigate(`/projects/${id}`);
        }}
      />
    </>
  );
}

export function EditProject() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const mutate = useMutate();
  return (
    <Load queryKey={["project", id]} fn={() => api.getProject(id)}>
      {({ project }) => (
        <>
          <PageHeader
            title={`Edit ${project.name}`}
            actions={
              <ConfirmButton
                label="Delete project"
                small={false}
                onConfirm={async () => {
                  await api.deleteProject(id);
                  navigate("/projects");
                  await mutate(async () => {});
                }}
              />
            }
          />
          <ProjectForm
            project={project}
            cancelTo={`/projects/${id}`}
            onSave={async (v) => {
              await mutate(() => api.updateProject(id, v));
              navigate(`/projects/${id}`);
            }}
          />
        </>
      )}
    </Load>
  );
}

export function ProjectDetail() {
  const id = Number(useParams().id);
  return (
    <Load queryKey={["project", id]} fn={() => api.getProject(id)} rows={5}>
      {(data) => <ProjectBody {...data} />}
    </Load>
  );
}

function ProjectBody({ project: p, tasks, team, managers, tickets, resources, milestones }: NonNullable<Awaited<ReturnType<typeof api.getProject>>>) {
  useTitle(p.name);
  const mutate = useMutate();
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;
  const assignees = new Map<number, string>(team.map((m) => [m.person.id, m.person.name]));
  for (const t of tasks) if (t.assignee_id && t.assignee) assignees.set(t.assignee_id, t.assignee.name);
  const assigneeOptions = [
    { value: "", label: "Unassigned" },
    ...[...assignees].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
  ];

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/projects" className="text-muted hover:text-fg">
          ← Projects
        </Link>
      </div>
      <PageHeader
        title={p.name}
        aside={
          <>
            <TargetDate projectId={p.id} date={p.due_date} />
            <ManagerPicker projectId={p.id} managers={managers} />
            <TagPicker projectId={p.id} tags={p.tags} />
          </>
        }
        subtitle={[p.client, p.start_date && `Started ${formatDate(p.start_date)}`].filter(Boolean).join(" · ")}
        actions={
          <LinkButton to={`/projects/${p.id}/edit`} variant="secondary">
            Edit
          </LinkButton>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge value={p.status} />
              <Badge value={p.priority} label={`${humanize(p.priority)} priority`} />
              <DueBadge date={p.due_date} />
            </div>
            <div className="mt-4">
              <Progress value={p.progress} />
              {tasks.length > 0 ? (
                <p className="mt-2 text-xs text-muted">
                  {doneTasks} done{inProgressTasks ? `, ${inProgressTasks} in progress` : ""} of {tasks.length} tasks. Progress updates as task statuses change.
                </p>
              ) : (
                <Form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(v) => mutate(() => api.updateProject(p.id, { progress: pct(v.progress) }))}>
                  <Input key={p.progress} name="progress" type="number" min={0} max={100} defaultValue={p.progress} aria-label="Progress percent" className="w-24 py-1" />
                  <SubmitButton small variant="secondary">
                    Update progress
                  </SubmitButton>
                  <span className="text-xs text-muted">Add tasks and progress will follow them.</span>
                </Form>
              )}
            </div>
            {p.description && <p className="mt-4 whitespace-pre-wrap text-sm">{p.description}</p>}
          </Card>

          <MilestonesCard projectId={p.id} milestones={milestones} />

          <Card title={`Tasks (${tasks.length - doneTasks} open)`}>
            {tasks.length === 0 ? (
              <Empty>No tasks yet.</Empty>
            ) : (
              <ul className="stagger divide-y divide-line/70">
                {tasks.map((task) => (
                  <TaskRow key={task.id} task={task} assigneeOptions={assigneeOptions} />
                ))}
              </ul>
            )}
            <Form
              reset
              className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_9rem_9rem_auto]"
              onSubmit={(v) => mutate(() => api.createTask({ project_id: p.id, title: v.title, due_date: opt(v.due_date), assignee_id: optId(v.assignee_id) }))}
            >
              <Input name="title" required placeholder="New task" aria-label="Task title" />
              <Input name="due_date" type="date" aria-label="Task due date" />
              <Select name="assignee_id" options={assigneeOptions} aria-label="Assignee" />
              <SubmitButton small>Add task</SubmitButton>
            </Form>
          </Card>

          <Card
            title="ZST tickets"
            actions={
              <Link to={`/tickets/new?project=${p.id}`} className="text-xs text-accent">
                + New ZST
              </Link>
            }
          >
            {tickets.length === 0 ? (
              <Empty>No tickets linked to this project.</Empty>
            ) : (
              <ul className="stagger divide-y divide-line/70">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link to={`/tickets/${t.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <span className="w-20 shrink-0 font-mono text-xs">{t.key}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                      <Badge value={t.priority} />
                      <Badge value={t.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <TeamCard projectId={p.id} team={team} />
          <ResourcesCard resources={resources} target={{ project_id: p.id, ticket_id: null }} />
        </div>
      </div>
    </>
  );
}

type AssigneeOption = { value: string | number; label: string };

// One task line; Edit swaps it for an inline form to change the title, date and assignee.
function TaskRow({ task, assigneeOptions }: { task: Task & { assignee: { name: string } | null }; assigneeOptions: AssigneeOption[] }) {
  const mutate = useMutate();
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <li className="py-2.5">
        <Form
          className="grid gap-2 sm:grid-cols-[1fr_9rem_10rem_auto]"
          onSubmit={async (v) => {
            await mutate(() => api.updateTask(task.id, { title: v.title, due_date: opt(v.due_date), assignee_id: optId(v.assignee_id) }));
            setEditing(false);
          }}
        >
          <Input name="title" required defaultValue={task.title} aria-label="Task title" autoFocus />
          <Input name="due_date" type="date" defaultValue={task.due_date ?? ""} aria-label="Task due date" />
          <Select name="assignee_id" options={assigneeOptions} defaultValue={task.assignee_id ?? ""} aria-label="Assignee" />
          <div className="flex gap-1.5">
            <SubmitButton small>Save</SubmitButton>
            <Button type="button" small variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </Form>
      </li>
    );
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <AutoSubmitSelect
        value={task.status}
        options={TASK_STATUSES}
        label={`Status of ${task.title}`}
        onChange={(status) => mutate(() => api.updateTask(task.id, { status: status as Task["status"] }))}
      />
      <span className={task.status === "done" ? "min-w-0 flex-1 text-sm text-muted line-through" : "min-w-0 flex-1 text-sm"}>{task.title}</span>
      {task.assignee && <span className="text-xs text-muted">{task.assignee.name}</span>}
      {task.status !== "done" && <DueBadge date={task.due_date} />}
      <Button type="button" small variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${task.title}`}>
        Edit
      </Button>
      <ConfirmButton onConfirm={() => mutate(() => api.deleteTask(task.id))} />
    </li>
  );
}

// The project's target (due) date beside its name; click to set, change or clear it.
function TargetDate({ projectId, date }: { projectId: number; date: string | null }) {
  const mutate = useMutate();
  const [editing, setEditing] = useState(false);
  const save = async (due_date: string | null) => {
    await mutate(() => api.updateProject(projectId, { due_date }));
    setEditing(false);
  };
  if (editing)
    return (
      <Form className="flex items-center gap-1.5" onSubmit={(v) => save(opt(v.due_date))}>
        <Input name="due_date" type="date" required defaultValue={date ?? ""} autoFocus aria-label="Target date" className="w-40 py-1 text-xs" />
        <SubmitButton small>Save</SubmitButton>
        {date && (
          <Button type="button" small variant="ghost" onClick={() => save(null)}>
            Clear
          </Button>
        )}
        <Button type="button" small variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Form>
    );
  const due = relativeDue(date);
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={date ? `Target date ${formatDate(date)}, change` : "Set target date"}
      className={cx(
        "rounded-full px-3 py-1 text-xs font-medium transition",
        !date
          ? "border border-dashed border-line text-muted hover:border-accent hover:text-accent"
          : due?.tone === "overdue"
            ? "bg-red-50 text-red-700 hover:bg-red-100"
            : due?.tone === "soon"
              ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "bg-hover text-fg hover:bg-line/70",
      )}
    >
      {date ? `Target · ${formatDate(date)}` : "+ Set target date"}
    </button>
  );
}

export function TagBadge({ tag }: { tag: string }) {
  return <span className="inline-flex shrink-0 items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">{tag}</span>;
}

const NEW_TAG = "__new";

// Platform tags beside the project name: remove with ×, add a suggested or existing tag, or type a new one.
function TagPicker({ projectId, tags }: { projectId: number; tags: string[] }) {
  const mutate = useMutate();
  const [creating, setCreating] = useState(false);
  const save = (next: string[]) => mutate(() => api.updateProject(projectId, { tags: next }));
  const add = (tag: string) => (tag && !tags.includes(tag) ? save([...tags, tag]) : Promise.resolve());
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-violet-50 py-1 pr-1 pl-3 text-xs font-medium text-violet-700">
          {t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            className="grid h-5 w-5 place-items-center rounded-full transition hover:bg-violet-100"
            onClick={() => save(tags.filter((x) => x !== t))}
          >
            ×
          </button>
        </span>
      ))}
      {creating ? (
        <Form
          className="flex items-center gap-1.5"
          onSubmit={async (v) => {
            await add(v.tag);
            setCreating(false);
          }}
        >
          <Input name="tag" required autoFocus maxLength={30} placeholder="Tag, e.g. API" aria-label="New platform tag" className="w-36 py-1 text-xs" />
          <SubmitButton small>Add</SubmitButton>
          <Button type="button" small variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </Form>
      ) : (
        <Load queryKey={["facets"]} fn={api.projectFacets} rows={0}>
          {({ tags: known }) => (
            <select
              value=""
              aria-label="Add platform tag"
              className="cursor-pointer rounded-full border border-dashed border-line bg-transparent px-3 py-1 text-xs text-muted transition hover:border-violet-400 hover:text-violet-700"
              onChange={(e) => (e.target.value === NEW_TAG ? setCreating(true) : add(e.target.value))}
            >
              <option value="">+ Add tag</option>
              {known
                .filter((t) => !tags.includes(t))
                .map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              <option value={NEW_TAG}>New tag…</option>
            </select>
          )}
        </Load>
      )}
    </span>
  );
}

const NEW_PM = "__new";

// Project managers shown beside the project name: remove with ×, add from the list or create a new one.
function ManagerPicker({ projectId, managers }: { projectId: number; managers: { id: number; name: string }[] }) {
  const mutate = useMutate();
  const [creating, setCreating] = useState(false);
  const assign = (personId: number) => mutate(() => api.assignPerson({ project_id: projectId, person_id: personId, role: api.PM_ROLE }));
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {managers.map((m) => (
        <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-accent/10 py-1 pr-1 pl-3 text-xs font-medium text-accent-strong">
          PM · {m.name}
          <button
            type="button"
            aria-label={`Remove ${m.name} as project manager`}
            className="grid h-5 w-5 place-items-center rounded-full transition hover:bg-accent/15"
            onClick={() => mutate(() => api.unassignPerson(projectId, m.id))}
          >
            ×
          </button>
        </span>
      ))}
      {creating ? (
        <Form
          className="flex items-center gap-1.5"
          onSubmit={async (v) => {
            const { id } = await api.createPerson({ name: v.name, role: api.PM_ROLE, email: null, notes: null });
            await assign(id);
            setCreating(false);
          }}
        >
          <Input name="name" required autoFocus placeholder="Project manager's name" aria-label="New project manager" className="w-52 py-1 text-xs" />
          <SubmitButton small>Add</SubmitButton>
          <Button type="button" small variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </Form>
      ) : (
        <Load queryKey={["manager-options"]} fn={api.managerOptions} rows={0}>
          {(all) => {
            const free = all.filter((x) => !managers.some((m) => m.id === x.id));
            return (
              <select
                value=""
                aria-label="Add project manager"
                className="cursor-pointer rounded-full border border-dashed border-line bg-transparent px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
                onChange={(e) => (e.target.value === NEW_PM ? setCreating(true) : assign(Number(e.target.value)))}
              >
                <option value="">+ Add PM</option>
                {free.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
                <option value={NEW_PM}>New project manager…</option>
              </select>
            );
          }}
        </Load>
      )}
    </span>
  );
}

function TeamCard({ projectId, team }: { projectId: number; team: { role: string | null; person: { id: number; name: string; role: string | null } }[] }) {
  const mutate = useMutate();
  return (
    <Card title="People">
      {team.length === 0 ? (
        <Empty>No one assigned yet.</Empty>
      ) : (
        <ul className="stagger divide-y divide-line/70">
          {team.map(({ person, role }) => (
            <li key={person.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{person.name}</div>
                <div className="truncate text-xs text-muted">{role ?? person.role}</div>
              </div>
              <ConfirmButton label="Remove" onConfirm={() => mutate(() => api.unassignPerson(projectId, person.id))} />
            </li>
          ))}
        </ul>
      )}
      <Load queryKey={["people-options"]} fn={api.peopleOptions} rows={1}>
        {(everyone) => {
          const unassigned = everyone.filter((x) => !team.some((m) => m.person.id === x.id));
          if (unassigned.length > 0)
            return (
              <Form
                reset
                className="mt-3 grid gap-2 border-t border-line pt-3"
                onSubmit={(v) => mutate(() => api.assignPerson({ project_id: projectId, person_id: Number(v.person_id), role: opt(v.role) }))}
              >
                <Select name="person_id" options={unassigned.map((x) => ({ value: x.id, label: x.name }))} aria-label="Person" />
                <Input name="role" placeholder="Role on this project (optional)" aria-label="Role on project" />
                <div>
                  <SubmitButton small>Assign</SubmitButton>
                </div>
              </Form>
            );
          return (
            <p className="mt-3 text-xs text-muted">
              {everyone.length === 0 ? (
                <>
                  <Link to="/people" className="text-accent">
                    Add people
                  </Link>{" "}
                  to assign them here.
                </>
              ) : (
                "Everyone in People is on this project."
              )}
            </p>
          );
        }}
      </Load>
    </Card>
  );
}
