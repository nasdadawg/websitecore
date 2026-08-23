"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components. Reads the public (inlined) env vars
 * directly — never import the server `env` module here.
 */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
