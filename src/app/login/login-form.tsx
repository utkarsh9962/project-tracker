"use client";

import { use, useActionState } from "react";
import { login } from "@/app/actions";
import { buttonClass, inputClass } from "@/components/ui";

export function LoginForm({ next }: { next: Promise<string> }) {
  const [state, action, pending] = useActionState(login, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={use(next)} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">Password</span>
        <input name="password" type="password" required autoFocus autoComplete="current-password" className={inputClass} />
      </label>
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button disabled={pending} className={buttonClass("primary") + " w-full"}>
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
