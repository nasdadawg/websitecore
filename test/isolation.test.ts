/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Payload } from 'payload';
import { initTestPayload } from './config';

let payload: Payload;
// `any` is intentional here: without `payload generate:types`, the Local API
// returns untyped `JsonObject` docs and `req.user` expects `UntypedUser`.
let tenantA: any;
let tenantB: any;
let agencyOwner: any;
let clientA: any;
let clientB: any;

/** Extract a tenant id from a relationship value (raw id or populated object). */
function tenantId(doc: any): any {
  const t = doc.tenant;
  return t && typeof t === 'object' ? t.id : t;
}

beforeAll(async () => {
  payload = await initTestPayload();

  tenantA = await payload.create({
    collection: 'tenants',
    data: { name: 'Tenant A', slug: 'tenant-a', notifyEmail: 'a@example.com' },
    overrideAccess: true,
  });
  tenantB = await payload.create({
    collection: 'tenants',
    data: { name: 'Tenant B', slug: 'tenant-b', notifyEmail: 'b@example.com' },
    overrideAccess: true,
  });

  await payload.create({
    collection: 'sites',
    data: { name: 'Site A', domain: 'a.example.com', secret: 'TEST_PLACEHOLDER_SECRET_A', tenant: tenantA.id },
    overrideAccess: true,
  });
  await payload.create({
    collection: 'sites',
    data: { name: 'Site B', domain: 'b.example.com', secret: 'TEST_PLACEHOLDER_SECRET_B', tenant: tenantB.id },
    overrideAccess: true,
  });

  agencyOwner = await payload.create({
    collection: 'users',
    data: {
      email: 'agency@test.com',
      password: 'TEST_PLACEHOLDER_PASSWORD',
      role: 'agency-owner',
      tenants: [{ tenant: tenantA.id }, { tenant: tenantB.id }],
    },
    overrideAccess: true,
  });
  clientA = await payload.create({
    collection: 'users',
    data: { email: 'client-a@test.com', password: 'TEST_PLACEHOLDER_PASSWORD', role: 'client', tenants: [{ tenant: tenantA.id }] },
    overrideAccess: true,
  });
  clientB = await payload.create({
    collection: 'users',
    data: { email: 'client-b@test.com', password: 'TEST_PLACEHOLDER_PASSWORD', role: 'client', tenants: [{ tenant: tenantB.id }] },
    overrideAccess: true,
  });

  await payload.create({
    collection: 'leads',
    data: { tenant: tenantA.id, name: 'Alice', phone: '555-0001', status: 'new' },
    overrideAccess: true,
  });
  await payload.create({
    collection: 'leads',
    data: { tenant: tenantB.id, name: 'Bob', phone: '555-0002', status: 'new' },
    overrideAccess: true,
  });
});

