import { Suspense } from "react";
import { createTicket } from "@/app/actions";
import { TicketForm } from "@/components/forms/ticket-form";
import { ListSkeleton, PageHeader } from "@/components/ui";
import { projectOptions } from "@/lib/data";

export const metadata = { title: "New ZST" };

export default function NewTicketPage({ searchParams }: PageProps<"/tickets/new">) {
  return (
    <>
      <PageHeader title="New ZST ticket" />
      <Suspense fallback={<ListSkeleton />}>
        <NewTicket project={searchParams.then((p) => (typeof p.project === "string" ? Number(p.project) : undefined))} />
      </Suspense>
    </>
  );
}

async function NewTicket({ project }: { project: Promise<number | undefined> }) {
  const [projectId, projects] = await Promise.all([project, projectOptions()]);
  return <TicketForm action={createTicket} projects={projects} defaultProjectId={projectId} cancelHref="/tickets" />;
}
