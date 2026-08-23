import type { CollectionConfig } from 'payload';
import { adminOnly, tenantScopedRead } from '../access';

export const Sites: CollectionConfig = {
  slug: 'sites',
  admin: {
    useAsTitle: 'name',
  },
  access: {
    read: tenantScopedRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'domain', type: 'text' },
    {
      name: 'secret',
      type: 'text',
      required: true,
      // Unique site-secret lookup: unique constraint + index.
      unique: true,
      index: true,
      // Hide the raw secret from admin/API reads — it's a server-to-server credential.
      access: {
        read: () => false,
      },
    },
  ],
};
