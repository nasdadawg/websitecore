import { APIError } from 'payload';
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
      // M9: guided "complete follow-up" action on the detail view.
      edit: {
        beforeDocumentControls: [{ path: '@/components/CompleteFollowUp#CompleteFollowUp' }],
      },
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
    // M9: guided follow-up completion. `_completeFollowUp` is a transient
    // marker sent by the CompleteFollowUp detail-view action — it is NOT a
    // schema field, so it never persists and never participates in access
    // control. The marker gates exactly-one-of validation only when present.
    beforeValidate: [
      ({ data, operation }) => {
        if (operation !== 'update' || !data) return data;
        const d = data as Record<string, unknown>;
        if (d._completeFollowUp !== true) return data;

        const next = d.nextFollowUp;
        let isFutureDate = false;
        if (next != null) {
          const t = new Date(next as string).getTime();
          if (!Number.isNaN(t) && t > Date.now()) isFutureDate = true;
        }
        const status = d.status;
        const isTerminalStatus =
          typeof status === 'string' && ['won', 'lost', 'spam'].includes(status);

        if (isFutureDate && isTerminalStatus) {
          throw new APIError(
            'Ambiguous follow-up completion: provide either a future next-follow-up date or a terminal status, not both.',
            400,
            null,
            true,
          );
        }
        if (!isFutureDate && !isTerminalStatus) {
          throw new APIError(
            'Follow-up completion requires exactly one of a future next-follow-up date or a terminal status.',
            400,
            null,
            true,
          );
        }

        delete d._completeFollowUp; // transient marker must never persist
        return data;
      },
    ],
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
    // M8: contact fields (name/phone/email) are editable in the detail view.
    // Tenant-scoped write access (collection-level) still governs API updates;
    // `message` stays read-only as the original submitted copy.
    { name: 'name', type: 'text' },
    { name: 'phone', type: 'text' },
    { name: 'email', type: 'text' },
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
