import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Badge, Card, Empty, inputClass, ListSkeleton, PageHeader, safeHref } from "@/components/ui";
import { search } from "@/lib/data";

export const metadata = { title: "Search" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  const q = searchParams.then((p) => (typeof p.q === "string" ? p.q.trim() : ""));
  return (
    <>
      <PageHeader title="Search" />
      <Suspense fallback={<ListSkeleton />}>
        <Results q={q} />
      </Suspense>
    </>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <Card title={`${title} (${count})`}>
      <ul className="divide-y divide-line">{children}</ul>
    </Card>
  );
}

async function Results({ q: qPromise }: { q: Promise<string> }) {
  const q = await qPromise;
  const form = (
    <form className="mb-5">
      <input name="q" type="search" defaultValue={q} autoFocus={!q} placeholder="Projects, tasks, ZSTs, people, links…" aria-label="Search" className={inputClass} />
    </form>
  );
  if (!q) return form;
  const r = await search(q);
  const total = r.projects.length + r.tasks.length + r.tickets.length + r.people.length + r.resources.length;
  const row = "flex items-center gap-3 py-2.5 hover:opacity-80";
  return (
    <>
      {form}
      {total === 0 ? (
        <Empty>Nothing matches “{q}”.</Empty>
      ) : (
        <div className="space-y-4">
          <Section title="Projects" count={r.projects.length}>
            {r.projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className={row}>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted">{p.client}</span>
                  <Badge value={p.status} />
                </Link>
              </li>
            ))}
          </Section>
          <Section title="ZST tickets" count={r.tickets.length}>
            {r.tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className={row}>
                  <span className="w-20 shrink-0 font-mono text-xs">{t.key}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <Badge value={t.status} />
                </Link>
              </li>
            ))}
          </Section>
          <Section title="Tasks" count={r.tasks.length}>
            {r.tasks.map((t) => (
              <li key={t.id}>
                <Link href={`/projects/${t.projectId}`} className={row}>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <Badge value={t.status} />
                </Link>
              </li>
            ))}
          </Section>
          <Section title="People" count={r.people.length}>
            {r.people.map((p) => (
              <li key={p.id}>
                <Link href={`/people/${p.id}`} className={row}>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-muted">{p.role}</span>
                </Link>
              </li>
            ))}
          </Section>
          <Section title="Files, links & notes" count={r.resources.length}>
            {r.resources.map((res) => {
              const parent = res.projectId ? `/projects/${res.projectId}` : `/tickets/${res.ticketId}`;
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
                  <Link href={parent} className="text-xs text-muted hover:text-fg">
                    Open parent
                  </Link>
                </li>
              );
            })}
          </Section>
        </div>
      )}
    </>
  );
}
