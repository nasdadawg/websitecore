import 'dotenv/config';
import { getPayload } from 'payload';
import config from '../payload.config';

/**
 * Local seed data for development: two tenants, two sites, three users
 * (one agency-owner + two client users), and two leads.
 *
 * ⚠️ All secrets/passwords here are clearly-marked NON-PRODUCTION placeholders.
 * Do not run this against a production database.
 *
 * Requires DATABASE_URI + PAYLOAD_SECRET in .env. Run: `npm run seed`
 */
async function seed() {
  const payload = await getPayload({ config });

  const tenantA = await payload.create({
    collection: 'tenants',
    data: { name: 'Demo Auto Detail', slug: 'demo-a', notifyEmail: 'owner-a@example.com' },
    overrideAccess: true,
  });
  const tenantB = await payload.create({
    collection: 'tenants',
    data: { name: 'Demo Exotic Rentals', slug: 'demo-b', notifyEmail: 'owner-b@example.com' },
    overrideAccess: true,
  });

  const siteA = await payload.create({
    collection: 'sites',
    data: {
      name: 'Demo A Site',
      domain: 'demo-a.example.com',
      secret: 'SEED_PLACEHOLDER_SECRET_SITE_A_DO_NOT_USE',
      tenant: tenantA.id,
    },
    overrideAccess: true,
  });
  const siteB = await payload.create({
    collection: 'sites',
    data: {
      name: 'Demo B Site',
      domain: 'demo-b.example.com',
      secret: 'SEED_PLACEHOLDER_SECRET_SITE_B_DO_NOT_USE',
      tenant: tenantB.id,
    },
    overrideAccess: true,
  });

  await payload.create({
    collection: 'users',
    data: {
      email: 'agency@example.com',
      password: 'SEED_PLACEHOLDER_PASSWORD',
      role: 'agency-owner',
      tenants: [{ tenant: tenantA.id }, { tenant: tenantB.id }],
    },
    overrideAccess: true,
  });
  await payload.create({
    collection: 'users',
    data: { email: 'client-a@example.com', password: 'SEED_PLACEHOLDER_PASSWORD', role: 'client', tenants: [{ tenant: tenantA.id }] },
    overrideAccess: true,
  });
  await payload.create({
    collection: 'users',
    data: { email: 'client-b@example.com', password: 'SEED_PLACEHOLDER_PASSWORD', role: 'client', tenants: [{ tenant: tenantB.id }] },
    overrideAccess: true,
  });

  await payload.create({
    collection: 'leads',
    data: { tenant: tenantA.id, site: siteA.id, name: 'Alice', phone: '555-0001', email: 'alice@example.com', status: 'new' },
    overrideAccess: true,
  });
  await payload.create({
    collection: 'leads',
    data: { tenant: tenantB.id, site: siteB.id, name: 'Bob', phone: '555-0002', email: 'bob@example.com', status: 'new' },
    overrideAccess: true,
  });

  console.log('✅ Seed complete: 2 tenants, 2 sites, 3 users, 2 leads.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
