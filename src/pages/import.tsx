import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { humanize } from "@/lib/format";
import { apply, buildPlan, FIELD_LABELS, FIELDS, guessMapping, loadExisting, readFile, type Mapping, type PlanRow, type Table } from "@/lib/import";
import { RowCheck } from "@/components/bulk";
import { Badge, Button, Card, cx, Empty, LinkButton, PageHeader, useTitle } from "@/components/ui";

// Bring tickets in from a Jira export: pick the file, check what would change, then apply.
export function ImportPage() {
  useTitle("Import from Jira");
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ["import-existing"], queryFn: loadExisting, staleTime: 0 });
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; table: Table } | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  // New and changed tickets start ticked; "not in the file" ones start unticked. This holds the exceptions.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof apply>> | null>(null);

  const plan = useMemo(
    () => (file && mapping && existing.data ? buildPlan(file.table, mapping, existing.data.tickets, existing.data.people) : null),
    [file, mapping, existing.data],
  );
  const id = (r: PlanRow) => `${r.kind}:${r.key}`;
  const isOn = (r: PlanRow) => (r.kind === "missing") === flipped.has(id(r));
  const chosen = plan?.rows.filter(isOn) ?? [];
  const flip = (rows: PlanRow[], on: boolean) =>
    setFlipped((old) => {
      const next = new Set(old);
      for (const r of rows) ((r.kind === "missing") === on ? next.add(id(r)) : next.delete(id(r)));
      return next;
    });

  async function open(f: File | undefined) {
    if (!f) return;
    setError(null);
    setResult(null);
    setReading(true);
    try {
      const table = await readFile(f);
      setFile({ name: f.name, table });
      setMapping(guessMapping(table.header));
      setFlipped(new Set());
      void existing.refetch();
    } catch (err) {
      setFile(null);
      setError(err instanceof Error ? err.message : "That file couldn’t be read.");
    } finally {
      setReading(false);
    }
  }

  async function save() {
    setError(null);
    setProgress({ done: 0, total: chosen.length });
    try {
      const summary = await apply(chosen, (done, total) => setProgress({ done, total }));
      setResult(summary);
      setFile(null);
      await qc.invalidateQueries();
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "Something went wrong."} Some changes may already be saved; choose the file again to see what is left.`);
      await qc.invalidateQueries();
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <div className="mb-2 text-sm">
        <Link to="/tickets" className="text-muted hover:text-fg">
          ← Tickets
        </Link>
      </div>
      <PageHeader title="Import from Jira" subtitle="Bring tickets up to date from a Jira export. You see every change before anything is saved." />

      {result && (
        <Card className="mb-5 border-emerald-200 bg-emerald-50/60">
          <p className="text-sm font-medium text-emerald-800">
            Done. {result.created} ticket{result.created === 1 ? "" : "s"} added, {result.changed} updated{result.resolved ? `, ${result.resolved} marked resolved` : ""}.
          </p>
          <div className="mt-3 flex gap-2">
            <LinkButton to="/tickets" small>
              See tickets
            </LinkButton>
            <LinkButton to="/activity" small variant="secondary">
              See what changed
            </LinkButton>
          </div>
        </Card>
      )}

      <Card>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void open(e.dataTransfer.files[0]);
          }}
          className={cx("rounded-xl border border-dashed border-line px-4 py-8 text-center transition", over && "border-accent bg-accent/5")}
        >
          <p className="text-sm font-medium">{reading ? "Reading the file…" : file ? file.name : "Drop your Jira export here"}</p>
          <p className="mt-1 text-xs text-muted">
            {file
              ? `${file.table.rows.length} row${file.table.rows.length === 1 ? "" : "s"}${file.table.sheet ? ` on the sheet “${file.table.sheet}”` : ""}.`
              : "Excel (.xlsx) or CSV. In Jira, open your filter or search, then Export and choose Excel or CSV."}
          </p>
          <Button type="button" variant={file ? "secondary" : "primary"} className="mt-4" onClick={() => picker.current?.click()}>
            {file ? "Choose another file" : "Choose a file"}
          </Button>
          <input
            ref={picker}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void open(f);
            }}
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        {existing.isError && <p className="mt-3 text-sm text-red-600" role="alert">Your current tickets couldn’t be loaded: {existing.error.message}</p>}

        {file && mapping && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-accent">
              Columns used: {FIELDS.filter((f) => mapping[f] !== -1).map((f) => `${FIELD_LABELS[f]} from “${file.table.header[mapping[f]]}”`).join(", ")}. Change
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {FIELDS.map((f) => (
                <label key={f} className="block text-xs font-medium text-muted">
                  {FIELD_LABELS[f]}
                  <select
                    value={mapping[f]}
                    disabled={f === "key" || f === "title"}
                    onChange={(e) => setMapping({ ...mapping, [f]: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-line bg-surface px-2 py-1.5 text-sm text-fg disabled:opacity-60"
                  >
                    <option value={-1}>Not in this file</option>
                    {file.table.header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </details>
        )}
      </Card>

      {plan && file && (
        <div className="mt-5 space-y-5">
          <Card>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <Count n={plan.rows.filter((r) => r.kind === "new").length} label="new" tone="text-emerald-600" />
              <Count n={plan.rows.filter((r) => r.kind === "changed").length} label="changed" tone="text-accent" />
              <Count n={plan.rows.filter((r) => r.kind === "missing").length} label="open here, not in the file" tone="text-amber-600" />
              <Count n={plan.unchanged} label="already up to date" />
              <div className="ml-auto flex items-center gap-3">
                {progress && (
                  <span className="text-xs text-muted">
                    Saving {progress.done} of {progress.total}…
                  </span>
                )}
                <Button type="button" disabled={chosen.length === 0 || progress != null} onClick={save}>
                  {chosen.length === 0 ? "Nothing ticked" : `Apply ${chosen.length} change${chosen.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
            {(plan.skipped > 0 || plan.duplicates > 0) && (
              <p className="mt-2 text-xs text-muted">
                {[plan.skipped > 0 && `${plan.skipped} row${plan.skipped === 1 ? "" : "s"} skipped (no ticket key or summary)`, plan.duplicates > 0 && `${plan.duplicates} repeated key${plan.duplicates === 1 ? "" : "s"} ignored`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            {plan.unmatched.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                <span className="font-medium text-fg">Assigned in Jira, but not in People:</span> {plan.unmatched.map((u) => `${u.name} (${u.tickets})`).join(", ")}. Add them on the{" "}
                <Link to="/people" className="text-accent hover:underline">
                  People page
                </Link>{" "}
                and choose the file again to link them.
              </p>
            )}
          </Card>

          {plan.rows.length === 0 && <Empty>Everything in this file already matches the tracker. Nothing to do.</Empty>}

          <Group title="New tickets" hint="In the file, not in the tracker yet." rows={plan.rows.filter((r) => r.kind === "new")} isOn={isOn} flip={flip}>
            {(r) =>
              r.kind === "new" && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.values.title}</span>
                    <span className="block truncate text-xs text-muted">{[r.values.client, r.assign.map((p) => p.name).join(", ")].filter(Boolean).join(" · ") || "No client"}</span>
                  </span>
                  <Badge value={r.values.priority} />
                  <Badge value={r.values.status} />
                </>
              )
            }
          </Group>

          <Group title="Changed tickets" hint="Already in the tracker; Jira now says something different." rows={plan.rows.filter((r) => r.kind === "changed")} isOn={isOn} flip={flip}>
            {(r) =>
              r.kind === "changed" && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.title}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                    {r.changes.map((c, i) => (
                      <span key={i} className="break-words">
                        {c.field}:{" "}
                        {c.from && (
                          <>
                            <span className="line-through">{humanize(c.from)}</span> →{" "}
                          </>
                        )}
                        <span className="font-medium text-fg">{c.from ? humanize(c.to) : c.to}</span>
                      </span>
                    ))}
                  </span>
                </span>
              )
            }
          </Group>

          <Group
            title="Open here, not in the file"
            hint="These may be finished in Jira, or simply outside the export. Tick the ones to mark as resolved."
            rows={plan.rows.filter((r) => r.kind === "missing")}
            isOn={isOn}
            flip={flip}
          >
            {(r) =>
              r.kind === "missing" && (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                  <span className="text-xs text-muted">
                    <span className="line-through">{humanize(r.status)}</span> → <span className="font-medium text-fg">Resolved</span>
                  </span>
                </>
              )
            }
          </Group>
        </div>
      )}
    </>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <span className="text-sm text-muted">
      <span className={cx("mr-1.5 text-xl font-semibold text-fg", n > 0 && tone)}>{n}</span>
      {label}
    </span>
  );
}

function Group({ title, hint, rows, isOn, flip, children }: { title: string; hint: string; rows: PlanRow[]; isOn: (r: PlanRow) => boolean; flip: (rows: PlanRow[], on: boolean) => void; children: (r: PlanRow) => React.ReactNode }) {
  if (rows.length === 0) return null;
  const on = rows.filter(isOn).length;
  return (
    <Card
      title={`${title} (${rows.length})`}
      actions={
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <RowCheck checked={on === rows.length} onChange={() => flip(rows, on !== rows.length)} label={`Select all ${title.toLowerCase()}`} />
          {on} of {rows.length} ticked
        </label>
      }
    >
      <p className="-mt-2 mb-2 text-xs text-muted">{hint}</p>
      <ul className="divide-y divide-line/70">
        {rows.map((r) => (
          <li key={r.key} className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5", !isOn(r) && "opacity-55")}>
            <RowCheck checked={isOn(r)} onChange={() => flip([r], !isOn(r))} label={`Include ${r.key}`} />
            <span className="w-24 shrink-0 font-mono text-xs">{r.key}</span>
            {children(r)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
