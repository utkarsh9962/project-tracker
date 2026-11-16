import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { HitRow, useSearch } from "@/components/search";
import { Button, Card, Empty, inputClass, ListSkeleton, PageHeader, useTitle } from "@/components/ui";
import { groupHits, KIND_LABELS, type Hit, type Kind } from "@/lib/search";

// Long groups start folded so one busy group doesn't push the others off the screen.
const FOLD = 8;

function Group({ kind, hits }: { kind: Kind; hits: Hit[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? hits : hits.slice(0, FOLD);
  return (
    <Card title={`${KIND_LABELS[kind].many} (${hits.length})`}>
      <ul className="divide-y divide-line/70">
        {shown.map((hit) => (
          <HitRow key={hit.id} hit={hit} />
        ))}
      </ul>
      {hits.length > FOLD && (
        <button type="button" className="mt-2 text-xs font-medium text-accent hover:underline" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${hits.length}`}
        </button>
      )}
    </Card>
  );
}

export function Search() {
  useTitle("Search");
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("q") ?? "";
  const [q, setQ] = useState(fromUrl);
  // Following a link to another search (or going back) updates the box.
  useEffect(() => setQ(fromUrl), [fromUrl]);
  const { hits, loading, error, retry } = useSearch(q);
  const query = q.trim();

  return (
    <>
      <PageHeader title="Search" subtitle="Projects, clients, people, tickets, tasks, milestones, tags, links and notes. Typos and half-typed words are fine." />
      <input
        type="search"
        value={q}
        autoFocus
        onChange={(e) => {
          setQ(e.target.value);
          setParams(e.target.value ? { q: e.target.value } : {}, { replace: true });
        }}
        placeholder="Try a name, a client, a ticket number…"
        aria-label="Search"
        autoComplete="off"
        className={`${inputClass} mb-5`}
      />
      {!query ? null : loading ? (
        <ListSkeleton />
      ) : error ? (
        <div className="space-y-3 rounded-2xl border border-red-200 bg-surface p-5">
          <h2 className="font-semibold">Couldn’t load this</h2>
          <p className="text-sm text-muted">{error.message}</p>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : hits.length === 0 ? (
        <Empty>Nothing matches “{query}”.</Empty>
      ) : (
        <div className="space-y-4">
          {groupHits(hits).map((g) => (
            <Group key={`${g.kind}-${query}`} kind={g.kind} hits={g.hits} />
          ))}
        </div>
      )}
    </>
  );
}
