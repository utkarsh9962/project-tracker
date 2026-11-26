import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import * as api from "@/lib/api";
import { matches } from "@/lib/search";
import { formatDate, humanize } from "@/lib/format";
import { PRIORITIES, TICKET_STATUSES, TICKET_TYPES, ticketType, type Priority, type TicketStatus } from "@/lib/types";
import { BulkBar, BulkDate, BulkSelect, RowCheck, useSelection } from "@/components/bulk";
import { AutoSubmitSelect, ConfirmButton, useMutate } from "@/components/client";
import { HistoryCard } from "@/components/history";
import { ScreenshotsCard } from "@/components/screenshots";
import { ResourcesCard } from "@/components/forms/resources";
import { TicketForm } from "@/components/forms/ticket-form";
import { Load } from "@/components/query";
import { ProjectSlicers, Slicer, useProjectFilter } from "@/components/slicers";
import { Badge, Card, cx, DueBadge, Empty, inputClass, LinkButton, PageHeader, safeHref, useTitle } from "@/components/ui";

const STATUS_OPTIONS = [...TICKET_STATUSES.map((s) => ({ value: s, label: humanize(s) })), { value: "all", label: "Everything" }];
const PRIORITY_OPTIONS = [...PRIORITIES].reverse().map((p) => ({ value: p, label: humanize(p) }));
const TICKET_KEYS = ["type", "status", "priority", "client", "person", "quiet"];

