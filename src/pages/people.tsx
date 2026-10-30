import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import * as api from "@/lib/api";
import { opt } from "@/lib/values";
import { ConfirmButton, Form, SubmitButton, useMutate } from "@/components/client";
import { Load } from "@/components/query";
import { ProjectSlicers, Slicer, useProjectFilter } from "@/components/slicers";
import { Badge, buttonClass, Card, DateChip, DueBadge, Empty, Field, Input, LinkButton, PageHeader, Progress, StatusBadge, Textarea, useTitle } from "@/components/ui";

export function People() {
  useTitle("People");
  const filter = useProjectFilter();
  const project = Number(filter.get("project")) || 0;
  const mutate = useMutate();
  return (
    <>
      <PageHeader title="People" subtitle="Who is working on what." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <ProjectSlicers filter={filter} statusLabel="Project status" extraKeys={["project"]}>
            <Slicer
              label="Project"
              value={project}
              options={(filter.facets?.projects ?? []).map((p) => ({ value: String(p.id), label: p.name }))}
              onChange={(v) => filter.set("project", v)}
            />
          </ProjectSlicers>
          <Load queryKey={["people"]} fn={api.listPeople}>
            {(all) => {
              const filtering = filter.active || Boolean(project);
              // While filtering, list only the people on matching projects, and only those projects.
              const rows = filtering
                ? all
                    .map((r) => ({
                      ...r,
                      projects: r.projects.filter((a) => filter.keep(a.project_id) && (!project || a.project_id === project)),
                      tickets: r.tickets.filter((t) => t.project_id != null && filter.keep(t.project_id) && (!project || t.project_id === project)),
                    }))
                    .filter((r) => r.projects.length > 0)
                : all;
              if (filtering && rows.length === 0) return <Empty>No one is on a project matching these filters.</Empty>;
              return rows.length === 0 ? (
                <Empty>No people yet. Add the people you work with, then add them to projects from their card.</Empty>
              ) : (
                <ul className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {rows.map(({ person, projects, tickets }) => {
                    const current = projects.filter((p) => p.project.status !== "done");
                    return (
                      <li key={person.id} className="rounded-2xl border border-line/80 bg-surface p-5 shadow-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/people/${person.id}`} className="block truncate font-medium hover:underline">
                              {person.name}
                            </Link>
                            <div className="truncate text-sm text-muted">{[person.role, person.email].filter(Boolean).join(" · ")}</div>
                            <JiraFilterLink personId={person.id} url={person.jira_filter} />
                          </div>
                          <Link to={`/people/${person.id}/edit`} className="text-xs text-accent">
                            Edit
                          </Link>
                        </div>
                        <div className="mt-3 text-xs text-muted">
                          {current.length === 0 ? "Not on any open project" : `On ${current.length} open project${current.length === 1 ? "" : "s"}`}
                        </div>
                        {projects.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {projects.map((a) => (
                              <li key={a.project_id} className="flex items-center gap-2 text-sm">
                                <Link to={`/projects/${a.project_id}`} className="min-w-0 flex-1 truncate hover:underline">
                                  {a.project.name}
                                  {a.role && <span className="text-muted"> · {a.role}</span>}
                                </Link>
                                <StatusBadge status={a.project.status} />
                              </li>
                            ))}
                          </ul>
                        )}
                        <AddToProject
                          personId={person.id}
                          role={person.role}
                          options={(filter.facets?.projects ?? []).filter((p) => !projects.some((a) => a.project_id === p.id))}
                        />
                        <WorkingOnTickets personId={person.id} tickets={tickets} />
                      </li>
                    );
                  })}
                </ul>
              );
            }}
          </Load>
        </div>
        <Card title="Add a person" className="h-fit">
          <Form
            id="add"
            reset
            className="space-y-3"
            onSubmit={(v) => mutate(() => api.createPerson({ name: v.name, role: opt(v.role), email: opt(v.email), notes: null, jira_filter: opt(v.jira_filter) }))}
          >
            <Field label="Name">
              <Input name="name" required />
            </Field>
            <Field label="Role">
              <Input name="role" placeholder="e.g. Developer, QA, PM" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" />
            </Field>
            <Field label="Jira working items link">
              <Input name="jira_filter" type="url" placeholder="Optional" />
            </Field>
            <SubmitButton>Add person</SubmitButton>
          </Form>
        </Card>
      </div>
    </>
  );
}

