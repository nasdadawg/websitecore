# CANTCLONE — Architecture

## Two repos, not one shared multi-tenant mega-app
- **cantclone-core** — the backend. One deploy, built once. Payload
  CMS + the official multi-tenant plugin, on Postgres (via the existing
  Supabase connection string, self-hosted, not Payload Cloud).
- **Client sites** — one repo per client, cloned from a shared
  frontend template, fully custom per client, its own Vercel deploy
  and domain. Contains zero backend credentials.

Rationale: clients believe, correctly, they're getting their own
build. One bug shouldn't take down three other clients at once, and a
relationship ending means handing off a clean, self-contained repo —
not disentangling one tenant from shared infrastructure.

## cantclone-core collections (Payload)
- `Users` — auth (`auth: true`), gives `/admin` login for free.
  `role` field: `agency-owner` | `client`.
- `Tenants` — one document per client site: business name, slug,
  notify email, per-site secret (see SECURITY.md).
- `Leads` — name, phone, email, message, status, notes, nextFollowUp,
  dealValue. Scoped to tenant automatically by the multi-tenant plugin.
  CRM lives here — no separate CRM tool.

## Request flow
Client site (its own server-side route, holding a per-site secret)
  → cantclone-core `/api/leads` (validates the secret, resolves the
    tenant from it, rate-limited via Upstash)
  → Payload Local API writes the Lead
  → Resend fires the owner notification after the response returns

Full contract in API-CONTRACT.md.

## Model routing (build-time / operator tooling, not runtime)
- Backend work (schema, deploys, wiring): DeepSeek, direct API, Think
  High by default, Think Max only for genuinely hard problems.
- Vision (mood board → design tokens): Gemini via Google AI Studio.
- Frontend + copy: Claude Code, interactive, human-driven — not an
  autonomous worker, not headless, not through OpenRouter.
- Hermes profile fleet: `orchestrator` (routes only, never
  implements), `vision` (Gemini), `backend` (DeepSeek). Frontend is
  manual by design, not automated.

## Modular by design
Every client gets a manifest, not a fork of the codebase:
```yaml
vertical: ppf-detailing
modules:
  leadIntelligence: true
  responseCopilot: false
  seo: false
  reviews: false
  payments: false
```
Enable only what a client has actually paid for and approved.

## Deferred, not forgotten
AI modules beyond structured lead scoring, the full SEO/content
engine, review automation, DM/call intelligence, payments — all bolt
onto the same Payload backend later as more collections. No
architecture change required to add them when the time comes. See
IMPLEMENTATION-PLAN.md for sequencing.
