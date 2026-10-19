// Signed session tokens shared by proxy.ts and server code. Uses Web Crypto so it runs anywhere.
export const SESSION_COOKIE = "pt_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD) || process.env.NODE_ENV === "production";
}

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.APP_PASSWORD;
  if (!s) throw new Error("Set APP_PASSWORD (and ideally SESSION_SECRET) to enable login.");
  return s;
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createToken(): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  return `${expires}.${await sign(String(expires))}`;
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) < Date.now() / 1000) return false;
  try {
    const expected = await sign(expires);
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}
