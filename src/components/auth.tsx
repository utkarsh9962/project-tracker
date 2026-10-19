import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { Form, SubmitButton } from "./client";
import { inputClass } from "./ui";

const SessionContext = createContext<Session | null>(null);
export const useSession = () => use(SessionContext);

export async function signOut() {
  await supabase.auth.signOut();
}

// Shows the login screen until there is a Supabase session, then the app.
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) qc.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  if (!supabaseConfigured) return <Setup />;
  if (session === undefined) return null;
  if (!session) return <Login />;
  return <SessionContext value={session}>{children}</SessionContext>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-semibold text-white">PT</span>
          <h1 className="text-lg font-semibold">Project Tracker</h1>
        </div>
        {children}
      </div>
    </main>
  );
}

function Login() {
  return (
    <Shell>
      <Form
        className="space-y-3"
        onSubmit={async (v) => {
          const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
          if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Email</span>
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Password</span>
          <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </label>
        <div className="pt-1">
          <SubmitButton>Log in</SubmitButton>
        </div>
      </Form>
    </Shell>
  );
}

function Setup() {
  return (
    <Shell>
      <p className="text-sm text-muted">
        This build isn’t connected to a database yet. Set <code className="font-mono">VITE_SUPABASE_URL</code> and{" "}
        <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> (see the README), then rebuild.
      </p>
    </Shell>
  );
}
