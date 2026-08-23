/**
 * Pure host parsing for multi-tenant routing. No dependencies, no network —
 * safe to import into `proxy.ts` (which runs before every request).
 */

export type HostResolution =
  | { kind: "platform" } // the master/root domain itself
  | { kind: "subdomain"; slug: string } // clienta.<baseDomain>
  | { kind: "custom"; host: string } // clienta.com (custom root domain)
  | { kind: "localhost" }; // dev loopback

/** Lowercase and strip the port (e.g. "ClientA.com:3000" -> "clienta.com"). */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

/**
 * Map a request `host` onto the multi-tenancy model given the platform's
 * `baseDomain`. Pure string logic only.
 */
export function resolveHost(host: string, baseDomain: string): HostResolution {
  const h = normalizeHost(host);
  const base = normalizeHost(baseDomain);

  if (h === "localhost" || h === "127.0.0.1" || h === "::1") {
    return { kind: "localhost" };
  }

  if (h === base) {
    return { kind: "platform" };
  }

  if (h.endsWith(`.${base}`)) {
    const slug = h.slice(0, h.length - base.length - 1);
    // Only a single, clean label is a valid subdomain tenant.
    if (slug && !slug.includes(".")) {
      return { kind: "subdomain", slug };
    }
  }

  return { kind: "custom", host: h };
}
