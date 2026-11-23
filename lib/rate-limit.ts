import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let ratelimit: Ratelimit | null = null;
let precheckRatelimit: Ratelimit | null = null;

function hasRedisConfig(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
}

function getRatelimit(): Ratelimit | null {
  // No Redis config => rate limiting is a graceful no-op (local dev / CI).
  if (!hasRedisConfig()) return null;

  if (!ratelimit) {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    // 5 submissions per 10-minute sliding window, per identifier — the "real
    // attempt" quota, consumed only AFTER Turnstile passes (see route).
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "10 m"),
      prefix: "lead:rl",
    });
  }

  return ratelimit;
}

function getPrecheckRatelimit(): Ratelimit | null {
  if (!hasRedisConfig()) return null;

  if (!precheckRatelimit) {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Cheap flood gate run BEFORE a Siteverify call: 30 hits per 10-minute
    // window. Loose on purpose — it only exists to stop obvious bot floods
    // from burning Siteverify calls, not to throttle genuine submissions.
    precheckRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "10 m"),
      prefix: "lead:pre",
    });
  }

  return precheckRatelimit;
}

export type RateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

/**
 * Sliding-window throttle for public lead capture. `identifier` should be
 * derived from the client IP (and optionally the tenant id) so one client
 * cannot exhaust the AI token budget.
 */
export async function rateLimitLead(identifier: string): Promise<RateLimitResult> {
  const rl = getRatelimit();
  if (!rl) return { limited: false };

  const { success, reset } = await rl.limit(identifier);
  if (success) return { limited: false };

  const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return { limited: true, retryAfterSeconds };
}

/**
 * Cheap pre-check throttle, run BEFORE spending a Siteverify call. A looser
 * window than `rateLimitLead`; its only job is to reject obvious floods early.
 */
export async function precheckRateLimit(identifier: string): Promise<RateLimitResult> {
  const rl = getPrecheckRatelimit();
  if (!rl) return { limited: false };

  const { success, reset } = await rl.limit(identifier);
  if (success) return { limited: false };

  const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return { limited: true, retryAfterSeconds };
}
