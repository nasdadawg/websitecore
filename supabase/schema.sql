-- =============================================================================
-- Multi-tenant schema + Row-Level Security
-- Run this in the Supabase SQL editor (or as a migration).
-- Assumes Supabase Auth is enabled.
--
-- Model: ONE master Postgres project, many tenants.
-- Isolation: a `tenant_id` FK on every tenant-scoped table + strict RLS
-- policies driven by the authenticated user's JWT (`app_metadata.tenant_id`).
-- =============================================================================

create extension if not exists "pgcrypto";

-- ── Tenants ─────────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,          -- url-safe id, e.g. "clienta"
  name          text not null,
  domain        text unique,                   -- custom root domain, e.g. "clienta.com"
  subdomain     text unique,                   -- "clienta" => clienta.<APP_BASE_DOMAIN>
  brand_color   text,
  contact_email text not null,                 -- where lead alerts are sent
  sms_number    text,                          -- optional owner phone for SMS alerts
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Leads (raw + AI-enriched) ───────────────────────────────────────────────
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text,
  phone       text,
  email       text,
  note        text,
  dedupe_key  text unique,                   -- idempotency key (workflow run id)
  -- AI enrichment
  fit_score   smallint check (fit_score between 0 and 100),
  intent      text,          -- "ready_to_book" | "researching" | "low_intent" | "unknown"
  budget_tier text,          -- "premium" | "mid" | "budget" | "unknown"
  summary     text,          -- one-line human summary from the AI
  -- lifecycle
  status      text not null default 'new',     -- new | qualified | contacted | won | lost | spam
  source      text,          -- form id / page path
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists leads_tenant_id_idx  on public.leads (tenant_id);
create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_fit_score_idx  on public.leads (fit_score desc nulls last);

-- ── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tenants_set_updated_at on public.tenants;
create trigger tenants_set_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ── Row-Level Security ──────────────────────────────────────────────────────
alter table public.tenants enable row level security;
alter table public.leads  enable row level security;

-- Helper: resolve the tenant_id of the authenticated user from their JWT.
-- Placed in app_metadata (or user_metadata) at signup / invitation time.
create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((auth.jwt() -> 'app_metadata'  ->> 'tenant_id')::text, '')::uuid,
    nullif((auth.jwt() -> 'user_metadata' ->> 'tenant_id')::text, '')::uuid
  );
$$;

-- tenants: an owner may read only their own tenant row. Service role bypasses RLS.
create policy tenants_read_own on public.tenants
  for select using (id = public.current_tenant_id());

-- leads: strict per-tenant isolation. Owners touch only their own tenant's leads.
create policy leads_select_own on public.leads
  for select using (tenant_id = public.current_tenant_id());

create policy leads_insert_own on public.leads
  for insert with check (tenant_id = public.current_tenant_id());

create policy leads_update_own on public.leads
  for update using (tenant_id = public.current_tenant_id());

create policy leads_delete_own on public.leads
  for delete using (tenant_id = public.current_tenant_id());

-- ── Public routing view (no secrets, anon-readable) ─────────────────────────
-- Maps host -> tenant for the proxy/server WITHOUT exposing contact_email etc.
-- `security_invoker = false` (default) runs as owner, bypassing RLS on tenants.
create or replace view public.tenant_routes
with (security_invoker = false)
as
  select id, slug, domain, subdomain, active
  from public.tenants;

grant select on public.tenant_routes to anon, authenticated;

-- ── Seed (dev only — remove for production) ─────────────────────────────────
-- insert into public.tenants (slug, name, subdomain, contact_email)
-- values ('demo', 'Demo Detailer', 'demo', 'owner@example.com');
