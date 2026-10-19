import type { TicketInput } from "@/lib/api";
import { PRIORITIES, TICKET_STATUSES, type Ticket } from "@/lib/types";
import { opt, optId, url } from "@/lib/values";
import { Form, SubmitButton } from "@/components/client";
import { Field, Input, LinkButton, Select, Textarea } from "@/components/ui";

export function TicketForm({
  onSave,
  ticket,
  projects,
  defaultProjectId,
  cancelTo,
}: {
  onSave: (v: TicketInput) => Promise<void>;
  ticket?: Ticket;
  projects: { id: number; name: string }[];
  defaultProjectId?: number;
  cancelTo: string;
}) {
  return (
    <Form
      className="grid gap-4 rounded-2xl border border-line/80 bg-surface p-5 shadow-xs sm:grid-cols-2"
      onSubmit={(v) =>
        onSave({
          key: v.key.toUpperCase(),
          title: v.title,
          client: opt(v.client),
          project_id: optId(v.project_id),
          priority: v.priority as Ticket["priority"],
          status: v.status as Ticket["status"],
          url: url(v),
          due_date: opt(v.due_date),
          notes: opt(v.notes),
        })
      }
    >
      <Field label="Ticket key">
        <Input name="key" required defaultValue={ticket?.key ?? "ZST-"} placeholder="ZST-1234" className="font-mono" />
      </Field>
      <Field label="Client">
        <Input name="client" defaultValue={ticket?.client ?? ""} />
      </Field>
      <Field label="Summary" className="sm:col-span-2">
        <Input name="title" required defaultValue={ticket?.title} placeholder="What's the issue?" />
      </Field>
      <Field label="Priority">
        <Select name="priority" options={PRIORITIES} defaultValue={ticket?.priority ?? "medium"} />
      </Field>
      <Field label="Status">
        <Select name="status" options={TICKET_STATUSES} defaultValue={ticket?.status ?? "open"} />
      </Field>
      <Field label="Project">
        <Select
          name="project_id"
          options={[{ value: "", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          defaultValue={String(ticket?.project_id ?? defaultProjectId ?? "")}
        />
      </Field>
      <Field label="Due / SLA date">
        <Input name="due_date" type="date" defaultValue={ticket?.due_date ?? ""} />
      </Field>
      <Field label="JIRA link" className="sm:col-span-2">
        <Input name="url" defaultValue={ticket?.url ?? ""} placeholder="https://yourcompany.atlassian.net/browse/ZST-1234" />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea name="notes" rows={5} defaultValue={ticket?.notes ?? ""} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{ticket ? "Save changes" : "Create ticket"}</SubmitButton>
        <LinkButton to={cancelTo} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </Form>
  );
}
