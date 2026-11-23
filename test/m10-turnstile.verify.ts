/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * M10 — Turnstile bot protection on lead intake.
 *
 * Proves against the REAL pipeline (lib/leads/process.ts) + REAL Supabase:
 *   A. verifyTurnstile with Cloudflare test keys: valid passes, invalid fails,
 *      unconfigured fails closed (no implicit bypass).
 *   B. processLeadRequest gating: missing -> 400; invalid -> 403; valid+secret
 *      -> 202; idempotency unchanged; rejected requests write zero leads.
 *
 * Uses Cloudflare's published test secret keys (always-pass / always-fail).
 * Probe lead created by the valid-token path is deleted afterward.
 *
 * Run: `npx tsx test/m10-turnstile.verify.ts`
 */
import 'dotenv/config';

import { getPayload } from 'payload';
import type { Payload } from 'payload';
import config from '../payload.config';
import { env } from '../lib/env';
import { verifyTurnstile } from '../lib/turnstile';
import { processLeadRequest } from '../lib/leads/process';

const PASS_SECRET='1x0000000000000000000000000000000AA'; // Cloudflare always-passes secret
const FAIL_SECRET='2x0000000000000000000000000000000AA'; // Cloudflare always-fails secret
const SITE_A_SECRET='SEED_PLACEHOLDER_SECRET_SITE_A_DO_NOT_USE'; // seed placeholder for demo-a site

let payload: Payload;
let failures = 0;
function check(name: string, cond: boolean, evidence: string): boolean {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  —  ${evidence}`);
  if (!cond) failures += 1;
  return cond;
}

async function main() {
  payload = await getPayload({ config });

  console.log('── A: verifyTurnstile with Cloudflare test keys ────────────────');
  env.TURNSTILE_SECRET_KEY = PASS_SECRET;
  const pass = await verifyTurnstile('TEST.DUMMY.TOKEN', '198.51.100.1');
  check('A valid token (always-pass key) → success', pass.success === true, `success=${pass.success}`);

  env.TURNSTILE_SECRET_KEY = FAIL_SECRET;
  const fail = await verifyTurnstile('TEST.DUMMY.TOKEN', '198.51.100.1');
  check('A invalid token (always-fail key) → fail', fail.success === false, `success=${fail.success} err=${(fail as any).error}`);

  env.TURNSTILE_SECRET_KEY = '';
  const unconfigured = await verifyTurnstile('TEST.DUMMY.TOKEN', '198.51.100.1');
  check('A unconfigured secret → fail closed (no bypass)', unconfigured.success === false, `success=${unconfigured.success}`);
  console.log('');

  console.log('── B: processLeadRequest gating ────────────────────────────────');

  env.TURNSTILE_SECRET_KEY = PASS_SECRET;
  const missing = await processLeadRequest(payload, {
    ip: '198.51.100.1', secret: SITE_A_SECRET, idempotencyKey: null,
    body: { name: 'M10_MISSING', phone: '555-0001' },
  });
  check('B1 missing token → 400', missing.ok === false && missing.status === 400, `status=${missing.ok ? 'n/a' : missing.status} error=${missing.ok ? '' : missing.error}`);

  env.TURNSTILE_SECRET_KEY = FAIL_SECRET;
  const invalid = await processLeadRequest(payload, {
    ip: '198.51.100.1', secret: SITE_A_SECRET, idempotencyKey: null,
    body: { name: 'M10_INVALID', phone: '555-0002', turnstileToken: 'TEST.DUMMY.TOKEN' },
  });
  check('B2 invalid token → 403', invalid.ok === false && invalid.status === 403, `status=${invalid.ok ? 'n/a' : invalid.status} error=${invalid.ok ? '' : invalid.error}`);

  env.TURNSTILE_SECRET_KEY = PASS_SECRET;
  const idemKey = `m10-${Date.now()}`;
  const okRes = await processLeadRequest(payload, {
    ip: '198.51.100.1', secret: SITE_A_SECRET, idempotencyKey: idemKey,
    body: { name: 'M10_VALID_PROBE', phone: '555-0003', email: 'm10@probe.test', turnstileToken: 'TEST.DUMMY.TOKEN' },
  });
  check('B3 valid token + secret → 202', okRes.ok === true && okRes.result.status === 202, `status=${okRes.ok ? okRes.result.status : 'n/a'}`);

  const dupRes = await processLeadRequest(payload, {
    ip: '198.51.100.1', secret: SITE_A_SECRET, idempotencyKey: idemKey,
    body: { name: 'M10_VALID_PROBE', phone: '555-0003', email: 'm10@probe.test', turnstileToken: 'TEST.DUMMY.TOKEN' },
  });
  check('B4 duplicate idempotency key → 202', dupRes.ok === true && dupRes.result.status === 202, `status=${dupRes.ok ? dupRes.result.status : 'n/a'}`);

  const written = await payload.find({
    collection: 'leads',
    where: { idempotencyKey: { equals: idemKey } },
    overrideAccess: true,
    limit: 10,
  });
  check('B4 exactly one lead written for the idempotency key', written.totalDocs === 1, `count=${written.totalDocs}`);

  const rejected = await payload.find({
    collection: 'leads',
    where: { or: [{ name: { equals: 'M10_MISSING' } }, { name: { equals: 'M10_INVALID' } }] },
    overrideAccess: true,
    limit: 10,
  });
  check('B5 missing/invalid requests wrote zero leads', rejected.totalDocs === 0, `count=${rejected.totalDocs}`);
  console.log('');

  for (const doc of written.docs as any[]) {
    await payload.delete({ collection: 'leads', id: doc.id, overrideAccess: true });
  }
  console.log(`(cleaned up ${written.totalDocs} probe lead(s))`);

  console.log('════════════════════════════════════════════════════════════');
  console.log(failures === 0 ? 'RESULT: ALL M10 TURNSTILE CHECKS PASSED' : `RESULT: ${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err?.message ?? err);
  process.exit(2);
});
