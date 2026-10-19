import Link from "next/link";
import { PageHeader } from "@/components/ui";

const OPTIONS = [
  { href: "/projects/new", title: "Project", text: "A piece of work with a client, deadline, team and tasks." },
  { href: "/tickets/new", title: "ZST ticket", text: "A support query on a live client, linked to JIRA." },
  { href: "/people#add", title: "Person", text: "Someone you assign to projects." },
];

export default function NewPage() {
  return (
    <>
      <PageHeader title="Add something" />
      <ul className="grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <li key={o.href}>
            <Link href={o.href} className="block h-full rounded-xl border border-line bg-surface p-4 shadow-sm hover:bg-hover">
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
