import { addResource, deleteResource } from "@/app/actions";
import { RESOURCE_KINDS, type Resource } from "@/db/schema";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { Badge, Card, Empty, Input, Select, safeHref } from "@/components/ui";
import { formatDate } from "@/lib/format";

// Links, docs, Slack threads, emails and notes attached to a project or ticket.
export function ResourcesCard({ resources, target }: { resources: Resource[]; target: { projectId?: number; ticketId?: number } }) {
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
                  <p className="mt-0.5 text-[11px] text-muted">Added {formatDate(r.createdAt.toISOString().slice(0, 10))}</p>
                </div>
                <ConfirmButton action={deleteResource.bind(null, r.id)} label="Remove" />
              </li>
            );
          })}
        </ul>
      )}
      <form action={addResource.bind(null, target)} className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_8rem]">
        <Input name="title" required placeholder="Title, e.g. Requirements doc" aria-label="Title" />
        <Select name="kind" options={RESOURCE_KINDS} aria-label="Type" />
        <Input name="url" placeholder="Link (optional)" aria-label="Link" className="sm:col-span-2" />
        <Input name="notes" placeholder="Note (optional)" aria-label="Note" className="sm:col-span-2" />
        <div>
          <SubmitButton small>Add</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
