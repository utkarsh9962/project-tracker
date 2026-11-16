import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import * as api from "@/lib/api";
import { buildIndex, KIND_LABELS, search, type Hit } from "@/lib/search";
import { Badge, cx, inputClass, safeHref } from "./ui";

// Loads everything once (shared between the header box and the Search page) and searches it as you type.
export function useSearch(query: string, enabled = true) {
  const data = useQuery({ queryKey: ["search-data"], queryFn: api.searchData, enabled, staleTime: 30_000 });
  const index = useMemo(() => (data.data ? buildIndex(data.data) : null), [data.data]);
  const hits = useMemo(() => (index ? search(index, query) : []), [index, query]);
  return { hits, loading: enabled && data.isPending, error: data.error, retry: () => data.refetch() };
}

// What a result shows: its name, where it belongs, and why it matched when that isn't obvious from the name.
export function HitText({ hit, showKind = false }: { hit: Hit; showKind?: boolean }) {
  const detail = hit.why ? `${hit.why.label}: ${hit.why.text}` : hit.context;
  return (
    <>
      {showKind && <span className="w-16 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted">{KIND_LABELS[hit.kind].one}</span>}
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-sm", (hit.kind === "project" || hit.kind === "person") && "font-medium")}>{hit.title}</span>
        {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
      </span>
      {hit.badge && <Badge value={hit.badge} label={hit.badgeLabel ?? undefined} />}
    </>
  );
}

// The search box in the top bar: results drop down while typing. Arrow keys and Enter pick one,
// Enter on its own opens the full results page, and "/" jumps to the box from anywhere.
export function HeaderSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const { hits, loading } = useSearch(q, touched);
  const top = hits.slice(0, 8);
  const show = open && q.trim() !== "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName ?? "");
      if ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  // The Search page has its own box; don't keep a second copy of the query up here.
  useEffect(() => {
    if (pathname === "/search") setQ("");
  }, [pathname]);

  const close = () => {
    setOpen(false);
    setActive(-1);
    input.current?.blur();
  };
  const go = (hit: Hit | undefined) => {
    if (hit) navigate(hit.to);
    else if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
    else return;
    setQ("");
    close();
  };

  return (
    <div ref={box} className="relative hidden md:block">
      <input
        ref={input}
        type="search"
        value={q}
        placeholder="Search…  /"
        aria-label="Search"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={cx(inputClass, "w-44 rounded-full border-transparent bg-hover py-1.5 focus:w-72 focus:bg-surface")}
        onFocus={() => {
          setTouched(true);
          setOpen(true);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = top.length;
            if (n) setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i <= 0 ? n : i) - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(top[active]);
          } else if (e.key === "Escape") {
            close();
          }
        }}
      />
      {show && (
        <div id={listId} role="listbox" className="animate-enter absolute right-0 top-full z-30 mt-2 w-[26rem] max-w-[90vw] overflow-hidden rounded-2xl border border-line/80 bg-surface p-1.5 shadow-xl">
          {loading ? (
            <p className="px-3 py-4 text-sm text-muted">Searching…</p>
          ) : top.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">Nothing matches “{q.trim()}”.</p>
          ) : (
            <>
              {top.map((hit, i) => (
                <Link
                  key={`${hit.kind}-${hit.id}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  to={hit.to}
                  onClick={() => {
                    setQ("");
                    close();
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cx("flex items-center gap-3 rounded-xl px-3 py-2", i === active && "bg-hover")}
                >
                  <HitText hit={hit} showKind />
                </Link>
              ))}
              <button type="button" className="mt-1 w-full rounded-xl border-t border-line/70 px-3 py-2 text-left text-xs font-medium text-accent hover:bg-hover" onClick={() => go(undefined)}>
                {hits.length > top.length ? `See all ${hits.length} results` : "Open in Search"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// A row on the Search page. Links and files open in a new tab, with a way back to where they are kept.
export function HitRow({ hit }: { hit: Hit }) {
  const row = "flex items-center gap-3 py-2.5";
  const href = hit.kind === "resource" ? safeHref(hit.url) : null;
  if (!href) {
    return (
      <li>
        <Link to={hit.to} className={cx(row, "hover:opacity-80")}>
          <HitText hit={hit} />
        </Link>
      </li>
    );
  }
  return (
    <li className={row}>
      <a href={href} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 text-accent hover:underline">
        <HitText hit={hit} />
      </a>
      <Link to={hit.to} className="shrink-0 text-xs text-muted hover:text-fg">
        Open parent
      </Link>
    </li>
  );
}
