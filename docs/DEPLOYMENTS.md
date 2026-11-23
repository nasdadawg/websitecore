# Production deployments

Deployment history for the CANTCLONE core backend (Vercel Production).

Vercel deployment IDs are the primary rollback artifacts: rollback
promotes a recorded Vercel deployment rather than relying on a Git SHA.
Vercel-recorded commit SHAs are immutable historical metadata — they do
not change when local Git history is rewritten. On 2026-08-23 the full
Git history was rewritten to correct the author/committer email
(metadata only; source tree content unchanged), so the current Git
commit equivalents are listed alongside the Vercel-recorded SHAs below.

## M10 — Turnstile, Sentry, intake hardening + payload/next CVE patch
- Commit: d64d1513734b74b956cbea8174d7ec18c1aa6ac3 — Turnstile bot protection,
  Sentry error monitoring + PII scrubbing, intake hardening
  (lib/turnstile.ts, lib/sentry-scrub.ts, lib/leads/process.ts,
  sentry.*.config.ts, instrumentation.ts, test/m10-*.verify.ts).
- Commit: 1b4601a69d4811328c7fd684343da1f997f67923 — CVE patch:
  payload 3.88.0 → 3.94.1 (CVE-2026-105860 tenant self-assignment,
  CVE-2026-105864 cross-tenant create), next 16.3.2 → 16.4.6,
  react 19.2.8 → 19.3.1. Multi-tenant plugin now rejects cross-tenant
  reassign with a ValidationError (test expectations updated accordingly).
- Status: PENDING — not deployed. Requires an explicit `vercel --prod`
  after review (Tier C).

## M9 — Guided lead follow-up completion
- Vercel deployment (production): flow-awvxl0hk0-nasdadawgs-projects.vercel.app
- Vercel-recorded commit SHA: faa769c41b26ec5b8a289db621ec447a7fc21d26
- Status: READY
- Production alias: flow-ruby-two.vercel.app
- Rollback target (previous production): flow-1bll4g0ss-nasdadawgs-projects.vercel.app (M8)

## M8 — Editable lead contact fields
- Vercel-recorded commit SHA: b2d14d7176d709bcb903b22c9acb3c0c76fc5a78
  (githubCommitSha — matches the local HEAD/worktree deployed)
- Status: READY
- Vercel deployment: flow-1bll4g0ss-nasdadawgs-projects.vercel.app
- Production alias: flow-ruby-two.vercel.app
- Rollback target (previous production): flow-ggf4hqujb-nasdadawgs-projects.vercel.app (M7)

## M7 — Quick lead filters
- Vercel deployment (rollback target): flow-ggf4hqujb-nasdadawgs-projects.vercel.app
- Vercel-recorded commit SHA: c88561f76d0a9760378f1b1675daff26c69e7a71
  — immutable historical Vercel metadata; remains a valid rollback
  target by promoting this deployment.
- Current Git commit (after email rewrite): 643a1af
  — author/committer metadata rewritten only; source tree unchanged.
- Status: READY
- Previous production rollback target: flow-5vl4vvyls-nasdadawgs-projects.vercel.app
  — Vercel SHA 07b9d8c810efbf5e4f3fb68e3389980fab73ddec (current Git 3b7aac2)

## Operational notes
- GitHub origin is configured and synchronized
  (git@github.com:nasdadawg/websitecore.git, branch main).
- The GitHub remote exists purely for backup/history. No Vercel git
  integration is connected, so pushes do not trigger auto-deploys —
  Production deploys happen only via an explicit `vercel --prod` CLI
  command.
- Vercel metadata schema: once the local GitHub remote existed, the CLI
  attached `githubCommit*` metadata (M8 onward); earlier deploys, made
  before the remote was added, record the commit under `gitCommit*`.
- Future commits use the corrected Git author/committer email.
- Before a future Production deployment, record both:
  a) the local HEAD SHA, and
  b) the resulting Vercel deployment identifier/alias.
- Treat Vercel deployment IDs as the primary rollback artifacts.
