import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { buttonClass, cx, inputClass } from "./ui";
import { humanize } from "@/lib/format";

// Runs a write, then refreshes every query so all screens show the new data.
export function useMutate() {
  const qc = useQueryClient();
  return async (fn: () => Promise<unknown>) => {
    await fn();
    await qc.invalidateQueries();
  };
}

export type Values = Record<string, string>;

// Form that hands its trimmed field values to an async handler, shows a pending state and inline errors.
export function Form({
  onSubmit,
  children,
  className,
  reset = false,
  id,
}: {
  onSubmit: (values: Values) => Promise<void>;
  children: ReactNode;
  className?: string;
  reset?: boolean;
  id?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values: Values = {};
    new FormData(form).forEach((v, k) => (values[k] = String(v).trim()));
    setPending(true);
    setError(null);
    try {
      await onSubmit(values);
      if (reset) form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That couldn't be saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form id={id} onSubmit={handle} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {error && <p className="text-sm text-red-600 sm:col-span-full dark:text-red-400" role="alert">{error}</p>}
    </form>
  );
}

export function SubmitButton({ children, variant = "primary", small }: { children: ReactNode; variant?: "primary" | "secondary"; small?: boolean }) {
  return (
    <button type="submit" className={buttonClass(variant, small)}>
      {children}
    </button>
  );
}

// A select that saves as soon as you pick a value (used for quick status changes).
export function AutoSubmitSelect({
  onChange,
  value,
  options,
  label,
  className,
}: {
  onChange: (value: string) => Promise<void>;
  value: string;
  options: readonly string[];
  label: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  return (
    <select
      aria-label={label}
      value={value}
      disabled={pending}
      className={cx(inputClass, "w-auto py-1 pr-7 text-xs", className)}
      onChange={async (e) => {
        setPending(true);
        try {
          await onChange(e.target.value);
        } finally {
          setPending(false);
        }
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
export function ConfirmButton({ onConfirm, label = "Delete", small = true }: { onConfirm: () => Promise<void>; label?: string; small?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  if (!armed) {
    return (
      <button type="button" className={buttonClass("ghost", small)} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex gap-1">
      <button
        type="button"
        disabled={pending}
        className={buttonClass("danger", small)}
        onClick={async () => {
          setPending(true);
          try {
            await onConfirm();
          } finally {
            setPending(false);
            setArmed(false);
          }
        }}
      >
        {pending ? "Deleting…" : "Confirm"}
      </button>
      <button type="button" className={buttonClass("ghost", small)} onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}
