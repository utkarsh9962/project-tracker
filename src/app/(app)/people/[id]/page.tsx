import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deletePerson, updatePerson } from "@/app/actions";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { Field, Input, LinkButton, ListSkeleton, PageHeader, Textarea } from "@/components/ui";
import { getPerson } from "@/lib/data";

export default function PersonPage({ params }: PageProps<"/people/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <EditPerson id={params.then((p) => Number(p.id))} />
    </Suspense>
  );
}

async function EditPerson({ id: idPromise }: { id: Promise<number> }) {
  const id = await idPromise;
  const person = Number.isInteger(id) ? await getPerson(id) : null;
  if (!person) notFound();
  return (
    <>
      <PageHeader title={`Edit ${person.name}`} actions={<ConfirmButton action={deletePerson.bind(null, id)} label="Delete person" small={false} />} />
      <form action={updatePerson.bind(null, id)} className="grid max-w-xl gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm">
        <Field label="Name">
          <Input name="name" required defaultValue={person.name} />
        </Field>
        <Field label="Role">
          <Input name="role" defaultValue={person.role ?? ""} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={person.email ?? ""} />
        </Field>
        <Field label="Notes">
          <Textarea name="notes" defaultValue={person.notes ?? ""} />
        </Field>
        <div className="flex gap-2">
          <SubmitButton>Save changes</SubmitButton>
          <LinkButton href="/people" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </>
  );
}
