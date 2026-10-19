import { Link } from "react-router";
import { PageHeader, useTitle } from "@/components/ui";

const OPTIONS = [
  { to: "/projects/new", title: "Project", text: "A piece of work with a client, deadline, team and tasks." },
  { to: "/tickets/new", title: "ZST ticket", text: "A support query on a live client, linked to JIRA." },
  { to: "/people", title: "Person", text: "Someone you assign to projects." },
];

export function NewMenu() {
  useTitle("Add something");
  return (
    <>
      <PageHeader title="Add something" />
      <ul className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <li key={o.to}>
            <Link to={o.to} className="block h-full rounded-xl border border-line bg-surface p-4 shadow-sm hover:bg-hover">
              <div className="font-medium">{o.title}</div>
              <p className="mt-1 text-sm text-muted">{o.text}</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">Tasks, people assignments and links are added from a project or ticket page.</p>
    </>
  );
}
