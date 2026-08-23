import { cache } from "react";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveHost, type HostResolution } from "@/lib/host";
import { env } from "@/lib/env";

/**
 * Minimal, safe routing projection of a tenant — no secrets, no owner
 * contact details. Mirrors the `public.tenant_routes` view in the DB.
 */
export type TenantRoute = {
  id: string;
  slug: string;
  domain: string | null;
  subdomain: string | null;
  active: boolean;
};

async function lookupTenant(resolution: HostResolution): Promise<TenantRoute | null> {
  // The platform site and localhost have no tenant context.
  if (resolution.kind === "platform" || resolution.kind === "localhost") {
    return null;
  }

  const sb = await createServerSupabase();
  const query = sb.from("tenant_routes").select("*").eq("active", true).limit(1);

  const res =
    resolution.kind === "subdomain"
      ? await query.eq("subdomain", resolution.slug)
      : await query.eq("domain", resolution.host);

  if (res.error) {
    console.error("[tenant] lookup failed:", res.error.message);
    return null;
  }

  return (res.data?.[0] as TenantRoute) ?? null;
}

/** Resolve a tenant from a raw host string. Cached per request via React `cache`. */
export const getTenantByHost = cache(
  async (host: string): Promise<TenantRoute | null> =>
    lookupTenant(resolveHost(host, env.APP_BASE_DOMAIN)),
);

/**
 * Resolve the tenant for the *current* request inside a Server Component or
 * Route Handler. Prefers the headers injected by `proxy.ts`, falling back to
 * parsing the `host` header directly.
 */
export async function getRequestTenant(): Promise<TenantRoute | null> {
  const h = await headers();

  const mode = h.get("x-tenant-mode") ?? "";
  const slug = h.get("x-tenant-slug");
  const customHost = h.get("x-tenant-host");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";

  let resolution: HostResolution;
  if (mode === "subdomain" && slug) {
    resolution = { kind: "subdomain", slug };
  } else if (mode === "custom" && customHost) {
    resolution = { kind: "custom", host: customHost };
  } else {
    resolution = resolveHost(host, env.APP_BASE_DOMAIN);
  }

  return lookupTenant(resolution);
}
