import type { CollectionConfig } from 'payload';
import { adminOnly, tenantScopedRead } from '../access';

export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  admin: {
    useAsTitle: 'action',
  },
  access: {
    read: tenantScopedRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: 'action', type: 'text', required: true },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
    },
    { name: 'collection', type: 'text' },
    { name: 'documentId', type: 'text' },
    { name: 'metadata', type: 'json' },
  ],
};
