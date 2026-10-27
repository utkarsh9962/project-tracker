import { Link, useNavigate, useParams } from "react-router";
import * as api from "@/lib/api";
import { opt } from "@/lib/values";
import { ConfirmButton, Form, SubmitButton, useMutate } from "@/components/client";
import { Load } from "@/components/query";
import { ProjectSlicers, Slicer, useProjectFilter } from "@/components/slicers";
import { Badge, Card, DateChip, DueBadge, Empty, Field, Input, LinkButton, PageHeader, Progress, StatusBadge, Textarea, useTitle } from "@/components/ui";

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
                    .map((r) => ({ ...r, projects: r.projects.filter((a) => filter.keep(a.project_id) && (!project || a.project_id === project)) }))
                    .filter((r) => r.projects.length > 0)
                : all;
              if (filtering && rows.length === 0) return <Empty>No one is on a project matching these filters.</Empty>;
              return rows.length === 0 ? (
                <Empty>No people yet. Add the people you work with, then add them to projects from their card.</Empty>
              ) : (
                <ul className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {rows.map(({ person, projects }) => {
                    const current = projects.filter((p) => p.project.status !== "done");
                    return (
                      <li key={person.id} className="rounded-2xl border border-line/80 bg-surface p-5 shadow-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/people/${person.id}`} className="block truncate font-medium hover:underline">
                              {person.name}
                            </Link>
                            <div className="truncate text-sm text-muted">{[person.role, person.email].filter(Boolean).join(" · ")}</div>
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
            onSubmit={(v) => mutate(() => api.createPerson({ name: v.name, role: opt(v.role), email: opt(v.email), notes: null }))}
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
            <SubmitButton>Add person</SubmitButton>
          </Form>
        </Card>
      </div>
    </>
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

// Where search and a person's name lead: the projects they are on and the tasks they have there.
export function PersonDetail() {
  const id = Number(useParams().id);
  return (
    <Load queryKey={["person-projects", id]} fn={() => api.getPersonProjects(id)} rows={4}>
      {({ person, projects }) => <PersonBody person={person} projects={projects} />}
    </Load>
  );
}

function PersonBody({ person, projects }: NonNullable<Awaited<ReturnType<typeof api.getPersonProjects>>>) {
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
          <LinkButton to={`/people/${person.id}/edit`} variant="secondary">
            Edit
          </LinkButton>
        }
      />
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
              await mutate(() => api.updatePerson(id, { name: v.name, role: opt(v.role), email: opt(v.email), notes: opt(v.notes) }));
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
