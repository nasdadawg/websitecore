# Deprecated / Superseded Code — M1

The following files were built against the earlier (superseded) single-app
Supabase-RLS architecture. They are **kept but inactive** and will be removed
after M2–M3 prove the new Payload lead path + tenant isolation.

## Superseded (single-app Supabase RLS + host routing + QStash)
- `supabase/schema.sql` — hand-rolled RLS schema → replaced by Payload collections
- `proxy.ts` — host-header multi-tenant routing → replaced by per-site secret auth
- `lib/host.ts`, `lib/tenant.ts` — host/subdomain resolution → replaced
- `lib/supabase/*` — Supabase clients → replaced by Payload Local API
- `lib/ai/*` — old `LeadAnalysisSchema` → replaced by `LeadIntelligenceSchema` (`lib/leads/schema.ts`)
- `lib/lead.ts` — old lead form schema → replaced by `lib/leads/schema.ts`
- `app/api/workflows/process-lead/route.ts` — old QStash workflow → replaced by `after()`

## Reused (active in M2, no longer deprecated)
- `lib/env.ts` — env access (now powers rate limiting + Resend)
- `lib/rate-limit.ts` — Upstash sliding-window rate limiting (used by `/api/leads`)
- `lib/resend.ts` — superseded by `lib/leads/notify.ts`; kept for reference only

## QStash — INSTALLED but UNUSED (deprecated for now)
- `@upstash/qstash` + `@upstash/workflow` remain installed.
- **Not removed yet**: durable retries for the post-response owner notification
  may still be needed if `after()` (Resend) proves insufficient under failure.
- Decision deferred until the core lead endpoint (M2) + notification reliability
  are tested. Candidates: Payload jobs, Vercel Workflows (once public), or QStash.
- **Removal plan** (post-M2/M3 decision): uninstall `@upstash/qstash` and
  `@upstash/workflow`, delete `app/api/workflows/*`, drop QStash env vars.

## Active in M1
- `payload.config.ts`, `collections/*`, `access.ts`, `seed/*`, `test/*`, `.env.example`
