import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteTicket, updateTicket } from "@/app/actions";
import { ConfirmButton } from "@/components/client";
import { TicketForm } from "@/components/forms/ticket-form";
import { ListSkeleton, PageHeader } from "@/components/ui";
import { getTicket, projectOptions } from "@/lib/data";

export default function EditTicketPage({ params }: PageProps<"/tickets/[id]/edit">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <EditTicket id={params.then((p) => Number(p.id))} />
    </Suspense>
  );
}

async function EditTicket({ id: idPromise }: { id: Promise<number> }) {
  const id = await idPromise;
  const [data, projects] = await Promise.all([Number.isInteger(id) ? getTicket(id) : null, projectOptions()]);
  if (!data) notFound();
  return (
    <>
      <PageHeader title={`Edit ${data.ticket.key}`} actions={<ConfirmButton action={deleteTicket.bind(null, id)} label="Delete ticket" small={false} />} />
      <TicketForm action={updateTicket.bind(null, id)} ticket={data.ticket} projects={projects} cancelHref={`/tickets/${id}`} />
    </>
  );
}