// Opens the person's Jira working items (their saved Jira filter). Without a link yet, offers to add one right on the card.
function JiraFilterLink({ personId, url }: { personId: number; url: string | null }) {
  const mutate = useMutate();
  const [adding, setAdding] = useState(false);
  if (url)
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-block text-xs text-accent hover:underline">
        Jira working items ↗
      </a>
    );
  if (!adding)
    return (
      <button type="button" className="block text-xs text-muted transition hover:text-accent" onClick={() => setAdding(true)}>
        + Add Jira working items link
      </button>
    );
  return (
    <Form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={async (v) => {
        await mutate(() => api.setJiraFilter(personId, opt(v.jira_filter)));
        setAdding(false);
      }}
    >
      <Input name="jira_filter" type="url" required autoFocus placeholder="Paste the Jira filter link" className="h-8 min-w-0 flex-1 text-xs" />
      <SubmitButton small>Save</SubmitButton>
      <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setAdding(false)}>
        Cancel
      </button>
    </Form>
  );
}

// Dashed picker at the bottom of a person card that puts them on another project.
// A project manager joins as that project's PM; anyone else joins with no project role.
function AddToProject({ personId, role, options }: { personId: number; role: string | null; options: { id: number; name: string; status: string }[] }) {
  const mutate = useMutate();
  if (options.length === 0) return null;
  // Open projects first, finished ones after.
  const sorted = [...options].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || a.name.localeCompare(b.name));
  return (
    <select
      value=""
      aria-label="Add to project"
      className="mt-3 cursor-pointer rounded-full border border-dashed border-line bg-transparent px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
      onChange={(e) => e.target.value && mutate(() => api.assignPerson({ project_id: Number(e.target.value), person_id: personId, role: role === api.PM_ROLE ? role : null }))}
    >
      <option value="">+ Add to project</option>
      {sorted.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.status === "done" ? " (done)" : ""}
        </option>
      ))}
    </select>
  );
}

type CardTicket = Awaited<ReturnType<typeof api.listPeople>>[number]["tickets"][number];

