import { postgresAdapter } from '@payloadcms/db-postgres';
import { buildConfig } from 'payload';
import { collections, plugins } from './collections';

export default buildConfig({
  // Required. Set PAYLOAD_SECRET in .env (long random string). The fallback
  // exists only so the config can be imported without an env file present.
  secret: process.env.PAYLOAD_SECRET || 'DEV_ONLY_INSECURE_SECRET_CHANGE_ME',

  collections,

  admin: {
    user: 'users',
  },

  // Payload REST API is served under /cms-api, keeping the custom public
  // intake endpoint at POST /api/leads unambiguous.
  routes: {
    api: '/cms-api',
  },

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),

  plugins,
});
