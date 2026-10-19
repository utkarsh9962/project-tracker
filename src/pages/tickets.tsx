import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import * as api from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { TICKET_STATUSES, type TicketStatus } from "@/lib/types";
import { AutoSubmitSelect, ConfirmButton, useMutate } from "@/components/client";
import { ResourcesCard } from "@/components/forms/resources";
import { TicketForm } from "@/components/forms/ticket-form";
import { Load } from "@/components/query";
import { Badge, Card, cx, DueBadge, Empty, inputClass, LinkButton, PageHeader, safeHref, useTitle } from "@/components/ui";

const FILTERS = ["active", ...TICKET_STATUSES, "all"] as const;

export function Tickets() {
  useTitle("ZST tickets");
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "active";
  const q = params.get("q") ?? "";
  const mutate = useMutate();
  const setFilter = (next: { status?: string; q?: string }) => {
    const merged = { status, q, ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([k, v]) => v && !(k === "status" && v === "active"))), { replace: true });
  };

  return (
    <>
      <PageHeader title="ZST tickets" subtitle="Support queries on live clients." actions={<LinkButton to="/tickets/new">New ZST</LinkButton>} />
      <input
        type="search"
        defaultValue={q}
        onChange={(e) => setFilter({ q: e.target.value })}
        placeholder="Filter by key, summary or client…"
        aria-label="Filter tickets"
        className={cx(inputClass, "mb-3")}
      />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter({ status: s })}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
              s === status ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:text-fg",
            )}
          >
            {s === "active" ? "All unresolved" : humanize(s)}
          </button>
        ))}
      </div>
      <Load queryKey={["tickets", status, q]} fn={() => api.listTickets({ status, q })}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>No tickets match.</Empty>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
              {rows.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                  <Link to={`/tickets/${t.id}`} className="flex min-w-0 flex-1 basis-64 items-center gap-3 hover:opacity-80">
                    <span className="w-20 shrink-0 font-mono text-xs">{t.key}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="block truncate text-xs text-muted">{[t.client, t.project?.name].filter(Boolean).join(" · ") || "No client"}</span>
                    </span>
                  </Link>
                  <div className="flex items-center gap-1.5">
                    <Badge value={t.priority} />
                    {api.isOpenTicket(t) && <DueBadge date={t.due_date} />}
                    <AutoSubmitSelect
                      value={t.status}
                      options={TICKET_STATUSES}
                      label={`Status of ${t.key}`}
                      onChange={(s) => mutate(() => api.updateTicket(t.id, { status: s as TicketStatus }))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Load>
    </>
  );
}

export function NewTicket() {
  useTitle("New ZST");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mutate = useMutate();
  const project = params.get("project");
  return (
    <>
      <PageHeader title="New ZST ticket" />
      <Load queryKey={["project-options"]} fn={api.projectOptions}>
        {(projects) => (
          <TicketForm
            projects={projects}
            defaultProjectId={project ? Number(project) : undefined}
            cancelTo="/tickets"
            onSave={async (v) => {
              let id = 0;
              await mutate(async () => (id = (await api.createTicket(v)).id));
              navigate(`/tickets/${id}`);
            }}
          />
        )}
      </Load>
    </>
  );
}

export function EditTicket() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const mutate = useMutate();
  return (
    <Load queryKey={["ticket-edit", id]} fn={() => Promise.all([api.getTicket(id), api.projectOptions()]).then(([t, p]) => (t ? { ...t, projects: p } : null))}>
      {({ ticket, projects }) => (
        <>
          <PageHeader
            title={`Edit ${ticket.key}`}
            actions={
              <ConfirmButton
                label="Delete ticket"
                small={false}
                onConfirm={async () => {
                  await api.deleteTicket(id);
                  navigate("/tickets");
                  await mutate(async () => {});
                }}
              />
            }
          />
          <TicketForm
            ticket={ticket}
            projects={projects}
            cancelTo={`/tickets/${id}`}
            onSave={async (v) => {
              await mutate(() => api.updateTicket(id, v));
              navigate(`/tickets/${id}`);
            }}
          />
        </>
      )}
    </Load>
  );
}

export function TicketDetail() {
  const id = Number(useParams().id);
  return (
    <Load queryKey={["ticket", id]} fn={() => api.getTicket(id)} rows={4}>
      {(data) => <TicketBody {...data} />}
    </Load>
  );
}

function TicketBody({ ticket: t, resources }: NonNullable<Awaited<ReturnType<typeof api.getTicket>>>) {
  useTitle(t.key);
  const mutate = useMutate();
  const jira = safeHref(t.url);
  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/tickets" className="text-muted hover:text-fg">
          ← ZST tickets
        </Link>
      </div>
      <PageHeader
        title={
          <>
            <span className="font-mono text-lg text-muted">{t.key}</span> {t.title}
          </>
        }
        subtitle={[t.client, `Updated ${formatDate(t.updated_at.slice(0, 10))}`].filter(Boolean).join(" · ")}
        actions={
          <>
            {jira && (
              <a href={jira} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-hover">
                Open in JIRA ↗
              </a>
            )}
            <LinkButton to={`/tickets/${t.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <AutoSubmitSelect value={t.status} options={TICKET_STATUSES} label="Ticket status" onChange={(s) => mutate(() => api.updateTicket(t.id, { status: s as TicketStatus }))} />
              <Badge value={t.priority} label={`${humanize(t.priority)} priority`} />
              {api.isOpenTicket(t) && <DueBadge date={t.due_date} />}
              {t.project_id && t.project && (
                <Link to={`/projects/${t.project_id}`} className="text-sm text-accent hover:underline">
                  {t.project.name}
                </Link>
              )}
            </div>
            {t.notes ? <p className="mt-4 whitespace-pre-wrap text-sm">{t.notes}</p> : <p className="mt-4 text-sm text-muted">No notes yet.</p>}
          </Card>
        </div>
        <ResourcesCard resources={resources} target={{ project_id: null, ticket_id: t.id }} />
      </div>
    </>
  );
}
