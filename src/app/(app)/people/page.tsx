import Link from "next/link";
import { Suspense } from "react";
import { createPerson } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Empty, Field, Input, ListSkeleton, PageHeader } from "@/components/ui";
import { listPeople } from "@/lib/data";

export const metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <>
      <PageHeader title="People" subtitle="Who is working on what." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<ListSkeleton />}>
            <PeopleList />
          </Suspense>
        </div>
        <Card title="Add a person" className="h-fit scroll-mt-20">
          <form id="add" action={createPerson} className="space-y-3">
            <Field label="Name">
              <Input name="name" required />
            </Field>
            <Field label="Role">
              <Input name="role" placeholder="e.g. Developer, QA, PM" />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" />
            </Field>
            <SubmitButton>Add person</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}

async function PeopleList() {
  const rows = await listPeople();
  if (rows.length === 0) return <Empty>No people yet. Add the people you work with, then assign them from a project page.</Empty>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map(({ person, projects }) => {
        const current = projects.filter((p) => p.status !== "done");
        return (
          <li key={person.id} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{person.name}</div>
                <div className="truncate text-sm text-muted">{[person.role, person.email].filter(Boolean).join(" · ")}</div>
              </div>
              <Link href={`/people/${person.id}`} className="text-xs text-accent">
                Edit
              </Link>
            </div>
            <div className="mt-3 text-xs text-muted">{current.length === 0 ? "Not on any open project" : `On ${current.length} open project${current.length === 1 ? "" : "s"}`}</div>
            {projects.length > 0 && (
              <ul className="mt-2 space-y-1">
                {projects.map((p) => (
                  <li key={p.projectId} className="flex items-center gap-2 text-sm">
                    <Link href={`/projects/${p.projectId}`} className="min-w-0 flex-1 truncate hover:underline">
                      {p.projectName}
                      {p.role && <span className="text-muted"> · {p.role}</span>}
                    </Link>
                    <Badge value={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
