import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { Button, PageHeader, cx, useTitle } from "@/components/ui";
import { apply, ask, describe, loadContext, type ChatMessage, type Context } from "@/lib/assistant";

const STORE = "assistant-chat";
const EXAMPLES = [
  "Paste a Slack thread and ask: “Create tickets for what's asked here and give them to the right people.”",
  "“What is overdue this week, and who is it with?”",
  "“Mark ZST-1234 as waiting and add a note that the client is testing.”",
  "“Add a milestone ‘UAT sign-off’ to the Acme app on 5 Dec.”",
];

// The conversation stays while the tab is open, so moving between pages doesn't lose it.
function loadChat(): ChatMessage[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as ChatMessage[];
  } catch {
    return [];
  }
}

export function AssistantPage() {
  useTitle("Assistant");
  const qc = useQueryClient();
  const context = useQuery({ queryKey: ["assistant-context"], queryFn: loadContext });
  const [chat, setChat] = useState<ChatMessage[]>(loadChat);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(chat));
    } catch {
      // Storage can be full or blocked; the chat still works for this visit.
    }
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, busy]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const history = [...chat, { role: "user" as const, content: text }];
    setChat(history);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      // Fresh data each time, so the assistant sees changes made a moment ago.
      const ctx = await qc.fetchQuery({ queryKey: ["assistant-context"], queryFn: loadContext, staleTime: 0 });
      const answer = await ask(history, ctx);
      setChat([...history, { role: "assistant", content: answer.reply || "Here is what I suggest.", actions: answer.actions }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setChat(chat);
      setDraft(text);
    } finally {
      setBusy(false);
    }
  }

  function setApplied(index: number, results: Record<number, string>) {
    setChat((c) => c.map((m, i) => (i === index ? { ...m, applied: { ...m.applied, ...results } } : m)));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Assistant"
        subtitle="Ask about your work, or paste a chat or email and have it turned into tickets, tasks and notes. You check every change before it is saved."
        actions={
          chat.length > 0 && (
            <Button variant="ghost" small onClick={() => setChat([])} disabled={busy}>
              New chat
            </Button>
          )
        }
      />

      <div className="space-y-4">
        {chat.length === 0 && (
          <div className="rounded-2xl border border-line/80 bg-surface p-5 shadow-xs">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Sparkle /> Things you can ask
            </div>
            <ul className="space-y-1.5 text-sm text-muted">
              {EXAMPLES.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        {chat.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm whitespace-pre-wrap text-white">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Sparkle />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="rounded-2xl rounded-tl-md border border-line/80 bg-surface px-4 py-2.5 text-sm whitespace-pre-wrap shadow-xs">{m.content}</div>
                {context.data && m.actions && m.actions.length > 0 && (
                  <Suggestions message={m} ctx={context.data} onApplied={(r) => setApplied(i, r)} />
                )}
              </div>
            </div>
          ),
        )}

        {busy && (
          <div className="flex items-center gap-3 text-sm text-muted">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Sparkle className="animate-pulse" />
            </div>
            Thinking…
          </div>
        )}
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div ref={end} />
      </div>

      <form
        className="mt-6 rounded-2xl border border-line/80 bg-surface p-2 shadow-lg shadow-slate-900/5 lg:sticky lg:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter makes a new line (pasted chats keep their lines either way).
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={draft.split("\n").length > 3 ? 8 : 3}
          placeholder="Ask something, or paste a chat or email…"
          className="block w-full resize-none rounded-xl px-3 py-2 text-sm outline-none placeholder:text-muted"
          disabled={busy}
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-1">
          <span className="text-xs text-muted">{context.isLoading ? "Loading your data…" : context.error ? "Couldn't load your data." : "Enter to send · Shift+Enter for a new line"}</span>
          <Button type="submit" small disabled={busy || !draft.trim() || !context.data}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

function Suggestions({ message, ctx, onApplied }: { message: ChatMessage; ctx: Context; onApplied: (r: Record<number, string>) => void }) {
  const qc = useQueryClient();
  const actions = message.actions ?? [];
  const applied = message.applied ?? {};
  const pending = actions.map((_, i) => i).filter((i) => applied[i] === undefined || (applied[i] !== "done" && !applied[i].startsWith("/")));
  const [picked, setPicked] = useState<Set<number>>(() => new Set(pending));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const results: Record<number, string> = {};
    // One at a time, in order: a ticket is created before it is given to someone.
    for (const i of [...picked].sort((a, b) => a - b)) {
      try {
        results[i] = (await apply(actions[i])) ?? "done";
      } catch (err) {
        results[i] = `Failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    onApplied(results);
    setPicked(new Set());
    setSaving(false);
    await qc.invalidateQueries();
  }

  return (
    <div className="rounded-2xl border border-line/80 bg-surface shadow-xs">
      <div className="border-b border-line/70 px-4 py-2.5 text-xs font-semibold tracking-wide text-muted uppercase">Suggested changes</div>
      <ul className="divide-y divide-line/70">
        {actions.map((a, i) => {
          const d = describe(a, ctx);
          const state = applied[i];
          const done = state === "done" || state?.startsWith("/");
          const failed = state?.startsWith("Failed");
          return (
            <li key={i} className="flex gap-3 px-4 py-3">
              {done ? (
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">✓</span>
              ) : (
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-(--accent)"
                  checked={picked.has(i)}
                  disabled={saving}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(i);
                    else next.delete(i);
                    setPicked(next);
                  }}
                  aria-label={d.title}
                />
              )}
              <div className="min-w-0 text-sm">
                <div className={cx("font-medium", done && "text-muted")}>{d.title}</div>
                {d.details.map((line, j) => (
                  <div key={j} className="text-xs whitespace-pre-wrap text-muted">
                    {line}
                  </div>
                ))}
                {done && (
                  <div className="mt-0.5 text-xs text-emerald-700">
                    Saved
                    {state.startsWith("/") && (
                      <>
                        {" · "}
                        <Link to={state} className="underline underline-offset-2">
                          Open
                        </Link>
                      </>
                    )}
                  </div>
                )}
                {failed && <div className="mt-0.5 text-xs text-red-700">{state}</div>}
              </div>
            </li>
          );
        })}
      </ul>
      {pending.length > 0 && (
        <div className="flex items-center justify-end gap-2 border-t border-line/70 px-4 py-2.5">
          <span className="mr-auto text-xs text-muted">Nothing is saved until you apply.</span>
          <Button small onClick={save} disabled={saving || picked.size === 0}>
            {saving ? "Saving…" : `Apply ${picked.size} ${picked.size === 1 ? "change" : "changes"}`}
          </Button>
        </div>
      )}
    </div>
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("h-4 w-4", className)} fill="currentColor" aria-hidden>
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9zM5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}
