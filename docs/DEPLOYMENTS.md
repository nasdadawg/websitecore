# Production deployments

Deployment history for the CANTCLONE core backend (Vercel Production).

Vercel deployment IDs are the primary rollback artifacts: rollback
promotes a recorded Vercel deployment rather than relying on a Git SHA.
Vercel-recorded commit SHAs are immutable historical metadata — they do
not change when local Git history is rewritten. On 2026-08-23 the full
Git history was rewritten to correct the author/committer email
(metadata only; source tree content unchanged), so the current Git
commit equivalents are listed alongside the Vercel-recorded SHAs below.

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
- The Vercel project is connected to GitHub (nasdadawg/websitecore):
  pushes to that repo trigger Production deployments (auto-deploy),
  in addition to manual CLI deploys.
- Vercel metadata schema: GitHub-connected deployments record the commit
  under `githubCommit*` (M8 onward); pre-connection deployments (M7 and
  earlier) record it under `gitCommit*`.
- Future commits use the corrected Git author/committer email (must
  match the connected GitHub account or deploys are blocked).
- Before a future Production deployment, record both:
  a) the local HEAD SHA, and
  b) the resulting Vercel deployment identifier/alias.
- Treat Vercel deployment IDs as the primary rollback artifacts.
