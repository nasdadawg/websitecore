/**
 * M10 — rate limiter fails OPEN on Redis error (no 500 on a dead store).
 *
 * NOTE: this is a vitest test despite the `.verify.ts` suffix — it needs
 * `vi.mock` to spy on `@sentry/node`'s captureException, which tsx cannot do.
 * It is added to vitest's `include` (vitest.config.ts) and therefore runs as
 * part of `npm test` / `npm run verify:all`.
 *
 * The Redis client is NOT mocked: we point UPSTASH_REDIS_REST_URL at a
 * reserved `.invalid` host so the real `rl.limit()` throws (ENOTFOUND) and we
 * exercise the real fail-open catch path.
 *
 * Run: `npx vitest run test/m10-ratelimit-failopen.verify.ts`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureException } from '@sentry/node';
import type { Payload } from 'payload';
import { env } from '../lib/env';
import { processLeadRequest } from '../lib/leads/process';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
}));

const mockCaptureException = vi.mocked(captureException);

// Cloudflare published test secret keys (always-passes / always-fails).
const PASS_SECRET = '1x0000000000000000000000000000000AA';
const FAIL_SECRET = '2x0000000000000000000000000000000AA';

// Force the rate limiter to hit a guaranteed-nonexistent Redis host so
// rl.limit() throws and the fail-open path is exercised for real.
env.UPSTASH_REDIS_REST_URL = 'https://ratelimit-failopen.invalid';
env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

const dummyPayload = {} as Payload;

describe('rate limiter fails open on Redis error (M10)', () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
  });

  it('no-token request returns 400 (limiter fails open, turnstile guards)', async () => {
    env.TURNSTILE_SECRET_KEY = PASS_SECRET;
    const res = await processLeadRequest(dummyPayload, {
      ip: '198.51.100.1',
      secret: null,
      idempotencyKey: null,
      body: { name: 'FAILOPEN_MISSING', phone: '555-0001' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toMatch(/turnstile/i);
    }
  });

  it('invalid-token request returns 403', async () => {
    env.TURNSTILE_SECRET_KEY = FAIL_SECRET;
    const res = await processLeadRequest(dummyPayload, {
      ip: '198.51.100.2',
      secret: null,
      idempotencyKey: null,
      body: { name: 'FAILOPEN_INVALID', phone: '555-0002', turnstileToken: 'TEST.DUMMY.TOKEN' },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
    }
  });

  it('Sentry captureException fires with the ratelimit_unavailable tag', async () => {
    env.TURNSTILE_SECRET_KEY = PASS_SECRET;
    await processLeadRequest(dummyPayload, {
      ip: '198.51.100.3',
      secret: null,
      idempotencyKey: null,
      body: { name: 'FAILOPEN_SENTRY', phone: '555-0003' },
    });
    expect(mockCaptureException).toHaveBeenCalled();
    const opts = mockCaptureException.mock.calls[0]?.[1] as { tags?: Record<string, string> } | undefined;
    expect(opts?.tags).toMatchObject({ ratelimit_unavailable: 'true' });
  });
});
