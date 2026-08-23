import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveHost } from "@/lib/host";

// Read directly (no `lib/env`) to keep the proxy bundle minimal — it runs
// before every request.
const BASE_DOMAIN = process.env.APP_BASE_DOMAIN ?? "localhost:3000";

/**
 * Multi-tenant router. Runs before every page/API request, parses the Host
 * header, and stamps request headers that downstream code reads:
 *
 *   x-forwarded-host  — the raw host (normalized source of truth)
 *   x-tenant-mode     — "platform" | "subdomain" | "custom" | "localhost"
 *   x-tenant-slug     — set when a subdomain tenant was detected
 *   x-tenant-host     — set when a custom root domain was detected
 *
 * This is pure string logic — no DB calls — so it adds negligible latency.
 * The actual tenant row is resolved (and cached) by `lib/tenant.ts`.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const resolution = resolveHost(host, BASE_DOMAIN);

  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", host);

  if (resolution.kind === "subdomain") {
    headers.set("x-tenant-mode", "subdomain");
    headers.set("x-tenant-slug", resolution.slug);
  } else if (resolution.kind === "custom") {
    headers.set("x-tenant-mode", "custom");
    headers.set("x-tenant-host", resolution.host);
  } else {
    headers.set("x-tenant-mode", resolution.kind);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Skip Next internals and static assets; run on everything else.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
