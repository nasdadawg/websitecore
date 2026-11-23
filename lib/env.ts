import { z } from "zod";

/**
 * Central, type-safe environment access.
 *
 * Every value has a default so the app builds and boots without a
 * `.env.local` present. Server-only secrets are validated lazily via
 * `requireSecret()` at the exact call site that needs them, so a missing
 * key produces a clear error instead of a crash at import time.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().default(""),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(""),

  APP_BASE_DOMAIN: z.string().default("localhost:3000"),

  AI_MODEL: z.string().default("openai/gpt-4o-mini"),
  OPENAI_API_KEY: z.string().default(""),
  DEEPSEEK_API_KEY: z.string().default(""),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com"),

  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM_DOMAIN: z.string().default(""),

  UPSTASH_REDIS_REST_URL: z.string().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().default(""),

  TURNSTILE_SECRET_KEY: z.string().default(""),

  APP_URL: z.string().default(""),
  QSTASH_TOKEN: z.string().default(""),
});

export const env = envSchema.parse(process.env);

/** Throws a descriptive error when a required server-only secret is missing. */
export function requireSecret(name: string, value: string): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}
