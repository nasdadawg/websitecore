import type { CollectionConfig } from 'payload';
import { leadCreateAccess, tenantScopedRead, tenantScopedWrite } from '../access';

export const Leads: CollectionConfig = {
  slug: 'leads',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'phone', 'status', 'nextFollowUp', 'dealValue', 'createdAt'],
    // M6: search by name/phone/email in the list view.
    listSearchableFields: ['name', 'phone', 'email'],
    // M7: quick-filter links above the list.
    components: {
      beforeListTable: [{ path: '@/components/LeadListFilters#LeadListFilters' }],
    },
  },
  // M6: newest-first by default (top-level collection option in Payload 3).
  defaultSort: '-createdAt',
  access: {
    read: tenantScopedRead,
    // Creation is trusted-server-side only (intake route / seed, both via
    // `overrideAccess: true`). No authenticated user may create a Lead.
    create: leadCreateAccess,
    update: tenantScopedWrite,
    // Read/limited-edit admin: no delete through any authenticated path.
    delete: () => false,
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation }) => {
        // Tenant ownership is immutable: on update, ignore any client-supplied
        // tenant and preserve the original. Client input must never reassign a
        // lead from one tenant to another.
        if (operation === 'update') {
          const tenant = (originalDoc as { tenant?: unknown })?.tenant;
          const tenantId = tenant && typeof tenant === 'object' ? (tenant as { id?: unknown }).id : tenant;
          if (tenantId != null) {
            (data as { tenant?: unknown }).tenant = tenantId;
          }
        }
        return data;
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', admin: { readOnly: true } },
    { name: 'phone', type: 'text', admin: { readOnly: true } },
    { name: 'email', type: 'text', admin: { readOnly: true } },
    { name: 'message', type: 'textarea', admin: { readOnly: true } },
    {
      name: 'idempotencyKey',
      type: 'text',
      // A repeated X-Idempotency-Key must never create a second lead.
      unique: true,
      index: true,
      admin: { readOnly: true, hidden: true },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Qualified', value: 'qualified' },
        { label: 'Contacted', value: 'contacted' },
        { label: 'Won', value: 'won' },
        { label: 'Lost', value: 'lost' },
        { label: 'Spam', value: 'spam' },
      ],
    },
    { name: 'notes', type: 'textarea' },
    { name: 'nextFollowUp', type: 'date' },
    { name: 'dealValue', type: 'number' },
    // The multi-tenant plugin adds a `tenant` relationship field automatically.
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      admin: { readOnly: true },
      // The site that captured this lead (resolved from its per-site secret).
    },
  ],
  // Tenant-scoped lead listing: compound index on (tenant, createdAt).
  indexes: [{ fields: ['tenant', 'createdAt'] }],
};
