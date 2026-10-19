import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { assignPerson, createTask, deleteTask, setProjectProgress, setTaskStatus, unassignPerson } from "@/app/actions";
import { TASK_STATUSES } from "@/db/schema";
import { AutoSubmitSelect, ConfirmButton, SubmitButton } from "@/components/client";
import { ResourcesCard } from "@/components/forms/resources";
import { Badge, Card, DueBadge, Empty, Input, LinkButton, ListSkeleton, PageHeader, Progress, Select } from "@/components/ui";
import { getProject, peopleOptions } from "@/lib/data";
import { formatDate } from "@/lib/format";

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <ProjectDetail id={params.then((p) => Number(p.id))} />
    </Suspense>
  );
}

async function ProjectDetail({ id: idPromise }: { id: Promise<number> }) {
  const id = await idPromise;
  const [data, everyone] = await Promise.all([Number.isInteger(id) ? getProject(id) : null, peopleOptions()]);
  if (!data) notFound();
  const { project: p, tasks, team, tickets, resources } = data;
  const doneTasks = tasks.filter((t) => t.task.status === "done").length;
  const unassigned = everyone.filter((person) => !team.some((m) => m.person.id === person.id));
  const assigneeOptions = [{ value: "", label: "Unassigned" }, ...team.map((m) => ({ value: m.person.id, label: m.person.name }))];

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/projects" className="text-muted hover:text-fg">
          ← Projects
        </Link>
      </div>
      <PageHeader
        title={p.name}
        subtitle={[p.client, p.startDate && `Started ${formatDate(p.startDate)}`, p.dueDate && `Due ${formatDate(p.dueDate)}`].filter(Boolean).join(" · ")}
        actions={<LinkButton href={`/projects/${p.id}/edit`} variant="secondary">Edit</LinkButton>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge value={p.status} />
              <Badge value={p.priority} label={`${p.priority[0].toUpperCase()}${p.priority.slice(1)} priority`} />
              <DueBadge date={p.dueDate} />
            </div>
            <div className="mt-4">
              <Progress value={p.progress} />
              <form action={setProjectProgress.bind(null, p.id)} className="mt-2 flex flex-wrap items-center gap-2">
                <Input name="progress" type="number" min={0} max={100} defaultValue={p.progress} aria-label="Progress percent" className="w-24 py-1" />
                <SubmitButton small variant="secondary">Update progress</SubmitButton>
                {tasks.length > 0 && <span className="text-xs text-muted">{doneTasks}/{tasks.length} tasks done</span>}
              </form>
            </div>
            {p.description && <p className="mt-4 whitespace-pre-wrap text-sm">{p.description}</p>}
          </Card>

          <Card title={`Tasks (${tasks.length - doneTasks} open)`}>
            {tasks.length === 0 ? (
              <Empty>No tasks yet.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {tasks.map(({ task, assignee }) => (
                  <li key={task.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <AutoSubmitSelect action={setTaskStatus.bind(null, task.id)} name="status" value={task.status} options={TASK_STATUSES} label={`Status of ${task.title}`} />
                    <span className={task.status === "done" ? "min-w-0 flex-1 text-sm text-muted line-through" : "min-w-0 flex-1 text-sm"}>{task.title}</span>
                    {assignee && <span className="text-xs text-muted">{assignee}</span>}
                    {task.status !== "done" && <DueBadge date={task.dueDate} />}
                    <ConfirmButton action={deleteTask.bind(null, task.id)} />
                  </li>
                ))}
              </ul>
            )}
            <form action={createTask.bind(null, p.id)} className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_9rem_9rem_auto]">
              <Input name="title" required placeholder="New task" aria-label="Task title" />
              <Input name="dueDate" type="date" aria-label="Task due date" />
              <Select name="assigneeId" options={assigneeOptions} aria-label="Assignee" />
              <SubmitButton small>Add task</SubmitButton>
            </form>
          </Card>

          <Card title="ZST tickets" actions={<Link href={`/tickets/new?project=${p.id}`} className="text-xs text-accent">+ New ZST</Link>}>
            {tickets.length === 0 ? (
              <Empty>No tickets linked to this project.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
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

        <div className="space-y-5">
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
                    <ConfirmButton action={unassignPerson.bind(null, p.id, person.id)} label="Remove" />
                  </li>
                ))}
              </ul>
            )}
            {unassigned.length > 0 ? (
              <form action={assignPerson.bind(null, p.id)} className="mt-3 grid gap-2 border-t border-line pt-3">
                <Select name="personId" options={unassigned.map((x) => ({ value: x.id, label: x.name }))} aria-label="Person" />
                <Input name="role" placeholder="Role on this project (optional)" aria-label="Role on project" />
                <div>
                  <SubmitButton small>Assign</SubmitButton>
                </div>
              </form>
            ) : (
              <p className="mt-3 text-xs text-muted">
                {everyone.length === 0 ? (
                  <>
                    <Link href="/people#add" className="text-accent">Add people</Link> to assign them here.
                  </>
                ) : (
                  "Everyone in People is on this project."
                )}
              </p>
            )}
          </Card>

          <ResourcesCard resources={resources} target={{ projectId: p.id }} />
        </div>
      </div>
    </>
  );
}
