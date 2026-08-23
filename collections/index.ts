import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant';
import type { CollectionConfig, Config } from 'payload';
import { Users } from './Users';
import { Tenants } from './Tenants';
import { Sites } from './Sites';
import { Leads } from './Leads';
import { LeadEvents } from './LeadEvents';
import { AuditLogs } from './AuditLogs';

export const collections: CollectionConfig[] = [
  Users,
  Tenants,
  Sites,
  Leads,
  LeadEvents,
  AuditLogs,
];

/**
 * Multi-tenant plugin wiring.
 *
 * - `collections`: tenant-owned collections that get a `tenant` relationship
 *   field (Sites, Leads, LeadEvents, AuditLogs). `tenants` (the tenant root)
 *   and `users` (gets a `tenants` array instead) are excluded.
 * - `userHasAccessToAllTenants`: `agency-owner` role bypasses tenant scoping.
 *
 * Explicit role + tenant access is ALSO defined in `access.ts` and attached to
 * each collection, so isolation never depends solely on this plugin.
 */

const ASSIGN_TENANT_TRIGGER =
  '@payloadcms/plugin-multi-tenant/client#AssignTenantFieldTrigger';

/**
 * Cosmetic-only: removes the plugin's "Assign Tenant" edit-menu trigger from
 * every tenant-enabled collection's admin 3-dot menu. The tenant field stays
 * read-only (plugin `allowEdit: false`) and the M3.2 `beforeChange` hook still
 * enforces immutability — this only removes the UI affordance, nothing else.
 */
const removeAssignTenantTrigger = (config: Config): Config => {
  config.collections?.forEach((collection) => {
    const edit = collection.admin?.components?.edit;
    if (edit?.editMenuItems) {
      edit.editMenuItems = edit.editMenuItems.filter(
        (item) => (item as { path?: string } | null)?.path !== ASSIGN_TENANT_TRIGGER,
      );
    }
  });
  return config;
};

export const plugins = [
  multiTenantPlugin({
    collections: {
      sites: {},
      leads: {},
      'lead-events': {},
      'audit-logs': {},
    },
    userHasAccessToAllTenants: (user) =>
      (user as { role?: string } | null)?.role === 'agency-owner',
  }),
  // Runs AFTER the multi-tenant plugin, stripping the "Assign Tenant" trigger
  // the plugin injects into each collection's edit menu.
  removeAssignTenantTrigger,
];
