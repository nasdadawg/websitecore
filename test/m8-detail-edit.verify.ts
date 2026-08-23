/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * M8 — Tenant-safe lead detail view/edit (existing fields only).
 *
 * Proves tenant-scoped read/write still holds now that name/phone/email are
 * editable in the detail view. Mirrors test/m3-isolation.verify.ts against the
 * REAL Supabase Postgres DB via the Local API with `overrideAccess: false` +
 * `req: { user }`.
 *
 * Covers:
 *   Step 2 — client A updates OWN lead's contact + status + nextFollowUp → ok
 *   Step 3 — cross-tenant view + contact-field update denied (symmetric A↔B)
 *   Step 4 — tenant immutable even while editing contact fields in same request
 *   Step 5 — agency-owner cross-tenant view + edit
 *
 * Any probe doc created is deleted again (overrideAccess:true) so the DB is
 * left exactly as found. Seed/E2E leads are never mutated or deleted.
 *
 * Run: `npx tsx test/m8-detail-edit.verify.ts`  (requires DATABASE_URI in .env.local)
 */
import 'dotenv/config';
import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '../payload.config';

let payload: Payload;

function tenantId(doc: any): any {
  const t = doc?.tenant;
  return t && typeof t === 'object' ? t.id : t;
}

function sameInstant(a: any, b: any): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

