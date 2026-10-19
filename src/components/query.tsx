import { useQuery, type QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Button, Empty, ListSkeleton, LinkButton } from "./ui";

// Loads data and renders a skeleton, an error with retry, a not-found message (for null), or the content.
export function Load<T>({ queryKey, fn, children, rows }: { queryKey: QueryKey; fn: () => Promise<T>; children: (data: NonNullable<T>) => ReactNode; rows?: number }) {
  const q = useQuery({ queryKey, queryFn: fn });
  if (q.isPending) return <ListSkeleton rows={rows} />;
  if (q.isError)
    return (
      <div className="space-y-3 rounded-2xl border border-red-200 bg-surface p-5">
        <h2 className="font-semibold">Couldn’t load this</h2>
        <p className="text-sm text-muted">{q.error.message}</p>
        <Button variant="secondary" onClick={() => q.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (q.data == null) return <Missing />;
  return <>{children(q.data as NonNullable<T>)}</>;
}

export function Missing() {
  return (
    <div className="space-y-4">
      <Empty>That page doesn’t exist, or the item was deleted.</Empty>
      <LinkButton to="/" variant="secondary">
        Back to dashboard
      </LinkButton>
    </div>
  );
}
