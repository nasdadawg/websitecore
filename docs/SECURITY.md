# CANTCLONE — Security

## The one rule that matters most
Client site browser code never has backend secrets. Ever. No
Supabase/Payload key, no service-role key, nothing that touches
cantclone-core directly from the browser.

## Tenant identity: per-site secret, not a public slug
An earlier draft of this system had the client-facing form POST
directly to cantclone-core with a `tenant_slug` in the request body
from client-side JS — visible in the shipped bundle, guessable, not
real access control. Corrected design:
- Each client site gets its own server-only secret, generated once at
  onboarding, stored only in that site's own environment variables.
- The client's Next.js app has its own internal route
  (`/api/submit-lead`) — the only thing the browser ever talks to.
- That route makes a server-to-server call to cantclone-core's
  `/api/leads`, sending the secret as a bearer token.
- cantclone-core resolves the tenant from the secret, never from
  anything the browser sent.
- A leaked or guessed slug alone is now useless without the secret.

## Isolation
Enforced by Payload's multi-tenant plugin, not a hand-rolled
`WHERE tenant_id = x` check scattered through application code.
Verified with a real test before any real client data goes in — see
TEST-PLAN.md. Not assumed correct because the plugin says it does this.

## Bot / abuse protection
- Upstash sliding-window rate limiting on `/api/leads` (5 requests /
  10 min per IP) — built.
- Turnstile on the client-facing form itself — v1-required, not yet built.

## What Hermes may never do without explicit approval
- Production deploys
- Production database migrations
- Generating or rotating secrets
- Any external provider action (Stripe, Twilio, Meta/Instagram,
  Google OAuth grants)
- Enabling payments, SMS, or messaging automation

## Data handling
- No health/medical, legal case, or financial detail goes to an LLM as
  part of lead intake unless a specific client's contract, consent
  flow, and data-handling process are built for it. Default: off.
- AI never invents prices, availability, case results, or reviews.
  Structured output only — see API-CONTRACT.md.
