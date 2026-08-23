# Payload 3 + Next 16 Integration — Runbook

> **Verification status.** Everything marked ✅ was exercised in this repo
> (typecheck, lint, 14 SQLite tests, a full `next build`, plus a live Postgres
> migration/seed/boot and an end-to-end `POST /api/leads` smoke test against the
> Supabase connection string). Anything still marked ⚠️ **requires
> production-environment verification** (live Redis rate-limiting and Resend
> email delivery) has NOT been exercised against real external credentials — it
> is wired and type-checks, but its runtime behavior is unproven in this project.

## Verified versions (install these together)

| Package | Version |
|---|---|
| `payload` | 3.88.0 |
| `@payloadcms/next` | 3.88.0 |
| `@payloadcms/db-postgres` | 3.88.0 |
| `@payloadcms/db-sqlite` | 3.88.0 |
| `@payloadcms/plugin-multi-tenant` | 3.88.0 |
| `graphql` (peer) | ^16.8.1 |
| `next` | 16.3.2 |
| Node | `^18.20.2 || >=20.9.0` (verified on 22) |

✅ **Compatibility:** `@payloadcms/next@3.88.0` declares its `next` peer range as
`>=15.2.9 <15.3.0 || >=15.3.9 <15.4.0 || >=15.4.11 <15.5.0 || >=16.2.6 <17.0.0`.
Next **16.3.2** satisfies `>=16.2.6 <17.0.0` — no Next downgrade is required.

---

## 1. Setup pattern ✅

- Payload 3 is Next.js-native (App Router). No separate server process.
- Collections live in `collections/*.ts`, aggregated + plugin-wired in `collections/index.ts`.
- Config at repo root `payload.config.ts`.
- Production DB = Postgres via Supabase connection string. Tests = SQLite (see §5).
- `lib/leads/*` holds the server-only intake/notify/resolve logic; the route handler `app/api/leads/route.ts` is a thin wrapper.

## 2. Required `next.config.ts` wrapper ✅

`withPayload` is **required**. Without it, `next build` fails while bundling
Payload's server-only packages (see failure #1 in §7).

```ts
import { withPayload } from '@payloadcms/next/withPayload';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default withPayload(nextConfig);
```

## 3. Correct import paths / subpath exports ✅

`@payloadcms/next` exposes **no bare `"."` main export** — every import must use a
subpath. Getting this wrong is the most common build failure.

| Import | Correct path |
|---|---|
| `withPayload` | `@payloadcms/next/withPayload` |
| `multiTenantPlugin` | `@payloadcms/plugin-multi-tenant` (has a bare main) |
| `getUserTenantIDs` | `@payloadcms/plugin-multi-tenant/utilities` |
| `postgresAdapter` | `@payloadcms/db-postgres` |
| `sqliteAdapter` | `@payloadcms/db-sqlite` |
| `buildConfig`, `getPayload` | `payload` |

`@payloadcms/next` subpaths (verified in `package.json#exports`): `./withPayload`,
`./css`, `./layouts`, `./routes`, `./templates`, `./auth`, `./utilities`,
`./views`, `./client`, `./rsc`.

`@payloadcms/plugin-multi-tenant` subpaths: `.` (main), `./fields`, `./types`,
`./utilities`, `./client`, `./rsc`, `./translations/languages/*`.

## 4. Async `buildConfig` pattern ✅

`buildConfig(config)` returns `Promise<SanitizedConfig>` (async). The config file
exports that Promise as its default, and `getPayload({ config })` accepts it
without an explicit `await`.

```ts
// payload.config.ts
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { collections, plugins } from './collections';

export default buildConfig({                    // ← default export is a Promise
  secret: process.env.PAYLOAD_SECRET || 'DEV_ONLY_INSECURE_SECRET_CHANGE_ME',
  collections,
  admin: { user: 'users' },
  db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URI || '' } }),
  plugins,
});
```

```ts
// consumer (route handler / seed / test)
import config from '@/payload.config';
const payload = await getPayload({ config });   // getPayload resolves the Promise
```

## 5. SQLite test setup vs PostgreSQL production ✅ / ⚠️

**Tests — SQLite (no `DATABASE_URI` required):** ✅

