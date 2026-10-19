import { PRIORITIES, TICKET_STATUSES, type Ticket } from "@/db/schema";
import { SubmitButton } from "@/components/client";
import { Field, Input, LinkButton, Select, Textarea } from "@/components/ui";

export function TicketForm({
  action,
  ticket,
  projects,
  defaultProjectId,
  cancelHref,
}: {
  action: (fd: FormData) => Promise<void>;
  ticket?: Ticket;
  projects: { id: number; name: string }[];
  defaultProjectId?: number;
  cancelHref: string;
}) {
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm sm:grid-cols-2">
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
          name="projectId"
          options={[{ value: "", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          defaultValue={String(ticket?.projectId ?? defaultProjectId ?? "")}
        />
      </Field>
      <Field label="Due / SLA date">
        <Input name="dueDate" type="date" defaultValue={ticket?.dueDate ?? ""} />
      </Field>
      <Field label="JIRA link" className="sm:col-span-2">
        <Input name="url" defaultValue={ticket?.url ?? ""} placeholder="https://yourcompany.atlassian.net/browse/ZST-1234" />
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <Textarea name="notes" rows={5} defaultValue={ticket?.notes ?? ""} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{ticket ? "Save changes" : "Create ticket"}</SubmitButton>
        <LinkButton href={cancelHref} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
