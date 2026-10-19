import * as api from "@/lib/api";
import { formatDate } from "@/lib/format";
import { RESOURCE_KINDS, type Resource } from "@/lib/types";
import { opt, url } from "@/lib/values";
import { ConfirmButton, Form, SubmitButton, useMutate } from "@/components/client";
import { Badge, Card, Empty, Input, Select, safeHref } from "@/components/ui";

// Links, docs, Slack threads, emails and notes attached to a project or ticket.
export function ResourcesCard({ resources, target }: { resources: Resource[]; target: { project_id: number | null; ticket_id: number | null } }) {
  const mutate = useMutate();
  return (
    <Card title="Files, links & notes">
      {resources.length === 0 ? (
        <Empty>Add links to sheets, docs, PDFs, Slack threads or emails so they live with this work.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {resources.map((r) => {
            const href = safeHref(r.url);
            return (
              <li key={r.id} className="flex items-start gap-3 py-2.5">
                <Badge value="low" label={r.kind.toUpperCase()} />
                <div className="min-w-0 flex-1">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-accent hover:underline">
                      {r.title}
                    </a>
                  ) : (
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                  )}
                  {r.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{r.notes}</p>}
                  <p className="mt-0.5 text-[11px] text-muted">Added {formatDate(r.created_at.slice(0, 10))}</p>
                </div>
                <ConfirmButton onConfirm={() => mutate(() => api.deleteResource(r.id))} label="Remove" />
              </li>
            );
          })}
        </ul>
      )}
      <Form
        reset
        className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_8rem]"
        onSubmit={(v) => mutate(() => api.addResource({ ...target, title: v.title, kind: v.kind as Resource["kind"], url: url(v), notes: opt(v.notes) }))}
      >
        <Input name="title" required placeholder="Title, e.g. Requirements doc" aria-label="Title" />
        <Select name="kind" options={RESOURCE_KINDS} aria-label="Type" />
        <Input name="url" placeholder="Link (optional)" aria-label="Link" className="sm:col-span-2" />
        <Input name="notes" placeholder="Note (optional)" aria-label="Note" className="sm:col-span-2" />
        <div>
          <SubmitButton small>Add</SubmitButton>
        </div>
      </Form>
    </Card>
  );
}
