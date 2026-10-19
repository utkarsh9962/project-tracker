import type { Values } from "@/components/client";
import { normalizeUrl } from "./format";

// Helpers for turning form values into column values.
export const opt = (v: string | undefined) => (v ? v : null);
export const optId = (v: string | undefined) => (v ? Number(v) : null);
export const pct = (v: string | undefined) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

export function url(v: Values, field = "url") {
  const r = normalizeUrl(v[field] ?? "");
  if (!r.ok) throw new Error("That link doesn’t look like a web address. Use something like https://docs.google.com/…");
  return r.url;
}
