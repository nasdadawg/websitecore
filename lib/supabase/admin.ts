import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, requireSecret } from "@/lib/env";

// Hard guard: the service-role key must never ship to the browser.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/supabase/admin.ts is server-only and must not be imported into client code.",
  );
}

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client — BYPASSES Row-Level Security.
 *
 * Use ONLY in trusted server contexts that must act across tenants:
 * durable workflows, the AI lead-enrichment step, and owner notification.
 * Public request paths must go through `createServerSupabase()` instead.
 */
export function adminSupabase(): SupabaseClient {
  if (!cached) {
    const url = requireSecret("NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL);
    const key = requireSecret("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);

    cached = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return cached;
}
