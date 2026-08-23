import type { CollectionConfig } from 'payload';
import { adminOnly, isAgencyOwner, tenantSelfRead } from '../access';

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: {
    useAsTitle: 'name',
    // Hide the Tenants collection from client-role navigation (agency-owner only).
    hidden: ({ user }) => !isAgencyOwner(user as never),
  },
  access: {
    read: tenantSelfRead,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'notifyEmail', type: 'email', required: true },
  ],
};
