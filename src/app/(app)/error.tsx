"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-red-300 bg-surface p-4 dark:border-red-800">
      <h2 className="font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted">{process.env.NODE_ENV === "development" && error.message
          ? error.message
          : "That couldn’t be saved. Check the fields (links should look like https://…) and try again."}</p>
      <Button variant="secondary" onClick={reset}>Try again</Button>
    </div>
  );
}
