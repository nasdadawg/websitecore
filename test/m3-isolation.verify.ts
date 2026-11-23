/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * M3 + M3.1 + M3.2 — Tenant-isolation verification against the REAL Supabase
 * Postgres DB. Exercises the same Payload access-control functions the
 * REST/admin layers wrap, via the Local API with `overrideAccess: false` +
 * `req: { user }`.
 *
 * Covers list, read (findByID), create (forged + no-tenant), reassign, update,
 * and delete cross-tenant checks, plus a delete control and an agency-owner
 * create probe.
 *
 * Any probe doc created for a check is deleted again (overrideAccess:true) so
 * the DB is left exactly as found. Seed/E2E leads are never deleted or mutated.
 *
 * Run: `npx tsx test/m3-isolation.verify.ts`  (requires DATABASE_URI in .env.local)
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

function snapshot(lead: any) {
  return {
    name: lead.name,
    status: lead.status,
    dealValue: lead.dealValue ?? null,
    notes: lead.notes ?? null,
    updatedAt: lead.updatedAt,
  };
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

  // ── 1. Identify ──
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
  console.log(`   client A tenants=[${(clientA.tenants ?? []).map((x: any) => tenantId(x))}]  client B tenants=[${(clientB.tenants ?? []).map((x: any) => tenantId(x))}]`);
  console.log('');

  // ── 2. List ──
  console.log('── List access ──────────────────────────────────────────────────');
  const listA = await payload.find({ collection: 'leads', req: { user: clientA }, overrideAccess: false, limit: 1000 });
  check('client A lead list → only tenant A leads', listA.docs.every((l: any) => tenantId(l) === tenantA.id), `${listA.totalDocs} lead(s), every doc tenant==${tenantA.id}`);
  check('client A lead list → excludes B known lead', !listA.docs.some((l: any) => l.id === bob.id), `lead id ${bob.id} not in result`);
  const listB = await payload.find({ collection: 'leads', req: { user: clientB }, overrideAccess: false, limit: 1000 });
  check('client B lead list → only tenant B leads', listB.docs.every((l: any) => tenantId(l) === tenantB.id), `${listB.totalDocs} lead(s), every doc tenant==${tenantB.id}`);
  check('client B lead list → excludes A known lead', !listB.docs.some((l: any) => l.id === alice.id), `lead id ${alice.id} not in result`);
  const listOwner = await payload.find({ collection: 'leads', req: { user: agencyOwner }, overrideAccess: false, limit: 1000 });
  check('agency-owner sees all leads (control)', listOwner.totalDocs >= leads.totalDocs, `sees ${listOwner.totalDocs} of ${leads.totalDocs}`);
  console.log('');

  // ── 3. Direct read ──
  console.log('── Direct read (findByID) ───────────────────────────────────────');
  const readAB = await attempt(() => payload.findByID({ collection: 'leads', id: bob.id, req: { user: clientA }, overrideAccess: false }));
  check('client A read of B lead denied', !readAB.ok, `status=${readAB.status} ${readAB.errName}`);
  const readBA = await attempt(() => payload.findByID({ collection: 'leads', id: alice.id, req: { user: clientB }, overrideAccess: false }));
  check('client B read of A lead denied', !readBA.ok, `status=${readBA.status} ${readBA.errName}`);
  const readOwnA = await attempt(() => payload.findByID({ collection: 'leads', id: alice.id, req: { user: clientA }, overrideAccess: false }));
  check('client A read of OWN lead allowed (control)', readOwnA.ok, 'no error thrown');
  console.log('');

  // ── 4. Create (forged tenant + no tenant) ──
  console.log('── Create access (authenticated create must be denied; zero rows) ──');
  async function createProbe(user: any, targetTenantId: any | undefined, probeName: string) {
    const totalBefore = (await payload.count({ collection: 'leads', overrideAccess: true })).totalDocs;
    const targetBefore = targetTenantId != null
      ? (await payload.count({ collection: 'leads', where: { tenant: { equals: targetTenantId } }, overrideAccess: true })).totalDocs
      : null;
    let denied = false;
    let status: number | undefined;
    let errName: string | undefined;
    let landedTenant: any;
    try {
      const doc = await payload.create({
        collection: 'leads',
        data: targetTenantId != null
          ? { tenant: targetTenantId, name: probeName, phone: '555-0000', status: 'new' }
          : { name: probeName, phone: '555-0000', status: 'new' },
        req: { user },
        overrideAccess: false,
      });
      landedTenant = tenantId(doc);
      await payload.delete({ collection: 'leads', id: doc.id, overrideAccess: true });
    } catch (err: any) {
      denied = true;
      status = typeof err?.status === 'number' ? err.status : undefined;
      errName = err?.name ?? err?.constructor?.name ?? 'Error';
    }
    const totalAfter = (await payload.count({ collection: 'leads', overrideAccess: true })).totalDocs;
    return { denied, status, errName, landedTenant, zeroTotal: totalAfter === totalBefore, zeroTarget: targetBefore == null ? true : (await payload.count({ collection: 'leads', where: { tenant: { equals: targetTenantId } }, overrideAccess: true })).totalDocs === targetBefore };
  }

  const cAB = await createProbe(clientA, tenantB.id, 'FORGE_A_TO_B');
  check('client A create lead forged to tenant B denied', cAB.denied, `status=${cAB.status} ${cAB.errName}${!cAB.denied ? ` (landed tenant=${cAB.landedTenant})` : ''}`);
  check('client A create forged → zero docs in tenant B', cAB.zeroTarget, 'tenant B count unchanged');
  check('client A create forged → zero docs overall', cAB.zeroTotal, 'total count unchanged');

  const cNoTenant = await createProbe(clientA, undefined, 'NO_TENANT_A');
  check('client A create with no tenant denied', cNoTenant.denied, `status=${cNoTenant.status} ${cNoTenant.errName}`);
  check('client A create no-tenant → zero docs overall', cNoTenant.zeroTotal, 'total count unchanged');

  const cBA = await createProbe(clientB, tenantA.id, 'FORGE_B_TO_A');
  check('client B create lead forged to tenant A denied', cBA.denied, `status=${cBA.status} ${cBA.errName}${!cBA.denied ? ` (landed tenant=${cBA.landedTenant})` : ''}`);
  check('client B create forged → zero docs in tenant A', cBA.zeroTarget, 'tenant A count unchanged');
  check('client B create forged → zero docs overall', cBA.zeroTotal, 'total count unchanged');
  console.log('');

  // ── 5. Reassign (tenant immutability) ──
  console.log('── Reassign (tenant ownership immutable after creation) ──');
  const rethrowA = await payload.create({ collection: 'leads', data: { tenant: tenantA.id, name: 'REASSIGN_THROWAWAY_A', phone: '555-0000', status: 'new' }, overrideAccess: true });
  const reassignAB = await attempt(() =>
    payload.update({ collection: 'leads', id: rethrowA.id, data: { tenant: tenantB.id, name: 'REASSIGN_ATTEMPT' }, req: { user: clientA }, overrideAccess: false }),
  );
  const rethrowAAfter = await payload.findByID({ collection: 'leads', id: rethrowA.id, overrideAccess: true });
  check('client A reassign own lead → tenant remains A', tenantId(rethrowAAfter) === tenantA.id, `tenant=${tenantId(rethrowAAfter)} (expected ${tenantA.id})`);
  check('client A reassign → rejected (tenant membership enforced)', !reassignAB.ok, `update rejected (ok=${reassignAB.ok}, ${reassignAB.errName})`);
  check('client A reassign → name unchanged (whole update rejected)', rethrowAAfter.name === 'REASSIGN_THROWAWAY_A', `name=${rethrowAAfter.name}`);
  await payload.delete({ collection: 'leads', id: rethrowA.id, overrideAccess: true });

  const rethrowB = await payload.create({ collection: 'leads', data: { tenant: tenantB.id, name: 'REASSIGN_THROWAWAY_B', phone: '555-0000', status: 'new' }, overrideAccess: true });
  const reassignBA = await attempt(() =>
    payload.update({ collection: 'leads', id: rethrowB.id, data: { tenant: tenantA.id, name: 'REASSIGN_ATTEMPT' }, req: { user: clientB }, overrideAccess: false }),
  );
  const rethrowBAfter = await payload.findByID({ collection: 'leads', id: rethrowB.id, overrideAccess: true });
  check('client B reassign own lead → tenant remains B', tenantId(rethrowBAfter) === tenantB.id, `tenant=${tenantId(rethrowBAfter)} (expected ${tenantB.id})`);
  check('client B reassign → rejected (tenant membership enforced)', !reassignBA.ok, `update rejected (ok=${reassignBA.ok}, ${reassignBA.errName})`);
  check('client B reassign → name unchanged (whole update rejected)', rethrowBAfter.name === 'REASSIGN_THROWAWAY_B', `name=${rethrowBAfter.name}`);
  await payload.delete({ collection: 'leads', id: rethrowB.id, overrideAccess: true });
  console.log('');

  // ── 6. Cross-tenant update denied + record unchanged ──
  console.log('── Update access (cross-tenant must be denied + record unchanged) ──');
  const bobSnap = snapshot(await payload.findByID({ collection: 'leads', id: bob.id, overrideAccess: true }));
  const updAB = await attempt(() => payload.update({ collection: 'leads', id: bob.id, data: { name: 'HACKED', status: 'won' }, req: { user: clientA }, overrideAccess: false }));
  const bobAfter = await payload.findByID({ collection: 'leads', id: bob.id, overrideAccess: true });
  check('client A update of B lead denied', !updAB.ok, `status=${updAB.status} ${updAB.errName}`);
  check('B lead unchanged after denied update', JSON.stringify(snapshot(bobAfter)) === JSON.stringify(bobSnap), `updatedAt unchanged=${bobAfter.updatedAt === bobSnap.updatedAt}`);

  const aliceSnap = snapshot(await payload.findByID({ collection: 'leads', id: alice.id, overrideAccess: true }));
  const updBA = await attempt(() => payload.update({ collection: 'leads', id: alice.id, data: { name: 'HACKED', status: 'won' }, req: { user: clientB }, overrideAccess: false }));
  const aliceAfter = await payload.findByID({ collection: 'leads', id: alice.id, overrideAccess: true });
  check('client B update of A lead denied', !updBA.ok, `status=${updBA.status} ${updBA.errName}`);
  check('A lead unchanged after denied update', JSON.stringify(snapshot(aliceAfter)) === JSON.stringify(aliceSnap), `updatedAt unchanged=${aliceAfter.updatedAt === aliceSnap.updatedAt}`);
  console.log('');

  // ── 7. Cross-tenant delete denied + record unchanged ──
  console.log('── Delete access (cross-tenant must be denied + record unchanged) ──');
  const bobDelSnap = snapshot(await payload.findByID({ collection: 'leads', id: bob.id, overrideAccess: true }));
  const delAB = await attempt(() => payload.delete({ collection: 'leads', id: bob.id, req: { user: clientA }, overrideAccess: false }));
  const bobStill = await payload.findByID({ collection: 'leads', id: bob.id, overrideAccess: true }).then(() => true).catch(() => false);
  const bobAfterDel = await payload.findByID({ collection: 'leads', id: bob.id, overrideAccess: true });
  check('client A delete of B lead denied', !delAB.ok, `status=${delAB.status} ${delAB.errName}`);
  check('B lead still exists after denied delete', bobStill, `findByID(id=${bob.id}) succeeds`);
  check('B lead unchanged after denied delete', JSON.stringify(snapshot(bobAfterDel)) === JSON.stringify(bobDelSnap), `updatedAt unchanged=${bobAfterDel.updatedAt === bobDelSnap.updatedAt}`);

  const aliceDelSnap = snapshot(await payload.findByID({ collection: 'leads', id: alice.id, overrideAccess: true }));
  const delBA = await attempt(() => payload.delete({ collection: 'leads', id: alice.id, req: { user: clientB }, overrideAccess: false }));
  const aliceStill = await payload.findByID({ collection: 'leads', id: alice.id, overrideAccess: true }).then(() => true).catch(() => false);
  const aliceAfterDel = await payload.findByID({ collection: 'leads', id: alice.id, overrideAccess: true });
  check('client B delete of A lead denied', !delBA.ok, `status=${delBA.status} ${delBA.errName}`);
  check('A lead still exists after denied delete', aliceStill, `findByID(id=${alice.id}) succeeds`);
  check('A lead unchanged after denied delete', JSON.stringify(snapshot(aliceAfterDel)) === JSON.stringify(aliceDelSnap), `updatedAt unchanged=${aliceAfterDel.updatedAt === aliceDelSnap.updatedAt}`);
  console.log('');

  // ── 8. Delete is denied for ALL roles (read/limited-edit admin) ──
  console.log('── Delete denial (no delete through any authenticated path) ──');
  const throwaway = await payload.create({ collection: 'leads', data: { tenant: tenantA.id, name: 'DELETE_DENY_PROBE', phone: '555-0000', status: 'new' }, overrideAccess: true });
  const delOwner = await attempt(() => payload.delete({ collection: 'leads', id: throwaway.id, req: { user: agencyOwner }, overrideAccess: false }));
  const throwawayStill = await payload.findByID({ collection: 'leads', id: throwaway.id, overrideAccess: true }).then(() => true).catch(() => false);
  check('agency-owner delete denied (read/limited-edit admin)', !delOwner.ok, `status=${delOwner.status} ${delOwner.errName}`);
  check('probe lead still exists (delete denied)', throwawayStill, `findByID(id=${throwaway.id}) succeeds`);
  await payload.delete({ collection: 'leads', id: throwaway.id, overrideAccess: true });
  console.log('');

  // ── 9. Agency-owner create (follow-up evidence) ──
  console.log('── Agency-owner create (currently denied — trusted selected tenant not wired) ──');
  const ownerTotalBefore = (await payload.count({ collection: 'leads', overrideAccess: true })).totalDocs;
  const cOwner = await attempt(() =>
    payload.create({ collection: 'leads', data: { tenant: tenantA.id, name: 'OWNER_CREATE_PROBE', phone: '555-0000', status: 'new' }, req: { user: agencyOwner }, overrideAccess: false }),
  );
  const ownerTotalAfter = (await payload.count({ collection: 'leads', overrideAccess: true })).totalDocs;
  check('agency-owner create via access path denied (follow-up: no trusted selected tenant)', !cOwner.ok, `status=${cOwner.status} ${cOwner.errName}`);
  check('agency-owner create → zero docs written', ownerTotalAfter === ownerTotalBefore, 'total count unchanged');
  console.log('');

  console.log('════════════════════════════════════════════════════════════════');
  console.log(failures === 0 ? 'RESULT: ALL ISOLATION CHECKS PASSED' : `RESULT: ${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err?.message ?? err);
  process.exit(2);
});