export function Tickets() {
  useTitle("Tickets");
  // Ticket status uses ?status, so the project-status filter is not offered here.
  const filter = useProjectFilter({ statusKey: "project_status" });
  const type = filter.get("type");
  const status = filter.get("status");
  const priority = filter.get("priority");
  const client = filter.get("client");
  const person = Number(filter.get("person")) || 0;
  const quiet = filter.get("quiet");
  const q = filter.get("q");
  const mutate = useMutate();

  return (
    <>
      <PageHeader title="Tickets" subtitle="ZSTs and other JIRA tickets (NET, WP, MOB, CCMS, CMS…) tied to your projects." 
        actions={
          <>
            <LinkButton to="/import" variant="secondary">
              Import from Jira
            </LinkButton>
            <LinkButton to="/tickets/new">New ticket</LinkButton>
          </>
        }
      />
      <input
        type="search"
        defaultValue={q}
        onChange={(e) => filter.set("q", e.target.value)}
        placeholder="Search by key, summary, client, project or person…"
        aria-label="Search tickets"
        className={cx(inputClass, "mb-3")}
      />
      <Load queryKey={["tickets", "all"]} fn={() => api.listTickets({ status: "all", q: "" })}>
        {(all) => {
          const types = [...new Set([...TICKET_TYPES, ...all.map((t) => ticketType(t.key))])];
          const clients = [...new Set(all.map((t) => t.client).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b));
          const people = [...new Map(all.flatMap((t) => t.people).map((p) => [p.id, p.name]))].sort((a, b) => a[1].localeCompare(b[1]));
          const rows = all.filter(
            (t) =>
              (!type || ticketType(t.key) === type) &&
              (status === "all" || (status ? t.status === status : api.isOpenTicket(t))) &&
              (!priority || t.priority === priority) &&
              (!client || t.client === client) &&
              (!person || t.people.some((p) => p.id === person)) &&
              (!quiet || api.quietTicketDays(t) > 0) &&
              filter.keep(t.project_id) &&
              matches(q, t.key, t.title, t.client, t.project?.name, ...t.people.map((p) => p.name)),
          );
          return (
            <>
              <ProjectSlicers filter={filter} showStatus={false} extraKeys={TICKET_KEYS}>
                <Slicer label="Type" value={type} options={types.map((t) => ({ value: t, label: t }))} onChange={(v) => filter.set("type", v)} />
                <Slicer label="Status" value={status} allLabel="All unresolved" options={STATUS_OPTIONS} onChange={(v) => filter.set("status", v)} />
                <Slicer label="Priority" value={priority} options={PRIORITY_OPTIONS} onChange={(v) => filter.set("priority", v)} />
                <Slicer label="Client" value={client} options={clients.map((c) => ({ value: c, label: c }))} onChange={(v) => filter.set("client", v)} />
                <Slicer label="Person" value={person} options={people.map(([id, name]) => ({ value: String(id), label: name }))} onChange={(v) => filter.set("person", v)} />
                <Slicer label="Activity" value={quiet} options={[{ value: "1", label: "Gone quiet" }]} onChange={(v) => filter.set("quiet", v)} />
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
  const selection = useSelection(rows.map((t) => t.id));
  if (rows.length === 0) return <Empty>No tickets match.</Empty>;
  return (
    <>
      <label className="mb-2 flex w-fit cursor-pointer items-center gap-2 px-4 text-xs text-muted">
        <RowCheck checked={selection.all} onChange={() => selection.setAll(!selection.all)} label="Select all tickets shown" />
        Select all {rows.length} shown, to change them together
      </label>
      <TicketRows rows={rows} mutate={mutate} selection={selection} />
      <BulkBar count={selection.ids.length} noun="ticket" onClear={selection.clear}>
        <BulkSelect label="Set status" options={TICKET_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} onPick={(v) => mutate(() => api.updateTickets(selection.ids, { status: v as TicketStatus }))} />
        <BulkSelect label="Set priority" options={PRIORITY_OPTIONS} onPick={(v) => mutate(() => api.updateTickets(selection.ids, { priority: v as Priority }))} />
        <Load queryKey={["people-options"]} fn={api.peopleOptions} rows={0}>
          {(people) => <BulkSelect label="Assign to" options={people.map((p) => ({ value: p.id, label: p.name }))} onPick={(v) => mutate(() => api.assignTickets(selection.ids, Number(v)))} />}
        </Load>
        <Load queryKey={["project-options"]} fn={api.projectOptions} rows={0}>
          {(projects) => (
            <BulkSelect
              label="Link to project"
              options={[...projects.map((p) => ({ value: p.id, label: p.name })), { value: "none", label: "No project" }]}
              onPick={(v) => mutate(() => api.updateTickets(selection.ids, { project_id: v === "none" ? null : Number(v) }))}
            />
          )}
        </Load>
        <BulkDate label="Due" onPick={(due_date) => mutate(() => api.updateTickets(selection.ids, { due_date }))} />
      </BulkBar>
    </>
  );
}

function TicketRows({ rows, mutate, selection }: { rows: Awaited<ReturnType<typeof api.listTickets>>; mutate: ReturnType<typeof useMutate>; selection: ReturnType<typeof useSelection> }) {
  return (
    <ul className="stagger divide-y divide-line/70 overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-xs">
      {rows.map((t) => (
        <li key={t.id} className={cx("flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3", selection.has(t.id) && "bg-accent/5")}>
          <RowCheck checked={selection.has(t.id)} onChange={() => selection.toggle([t.id])} label={`Select ${t.key}`} />
          <Link to={`/tickets/${t.id}`} className="flex min-w-0 flex-1 basis-64 items-center gap-3 hover:opacity-80">
            <span className="w-24 shrink-0 font-mono text-xs">{t.key}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{t.title}</span>
              <span className="block truncate text-xs text-muted">
                {[t.client, t.project?.name].filter(Boolean).join(" · ") || "No client"}
                {t.people.length > 0 && <span className="text-accent-strong"> · {t.people.map((p) => p.name).join(", ")}</span>}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            {api.quietTicketDays(t) > 0 && <Badge value="soon" label={`Quiet ${api.quietTicketDays(t)}d`} />}
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

function TicketBody({ ticket: t, resources, attachments, people, links }: NonNullable<Awaited<ReturnType<typeof api.getTicket>>>) {
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
          <TicketPeopleCard ticketId={t.id} people={people} />
          <LinkedTicketsCard ticketUrl={t.url} links={links} />
          <ScreenshotsCard items={attachments} target={{ project_id: null, task_id: null, ticket_id: t.id }} />
        </div>
        <div className="min-w-0 space-y-5">
          <ResourcesCard resources={resources} target={{ project_id: null, ticket_id: t.id }} />
          <HistoryCard ticketId={t.id} />
        </div>
      </div>
    </>
  );
}

// The Jira tickets linked to this one: the ZST support ticket an internal ticket serves, the RM release it ships in,
// and, on a ZST, the internal work done for it. Ones in the tracker open here; others open in Jira.
const LINK_GROUPS: { label: string; test: (key: string) => boolean }[] = [
  { label: "Support tickets (ZST)", test: (k) => ticketType(k) === "ZST" },
  { label: "Releases (RM)", test: (k) => ticketType(k) === "RM" },
  { label: "Internal work", test: (k) => ticketType(k) !== "ZST" && ticketType(k) !== "RM" },
];
function LinkedTicketsCard({ ticketUrl, links }: { ticketUrl: string | null; links: { to: api.LinkedTicket[]; from: api.LinkedTicket[] } }) {
  const all = [...links.to, ...links.from];
  if (all.length === 0) return null;
  const site = ticketUrl?.match(/^(https:\/\/[^/]+)\/browse\//)?.[1] ?? null;
  return (
    <Card title="Linked in Jira">
      <div className="space-y-4">
        {LINK_GROUPS.map(({ label, test }) => {
          const items = all.filter((l) => test(l.key));
          if (items.length === 0) return null;
          return (
            <div key={label}>
              <div className="mb-1 text-xs text-muted">{label}</div>
              <ul className="space-y-1">
                {items.map((l) => (
                  <li key={l.key} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 font-mono text-xs">{l.key}</span>
                    {l.ticket ? (
                      <Link to={`/tickets/${l.ticket.id}`} className="min-w-0 flex-1 truncate hover:underline">
                        {l.ticket.title}
                      </Link>
                    ) : site ? (
                      <a href={`${site}/browse/${l.key}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-muted hover:underline">
                        Open in Jira ↗
                      </a>
                    ) : (
                      <span className="flex-1 text-muted">Not in the tracker</span>
                    )}
                    {l.ticket && <Badge value={l.ticket.status} />}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Who is working on a ticket. Picking a name assigns them; it then shows under "Working on tickets" on their People card.
function TicketPeopleCard({ ticketId, people }: { ticketId: number; people: { id: number; name: string; role: string | null }[] }) {
  const mutate = useMutate();
  return (
    <Card title="Working on this">
      {people.length === 0 ? (
        <p className="text-sm text-muted">No one is assigned yet.</p>
      ) : (
        <ul className="stagger divide-y divide-line/70">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <Link to={`/people/${p.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                {p.role && <span className="block truncate text-xs text-muted">{p.role}</span>}
              </Link>
              <ConfirmButton label="Remove" onConfirm={() => mutate(() => api.unassignTicket(ticketId, p.id))} />
            </li>
          ))}
        </ul>
      )}
      <Load queryKey={["people-options"]} fn={api.peopleOptions} rows={1}>
        {(everyone) => {
          const others = everyone.filter((x) => !people.some((p) => p.id === x.id));
          if (everyone.length === 0)
            return (
              <p className="mt-3 text-xs text-muted">
                <Link to="/people" className="text-accent">
                  Add people
                </Link>{" "}
                to assign them here.
              </p>
            );
          return (
            others.length > 0 && (
              <select
                value=""
                aria-label="Assign a person"
                className="mt-3 cursor-pointer rounded-full border border-dashed border-line bg-transparent px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
                onChange={(e) => e.target.value && mutate(() => api.assignTicket({ ticket_id: ticketId, person_id: Number(e.target.value) }))}
              >
                <option value="">+ Assign a person</option>
                {others.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )
          );
        }}
      </Load>
    </Card>
  );
}
