/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload';
import { LeadIntakeSchema } from './schema';
import { resolveTenantFromSecret, type ResolvedTenant } from './resolve-tenant';

export type IntakeInput = {
  secret: string | null;
  idempotencyKey: string | null;
  body: unknown;
};

export type IntakeResult =
  | { status: 202; success: true; lead: any; resolved: ResolvedTenant; deduplicated: boolean }
  | { status: 400 | 401; error: string; issues?: unknown };

/**
 * Core lead intake, exactly per API-CONTRACT.md:
 *   1. Validate payload (Zod) → 400
 *   2. Resolve tenant from bearer secret → 401
 *   3. Idempotency (X-Idempotency-Key) → duplicate returns original 202
 *   4. Write the lead (saved before any optional action)
 *
 * The owner notification runs AFTER the 202 response (see the route handler).
 */
export async function intakeLead(payload: Payload, input: IntakeInput): Promise<IntakeResult> {
  // 1. Validate payload → 400
  const parsed = LeadIntakeSchema.safeParse(input.body);
  if (!parsed.success) {
    return {
      status: 400,
      error: 'Invalid lead payload',
      issues: parsed.error.flatten().fieldErrors,
    };
  }

  // 2. Resolve tenant from secret → 401
  const resolved = await resolveTenantFromSecret(payload, input.secret);
  if (!resolved) {
    return { status: 401, error: 'Invalid or missing site secret' };
  }

  // 3. Idempotency → duplicate returns the original 202
  if (input.idempotencyKey) {
    const { docs } = await payload.find({
      collection: 'leads',
      where: { idempotencyKey: { equals: input.idempotencyKey } },
      overrideAccess: true,
      limit: 1,
    });
    if (docs.length > 0) {
      return { status: 202, success: true, lead: docs[0], resolved, deduplicated: true };
    }
  }

  // 4. Write the lead
  const lead = await payload.create({
    collection: 'leads',
    data: {
      tenant: resolved.tenant.id,
      site: resolved.site.id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      message: parsed.data.message,
      idempotencyKey: input.idempotencyKey,
      status: 'new',
    },
    overrideAccess: true,
  });

  return { status: 202, success: true, lead, resolved, deduplicated: false };
}
