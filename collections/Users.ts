import type { CollectionConfig } from 'payload';
import { isAgencyOwner } from '../access';

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
    // Hide the Users collection from client-role navigation (agency-owner only).
    hidden: ({ user }) => !isAgencyOwner(user as never),
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'client',
      options: [
        { label: 'Agency Owner', value: 'agency-owner' },
        { label: 'Client', value: 'client' },
      ],
    },
    // The multi-tenant plugin adds a `tenants` array field here automatically:
    //   tenants: [{ tenant: <tenants id> }]
  ],
};
