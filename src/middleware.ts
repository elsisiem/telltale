import { NextResponse, type NextRequest } from "next/server";

// A deployed Telltale can spend model credits and send letters, so it sits behind a password
// (HTTP Basic, user "telltale"). The landing page, the tour and the fictional demo pages are public.
const PUBLIC = new Set(["/", "/tour", "/icon.svg"]);

export function middleware(req: NextRequest) {
  const password = process.env.TELLTALE_PASSWORD?.trim();
  if (!password) return NextResponse.next();
  // The overview and the walkthrough are public: static content, no data, no model calls.
  if (PUBLIC.has(req.nextUrl.pathname)) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (given.length === password.length && timingSafeEqual(given, password)) return NextResponse.next();
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Telltale"' } });
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!demo/|api/health|_next/static|_next/image|favicon.ico).*)"],
};
