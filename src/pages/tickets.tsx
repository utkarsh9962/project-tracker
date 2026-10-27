import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import * as api from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { PRIORITIES, TICKET_STATUSES, TICKET_TYPES, ticketType, type TicketStatus } from "@/lib/types";
import { AutoSubmitSelect, ConfirmButton, useMutate } from "@/components/client";
import { ResourcesCard } from "@/components/forms/resources";
import { TicketForm } from "@/components/forms/ticket-form";
import { Load } from "@/components/query";
import { ProjectSlicers, Slicer, useProjectFilter } from "@/components/slicers";
import { Badge, Card, cx, DueBadge, Empty, inputClass, LinkButton, PageHeader, safeHref, useTitle } from "@/components/ui";

const STATUS_OPTIONS = [...TICKET_STATUSES.map((s) => ({ value: s, label: humanize(s) })), { value: "all", label: "Everything" }];
const PRIORITY_OPTIONS = [...PRIORITIES].reverse().map((p) => ({ value: p, label: humanize(p) }));
const TICKET_KEYS = ["type", "status", "priority", "client"];

export function Tickets() {
  useTitle("Tickets");
  // Ticket status uses ?status, so the project-status filter is not offered here.
  const filter = useProjectFilter({ statusKey: "project_status" });
  const type = filter.get("type");
  const status = filter.get("status");
  const priority = filter.get("priority");
  const client = filter.get("client");
  const q = filter.get("q");
  const mutate = useMutate();

  return (
    <>
      <PageHeader title="Tickets" subtitle="ZSTs and other JIRA tickets (NET, WP, MOB, CCMS, CMS…) tied to your projects." actions={<LinkButton to="/tickets/new">New ticket</LinkButton>} />
      <input
        type="search"
        defaultValue={q}
        onChange={(e) => filter.set("q", e.target.value)}
        placeholder="Search by key, summary or client…"
        aria-label="Search tickets"
        className={cx(inputClass, "mb-3")}
      />
      <Load queryKey={["tickets", "all"]} fn={() => api.listTickets({ status: "all", q: "" })}>
        {(all) => {
          const needle = q.trim().toLowerCase();
          const types = [...new Set([...TICKET_TYPES, ...all.map((t) => ticketType(t.key))])];
          const clients = [...new Set(all.map((t) => t.client).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b));
          const rows = all.filter(
            (t) =>
              (!type || ticketType(t.key) === type) &&
              (status === "all" || (status ? t.status === status : api.isOpenTicket(t))) &&
              (!priority || t.priority === priority) &&
              (!client || t.client === client) &&
              filter.keep(t.project_id) &&
              (!needle || [t.key, t.title, t.client].some((v) => v?.toLowerCase().includes(needle))),
          );
          return (
            <>
              <ProjectSlicers filter={filter} showStatus={false} extraKeys={TICKET_KEYS}>
                <Slicer label="Type" value={type} options={types.map((t) => ({ value: t, label: t }))} onChange={(v) => filter.set("type", v)} />
                <Slicer label="Status" value={status} allLabel="All unresolved" options={STATUS_OPTIONS} onChange={(v) => filter.set("status", v)} />
                <Slicer label="Priority" value={priority} options={PRIORITY_OPTIONS} onChange={(v) => filter.set("priority", v)} />
                <Slicer label="Client" value={client} options={clients.map((c) => ({ value: c, label: c }))} onChange={(v) => filter.set("client", v)} />
              </ProjectSlicers>
              <TicketList rows={rows} mutate={mutate} />
            </>
          );
        }}
      </Load>
    </>
  );
}

function TicketList({ rows, mutate }: { rows: Awaited<ReturnType<typeof api.listTickets>>; mutate: ReturnType<typeof useMutate> }) {
  return rows.length === 0 ? (
    <Empty>No tickets match.</Empty>
  ) : (
    <ul className="stagger divide-y divide-line/70 overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-xs">
      {rows.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
          <Link to={`/tickets/${t.id}`} className="flex min-w-0 flex-1 basis-64 items-center gap-3 hover:opacity-80">
            <span className="w-24 shrink-0 font-mono text-xs">{t.key}</span>
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
  );
}

export function NewTicket() {
  useTitle("New ticket");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mutate = useMutate();
  const project = params.get("project");
  return (
    <>
      <PageHeader title="New ticket" />
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
          ← Tickets
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
              <a href={jira} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-medium transition hover:bg-hover">
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
