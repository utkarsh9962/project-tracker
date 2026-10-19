"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, cx, inputClass } from "./ui";
import { humanize } from "@/lib/format";

// A select that saves as soon as you pick a value (used for quick status changes).
export function AutoSubmitSelect({
  action,
  name,
  value,
  options,
  label,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
  value: string;
  options: readonly string[];
  label: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label={label}
      name={name}
      defaultValue={value}
      disabled={pending}
      className={cx(inputClass, "w-auto py-1 pr-7 text-xs", className)}
      onChange={(e) => {
        const fd = new FormData();
        fd.set(name, e.target.value);
        startTransition(() => action(fd));
      }}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {humanize(o)}
        </option>
      ))}
    </select>
  );
}

// Two-step delete so nothing disappears on a single mis-tap (and no browser dialogs).
export function ConfirmButton({ action, label = "Delete", small = true }: { action: () => Promise<void>; label?: string; small?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!armed) {
    return (
      <button type="button" className={buttonClass("ghost", small)} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex gap-1">
      <button type="button" disabled={pending} className={buttonClass("danger", small)} onClick={() => startTransition(() => action())}>
        {pending ? "Deleting…" : "Confirm"}
      </button>
      <button type="button" className={buttonClass("ghost", small)} onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}

export function SubmitButton({ children, variant = "primary", small, ...props }: ComponentProps<"button"> & { variant?: "primary" | "secondary"; small?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, small)} {...props}>
      {pending ? "Saving…" : children}
    </button>
  );
}
