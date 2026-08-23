# CANTCLONE — Product Spec

## What it is
A multi-tenant, modular backend for fully custom Vercel/Next.js client
websites. One backend, reused across every client. Frontend is fully
custom per client — that's the product differentiator, not the backend.

## Who it's for
CANTCLONE.NET builds websites and lead systems for premium, high-ticket
local businesses — where one booked lead is worth hundreds to thousands
of dollars. Priority verticals: luxury automotive (PPF/ceramic/tint/
wrap, exotic rentals), high-end events/venues, premium local services.
Avoid clients whose average customer is worth under roughly $300-500 —
the lead system doesn't pay for itself at that value.

## What it does
- Captures leads from any number of independently-branded client sites
  into one shared, tenant-isolated backend
- Scores/qualifies leads with structured AI output, never freeform
- Notifies the business owner instantly
- Gives each client owner a login to see only their own leads
- Modular: vertical packs and feature flags decide what's active per
  client — a beautiful form doesn't imply payments, chatbots, or SMS
  are needed

## Core principle
The frontend is based on the conversion strategy for that specific
client. The backend is based on approved operational requirements.
Don't build a capability into a client's site until there's an actual
reason it's needed.

## What CANTCLONE is not, yet
Not a payments platform, not an SMS/DM automation platform, not an
autonomous outbound messaging system. Real future modules, explicitly
out of v1 scope — see IMPLEMENTATION-PLAN.md.
