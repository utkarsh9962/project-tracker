import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { setTicketStatus } from "@/app/actions";
import { TICKET_STATUSES } from "@/db/schema";
import { AutoSubmitSelect } from "@/components/client";
import { ResourcesCard } from "@/components/forms/resources";
import { Badge, Card, DueBadge, LinkButton, ListSkeleton, PageHeader, safeHref } from "@/components/ui";
import { getTicket } from "@/lib/data";
import { formatDate } from "@/lib/format";

export default function TicketPage({ params }: PageProps<"/tickets/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <TicketDetail id={params.then((p) => Number(p.id))} />
    </Suspense>
  );
}

async function TicketDetail({ id: idPromise }: { id: Promise<number> }) {
  const id = await idPromise;
  const data = Number.isInteger(id) ? await getTicket(id) : null;
  if (!data) notFound();
  const { ticket: t, projectName, resources } = data;
  const jira = safeHref(t.url);

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/tickets" className="text-muted hover:text-fg">
          ← ZST tickets
        </Link>
      </div>
      <PageHeader
        title={
          <>
            <span className="font-mono text-lg text-muted">{t.key}</span> {t.title}
          </>
        }
        subtitle={[t.client, `Updated ${formatDate(t.updatedAt.toISOString().slice(0, 10))}`].filter(Boolean).join(" · ")}
        actions={
          <>
            {jira && (
              <a href={jira} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-hover">
                Open in JIRA ↗
              </a>
            )}
            <LinkButton href={`/tickets/${t.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <AutoSubmitSelect action={setTicketStatus.bind(null, t.id)} name="status" value={t.status} options={TICKET_STATUSES} label="Ticket status" />
              <Badge value={t.priority} label={`${t.priority[0].toUpperCase()}${t.priority.slice(1)} priority`} />
              {t.status !== "resolved" && t.status !== "closed" && <DueBadge date={t.dueDate} />}
              {t.projectId && (
                <Link href={`/projects/${t.projectId}`} className="text-sm text-accent hover:underline">
                  {projectName}
                </Link>
              )}
            </div>
            {t.notes ? <p className="mt-4 whitespace-pre-wrap text-sm">{t.notes}</p> : <p className="mt-4 text-sm text-muted">No notes yet.</p>}
          </Card>
        </div>
        <ResourcesCard resources={resources} target={{ ticketId: t.id }} />
      </div>
    </>
  );
}
