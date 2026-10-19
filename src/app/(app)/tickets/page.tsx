import Link from "next/link";
import { Suspense } from "react";
import { setTicketStatus } from "@/app/actions";
import { TICKET_STATUSES } from "@/db/schema";
import { AutoSubmitSelect } from "@/components/client";
import { Badge, cx, DueBadge, Empty, inputClass, LinkButton, ListSkeleton, PageHeader } from "@/components/ui";
import { listTickets } from "@/lib/data";
import { humanize } from "@/lib/format";

export const metadata = { title: "ZST tickets" };

const FILTERS = ["active", ...TICKET_STATUSES, "all"] as const;

export default function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  const filter = searchParams.then((p) => ({
    status: typeof p.status === "string" ? p.status : "active",
    q: typeof p.q === "string" ? p.q : "",
  }));
  return (
    <>
      <PageHeader title="ZST tickets" subtitle="Support queries on live clients." actions={<LinkButton href="/tickets/new">New ZST</LinkButton>} />
      <Suspense fallback={<ListSkeleton />}>
        <TicketList filter={filter} />
      </Suspense>
    </>
  );
}

async function TicketList({ filter: filterPromise }: { filter: Promise<{ status: string; q: string }> }) {
  const filter = await filterPromise;
  const rows = await listTickets(filter);
  const href = (status: string) => `/tickets?${new URLSearchParams({ status, ...(filter.q ? { q: filter.q } : {}) })}`;
  return (
    <>
      <form className="mb-3">
        <input type="hidden" name="status" value={filter.status} />
        <input name="q" type="search" defaultValue={filter.q} placeholder="Filter by key, summary or client…" aria-label="Filter tickets" className={inputClass} />
      </form>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((s) => (
          <Link
            key={s}
            href={href(s)}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
              s === filter.status ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:text-fg",
            )}
          >
            {s === "active" ? "All unresolved" : humanize(s)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>No tickets match.</Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          {rows.map(({ ticket: t, projectName }) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
              <Link href={`/tickets/${t.id}`} className="flex min-w-0 flex-1 basis-64 items-center gap-3 hover:opacity-80">
                <span className="w-20 shrink-0 font-mono text-xs">{t.key}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block truncate text-xs text-muted">{[t.client, projectName].filter(Boolean).join(" · ") || "No client"}</span>
                </span>
              </Link>
              <div className="flex items-center gap-1.5">
                <Badge value={t.priority} />
                {t.status !== "resolved" && t.status !== "closed" && <DueBadge date={t.dueDate} />}
                <AutoSubmitSelect action={setTicketStatus.bind(null, t.id)} name="status" value={t.status} options={TICKET_STATUSES} label={`Status of ${t.key}`} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
