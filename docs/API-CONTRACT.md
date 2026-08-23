# CANTCLONE — API Contract

## Client site → its own server route
`POST /api/submit-lead` — inside each client site repo, not public,
called only by that site's own form.
```
{ name: string, phone: string, email?: string, message?: string }
```
This route holds `CANTCLONE_SITE_SECRET` in its own env vars and
forwards the request server-to-server.

## Client site's server route → cantclone-core
`POST https://<cantclone-core-url>/api/leads`
Headers: `Authorization: Bearer <CANTCLONE_SITE_SECRET>`
Body:
```
{ name: string, phone: string, email?: string, message?: string }
```
Response: `202 { success: true }`, or an error status per below.

## Behavior, in order
1. Rate limit by IP (Upstash, 5/10min) before anything else runs.
2. Validate payload with Zod. Malformed input → `400`.
3. Resolve tenant from the bearer secret. Invalid/missing secret → `401`.
4. Check idempotency key (see below) — duplicate → return the original
   `202`, do not create a second lead.
5. Write the Lead via Payload's Local API. The lead is saved before
   any optional action runs.
6. Respond `202` immediately.
7. After the response (`after()`), send the owner notification via
   Resend. A failed email never un-saves the lead — log it and move on.

## Idempotency
Client site's server route generates a request ID (UUID) per form
submission attempt and sends it as `X-Idempotency-Key`. cantclone-core
tracks keys seen in the last 24h; a repeat key returns the original
response instead of writing a second lead. Currently a known gap —
see PLATFORM-CHECKLIST.md.

## AI structured output contract (when a module uses it)
Every AI lead-analysis call returns exactly this shape — no freeform
text is trusted for a decision:
```ts
const LeadIntelligenceSchema = z.object({
  priority: z.enum(["low", "normal", "high", "vip"]),
  intentScore: z.number().int().min(0).max(100),
  summary: z.string().max(500),
  extractedFacts: z.record(z.string(), z.string()),
  missingInformation: z.array(z.string()).max(8),
  recommendedAction: z.string().max(300),
  recommendedChannel: z.enum(["call", "text", "email", "human-review"]),
  requiresHumanReview: z.boolean(),
  prohibitedClaimsDetected: z.array(z.string()).max(8),
});
```
The model recommends. Deterministic code and a human decide. It never
confirms availability, quotes a final price, or approves anything.
