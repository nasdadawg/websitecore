# CANTCLONE — Test Plan

## Tenant isolation (blocking — must pass before any real client data)
- Create two tenants (A, B), each with a linked client-role user.
- Log in as A's user. Confirm the admin panel shows only A's leads.
- Attempt to query B's leads directly via the API as A's user. Confirm
  it's rejected, not just hidden in the UI.
- Repeat as B's user against A's data.

## Lead intake
- Valid submission → 202, lead exists in Payload under the correct tenant.
- Missing/invalid fields → 400, no lead created.
- Invalid or missing site secret → 401, no lead created.
- Same request sent twice with the same idempotency key (simulated
  retry) → exactly one lead, not two.
- Exceeding rate limit → 429, no lead created past the limit.
- Resend failing (simulated) → lead still exists; failure is logged,
  not silently dropped.

## Email notification
- Successful submission triggers exactly one email to the correct
  tenant's notify address.
- Email content matches the submitted data — no missing/garbled fields.

## Admin panel
- `agency-owner` role sees all tenants' leads.
- `client` role sees only their own tenant's leads.
- Status/notes/follow-up/deal-value fields are editable and persist.

## Acceptance for "v1 done"
A real test lead submitted through the actual deployed client site,
landing correctly in the admin panel, triggering the correct
notification email — with test evidence (screenshots or logs)
attached to the milestone, not just asserted as working.
