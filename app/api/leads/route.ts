import { NextResponse, after } from 'next/server';
import { getPayload } from 'payload';
import config from '@/payload.config';
import { rateLimitLead } from '@/lib/rate-limit';
import { intakeLead } from '@/lib/leads/intake';
import { notifyOwner } from '@/lib/leads/notify';

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Secure lead intake — the single most important endpoint.
 * Per API-CONTRACT.md:
 *   1. Rate limit by IP (Upstash, 5/10min) — before anything else.
 *   2. Validate payload (Zod) → 400.
 *   3. Resolve tenant from bearer secret → 401.
 *   4. Idempotency (X-Idempotency-Key) → duplicate returns original 202.
 *   5. Write the lead via Payload Local API (saved before any optional action).
 *   6. Respond 202 immediately.
 *   7. after() → Resend owner notification (failure never un-saves the lead).
 */
export async function POST(req: Request) {
  // 1. Rate limit before anything else
  const ip = clientIp(req);
  const rl = await rateLimitLead(ip);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  // Parse body + headers
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const auth = req.headers.get('authorization') ?? '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const idempotencyKey = req.headers.get('x-idempotency-key');

  // 2-5. Validate → resolve secret → idempotency → write
  const payload = await getPayload({ config });
  const result = await intakeLead(payload, { secret, idempotencyKey, body });

  if (result.status !== 202) {
    return NextResponse.json(
      { error: result.error, ...('issues' in result && result.issues ? { issues: result.issues } : {}) },
      { status: result.status },
    );
  }

  // 7. Notify after the response is sent. Never throws / un-saves the lead.
  after(() => {
    notifyOwner({
      tenantName: result.resolved.tenant.name,
      notifyEmail: result.resolved.tenant.notifyEmail,
      lead: {
        name: result.lead.name,
        phone: result.lead.phone,
        email: result.lead.email,
        message: result.lead.message,
      },
    }).catch((err: unknown) => console.error('[notify] failed:', err));
  });

  return NextResponse.json({ success: true }, { status: 202 });
}