// "Working on tickets" on a person card: their open tickets, with a picker to give them another.
function WorkingOnTickets({ personId, tickets }: { personId: number; tickets: CardTicket[] }) {
  const mutate = useMutate();
  const open = tickets.filter(api.isOpenTicket);
  return (
    <div className="mt-4 border-t border-line/70 pt-3">
      <div className="text-xs text-muted">{open.length === 0 ? "Not working on any open ticket" : `Working on ${open.length} ticket${open.length === 1 ? "" : "s"}`}</div>
      {open.length > 0 && (
        <ul className="mt-2 space-y-1">
          {open.map((t) => (
            <li key={t.id} className="group flex items-center gap-2 text-sm">
              <Link to={`/tickets/${t.id}`} className="flex min-w-0 flex-1 items-baseline gap-2 hover:underline">
                <span className="shrink-0 font-mono text-xs text-muted">{t.key}</span>
                <span className="truncate">{t.title}</span>
              </Link>
              <Badge value={t.priority} />
              <button
                type="button"
                aria-label={`Take ${t.key} off this person`}
                title="Remove"
                className="text-muted opacity-60 transition hover:text-red-600 hover:opacity-100"
                onClick={() => mutate(() => api.unassignTicket(t.id, personId))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <AssignTicket personId={personId} assigned={tickets.map((t) => t.id)} />
    </div>
  );
}

// Dashed picker listing every open ticket the person isn't on yet, newest key first.
function AssignTicket({ personId, assigned }: { personId: number; assigned: number[] }) {
  const mutate = useMutate();
  const { data } = useQuery({ queryKey: ["ticket-options"], queryFn: api.ticketOptions });
  const options = (data ?? []).filter((t) => !assigned.includes(t.id));
  if (options.length === 0) return null;
  return (
    <select
      value=""
      aria-label="Assign a ticket"
      className="mt-3 w-full max-w-full cursor-pointer truncate rounded-full border border-dashed border-line bg-transparent px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
      onChange={(e) => e.target.value && mutate(() => api.assignTicket({ ticket_id: Number(e.target.value), person_id: personId }))}
    >
      <option value="">+ Assign ticket</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.key} · {t.title}
        </option>
      ))}
    </select>
  );
}

// Where search and a person's name lead: the projects they are on and the tasks they have there.
export function PersonDetail() {
  const id = Number(useParams().id);
  return (
    <Load queryKey={["person-projects", id]} fn={() => api.getPersonProjects(id)} rows={4}>
      {(data) => <PersonBody {...data} />}
    </Load>
  );
}

function PersonBody({ person, projects, tickets }: NonNullable<Awaited<ReturnType<typeof api.getPersonProjects>>>) {
  useTitle(person.name);
  const open = projects.filter((p) => p.project.status !== "done").length;
  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/people" className="text-muted hover:text-fg">
          ← People
        </Link>
      </div>
      <PageHeader
        title={person.name}
        subtitle={[person.role, person.email, projects.length > 0 && `On ${open} open project${open === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
        actions={
          <>
            {person.jira_filter && (
              <a href={person.jira_filter} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                Jira working items ↗
              </a>
            )}
            <LinkButton to={`/people/${person.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
          </>
        }
      />
      <Card title="Working on tickets" className="mb-5">
        {tickets.length === 0 ? (
          <p className="text-sm text-muted">No tickets yet.</p>
        ) : (
          <ul className="stagger divide-y divide-line/70">
            {tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <Link to={`/tickets/${t.id}`} className="flex min-w-0 flex-1 basis-64 items-center gap-3 hover:opacity-80">
                  <span className="w-24 shrink-0 font-mono text-xs">{t.key}</span>
                  <span className="min-w-0">
                    <span className={api.isOpenTicket(t) ? "block truncate text-sm" : "block truncate text-sm text-muted line-through"}>{t.title}</span>
                    {t.client && <span className="block truncate text-xs text-muted">{t.client}</span>}
                  </span>
                </Link>
                <div className="flex items-center gap-1.5">
                  <Badge value={t.priority} />
                  <Badge value={t.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <AssignTicket personId={person.id} assigned={tickets.map((t) => t.id)} />
      </Card>
      {projects.length === 0 ? (
        <Empty>{person.name} isn’t on any project yet. Add them from the People page or a project’s People card.</Empty>
      ) : (
        <ul className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
          {projects.map(({ project: p, role, tasks }) => {
            const openTasks = tasks.filter((t) => t.status !== "done");
            return (
              <li key={p.id} className="rounded-2xl border border-line/80 bg-surface p-5 shadow-xs">
                <Link to={`/projects/${p.id}`} className="block hover:opacity-80">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        <DateChip date={p.due_date} done={p.status === "done"} />
                      </div>
                      {role && <div className="truncate text-xs text-accent-strong">{role}</div>}
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="mt-3">
                    <Progress value={p.progress} />
                  </div>
                </Link>
                {tasks.length > 0 && (
                  <>
                    <div className="mt-3 text-xs text-muted">
                      {openTasks.length} open task{openTasks.length === 1 ? "" : "s"} for {person.name.split(" ")[0]}
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {tasks.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-sm">
                          <span className={t.status === "done" ? "min-w-0 flex-1 truncate text-muted line-through" : "min-w-0 flex-1 truncate"}>{t.title}</span>
                          {t.status === "done" ? <Badge value="done" /> : <DueBadge date={t.due_date} />}
                          {t.status === "in_progress" && <Badge value="in_progress" />}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {person.notes && (
        <Card title="Notes" className="mt-5">
          <p className="whitespace-pre-wrap text-sm">{person.notes}</p>
        </Card>
      )}
    </>
  );
}

export function EditPerson() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const mutate = useMutate();
  return (
    <Load queryKey={["person", id]} fn={() => api.getPerson(id)}>
      {(person) => (
        <>
          <PageHeader
            title={`Edit ${person.name}`}
            actions={
              <ConfirmButton
                label="Delete person"
                small={false}
                onConfirm={async () => {
                  await api.deletePerson(id);
                  navigate("/people");
                  await mutate(async () => {});
                }}
              />
            }
          />
          <Form
            className="grid max-w-xl gap-4 rounded-2xl border border-line/80 bg-surface p-5 shadow-xs"
            onSubmit={async (v) => {
              await mutate(() => api.updatePerson(id, { name: v.name, role: opt(v.role), email: opt(v.email), notes: opt(v.notes), jira_filter: opt(v.jira_filter) }));
              navigate(`/people/${id}`);
            }}
          >
            <Field label="Name">
              <Input name="name" required defaultValue={person.name} />
            </Field>
            <Field label="Role">
              <Input name="role" defaultValue={person.role ?? ""} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={person.email ?? ""} />
            </Field>
            <Field label="Jira working items link">
              <Input name="jira_filter" type="url" placeholder="https://quicketsolutions.atlassian.net/issues/?filter=…" defaultValue={person.jira_filter ?? ""} />
            </Field>
            <Field label="Notes">
              <Textarea name="notes" defaultValue={person.notes ?? ""} />
            </Field>
            <div className="flex gap-2">
              <SubmitButton>Save changes</SubmitButton>
              <LinkButton to={`/people/${id}`} variant="secondary">
                Cancel
              </LinkButton>
            </div>
          </Form>
        </>
      )}
    </Load>
  );
}
