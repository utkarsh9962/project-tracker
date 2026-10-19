import { PRIORITIES, PROJECT_STATUSES, type Project } from "@/lib/types";
import type { ProjectInput } from "@/lib/api";
import { opt, pct } from "@/lib/values";
import { Form, SubmitButton } from "@/components/client";
import { Field, Input, LinkButton, Select, Textarea } from "@/components/ui";

export function ProjectForm({ onSave, project, cancelTo }: { onSave: (v: ProjectInput) => Promise<void>; project?: Project; cancelTo: string }) {
  return (
    <Form
      className="grid gap-4 rounded-2xl border border-line/80 bg-surface p-5 shadow-xs sm:grid-cols-2"
      onSubmit={(v) =>
        onSave({
          name: v.name,
          client: opt(v.client),
          description: opt(v.description),
          status: v.status as Project["status"],
          priority: v.priority as Project["priority"],
          progress: pct(v.progress),
          start_date: opt(v.start_date),
          due_date: opt(v.due_date),
        })
      }
    >
      <Field label="Project name" className="sm:col-span-2">
        <Input name="name" required defaultValue={project?.name} placeholder="e.g. Acme onboarding" />
      </Field>
      <Field label="Client">
        <Input name="client" defaultValue={project?.client ?? ""} />
      </Field>
      <Field label="Progress (%)">
        <Input name="progress" type="number" min={0} max={100} defaultValue={project?.progress ?? 0} />
      </Field>
      <Field label="Status">
        <Select name="status" options={PROJECT_STATUSES} defaultValue={project?.status ?? "active"} />
      </Field>
      <Field label="Priority">
        <Select name="priority" options={PRIORITIES} defaultValue={project?.priority ?? "medium"} />
      </Field>
      <Field label="Start date">
        <Input name="start_date" type="date" defaultValue={project?.start_date ?? ""} />
      </Field>
      <Field label="Due date">
        <Input name="due_date" type="date" defaultValue={project?.due_date ?? ""} />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <Textarea name="description" rows={4} defaultValue={project?.description ?? ""} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{project ? "Save changes" : "Create project"}</SubmitButton>
        <LinkButton to={cancelTo} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </Form>
  );
}
