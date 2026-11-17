// AI assistant: passes the conversation to the language model and returns its answer.
//
// The model's API key never reaches the browser or this public repository. It is stored as a
// Supabase secret (Edge Functions > Secrets), and only signed-in team members can use this function.
//
// Secrets:
//   LLM_API_KEY   the provider's API key (required)
//   LLM_BASE_URL  the provider's OpenAI-compatible address, e.g. https://api.openai.com/v1 (the default)
//   LLM_MODEL     the model to use, e.g. gpt-4o-mini (the default)
//
// Self-contained on purpose, so it can be pasted into the Supabase dashboard's function editor.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Message = { role: "system" | "user" | "assistant"; content: string };

// Asks the database whether the caller is a signed-in member of the team, using their own login.
async function isTeamMember(req: Request) {
  const auth = req.headers.get("Authorization");
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!auth?.startsWith("Bearer ")) return false;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/is_team_member`, {
    method: "POST",
    headers: { Authorization: auth, apikey, "Content-Type": "application/json" },
    body: "{}",
  });
  return res.ok && (await res.json()) === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  if (!(await isTeamMember(req))) return json({ error: "Sign in to use the assistant." }, 401);

  const key = Deno.env.get("LLM_API_KEY");
  if (!key) return json({ error: "The assistant isn't set up yet: add the LLM_API_KEY secret in Supabase." }, 503);
  const base = (Deno.env.get("LLM_BASE_URL") || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = Deno.env.get("LLM_MODEL") || "gpt-4o-mini";

  let messages: Message[];
  try {
    ({ messages } = await req.json());
    if (!Array.isArray(messages) || messages.length === 0) throw new Error();
  } catch {
    return json({ error: "Send { messages: [...] }." }, 400);
  }
  // Keep requests to a sensible size (about 400k characters).
  if (JSON.stringify(messages).length > 400_000) return json({ error: "That is too much text at once. Paste a shorter part." }, 413);

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.2 }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("LLM error", res.status, text.slice(0, 500));
    return json({ error: `The AI service answered with an error (${res.status}): ${text.slice(0, 300)}` }, 502);
  }
  try {
    const data = JSON.parse(text);
    return json({ content: data.choices?.[0]?.message?.content ?? "", model: data.model ?? model });
  } catch {
    return json({ error: "The AI service sent back something unexpected." }, 502);
  }
});