```ts
import { sqliteAdapter } from '@payloadcms/db-sqlite';
import { randomUUID } from 'node:crypto';

const dbFile = `test-payload-${randomUUID()}.db`;
db: sqliteAdapter({ client: { url: `file:./${dbFile}` } }),
```

Use a **unique filename per `initTestPayload()` call** (`randomUUID()`). Parallel
test files that share one fixed filename throw `SQLITE_READONLY_DBMOVED`
(failure #3). Files are gitignored via `test-payload.db*`.

**Production — Postgres:** ✅

```ts
import { postgresAdapter } from '@payloadcms/db-postgres';

db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URI } }),
```

This adapter config type-checks and builds, and has been connected to the live
Supabase Postgres instance (see "Verified against live Postgres" below).

## 6. Migration create/apply commands + `DATABASE_URI` requirement ✅

All migration commands need a live Postgres (`DATABASE_URI`). Verified against
the Supabase connection string (Postgres 17.6): `migrate:status` reports the
initial migration `20260823_113620` as `Ran: Yes`, and `npm run seed` populates
2 tenants / 2 sites / 3 users / 2 leads.

```bash
npx payload migrate:create     # create a migration from schema diff
npx payload migrate            # apply pending migrations
npx payload migrate:status     # show migration status
```

Also confirmed available (not run): `payload generate:types`,
`payload generate:importmap`, `payload run`.

## 7. Common failures + confirmed fixes ✅

| # | Symptom | Root cause | Confirmed fix |
|---|---|---|---|
| 1 | `next build`: `Expected ';', '}' or <eof>` on `@libsql/hrana-client/LICENSE` | Turbopack bundles Payload's server packages (drizzle-kit → hrana-client) | Wrap `next.config` with `withPayload` |
| 2 | `ERR_PACKAGE_PATH_NOT_EXPORTED: No "exports" main defined` for `@payloadcms/next` | Package has no bare `"."` export | Import `@payloadcms/next/withPayload` (subpath) |
| 3 | Vitest `SQLITE_READONLY_DBMOVED: attempt to write a readonly database` | Two test files share a fixed SQLite filename | Unique `randomUUID()` filename per `initTestPayload()` |
| 4 | `tsc`: `Cannot find module '../../payload.config'` | Wrong relative depth in a route handler | Use the `@/` alias (`@/payload.config`) |
| 5 | `tsc`: `Record<string, unknown>` not assignable to `UntypedUser` in tests | Typed config not generated (`payload generate:types` not run) | Use `any` for untyped Local API test data (+ `/* eslint-disable @typescript-eslint/no-explicit-any */`) |
| 6 | `next build`: `Module not found: Can't resolve './collections/index.js'` | Relative imports carry a `.js` extension, which `moduleResolution: "bundler"` + `tsc` silently maps to `.ts` but Turbopack does **not** | Drop the `.js` suffix on every relative import (extensionless: `./collections`, `../access`) |

## 8. Preflight checklist ✅

```bash
npx tsc --noEmit      # typecheck — expect exit 0
npm run lint          # eslint — expect exit 0
npx vitest run        # SQLite tests — expect all pass (currently 14: 7 isolation + 7 intake)
npm run build         # Next 16 build — expect exit 0
```

```bash
npx payload migrate:status   # migration check — ✅ verified (Ran: Yes)
```

## Unverified (requires production-environment verification)

- Upstash rate limiting 429 path — the module type-checks but is a graceful
  no-op without Redis credentials.
- Resend owner notification delivery — no-op without `RESEND_API_KEY`.
- `after()` post-response execution (from `next/server`) — compiles and builds,
  but actual post-response timing has not been exercised at runtime.

## Verified against live Postgres (Supabase)

- `DATABASE_URI` in `.env.local` connects to `aws-0-us-east-2.pooler.supabase.com`
  (Postgres 17.6); the initial migration is applied and the seed data is present.
- `next build` (Turbopack) exits 0 and registers `ƒ /api/leads`.
- `next start` boots against Postgres; `POST /api/leads` returns 202 on a valid
  site secret, 401 on an unknown secret, 400 on a malformed body, and idempotent
  dedup (two identical `X-Idempotency-Key` posts write exactly one lead).
