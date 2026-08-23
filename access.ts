import type { Access } from 'payload';
import { getUserTenantIDs } from '@payloadcms/plugin-multi-tenant/utilities';

export type Role = 'agency-owner' | 'client';

/** Loose user shape (Payload generates exact types via `payload generate:types`). */
type AuthUser = {
  id?: string | number;
  role?: Role;
  tenants?: { tenant: string | number }[] | null;
};

export function isAgencyOwner(user: AuthUser | null | undefined): boolean {
  return user?.role === 'agency-owner';
}

/**
 * TENANT ISOLATION — how it is enforced (documented, not assumed):
 *
 * 1. The multi-tenant plugin adds a `tenant` relationship field to every
 *    tenant-owned collection and a `tenants` array to Users.
 * 2. The plugin applies a base list filter that scopes documents to the
 *    user's tenant IDs (its own `getTenantAccess`).
 * 3. The explicit access functions below re-assert the same scoping
 *    (`{ tenant: { in: getUserTenantIDs(user) } }`) and add role gates, so
 *    isolation does not depend solely on the plugin's behavior. Both layers
 *    are covered by the two-tenant tests in `test/`.
 */

/** Read: agency-owner sees all; client sees only docs in their tenants. */
export const tenantScopedRead: Access = ({ req: { user } }) => {
  const u = user as AuthUser | null;
  if (!u) return false;
  if (isAgencyOwner(u)) return true;
  return { tenant: { in: getUserTenantIDs(u as never) } };
};

/** Write: same scoping as read. */
export const tenantScopedWrite: Access = ({ req: { user } }) => {
  const u = user as AuthUser | null;
  if (!u) return false;
  if (isAgencyOwner(u)) return true;
  return { tenant: { in: getUserTenantIDs(u as never) } };
};

/**
 * Lead creation is restricted to trusted server-side flows — the public
 * `/api/leads` intake route and the seed — both of which call the Local API
 * with `overrideAccess: true` and resolve the tenant from a validated site
 * secret, never from request data.
 *
 * No authenticated user may create a Lead through the Payload access path:
 * - client-role users receive leads via intake and must never create directly;
 * - agency-owner creation would require a trusted selected tenant, which is
 *   not yet wired in this project (no admin UI / signed tenant session).
 *
 * Returns a real boolean — Payload's `create` operation only enforces a falsy
 * access result (a returned `Where` is discarded; see the M3.1 finding), so
 * this must never return a query constraint.
 */
export const leadCreateAccess: Access = () => false;

/** Agency-owner only (tenant/site/user management, system writes). */
export const adminOnly: Access = ({ req: { user } }) => {
  return isAgencyOwner(user as AuthUser | null);
};

/** Tenants collection read: client sees only their own tenant record. */
export const tenantSelfRead: Access = ({ req: { user } }) => {
  const u = user as AuthUser | null;
  if (!u) return false;
  if (isAgencyOwner(u)) return true;
  return { id: { in: getUserTenantIDs(u as never) } };
};
