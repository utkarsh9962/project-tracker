import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Attachment } from "@/lib/types";
import { opt } from "@/lib/values";
import { ConfirmButton, Form, SubmitButton, useMutate } from "./client";
import { Button, Card, cx, Input } from "./ui";

type Target = Pick<Attachment, "project_id" | "task_id" | "ticket_id">;

export const SETUP_HINT = "Run the newest file in supabase/migrations in the Supabase SQL Editor to turn this on.";

// Screenshots on a project, a task or a ticket: paste, drop or pick an image, add a note to say what it shows.
export function Screenshots({ items, target, compact = false }: { items: Attachment[]; target: Target; compact?: boolean }) {
  const mutate = useMutate();
  const [open, setOpen] = useState<Attachment | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <div>
      {items.length > 0 && (
        <ul className={cx("mb-3 grid gap-3", compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2")}>
          {items.map((a) => (
            <li key={a.id} className="min-w-0">
              <button
                type="button"
                onClick={() => setOpen(a)}
                aria-label={`Open screenshot ${a.caption ?? a.name}`}
                className="block aspect-video w-full overflow-hidden rounded-xl border border-line/80 bg-hover transition hover:border-accent/50 hover:shadow-md"
              >
                {a.url ? <img src={a.url} alt={a.caption ?? a.name} loading="lazy" className="h-full w-full object-cover object-top" /> : <span className="text-xs text-muted">Image unavailable</span>}
              </button>
              {editing === a.id ? (
                <Form
                  className="mt-1.5 flex gap-1.5"
                  onSubmit={async (v) => {
                    await mutate(() => api.updateScreenshot(a.id, opt(v.caption)));
                    setEditing(null);
                  }}
                >
                  <Input name="caption" defaultValue={a.caption ?? ""} autoFocus placeholder="What does this show?" aria-label="Note" className="min-w-0 py-1 text-xs" />
                  <SubmitButton small>Save</SubmitButton>
                </Form>
              ) : (
                <>
                  {a.caption && <p className="mt-1.5 text-xs whitespace-pre-wrap">{a.caption}</p>}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                    <span>{formatDate(a.created_at.slice(0, 10))}</span>
                    <button type="button" className="hover:text-accent" onClick={() => setEditing(a.id)}>
                      {a.caption ? "Edit note" : "Add note"}
                    </button>
                    <ConfirmButton label="Remove" onConfirm={() => mutate(() => api.deleteScreenshot(a))} />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <DropZone target={target} compact={compact} />
      {open && <Lightbox item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// Click it and press Ctrl+V to paste a screenshot, drop an image on it, or browse for a file.
function DropZone({ target, compact }: { target: Target; compact: boolean }) {
  const mutate = useMutate();
  const picker = useRef<HTMLInputElement>(null);
  const note = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return setError("That isn’t an image. Take a screenshot, then paste or drop it here.");
    setBusy(true);
    setError(null);
    try {
      const caption = opt(note.current?.value.trim());
      await mutate(async () => {
        for (const file of images) await api.addScreenshot(target, file, caption);
      });
      if (note.current) note.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "That couldn’t be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        tabIndex={0}
        role="group"
        aria-label="Add a screenshot: paste, drop or browse"
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (files.length === 0) return;
          e.preventDefault();
          void add(files);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add([...e.dataTransfer.files]);
        }}
        className={cx(
          "group rounded-xl border border-dashed border-line text-center text-xs text-muted outline-none transition focus:border-accent focus:bg-accent/5 focus:ring-4 focus:ring-accent/10",
          compact ? "px-3 py-2.5" : "px-3 py-5",
          over && "border-accent bg-accent/5",
        )}
      >
        {busy ? (
          "Adding…"
        ) : (
          <>
            <span className="group-focus:hidden">Click here, then press Ctrl+V to paste a screenshot. Or drop an image, or </span>
            <span className="hidden font-medium text-accent-strong group-focus:inline">Now press Ctrl+V to paste. Or </span>
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => picker.current?.click()}>
              browse
            </button>
            .
          </>
        )}
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) void add(files);
          }}
        />
      </div>
      <input ref={note} placeholder="Note to save with the next screenshot (optional)" aria-label="Note for the next screenshot" className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-1.5 text-xs outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-4 focus:ring-accent/10" />
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

function Lightbox({ item, onClose }: { item: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={item.caption ?? item.name} className="animate-enter fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="mb-3 flex items-start gap-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 flex-1 text-sm whitespace-pre-wrap">{item.caption ?? item.name}</p>
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25">
            Open full size ↗
          </a>
        )}
        <Button type="button" small className="shrink-0 rounded-full bg-white text-slate-900 hover:bg-white/90" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {item.url && <img src={item.url} alt={item.caption ?? item.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />}
      </div>
    </div>
  );
}

// The card on project and ticket pages.
export function ScreenshotsCard({ items, target }: { items: Attachment[] | null; target: Target }) {
  return (
    <Card title={items?.length ? `Screenshots (${items.length})` : "Screenshots"}>
      {items == null ? <p className="text-sm text-muted">Screenshots aren’t set up yet. {SETUP_HINT}</p> : <Screenshots items={items} target={target} />}
    </Card>
  );
}
