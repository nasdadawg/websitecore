# CANTCLONE — Decisions Log

Real decisions, and why, so nothing gets re-litigated later.

- **Payload CMS + official multi-tenant plugin, over raw Supabase +
  hand-rolled RLS.** Payload's admin panel is generated, not hand-
  built — new fields show up in the UI automatically instead of
  needing new JSX every time. Trade-off: bigger framework, more
  initial setup than plain SQL. Chosen because the goal is "backend
  already solved," and a generated admin panel is closer to that than
  a page maintained by hand.
- **Two repos — shared backend + cloned frontend per client — not one
  shared multi-tenant deployment serving custom domains.** Matches
  Vercel's own documented guidance to pick based on how isolated each
  customer needs to be. Clients believe they're getting their own
  build; one bug shouldn't take down three others.
- **Frontend is not an autonomous Hermes worker.** Claude Code, run
  interactively by the operator on the existing subscription. Matches
  the original goal — frontend/creative stays manual, backend gets
  automated.
- **DeepSeek, direct API, not OpenRouter, for backend work.** Direct
  access already existed; OpenRouter would only be useful for routing
  Claude, which would bypass the existing subscription and double-bill
  for the same model.
- **CRM lives inside the Leads collection** (status, notes, follow-up,
  deal value), not a separate CRM tool. Proportionate to a handful of
  local clients; Payload's own docs treat syncing to a real CRM as a
  later hook, not a default.
- **Tenant identity resolved by a per-site secret, not a public
  tenant_slug sent from client-side JS.** Corrected on review — a slug
  shipped in browser code is guessable and isn't real access control.
  Each client site now has its own server-only route holding its own
  secret; the browser never talks to cantclone-core directly.
- **SEO module, AI modules beyond structured lead scoring, review
  automation, and payments are all deferred past v1.** Real and worth
  building, but the priority is proving the core lead system works for
  one real client before adding scope. All of it bolts onto the same
  Payload backend later as more collections — no architecture rework
  needed when the time comes.
