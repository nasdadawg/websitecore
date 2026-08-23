/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload';

export type ResolvedTenant = {
  tenant: { id: number; name: string; notifyEmail: string };
  site: { id: number };
};

/** Extract an id from a relationship value (raw id or populated object). */
function relId(value: any): any {
  return value && typeof value === 'object' ? value.id : value;
}

/**
 * Resolve the tenant + site for a per-site bearer secret.
 * Returns null for an unknown/missing secret (the route maps that to 401).
 *
 * Runs with `overrideAccess` because this is trusted server-side auth, not
 * user-identity access control. The `secret` field's `access.read: false`
 * only hides it from normal reads; server-side lookup by secret still works.
 */
export async function resolveTenantFromSecret(
  payload: Payload,
  secret: string | null,
): Promise<ResolvedTenant | null> {
  if (!secret) return null;

  const { docs } = await payload.find({
    collection: 'sites',
    where: { secret: { equals: secret } },
    overrideAccess: true,
    limit: 1,
  });
  const site: any = docs[0];
  if (!site) return null;

  const tenantId = relId(site.tenant);
  if (!tenantId) return null;

  const tenant: any = await payload.findByID({
    collection: 'tenants',
    id: tenantId,
    overrideAccess: true,
  });

  return {
    tenant: { id: tenant.id, name: tenant.name, notifyEmail: tenant.notifyEmail },
    site: { id: site.id },
  };
}
