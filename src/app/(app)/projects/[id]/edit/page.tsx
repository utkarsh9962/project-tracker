import { notFound } from "next/navigation";
import { Suspense } from "react";
import { deleteProject, updateProject } from "@/app/actions";
import { ConfirmButton } from "@/components/client";
import { ProjectForm } from "@/components/forms/project-form";
import { ListSkeleton, PageHeader } from "@/components/ui";
import { getProject } from "@/lib/data";

export default function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <EditProject id={params.then((p) => Number(p.id))} />
    </Suspense>
  );
}

async function EditProject({ id: idPromise }: { id: Promise<number> }) {
  const id = await idPromise;
  const data = Number.isInteger(id) ? await getProject(id) : null;
  if (!data) notFound();
  return (
    <>
      <PageHeader title={`Edit ${data.project.name}`} actions={<ConfirmButton action={deleteProject.bind(null, id)} label="Delete project" small={false} />} />
      <ProjectForm action={updateProject.bind(null, id)} project={data.project} cancelHref={`/projects/${id}`} />
    </>
  );
}
