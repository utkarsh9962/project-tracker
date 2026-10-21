import * as api from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Milestone } from "@/lib/types";
import { opt } from "@/lib/values";
import { ConfirmButton, Form, SubmitButton, useMutate } from "@/components/client";
import { Card, cx, DueBadge, Empty, Input } from "@/components/ui";

// One milestone line: tick it off, see its date, remove it.
export function MilestoneRow({ milestone: m }: { milestone: Milestone }) {
  const mutate = useMutate();
  return (
    <li className="flex flex-wrap items-center gap-2.5 py-2.5">
      <input
        type="checkbox"
        checked={m.done}
        aria-label={`Mark ${m.title} ${m.done ? "not done" : "done"}`}
        className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
        onChange={() => mutate(() => api.updateMilestone(m.id, { done: !m.done }))}
      />
      <span className={cx("min-w-0 flex-1 text-sm", m.done && "text-muted line-through")}>{m.title}</span>
      {m.done ? m.due_date && <span className="text-xs text-muted">{formatDate(m.due_date)}</span> : <DueBadge date={m.due_date} />}
      <ConfirmButton onConfirm={() => mutate(() => api.deleteMilestone(m.id))} />
    </li>
  );
}

export function MilestonesCard({ projectId, milestones }: { projectId: number; milestones: Milestone[] }) {
  const mutate = useMutate();
  const done = milestones.filter((m) => m.done).length;
  return (
    <Card title={milestones.length ? `Milestones (${done}/${milestones.length} reached)` : "Milestones"}>
      {milestones.length === 0 ? (
        <Empty>No milestones yet. Add the big checkpoints, like “UAT sign-off” or “Go live”.</Empty>
      ) : (
        <ul className="stagger divide-y divide-line/70">
          {milestones.map((m) => (
            <MilestoneRow key={m.id} milestone={m} />
          ))}
        </ul>
      )}
      <Form
        reset
        className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_9rem_auto]"
        onSubmit={(v) => mutate(() => api.createMilestone({ project_id: projectId, title: v.title, due_date: opt(v.due_date) }))}
      >
        <Input name="title" required placeholder="New milestone" aria-label="Milestone" />
        <Input name="due_date" type="date" aria-label="Milestone date" />
        <SubmitButton small>Add milestone</SubmitButton>
      </Form>
    </Card>
  );
}