let failures = 0;
function check(name: string, cond: boolean, evidence: string): boolean {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  —  ${evidence}`);
  if (!cond) failures += 1;
  return cond;
}

async function attempt(
  fn: () => Promise<any>,
): Promise<{ ok: boolean; status?: number; errName?: string; errMsg?: string }> {
  try {
    await fn();
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      status: typeof err?.status === 'number' ? err.status : undefined,
      errName: err?.name ?? err?.constructor?.name ?? 'Error',
      errMsg: (err?.message ?? '').slice(0, 140),
    };
  }
}

async function main() {
  payload = await getPayload({ config });

  // ── Identify ──
  const tenants = await payload.find({ collection: 'tenants', overrideAccess: true, sort: 'slug', limit: 100 });
  const tenantA = tenants.docs.find((t: any) => t.slug === 'demo-a');
  const tenantB = tenants.docs.find((t: any) => t.slug === 'demo-b');
  if (!tenantA || !tenantB) throw new Error('Seed tenants demo-a/demo-b not found');

  const users = await payload.find({ collection: 'users', overrideAccess: true, limit: 100 });
  const clientA = users.docs.find((u: any) => u.role === 'client' && (u.tenants ?? []).some((x: any) => tenantId(x) === tenantA.id));
  const clientB = users.docs.find((u: any) => u.role === 'client' && (u.tenants ?? []).some((x: any) => tenantId(x) === tenantB.id));
  const agencyOwner = users.docs.find((u: any) => u.role === 'agency-owner');
  if (!clientA || !clientB || !agencyOwner) throw new Error('Seed users not found');

  const leads = await payload.find({ collection: 'leads', overrideAccess: true, sort: 'name', limit: 100 });
  const alice = leads.docs.find((l: any) => l.name === 'Alice' && tenantId(l) === tenantA.id);
  const bob = leads.docs.find((l: any) => l.name === 'Bob' && tenantId(l) === tenantB.id);
  if (!alice || !bob) throw new Error('Seed leads Alice (A) / Bob (B) not found');

  console.log('── Identified (no secrets printed) ──────────────────────────────');
  console.log(`   tenant A = ${tenantA.slug} (id ${tenantA.id})  ·  known lead: ${alice.name} (id ${alice.id})`);
  console.log(`   tenant B = ${tenantB.slug} (id ${tenantB.id})  ·  known lead: ${bob.name} (id ${bob.id})`);
  console.log('');

  const followUp = new Date(Date.UTC(2026, 8, 1)).toISOString(); // 2026-09-01T00:00:00.000Z

  // ── Step 2: client A updates OWN lead contact + status + nextFollowUp ──
  console.log('── Step 2: own-tenant contact/status/followUp edit ──────────────');
  const own = await payload.create({
    collection: 'leads',
    data: { tenant: tenantA.id, name: 'M8_OWN_PROBE', phone: '555-1000', email: 'own@probe.test', status: 'new' },
    overrideAccess: true,
  });
  const updOwn = await attempt(() =>
    payload.update({
      collection: 'leads',
      id: own.id,
      data: {
        name: 'M8_OWN_UPDATED',
        phone: '555-1001',
        email: 'own-updated@probe.test',
        status: 'contacted',
        nextFollowUp: followUp,
      },
      req: { user: clientA },
      overrideAccess: false,
    }),
  );
  const ownAfter = await payload.findByID({ collection: 'leads', id: own.id, overrideAccess: true });
  check('client A update OWN lead contact fields → succeeds', updOwn.ok, `status=${updOwn.status ?? 'n/a'} err=${updOwn.errName ?? 'none'}`);
  check('client A update OWN lead → name persisted', ownAfter.name === 'M8_OWN_UPDATED', `name=${ownAfter.name}`);
  check('client A update OWN lead → phone persisted', ownAfter.phone === '555-1001', `phone=${ownAfter.phone}`);
  check('client A update OWN lead → email persisted', ownAfter.email === 'own-updated@probe.test', `email=${ownAfter.email}`);
  check('client A update OWN lead → status persisted', ownAfter.status === 'contacted', `status=${ownAfter.status}`);
  check('client A update OWN lead → nextFollowUp persisted', sameInstant(ownAfter.nextFollowUp, followUp), `nextFollowUp=${ownAfter.nextFollowUp}`);
  await payload.delete({ collection: 'leads', id: own.id, overrideAccess: true });
  console.log('');

  // ── Step 3: cross-tenant view + contact-field update denied (symmetric) ──
  console.log('── Step 3: cross-tenant view + contact-field update denied ───────');
  const readAB = await attempt(() => payload.findByID({ collection: 'leads', id: bob.id, req: { user: clientA }, overrideAccess: false }));
  check('client A read of B lead denied', !readAB.ok, `status=${readAB.status} ${readAB.errName}`);
  const bobSnap = { name: bob.name, phone: bob.phone, email: bob.email, status: bob.status, updatedAt: bob.updatedAt };
  const updAB = await attempt(() =>
    payload.update({
      collection: 'leads',
      id: bob.id,
      data: { name: 'HACKED', phone: '555-9999', email: 'hacked@evil.test', status: 'won' },
      req: { user: clientA },
      overrideAccess: false,
    }),
  );
  const bobAfter = await payload.findByID({ collection: 'leads', id: bob.id, overrideAccess: true });
  check('client A update of B lead (contact fields) denied', !updAB.ok, `status=${updAB.status} ${updAB.errName}`);
  check(
    'B lead unchanged after denied update',
    bobAfter.name === bobSnap.name && bobAfter.phone === bobSnap.phone && bobAfter.email === bobSnap.email && bobAfter.status === bobSnap.status && bobAfter.updatedAt === bobSnap.updatedAt,
    `updatedAt unchanged=${bobAfter.updatedAt === bobSnap.updatedAt}`,
  );

  const readBA = await attempt(() => payload.findByID({ collection: 'leads', id: alice.id, req: { user: clientB }, overrideAccess: false }));
  check('client B read of A lead denied', !readBA.ok, `status=${readBA.status} ${readBA.errName}`);
  const aliceSnap = { name: alice.name, phone: alice.phone, email: alice.email, status: alice.status, updatedAt: alice.updatedAt };
  const updBA = await attempt(() =>
    payload.update({
      collection: 'leads',
      id: alice.id,
      data: { name: 'HACKED', phone: '555-9999', email: 'hacked@evil.test', status: 'won' },
      req: { user: clientB },
      overrideAccess: false,
    }),
  );
  const aliceAfter = await payload.findByID({ collection: 'leads', id: alice.id, overrideAccess: true });
  check('client B update of A lead (contact fields) denied', !updBA.ok, `status=${updBA.status} ${updBA.errName}`);
  check(
    'A lead unchanged after denied update',
    aliceAfter.name === aliceSnap.name && aliceAfter.phone === aliceSnap.phone && aliceAfter.email === aliceSnap.email && aliceAfter.status === aliceSnap.status && aliceAfter.updatedAt === aliceSnap.updatedAt,
    `updatedAt unchanged=${aliceAfter.updatedAt === aliceSnap.updatedAt}`,
  );
  console.log('');

  // ── Step 4: tenant immutable while editing contact fields in same request ──
  console.log('── Step 4: tenant immutability with contact edits in same request ──');
  const imm = await payload.create({
    collection: 'leads',
    data: { tenant: tenantA.id, name: 'M8_IMM_PROBE', phone: '555-2000', status: 'new' },
    overrideAccess: true,
  });
  const updImm = await attempt(() =>
    payload.update({
      collection: 'leads',
      id: imm.id,
      data: {
        name: 'M8_IMM_EDITED',
        phone: '555-2001',
        email: 'imm@probe.test',
        status: 'qualified',
        nextFollowUp: followUp,
        tenant: tenantB.id, // attempted reassign — must be ignored
      },
      req: { user: clientA },
      overrideAccess: false,
    }),
  );
  const immAfter = await payload.findByID({ collection: 'leads', id: imm.id, overrideAccess: true });
  check('client A edit own lead + attempted reassign → update allowed', updImm.ok, `status=${updImm.status ?? 'n/a'}`);
  check('tenant unchanged (A) despite reassign attempt in same request', tenantId(immAfter) === tenantA.id, `tenant=${tenantId(immAfter)} (expected ${tenantA.id})`);
  check(
    'contact fields still updated despite reassign attempt',
    immAfter.name === 'M8_IMM_EDITED' && immAfter.phone === '555-2001' && immAfter.email === 'imm@probe.test' && immAfter.status === 'qualified',
    `name=${immAfter.name} phone=${immAfter.phone} email=${immAfter.email} status=${immAfter.status}`,
  );
  await payload.delete({ collection: 'leads', id: imm.id, overrideAccess: true });
  console.log('');

  // ── Step 5: agency-owner cross-tenant view + edit ──
  console.log('── Step 5: agency-owner cross-tenant view + edit ────────────────');
  const listOwner = await payload.find({ collection: 'leads', req: { user: agencyOwner }, overrideAccess: false, limit: 1000 });
  const seesA = listOwner.docs.some((l: any) => l.id === alice.id);
  const seesB = listOwner.docs.some((l: any) => l.id === bob.id);
  check('agency-owner list sees both tenants', seesA && seesB, `sees Alice(A)=${seesA}, Bob(B)=${seesB}`);

  const readOwnerA = await attempt(() => payload.findByID({ collection: 'leads', id: alice.id, req: { user: agencyOwner }, overrideAccess: false }));
  const readOwnerB = await attempt(() => payload.findByID({ collection: 'leads', id: bob.id, req: { user: agencyOwner }, overrideAccess: false }));
  check('agency-owner read tenant A lead by ID', readOwnerA.ok, 'no error');
  check('agency-owner read tenant B lead by ID', readOwnerB.ok, 'no error');

  const ownB = await payload.create({
    collection: 'leads',
    data: { tenant: tenantB.id, name: 'M8_OWNER_B_PROBE', phone: '555-3000', status: 'new' },
    overrideAccess: true,
  });
  const updOwnerB = await attempt(() =>
    payload.update({
      collection: 'leads',
      id: ownB.id,
      data: { name: 'M8_OWNER_B_EDITED', email: 'owner-b@probe.test' },
      req: { user: agencyOwner },
      overrideAccess: false,
    }),
  );
  const ownBAfter = await payload.findByID({ collection: 'leads', id: ownB.id, overrideAccess: true });
  check('agency-owner edit tenant B lead → succeeds', updOwnerB.ok, `status=${updOwnerB.status ?? 'n/a'}`);
  check('agency-owner edit tenant B lead → persisted', ownBAfter.name === 'M8_OWNER_B_EDITED' && ownBAfter.email === 'owner-b@probe.test', `name=${ownBAfter.name} email=${ownBAfter.email}`);
  await payload.delete({ collection: 'leads', id: ownB.id, overrideAccess: true });
  console.log('');

  console.log('════════════════════════════════════════════════════════════════');
  console.log(failures === 0 ? 'RESULT: ALL M8 CHECKS PASSED' : `RESULT: ${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err?.message ?? err);
  process.exit(2);
});
