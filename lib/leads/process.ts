/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Payload } from 'payload';
import { precheckRateLimit, rateLimitLead } from '@/lib/rate-limit';
import { verifyTurnstile } from '@/lib/turnstile';
import { intakeLead, type IntakeResult } from './intake';

/**
 * The full intake pipeline, minus the HTTP response mapping and the `after()`
 * owner-notification (which live in the route handler and require a real
 * request scope). Extracted so the bot-protection order is unit-testable:
 *
 *   0. cheap precheck rate limit (before Siteverify)
 *   1. require + verify Turnstile token (server-side)
 *   2. real attempt rate limit (only after Turnstile passes)
 *   3. validate → resolve secret → idempotency → write (intakeLead)
 */

export type ProcessResult =
  | { ok: true; result: IntakeResult }
  | {
      ok: false;
      status: 400 | 403 | 429;
      error: string;
      retryAfterSeconds?: number;
    };

function extractTurnstileToken(body: unknown): string {
  if (body && typeof body === 'object') {
    const t = (body as Record<string, unknown>).turnstileToken;
    if (typeof t === 'string') return t;
  }
  return '';
}

export async function processLeadRequest(
  payload: Payload,
  input: { ip: string; secret: string | null; idempotencyKey: string | null; body: unknown },
): Promise<ProcessResult> {
  // 0. Cheap precheck BEFORE spending a Siteverify call.
  const pre = await precheckRateLimit(input.ip);
  if (pre.limited) {
    return { ok: false, status: 429, error: 'Too many requests. Please try again later.', retryAfterSeconds: pre.retryAfterSeconds };
  }

  // 1. Require Turnstile token.
  const turnstileToken = extractTurnstileToken(input.body);
  if (!turnstileToken) {
    return { ok: false, status: 400, error: 'Missing Turnstile token' };
  }

  // 1b. Verify Turnstile server-side.
  const turnstile = await verifyTurnstile(turnstileToken, input.ip);
  if (!turnstile.success) {
    return { ok: false, status: 403, error: turnstile.error };
  }

  // 2. Real attempt quota — only reached once Turnstile passed.
  const rl = await rateLimitLead(input.ip);
  if (rl.limited) {
    return { ok: false, status: 429, error: 'Too many requests. Please try again later.', retryAfterSeconds: rl.retryAfterSeconds };
  }

  // 3. Validate → resolve secret → idempotency → write.
  const result = await intakeLead(payload, {
    secret: input.secret,
    idempotencyKey: input.idempotencyKey,
    body: input.body,
  });
  return { ok: true, result };
}
