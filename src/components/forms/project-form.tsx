import { PRIORITIES, PROJECT_STATUSES, type Project } from "@/db/schema";
import { SubmitButton } from "@/components/client";
import { Field, Input, LinkButton, Select, Textarea } from "@/components/ui";

export function ProjectForm({ action, project, cancelHref }: { action: (fd: FormData) => Promise<void>; project?: Project; cancelHref: string }) {
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm sm:grid-cols-2">
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
        <Input name="startDate" type="date" defaultValue={project?.startDate ?? ""} />
      </Field>
      <Field label="Due date">
        <Input name="dueDate" type="date" defaultValue={project?.dueDate ?? ""} />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <Textarea name="description" rows={4} defaultValue={project?.description ?? ""} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{project ? "Save changes" : "Create project"}</SubmitButton>
        <LinkButton href={cancelHref} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
