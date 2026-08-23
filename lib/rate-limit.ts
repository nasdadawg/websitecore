import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  // No Redis config => rate limiting is a graceful no-op (local dev / CI).
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  if (!ratelimit) {
    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    // 5 submissions per 10-minute sliding window, per identifier.
    ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "10 m"),
      prefix: "lead:rl",
    });
  }

  return ratelimit;
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
