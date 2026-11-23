import { env } from '@/lib/env';

/**
 * Cloudflare Turnstile server-side verification (siteverify).
 *
 * Privacy note: we send only the client `token` and the client IP to
 * Cloudflare's siteverify endpoint — never lead PII, secrets, headers, or
 * bodies. The token itself is a short-lived challenge response, not user data.
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Verify a Turnstile token. Fail-closed: an unconfigured secret key or any
 * non-`success` response rejects the request — there is no code path that
 * silently skips Turnstile. Test-only verification uses Cloudflare's published
 * test secret keys as the value of TURNSTILE_SECRET_KEY, so the code path is
 * identical to production (no implicit bypass).
 */
export async function verifyTurnstile(token: string, ip: string): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail closed — never allow intake through without Turnstile configured.
    return { success: false, error: 'Turnstile is not configured on the server' };
  }

  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success === true) {
      return { success: true };
    }
    const codes = data['error-codes']?.join(', ') ?? 'unknown';
    return { success: false, error: `Turnstile verification failed (${codes})` };
  } catch (err) {
    // Network/parse failure → fail closed.
    return { success: false, error: 'Turnstile verification error' };
  }
}
