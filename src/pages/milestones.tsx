import { Link } from "react-router";
import * as api from "@/lib/api";
import { MilestoneRow } from "@/components/forms/milestones";
import { Load } from "@/components/query";
import { ProjectSlicers, Slicer, useProjectFilter } from "@/components/slicers";
import { Card, Empty, PageHeader, useTitle } from "@/components/ui";

export function Milestones() {
  useTitle("Milestones");
  const filter = useProjectFilter();
  const state = filter.get("state");
  return (
    <>
      <PageHeader title="Milestones" subtitle="Every project's milestones in one place. Add them from a project page." />
      <ProjectSlicers filter={filter} statusLabel="Project status" extraKeys={["state"]}>
        <Slicer
          label="Milestones"
          value={state}
          options={[
            { value: "open", label: "Not reached" },
            { value: "done", label: "Reached" },
          ]}
          onChange={(v) => filter.set("state", v)}
        />
      </ProjectSlicers>
      <Load queryKey={["milestones"]} fn={api.listMilestones}>
        {(all) => {
          const groups = all
            .filter((g) => filter.keep(g.projectId))
            .map((g) => ({ ...g, milestones: g.milestones.filter((m) => !state || m.done === (state === "done")) }))
            .filter((g) => g.milestones.length > 0);
          if (groups.length === 0 && all.length > 0) return <Empty>No milestones match these filters.</Empty>;
          return groups.length === 0 ? (
            <Empty>
              No milestones yet. Open a{" "}
              <Link to="/projects" className="text-accent">
                project
              </Link>{" "}
              and add them in its Milestones section.
            </Empty>
          ) : (
            <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-2">
              {groups.map((g) => {
                const done = g.milestones.filter((m) => m.done).length;
                return (
                  <Card
                    key={g.projectId}
                    title={
                      <Link to={`/projects/${g.projectId}`} className="hover:text-accent">
                        {g.name}
                      </Link>
                    }
                    actions={
                      <span className="text-xs text-muted">
                        {done}/{g.milestones.length} reached
                      </span>
                    }
                  >
                    <ul className="divide-y divide-line/70">
                      {g.milestones.map((m) => (
                        <MilestoneRow key={m.id} milestone={m} />
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          );
        }}
      </Load>
    </>
  );
}