describe('tenant isolation (two real tenants)', () => {
  it('client A sees only tenant A leads', async () => {
    const { docs } = await payload.find({ collection: 'leads', req: { user: clientA }, overrideAccess: false });
    expect(docs.map(tenantId)).toEqual([tenantA.id]);
  });

  it('client B sees only tenant B leads', async () => {
    const { docs } = await payload.find({ collection: 'leads', req: { user: clientB }, overrideAccess: false });
    expect(docs.map(tenantId)).toEqual([tenantB.id]);
  });

  it('agency-owner sees all leads', async () => {
    const { docs } = await payload.find({ collection: 'leads', req: { user: agencyOwner }, overrideAccess: false });
    expect(docs).toHaveLength(2);
  });

  it('client A sees only their own tenant record', async () => {
    const { docs } = await payload.find({ collection: 'tenants', req: { user: clientA }, overrideAccess: false });
    expect(docs.map((d: any) => d.id)).toEqual([tenantA.id]);
  });

  it('client A cannot create a tenant (agency-only)', async () => {
    await expect(
      payload.create({
        collection: 'tenants',
        data: { name: 'Rogue', slug: 'rogue', notifyEmail: 'rogue@example.com' },
        req: { user: clientA },
        overrideAccess: false,
      }),
    ).rejects.toThrow();
  });

  it('client A cannot delete a lead (agency-only)', async () => {
    const lead = (await payload.find({ collection: 'leads', req: { user: agencyOwner }, overrideAccess: false })).docs[0];
    await expect(
      payload.delete({ collection: 'leads', id: lead.id, req: { user: clientA }, overrideAccess: false }),
    ).rejects.toThrow();
  });

  it('unique site-secret constraint is enforced', async () => {
    await expect(
      payload.create({
        collection: 'sites',
        data: { name: 'Duplicate secret', secret: 'TEST_PLACEHOLDER_SECRET_A', tenant: tenantB.id },
        overrideAccess: true,
      }),
    ).rejects.toThrow();
  });

  it('client A cannot read tenant B lead by id (findByID rejects)', async () => {
    const { docs } = await payload.find({ collection: 'leads', req: { user: agencyOwner }, overrideAccess: false });
    const bLead = docs.find((d: any) => tenantId(d) === tenantB.id)!;
    await expect(
      payload.findByID({ collection: 'leads', id: bLead.id, req: { user: clientA }, overrideAccess: false }),
    ).rejects.toThrow();
  });

  it('client A cannot update tenant B lead (denied, record unchanged)', async () => {
    const { docs } = await payload.find({ collection: 'leads', req: { user: agencyOwner }, overrideAccess: false });
    const bLead = docs.find((d: any) => tenantId(d) === tenantB.id)!;
    await expect(
      payload.update({
        collection: 'leads',
        id: bLead.id,
        data: { name: 'HACKED', status: 'won' },
        req: { user: clientA },
        overrideAccess: false,
      }),
    ).rejects.toThrow();
    const after = await payload.findByID({ collection: 'leads', id: bLead.id, overrideAccess: true });
    expect(after.name).toBe(bLead.name);
    expect(after.status).toBe(bLead.status);
  });

  it('client A cannot delete tenant B lead (cross-tenant)', async () => {
    const { docs } = await payload.find({ collection: 'leads', req: { user: agencyOwner }, overrideAccess: false });
    const bLead = docs.find((d: any) => tenantId(d) === tenantB.id)!;
    await expect(
      payload.delete({ collection: 'leads', id: bLead.id, req: { user: clientA }, overrideAccess: false }),
    ).rejects.toThrow();
  });

  it('client A cannot create a lead assigned to tenant B (create denied)', async () => {
    await expect(
      payload.create({
        collection: 'leads',
        data: { tenant: tenantB.id, name: 'Forge', phone: '555-0000', status: 'new' },
        req: { user: clientA },
        overrideAccess: false,
      }),
    ).rejects.toThrow();
  });

  it('client A cannot create a lead with no tenant (create denied)', async () => {
    await expect(
      payload.create({
        collection: 'leads',
        data: { name: 'NoTenant', phone: '555-0000', status: 'new' },
        req: { user: clientA },
        overrideAccess: false,
      }),
    ).rejects.toThrow();
  });

  it('client A cannot reassign own lead to tenant B (tenant immutable)', async () => {
    const { docs } = await payload.find({ collection: 'leads', req: { user: agencyOwner }, overrideAccess: false });
    const aLead = docs.find((d: any) => tenantId(d) === tenantA.id)!;
    await payload.update({
      collection: 'leads',
      id: aLead.id,
      data: { tenant: tenantB.id, name: 'REASSIGN_ATTEMPT' },
      req: { user: clientA },
      overrideAccess: false,
    });
    const after = await payload.findByID({ collection: 'leads', id: aLead.id, overrideAccess: true });
    expect(tenantId(after)).toBe(tenantA.id); // tenant unchanged
    expect(after.name).toBe('REASSIGN_ATTEMPT'); // but name updated (update allowed)
  });
});
