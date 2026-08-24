/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * M9 — Lead follow-up completion action (guided schedule-or-close).
 *
 * Proves the server-side `_completeFollowUp` validation against the REAL
 * Supabase Postgres DB via the Local API with `overrideAccess: false` +
 * `req: { user }`, plus tenant isolation on the new action. Mirrors
 * test/m3-isolation.verify.ts and test/m8-detail-edit.verify.ts.
 *
 * Covers (task step 5):
 *   a. client A completes an overdue/due-today lead with a future date → drops
 *      out of the matching M7 filter.
 *   b. client A completes a different lead with a terminal status (won) →
 *      drops out of Overdue.
 *   c. marker with neither a valid future date nor a terminal status → rejected.
 *   d. marker with BOTH a future date and a terminal status → rejected ambiguous.
 *   e. ordinary M8 edit (no marker) touching unrelated fields → succeeds;
 *      ordinary edit setting BOTH date+status (no marker) → still succeeds
 *      (proves the marker gate is correctly scoped).
 *   f. cross-tenant completion denied 403 (symmetric A↔B), record unchanged;
 *      agency-owner completes cross-tenant successfully.
 *
 * Probe docs are deleted in a `finally` block. Seed/E2E leads are never mutated.
 *
 * Run: `npx tsx test/m9-complete-followup.verify.ts` (requires DATABASE_URI in .env.local)
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
      errMsg: (err?.message ?? '').slice(0, 160),
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

  // ── UTC day bounds (mirrors LeadListFilters.utcDayBounds) ──
  const now = new Date();
  const startUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const today = new Date(startUtc).toISOString();
  const tomorrow = new Date(startUtc + 86_400_000).toISOString();

  // ── M7 filters (verbatim from components/LeadListFilters.tsx) ──
  const overdueFilter = {
    and: [
      { nextFollowUp: { less_than: today } },
      { status: { not_in: ['won', 'lost'] } },
    ],
  };
  const dueTodayFilter = {
    and: [
      { nextFollowUp: { greater_than_equal: today } },
      { nextFollowUp: { less_than: tomorrow } },
    ],
  };

  const overdueISO = new Date(Date.now() - 7 * 86_400_000).toISOString(); // 7 days ago
  const dueTodayISO = new Date(startUtc + 2 * 3_600_000).toISOString(); // 2h after midnight UTC today
  const futureISO = new Date(Date.now() + 7 * 86_400_000).toISOString(); // 7 days ahead

  const probes: any[] = [];
  async function makeProbe(tenantIdValue: any, data: Record<string, any>) {
    const p = await payload.create({
      collection: 'leads',
      data: { tenant: tenantIdValue, ...data },
      overrideAccess: true,
    });
    probes.push(p.id);
    return p;
  }

  async function listAs(user: any, where: any) {
    const r = await payload.find({ collection: 'leads', where, req: { user }, overrideAccess: false, limit: 1000 });
    return r.docs;
  }

  try {
    // ── 5a: schedule path — due-today lead drops out of "Due Today" ──
    console.log('── 5a: complete due-today lead by scheduling a future date ──────');
    const sched = await makeProbe(tenantA.id, { name: 'M9_SCHED_PROBE', status: 'new', nextFollowUp: dueTodayISO });
    const dueBefore = await listAs(clientA, dueTodayFilter);
    check('5a due-today lead appears in "Due Today" before completion', dueBefore.some((l: any) => l.id === sched.id), `id=${sched.id} inDueToday=${dueBefore.some((l: any) => l.id === sched.id)}`);

    const updSched = await attempt(() =>
      payload.update({
        collection: 'leads',
        id: sched.id,
        data: { _completeFollowUp: true, nextFollowUp: futureISO } as any,
        req: { user: clientA },
        overrideAccess: false,
      }),
    );
    check('5a schedule completion succeeds', updSched.ok, `status=${updSched.status ?? 'n/a'} err=${updSched.errName ?? 'none'}`);

    const schedAfter = await payload.findByID({ collection: 'leads', id: sched.id, overrideAccess: true });
    check('5a nextFollowUp persisted to future date', sameInstant(schedAfter.nextFollowUp, futureISO), `nextFollowUp=${schedAfter.nextFollowUp}`);
    check('5a marker not persisted', (schedAfter as any)._completeFollowUp === undefined, `_completeFollowUp=${(schedAfter as any)._completeFollowUp}`);

    const dueAfter = await listAs(clientA, dueTodayFilter);
    check('5a lead no longer in "Due Today" after reschedule', !dueAfter.some((l: any) => l.id === sched.id), `stillInDueToday=${dueAfter.some((l: any) => l.id === sched.id)}`);
    console.log('');

    // ── 5b: close path — overdue lead drops out of "Overdue" via terminal status ──
    console.log('── 5b: complete overdue lead with a terminal status (won) ───────');
    const close = await makeProbe(tenantA.id, { name: 'M9_CLOSE_PROBE', status: 'new', nextFollowUp: overdueISO });
    const overdueBefore = await listAs(clientA, overdueFilter);
    check('5b overdue lead appears in "Overdue" before completion', overdueBefore.some((l: any) => l.id === close.id), `id=${close.id} inOverdue=${overdueBefore.some((l: any) => l.id === close.id)}`);

    const updClose = await attempt(() =>
      payload.update({
        collection: 'leads',
        id: close.id,
        data: { _completeFollowUp: true, status: 'won' } as any,
        req: { user: clientA },
        overrideAccess: false,
      }),
    );
    check('5b close completion (won) succeeds', updClose.ok, `status=${updClose.status ?? 'n/a'} err=${updClose.errName ?? 'none'}`);

    const closeAfter = await payload.findByID({ collection: 'leads', id: close.id, overrideAccess: true });
    check('5b status persisted to won', closeAfter.status === 'won', `status=${closeAfter.status}`);
    check('5b marker not persisted', (closeAfter as any)._completeFollowUp === undefined, `_completeFollowUp=${(closeAfter as any)._completeFollowUp}`);

    const overdueAfter = await listAs(clientA, overdueFilter);
    check('5b lead no longer in "Overdue" after close', !overdueAfter.some((l: any) => l.id === close.id), `stillInOverdue=${overdueAfter.some((l: any) => l.id === close.id)}`);
    console.log('');

    // ── 5c: neither a valid future date nor a terminal status → rejected ──
    console.log('── 5c: marker with neither valid date nor terminal status ────────');
    const neither = await makeProbe(tenantA.id, { name: 'M9_NEITHER_PROBE', status: 'new', nextFollowUp: overdueISO });

    const neitherEmpty = await attempt(() =>
      payload.update({ collection: 'leads', id: neither.id, data: { _completeFollowUp: true } as any, req: { user: clientA }, overrideAccess: false }),
    );
    check('5c marker alone (no date, no status) → rejected', !neitherEmpty.ok, `status=${neitherEmpty.status} err=${neitherEmpty.errMsg}`);
    check('5c marker alone → 400', neitherEmpty.status === 400, `status=${neitherEmpty.status}`);

    const neitherNonTerminal = await attempt(() =>
      payload.update({ collection: 'leads', id: neither.id, data: { _completeFollowUp: true, status: 'new' } as any, req: { user: clientA }, overrideAccess: false }),
    );
    check('5c marker + non-terminal status (new) → rejected', !neitherNonTerminal.ok, `status=${neitherNonTerminal.status} err=${neitherNonTerminal.errMsg}`);
    check('5c marker + non-terminal status → 400', neitherNonTerminal.status === 400, `status=${neitherNonTerminal.status}`);

    const neitherPastDate = await attempt(() =>
      payload.update({ collection: 'leads', id: neither.id, data: { _completeFollowUp: true, nextFollowUp: overdueISO } as any, req: { user: clientA }, overrideAccess: false }),
    );
    check('5c marker + past date → rejected', !neitherPastDate.ok, `status=${neitherPastDate.status} err=${neitherPastDate.errMsg}`);
    check('5c marker + past date → 400', neitherPastDate.status === 400, `status=${neitherPastDate.status}`);

    const neitherAfter = await payload.findByID({ collection: 'leads', id: neither.id, overrideAccess: true });
    check('5c lead unchanged after rejected attempts', neitherAfter.status === 'new' && sameInstant(neitherAfter.nextFollowUp, overdueISO), `status=${neitherAfter.status} nextFollowUp=${neitherAfter.nextFollowUp}`);
    console.log('');

    // ── 5d: both future date AND terminal status → rejected ambiguous ──
    console.log('── 5d: marker with BOTH future date and terminal status ─────────');
    const both = await makeProbe(tenantA.id, { name: 'M9_BOTH_PROBE', status: 'new', nextFollowUp: overdueISO });
    const updBoth = await attempt(() =>
      payload.update({
        collection: 'leads',
        id: both.id,
        data: { _completeFollowUp: true, nextFollowUp: futureISO, status: 'won' } as any,
        req: { user: clientA },
        overrideAccess: false,
      }),
    );
    check('5d both date + terminal → rejected ambiguous', !updBoth.ok, `status=${updBoth.status} err=${updBoth.errMsg}`);
    check('5d both → 400', updBoth.status === 400, `status=${updBoth.status}`);
    const bothAfter = await payload.findByID({ collection: 'leads', id: both.id, overrideAccess: true });
    check('5d lead unchanged after ambiguous rejection', bothAfter.status === 'new' && sameInstant(bothAfter.nextFollowUp, overdueISO), `status=${bothAfter.status}`);
    console.log('');

    // ── 5e: ordinary M8 edit (no marker) unaffected ──
    console.log('── 5e: ordinary edits (no marker) are unaffected ───────────────');
    const plain = await makeProbe(tenantA.id, { name: 'M9_PLAIN_PROBE', phone: '555-0000', status: 'new' });
    const updPlain = await attempt(() =>
      payload.update({
        collection: 'leads',
        id: plain.id,
        data: { name: 'M9_PLAIN_EDITED', phone: '555-0001' },
        req: { user: clientA },
        overrideAccess: false,
      }),
    );
    check('5e ordinary edit (no marker) succeeds', updPlain.ok, `status=${updPlain.status ?? 'n/a'} err=${updPlain.errName ?? 'none'}`);
    const plainAfter = await payload.findByID({ collection: 'leads', id: plain.id, overrideAccess: true });
    check('5e ordinary edit persisted', plainAfter.name === 'M9_PLAIN_EDITED' && plainAfter.phone === '555-0001', `name=${plainAfter.name} phone=${plainAfter.phone}`);

    // Critical scoping check: an ordinary update (no marker) that sets BOTH a
    // future date and a terminal status must NOT be rejected — the marker gate
    // only applies when `_completeFollowUp: true` is present.
    const bothNoMarker = await makeProbe(tenantA.id, { name: 'M9_NOMARKER_BOTH_PROBE', status: 'new' });
    const updBothNoMarker = await attempt(() =>
      payload.update({
        collection: 'leads',
        id: bothNoMarker.id,
        data: { nextFollowUp: futureISO, status: 'won' },
        req: { user: clientA },
        overrideAccess: false,
      }),
    );
    check('5e ordinary edit setting BOTH date+status (no marker) → still succeeds', updBothNoMarker.ok, `status=${updBothNoMarker.status ?? 'n/a'} err=${updBothNoMarker.errName ?? 'none'}`);
    const bothNoMarkerAfter = await payload.findByID({ collection: 'leads', id: bothNoMarker.id, overrideAccess: true });
    check('5e both fields persisted without marker', bothNoMarkerAfter.status === 'won' && sameInstant(bothNoMarkerAfter.nextFollowUp, futureISO), `status=${bothNoMarkerAfter.status}`);
    console.log('');

    // ── 5f: cross-tenant completion denied (symmetric), owner succeeds ──
    console.log('── 5f: tenant isolation on the completion action ────────────────');
    const bobSnap = { status: bob.status, nextFollowUp: bob.nextFollowUp, updatedAt: bob.updatedAt };
    const updAB = await attempt(() =>
      payload.update({
        collection: 'leads',
        id: bob.id,
        data: { _completeFollowUp: true, status: 'won' } as any,
        req: { user: clientA },
        overrideAccess: false,
      }),
    );
    check('5f client A completion of B lead denied', !updAB.ok, `status=${updAB.status} ${updAB.errName}`);
    check('5f client A denied with 403', updAB.status === 403, `status=${updAB.status}`);
    const bobAfterDeny = await payload.findByID({ collection: 'leads', id: bob.id, overrideAccess: true });
    check(
      '5f B lead unchanged after denied completion',
      bobAfterDeny.status === bobSnap.status && bobAfterDeny.updatedAt === bobSnap.updatedAt,
      `status=${bobAfterDeny.status} updatedAt unchanged=${bobAfterDeny.updatedAt === bobSnap.updatedAt}`,
    );

    const aliceSnap = { status: alice.status, nextFollowUp: alice.nextFollowUp, updatedAt: alice.updatedAt };
    const updBA = await attempt(() =>
      payload.update({
        collection: 'leads',
        id: alice.id,
        data: { _completeFollowUp: true, status: 'won' } as any,
        req: { user: clientB },
        overrideAccess: false,
      }),
    );
    check('5f client B completion of A lead denied', !updBA.ok, `status=${updBA.status} ${updBA.errName}`);
    check('5f client B denied with 403', updBA.status === 403, `status=${updBA.status}`);
    const aliceAfterDeny = await payload.findByID({ collection: 'leads', id: alice.id, overrideAccess: true });
    check(
      '5f A lead unchanged after denied completion',
      aliceAfterDeny.status === aliceSnap.status && aliceAfterDeny.updatedAt === aliceSnap.updatedAt,
      `status=${aliceAfterDeny.status} updatedAt unchanged=${aliceAfterDeny.updatedAt === aliceSnap.updatedAt}`,
    );

    const ownerProbe = await makeProbe(tenantB.id, { name: 'M9_OWNER_B_PROBE', status: 'new', nextFollowUp: overdueISO });
    const updOwner = await attempt(() =>
      payload.update({
        collection: 'leads',
        id: ownerProbe.id,
        data: { _completeFollowUp: true, status: 'lost' } as any,
        req: { user: agencyOwner },
        overrideAccess: false,
      }),
    );
    check('5f agency-owner completes tenant B lead cross-tenant → succeeds', updOwner.ok, `status=${updOwner.status ?? 'n/a'} err=${updOwner.errName ?? 'none'}`);
    const ownerAfter = await payload.findByID({ collection: 'leads', id: ownerProbe.id, overrideAccess: true });
    check('5f agency-owner completion persisted', ownerAfter.status === 'lost', `status=${ownerAfter.status}`);
    console.log('');
  } finally {
    // ── cleanup: remove every probe doc (overrideAccess: true) ──
    for (const pid of probes) {
      try {
        await payload.delete({ collection: 'leads', id: pid, overrideAccess: true });
      } catch {
        // probe may already be gone; ignore
      }
    }
  }

  console.log('════════════════════════════════════════════════════════════════');
  console.log(failures === 0 ? 'RESULT: ALL M9 CHECKS PASSED' : `RESULT: ${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err?.message ?? err);
  process.exit(2);
});
