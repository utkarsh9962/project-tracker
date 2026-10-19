import { createProject } from "@/app/actions";
import { ProjectForm } from "@/components/forms/project-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <>
      <PageHeader title="New project" />
      <ProjectForm action={createProject} cancelHref="/projects" />
    </>
  );
}
