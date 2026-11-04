import { createClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const validUrl = (() => {
  try {
    return Boolean(url) && /^https?:$/.test(new URL(url!).protocol);
  } catch {
    return false;
  }
})();

// A bad build setting shows the setup screen instead of crashing to a blank page.
export const supabaseConfigured = validUrl && Boolean(key);

// The key is the public "publishable/anon" key; row-level security in the database protects the data.
export const supabase = createClient(supabaseConfigured ? url! : "http://localhost:54321", supabaseConfigured ? key! : "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true },
});
