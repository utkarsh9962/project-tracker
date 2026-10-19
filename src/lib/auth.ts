import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authEnabled, SESSION_COOKIE, verifyToken } from "./session-token";

// Every server action calls this: actions are reachable by direct POST, so the proxy check alone is not enough.
export async function requireAuth(): Promise<void> {
  if (!authEnabled()) return;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifyToken(token))) redirect("/login");
}
