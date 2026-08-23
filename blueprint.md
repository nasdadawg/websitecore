> ⚠️ **SUPERSEDED (Aug 2026).** The real, decided architecture is in `docs/` — see `ARCHITECTURE.md`, `API-CONTRACT.md`, `DECISIONS.md`, `IMPLEMENTATION-PLAN.md`, `SECURITY.md`. This file was an early sketch (single Supabase-RLS multi-tenant app). Final design = **Payload CMS + multi-tenant plugin** (two repos), per-site secret auth. Kept for reference only.

# DEEP RESEARCH DIRECTIVE: NEXT.JS MULTI-TENANT AI LEAD ENGINE ARCHITECTURE (2026 STANDARDS)

## 1. PROJECT OBJECTIVE
I am building a dark-luxury, high-conversion web development & automated lead generation platform for local business clients (e.g., luxury auto detailers, exotic car rentals, high-end event spaces). The platform must deliver:
- A high-speed, Next.js App Router front-end (under 0.3s load times).
- Dynamic multi-tenancy (serving multiple client custom domains/subdomains from a single Next.js codebase on Vercel).
- An autonomous background AI lead enrichment & qualification engine.
- Instant, multi-channel owner notifications (Email via Resend API, SMS/Slack).
- A protected, dark-luxury client portal (`/admin`) with Row-Level Security (RLS) data isolation per tenant.

---

## 2. TECHNICAL STACK REQUIREMENTS
Examine and provide optimal code patterns for the following stack:
- Framework: Next.js App Router, TypeScript, Tailwind CSS.
- Orchestration & Durability: Vercel Workflows (`"use workflow"` / `"use step"`) for durable background execution and retries without serverless timeouts.
- AI Engine: Vercel AI SDK (`ai`) using structured output (`generateObject` + Zod schemas) for lead scoring, intent classification, and budget tiering.
- Database & Auth: Supabase Postgres with Row-Level Security (RLS) policies and Supabase Auth / Clerk.
- Protection: Upstash Redis sliding-window rate limiting for public lead capture routes.
- Notifications: Resend API configured for dynamic multi-domain email dispatch (`from: concierge@{tenantDomain}`).

---

## 3. REQUIRED RESEARCH BREAKDOWNS

### A. Architecture & Multi-Tenancy Routing
1. Provide the complete code implementation for Next.js middleware / proxy routing (`proxy.ts` / `middleware.ts`) that extracts subdomains or custom root domains (`clienta.com`, `clientb.com`) and routes requests cleanly to tenant-specific pages without page reloads.
2. Detail how 1 master Supabase project isolates client data using a `tenant_id` column combined with strict Postgres Row-Level Security (RLS) policies.

### B. Durable Background AI Lead Pipeline
1. Provide a production-grade Vercel Workflow handler (`app/workflows/process-lead.ts`) that:
   - Receives raw lead form data (`name`, `phone`, `note`, `tenant_id`, `client_email`).
   - Executes a durable step to score intent and calculate a fit score (0-100) using the Vercel AI SDK and Zod.
   - Stores the enriched lead record in Supabase Postgres.
   - Executes a durable step to trigger a dynamic HTML lead alert email via Resend API to the business owner.

### C. Rate-Limiting & Security
1. Show how to lock down public lead submission Server Actions or API routes using Upstash Redis to prevent bot attacks or AI token draining.

### D. Cost & Operational Strategy
1. Breakdown exact 2026 infrastructure pricing across Vercel Pro, Supabase, Upstash, Resend, and AI API consumption (e.g., GPT-4o-mini / DeepSeek) for 1 to 50 active client domains.

---

## 4. OUTPUT EXPECTATIONS
- Direct, production-ready TypeScript and SQL code blocks.
- No dummy/placeholder code. Include strict typing, error handling, and Zod schema validations.
- Focus strictly on modular, maintainable code structures.
