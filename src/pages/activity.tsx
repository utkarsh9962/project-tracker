import { HistoryList } from "@/components/history";
import { Card, PageHeader, useTitle } from "@/components/ui";

export function ActivityPage() {
  useTitle("All changes");
  return (
    <>
      <PageHeader title="All changes" subtitle="Who changed what across projects, tasks, milestones and tickets, newest first." />
      <Card>
        <HistoryList pageSize={40} context />
      </Card>
    </>
  );
}
