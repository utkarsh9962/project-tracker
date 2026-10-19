import { Link } from "react-router";
import { Load } from "@/components/query";
import { Badge, Card, DueBadge, Empty, LinkButton, PageHeader, Progress, useTitle } from "@/components/ui";
import { getDashboard } from "@/lib/api";

export function Dashboard() {
  useTitle("");
  return (
    <>
      <PageHeader title="Dashboard" subtitle="What needs your attention across projects and ZSTs." />
      <Load queryKey={["dashboard"]} fn={getDashboard} rows={6}>
        {(data) => <DashboardBody {...data} />}
      </Load>
    </>
  );
}

function Stat({ label, value, href, alert }: { label: string; value: number; href?: string; alert?: boolean }) {
  const className = "rounded-2xl border border-line/80 bg-surface p-5 text-left shadow-xs transition duration-200 ease-(--ease-out) hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-900/5";
  const body = (
    <>
      <div className={alert && value > 0 ? "text-2xl font-semibold text-red-600 dark:text-red-400" : "text-2xl font-semibold"}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </>
  );
  if (href)
    return (
      <Link to={href} className={className}>
        {body}
      </Link>
    );
  // Hash routing owns the URL fragment, so in-page jumps scroll by hand.
  return (
    <button type="button" className={className} onClick={() => document.getElementById("deadlines")?.scrollIntoView({ behavior: "smooth" })}>
      {body}
    </button>
  );
}

function DashboardBody({ stats, deadlines, openTickets, activeProjects }: Awaited<ReturnType<typeof getDashboard>>) {
  const isEmpty = activeProjects.length === 0 && openTickets.length === 0;

  return (
    <div className="space-y-5">
      <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Active projects" value={stats.activeProjects} href="/projects?status=active" />
        <Stat label="Open ZSTs" value={stats.openTickets} href="/tickets" />
        <Stat label="Overdue" value={stats.overdue} alert />
        <Stat label="Due in 7 days" value={stats.dueThisWeek} />
      </div>

      {isEmpty && (
        <Card>
          <div className="space-y-3 py-4 text-center">
            <p className="text-sm text-muted">Nothing here yet. Start by adding a project or a ZST.</p>
            <div className="flex justify-center gap-2">
              <LinkButton to="/projects/new">New project</LinkButton>
              <LinkButton to="/tickets/new" variant="secondary">New ZST</LinkButton>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Deadlines">
          <div id="deadlines" className="scroll-mt-20" />
          {deadlines.length === 0 ? (
            <Empty>Nothing overdue or due in the next 7 days.</Empty>
          ) : (
            <ul className="stagger divide-y divide-line/70">
              {deadlines.map((d) => (
                <li key={`${d.kind}-${d.id}`}>
                  <Link to={d.href} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <span className="w-14 shrink-0 text-xs text-muted">{d.kind}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{d.title}</span>
                      {d.context && <span className="block truncate text-xs text-muted">{d.context}</span>}
                    </span>
                    <DueBadge date={d.due} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Open ZSTs${stats.urgentTickets ? ` · ${stats.urgentTickets} urgent` : ""}`} actions={<Link to="/tickets" className="text-xs text-accent">All tickets</Link>}>
          {openTickets.length === 0 ? (
            <Empty>No open tickets.</Empty>
          ) : (
            <ul className="stagger divide-y divide-line/70">
              {openTickets.slice(0, 8).map((ticket) => (
                <li key={ticket.id}>
                  <Link to={`/tickets/${ticket.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <span className="w-20 shrink-0 font-mono text-xs">{ticket.key}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{ticket.title}</span>
                      <span className="block truncate text-xs text-muted">{[ticket.client, ticket.project?.name].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Badge value={ticket.priority} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Active projects" actions={<Link to="/projects" className="text-xs text-accent">All projects</Link>}>
        {activeProjects.length === 0 ? (
          <Empty>No active projects.</Empty>
        ) : (
          <ul className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeProjects.map((p) => (
              <li key={p.id}>
                <Link to={`/projects/${p.id}`} className="block rounded-xl border border-line/80 p-3.5 transition duration-200 hover:border-slate-300 hover:bg-hover">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      {p.client && <div className="truncate text-xs text-muted">{p.client}</div>}
                    </div>
                    <Badge value={p.status} />
                  </div>
                  <div className="mt-3">
                    <Progress value={p.progress} />
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <Badge value={p.priority} />
                    <DueBadge date={p.due_date} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
