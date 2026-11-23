import { NextResponse, after } from 'next/server';
import { getPayload } from 'payload';
import config from '@/payload.config';
import { processLeadRequest } from '@/lib/leads/process';
import { notifyOwner } from '@/lib/leads/notify';

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/**
 * Secure lead intake — the single most important endpoint.
 * Order (M10):
 *   0. Cheap precheck rate limit by IP (loose flood gate) — before Siteverify.
 *   1. Require + verify Turnstile token (server-side siteverify) → 400/403.
 *   2. Real attempt rate limit by IP (5/10min) — only AFTER Turnstile passes.
 *   3. Validate payload (Zod) → 400.
 *   4. Resolve tenant from bearer secret → 401.
 *   5. Idempotency (X-Idempotency-Key) → duplicate returns original 202.
 *   6. Write the lead via Payload Local API (saved before any optional action).
 *   7. Respond 202 immediately; after() → Resend owner notification.
 *
 * The bot-protection + intake pipeline lives in `lib/leads/process.ts` so it is
 * unit-testable without a request scope; this handler only maps results to HTTP
 * and fires the after-response notification.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const auth = req.headers.get('authorization') ?? '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const idempotencyKey = req.headers.get('x-idempotency-key');

  const payload = await getPayload({ config });
  const processed = await processLeadRequest(payload, { ip, secret, idempotencyKey, body });

  if (!processed.ok) {
    const headers: Record<string, string> = {};
    if (processed.retryAfterSeconds) headers['Retry-After'] = String(processed.retryAfterSeconds);
    return NextResponse.json({ error: processed.error }, { status: processed.status, headers });
  }

  const result = processed.result;
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
