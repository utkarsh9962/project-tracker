import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, SESSION_COOKIE, verifyToken } from "@/lib/session-token";

export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  if (await verifyToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|icon|manifest).*)"],
};
