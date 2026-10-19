import Link from "next/link";
import { Suspense } from "react";
import { PROJECT_STATUSES } from "@/db/schema";
import { Badge, cx, DueBadge, Empty, LinkButton, ListSkeleton, PageHeader, Progress } from "@/components/ui";
import { listProjects } from "@/lib/data";
import { humanize } from "@/lib/format";

export const metadata = { title: "Projects" };

export default function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  return (
    <>
      <PageHeader title="Projects" actions={<LinkButton href="/projects/new">New project</LinkButton>} />
      <Suspense fallback={<ListSkeleton />}>
        <ProjectList status={searchParams.then((p) => (typeof p.status === "string" ? p.status : "all"))} />
      </Suspense>
    </>
  );
}

async function ProjectList({ status: statusPromise }: { status: Promise<string> }) {
  const status = await statusPromise;
  const rows = await listProjects(status);
  return (
    <>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {["all", ...PROJECT_STATUSES].map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/projects" : `/projects?status=${s}`}
            className={cx(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
              s === status ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:text-fg",
            )}
          >
            {humanize(s)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>No projects{status !== "all" ? ` with status “${humanize(status)}”` : ""} yet.</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map(({ project: p, openTasks, openTickets }) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="block rounded-xl border border-line bg-surface p-4 shadow-sm hover:bg-hover">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    {p.client && <div className="truncate text-sm text-muted">{p.client}</div>}
                  </div>
                  <Badge value={p.status} />
                </div>
                <div className="mt-3">
                  <Progress value={p.progress} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge value={p.priority} />
                  <DueBadge date={p.dueDate} />
                  <span className="ml-auto">
                    {openTasks} open task{openTasks === 1 ? "" : "s"} · {openTickets} ZST{openTickets === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
