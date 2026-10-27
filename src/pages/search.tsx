import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import * as api from "@/lib/api";
import { Load } from "@/components/query";
import { Badge, Card, Empty, inputClass, PageHeader, safeHref, StatusBadge, useTitle } from "@/components/ui";

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <Card title={`${title} (${count})`}>
      <ul className="stagger divide-y divide-line/70">{children}</ul>
    </Card>
  );
}

export function Search() {
  useTitle("Search");
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const row = "flex items-center gap-3 py-2.5 hover:opacity-80";
  return (
    <>
      <PageHeader title="Search" />
      <form
        className="mb-5"
        onSubmit={(e) => {
          e.preventDefault();
          setParams({ q: String(new FormData(e.currentTarget).get("q") ?? "") });
        }}
      >
        <input key={q} name="q" type="search" defaultValue={q} autoFocus={!q} placeholder="Projects, tasks, tickets, people, links…" aria-label="Search" className={inputClass} />
      </form>
      {q && (
        <Load queryKey={["search", q]} fn={() => api.search(q)}>
          {(r) => {
            const total = r.projects.length + r.tasks.length + r.tickets.length + r.people.length + r.resources.length;
            if (total === 0) return <Empty>Nothing matches “{q}”.</Empty>;
            return (
              <div className="space-y-4">
                <Section title="Projects" count={r.projects.length}>
                  {r.projects.map((p) => (
                    <li key={p.id}>
                      <Link to={`/projects/${p.id}`} className={row}>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-muted">{p.client}</span>
                        <StatusBadge status={p.status} />
                      </Link>
                    </li>
                  ))}
                </Section>
                <Section title="Tickets" count={r.tickets.length}>
                  {r.tickets.map((t) => (
                    <li key={t.id}>
                      <Link to={`/tickets/${t.id}`} className={row}>
                        <span className="w-24 shrink-0 font-mono text-xs">{t.key}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                        <Badge value={t.status} />
                      </Link>
                    </li>
                  ))}
                </Section>
                <Section title="Tasks" count={r.tasks.length}>
                  {r.tasks.map((t) => (
                    <li key={t.id}>
                      <Link to={`/projects/${t.project_id}`} className={row}>
                        <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                        <Badge value={t.status} />
                      </Link>
                    </li>
                  ))}
                </Section>
                <Section title="People" count={r.people.length}>
                  {r.people.map((p) => (
                    <li key={p.id}>
                      <Link to={`/people/${p.id}`} className={row}>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-muted">{p.role}</span>
                      </Link>
                    </li>
                  ))}
                </Section>
                <Section title="Files, links & notes" count={r.resources.length}>
                  {r.resources.map((res) => {
                    const href = safeHref(res.url);
                    return (
                      <li key={res.id} className={row}>
                        <Badge value="low" label={res.kind.toUpperCase()} />
                        {href ? (
                          <a href={href} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-accent hover:underline">
                            {res.title}
                          </a>
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-sm">{res.title}</span>
                        )}
                        <Link to={res.project_id ? `/projects/${res.project_id}` : `/tickets/${res.ticket_id}`} className="text-xs text-muted hover:text-fg">
                          Open parent
                        </Link>
                      </li>
                    );
                  })}
                </Section>
              </div>
            );
          }}
        </Load>
      )}
    </>
  );
}
