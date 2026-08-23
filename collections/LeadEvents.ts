import type { CollectionConfig } from 'payload';
import { adminOnly, tenantScopedRead } from '../access';

export const LeadEvents: CollectionConfig = {
  slug: 'lead-events',
  admin: {
    useAsTitle: 'type',
  },
  access: {
    read: tenantScopedRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'lead',
      type: 'relationship',
      relationTo: 'leads',
      required: true,
      index: true,
    },
    { name: 'type', type: 'text', required: true },
    { name: 'note', type: 'textarea' },
    { name: 'data', type: 'json' },
  ],
};
