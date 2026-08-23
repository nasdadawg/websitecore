# CANTCLONE — Platform Checklist

## FOUNDATION
[x] Multi-tenant data model (Payload + multi-tenant plugin)
[ ] Multi-tenant isolation — verified with a real two-tenant test
[x] Secure site-secret design corrected (SECURITY.md) — not yet in code
[x] Form intake endpoint (schema + rate limiting built)
[ ] Idempotency key on lead submission
[ ] Turnstile on public forms
[ ] Client content editing basics
[x] Feature-flag manifest concept defined
[ ] Client onboarding/provisioning flow (currently manual)

## CONVERSION
[ ] One vertical pack fully defined (recommend: PPF/detailing)
[x] Lead pipeline (status, notes, follow-up, deal value — CRM fields)
[x] Email notifications (Resend, built)
[ ] Booking/deposit module — later
[ ] UTM/source tracking — later
[ ] Review request flow — later

## AI
[ ] Structured lead intelligence — schema defined, not implemented
[ ] Response copilot — later
[ ] Human approval + AI kill switch — not built

## SEO / LOCAL
[ ] All of it — explicitly deferred until v1 ships to one real client

## SECURITY / RELIABILITY
[ ] Access-control test (two real tenants)
[ ] Idempotency key (known gap — retried request currently creates a
    duplicate lead and a duplicate email)
[ ] Per-tenant kill switch
[ ] Error monitoring (Sentry or equivalent)
[ ] Uptime monitoring
[x] Backups — already covered free on the existing Supabase Pro plan
    (7-day daily backups); uploaded media needs a separate export plan
[ ] Preview/rollback workflow for the site template

## QUALITY / SERVICE
[ ] Mobile/browser QA
[ ] Accessibility baseline
[ ] Client agreement / SOW — not drafted
