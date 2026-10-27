import { Link, useNavigate, useParams } from "react-router";
import * as api from "@/lib/api";
import { opt } from "@/lib/values";
import { ConfirmButton, Form, SubmitButton, useMutate } from "@/components/client";
import { Load } from "@/components/query";
import { ProjectSlicers, Slicer, useProjectFilter } from "@/components/slicers";
import { Badge, Card, Empty, Field, Input, LinkButton, PageHeader, Textarea, useTitle } from "@/components/ui";

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
                            <div className="truncate font-medium">{person.name}</div>
                            <div className="truncate text-sm text-muted">{[person.role, person.email].filter(Boolean).join(" · ")}</div>
                          </div>
                          <Link to={`/people/${person.id}`} className="text-xs text-accent">
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
                                <Badge value={a.project.status} />
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
              navigate("/people");
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
              <LinkButton to="/people" variant="secondary">
                Cancel
              </LinkButton>
            </div>
          </Form>
        </>
      )}
    </Load>
  );
}
