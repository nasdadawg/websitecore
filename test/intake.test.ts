/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Payload } from 'payload';
import { initTestPayload } from './config';
import { intakeLead } from '../lib/leads/intake';
import { resolveTenantFromSecret } from '../lib/leads/resolve-tenant';

let payload: Payload;
let tenantA: any;
let tenantB: any;

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
    data: { name: 'Site A', domain: 'a.example.com', secret: 'TEST_SECRET_A', tenant: tenantA.id },
    overrideAccess: true,
  });
  await payload.create({
    collection: 'sites',
    data: { name: 'Site B', domain: 'b.example.com', secret: 'TEST_SECRET_B', tenant: tenantB.id },
    overrideAccess: true,
  });
});

describe('secret → tenant resolution', () => {
  it('resolves a valid secret to the correct tenant', async () => {
    const r = await resolveTenantFromSecret(payload, 'TEST_SECRET_A');
    expect(r).not.toBeNull();
    expect(r!.tenant.id).toBe(tenantA.id);
  });

  it('returns null for an unknown secret', async () => {
    expect(await resolveTenantFromSecret(payload, 'NOPE')).toBeNull();
  });

  it('returns null for a missing secret', async () => {
    expect(await resolveTenantFromSecret(payload, null)).toBeNull();
  });
});

describe('lead intake', () => {
  it('accepts a valid lead with a valid secret (202, writes to correct tenant)', async () => {
    const result = await intakeLead(payload, {
      secret: 'TEST_SECRET_A',
      idempotencyKey: 'key-1',
      body: { name: 'Alice', phone: '555-0001', email: 'alice@example.com', message: 'Interested' },
    });
    expect(result.status).toBe(202);
    if (result.status === 202) {
      expect(result.lead.name).toBe('Alice');
      expect(result.resolved.tenant.id).toBe(tenantA.id);
    }
  });

  it('rejects a missing/invalid secret with 401', async () => {
    const r = await intakeLead(payload, {
      secret: 'WRONG_SECRET',
      idempotencyKey: 'key-2',
      body: { name: 'Mallory', phone: '555-0002' },
    });
    expect(r.status).toBe(401);
  });

  it('rejects a malformed body (missing phone) with 400', async () => {
    const r = await intakeLead(payload, {
      secret: 'TEST_SECRET_A',
      idempotencyKey: 'key-3',
      body: { name: 'Bob' },
    });
    expect(r.status).toBe(400);
  });

  it('deduplicates on a repeated idempotency key (exactly one lead)', async () => {
    const key = 'key-dup';
    const body = { name: 'Carol', phone: '555-0003' };
    const r1 = await intakeLead(payload, { secret: 'TEST_SECRET_A', idempotencyKey: key, body });
    const r2 = await intakeLead(payload, { secret: 'TEST_SECRET_A', idempotencyKey: key, body });

    expect(r1.status).toBe(202);
    expect(r2.status).toBe(202);
    expect(r2.status === 202 && r2.deduplicated).toBe(true);

    const { docs } = await payload.find({
      collection: 'leads',
      where: { idempotencyKey: { equals: key } },
      overrideAccess: true,
    });
    expect(docs).toHaveLength(1);
  });
});
