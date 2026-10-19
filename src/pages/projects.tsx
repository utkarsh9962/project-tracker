import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import * as api from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { PROJECT_STATUSES, TASK_STATUSES } from "@/lib/types";
import { opt, optId, pct } from "@/lib/values";
import { AutoSubmitSelect, ConfirmButton, Form, SubmitButton, useMutate } from "@/components/client";
import { ProjectForm } from "@/components/forms/project-form";
import { ResourcesCard } from "@/components/forms/resources";
import { Load } from "@/components/query";
import { Badge, Card, cx, DueBadge, Empty, Input, LinkButton, PageHeader, Progress, Select, useTitle } from "@/components/ui";

export function Projects() {
  useTitle("Projects");
  const [params] = useSearchParams();
  const status = params.get("status") ?? "all";
  return (
    <>
      <PageHeader title="Projects" actions={<LinkButton to="/projects/new">New project</LinkButton>} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {["all", ...PROJECT_STATUSES].map((s) => (
          <Link
            key={s}
            to={s === "all" ? "/projects" : `/projects?status=${s}`}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
              s === status ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:text-fg",
            )}
          >
            {humanize(s)}
          </Link>
        ))}
      </div>
      <Load queryKey={["projects", status]} fn={() => api.listProjects(status)}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>No projects{status !== "all" ? ` with status “${humanize(status)}”` : ""} yet.</Empty>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {rows.map(({ project: p, openTasks, openTickets }) => (
                <li key={p.id}>
                  <Link to={`/projects/${p.id}`} className="block rounded-xl border border-line bg-surface p-4 shadow-sm hover:bg-hover">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        {p.client && <div className="truncate text-sm text-muted">{p.client}</div>}
                      </div>
                      <Badge value={p.status} />
                    </div>
                    <div className="mt-3">
                      <Progress value={p.progress} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <Badge value={p.priority} />
                      <DueBadge date={p.due_date} />
                      <span className="ml-auto">
                        {openTasks} open task{openTasks === 1 ? "" : "s"} · {openTickets} ZST{openTickets === 1 ? "" : "s"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
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

function ProjectBody({ project: p, tasks, team, tickets, resources }: NonNullable<Awaited<ReturnType<typeof api.getProject>>>) {
  useTitle(p.name);
  const mutate = useMutate();
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const assigneeOptions = [{ value: "", label: "Unassigned" }, ...team.map((m) => ({ value: m.person.id, label: m.person.name }))];

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/projects" className="text-muted hover:text-fg">
          ← Projects
        </Link>
      </div>
      <PageHeader
        title={p.name}
        subtitle={[p.client, p.start_date && `Started ${formatDate(p.start_date)}`, p.due_date && `Due ${formatDate(p.due_date)}`].filter(Boolean).join(" · ")}
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
              <Form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(v) => mutate(() => api.updateProject(p.id, { progress: pct(v.progress) }))}>
                <Input key={p.progress} name="progress" type="number" min={0} max={100} defaultValue={p.progress} aria-label="Progress percent" className="w-24 py-1" />
                <SubmitButton small variant="secondary">
                  Update progress
                </SubmitButton>
                {tasks.length > 0 && (
                  <span className="text-xs text-muted">
                    {doneTasks}/{tasks.length} tasks done
                  </span>
                )}
              </Form>
            </div>
            {p.description && <p className="mt-4 whitespace-pre-wrap text-sm">{p.description}</p>}
          </Card>

          <Card title={`Tasks (${tasks.length - doneTasks} open)`}>
            {tasks.length === 0 ? (
              <Empty>No tasks yet.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <AutoSubmitSelect
                      value={task.status}
                      options={TASK_STATUSES}
                      label={`Status of ${task.title}`}
                      onChange={(status) => mutate(() => api.updateTask(task.id, { status: status as typeof task.status }))}
                    />
                    <span className={task.status === "done" ? "min-w-0 flex-1 text-sm text-muted line-through" : "min-w-0 flex-1 text-sm"}>{task.title}</span>
                    {task.assignee && <span className="text-xs text-muted">{task.assignee.name}</span>}
                    {task.status !== "done" && <DueBadge date={task.due_date} />}
                    <ConfirmButton onConfirm={() => mutate(() => api.deleteTask(task.id))} />
                  </li>
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
              <ul className="divide-y divide-line">
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

function TeamCard({ projectId, team }: { projectId: number; team: { role: string | null; person: { id: number; name: string; role: string | null } }[] }) {
  const mutate = useMutate();
  return (
    <Card title="People">
      {team.length === 0 ? (
        <Empty>No one assigned yet.</Empty>
      ) : (
        <ul className="divide-y divide-line">
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
