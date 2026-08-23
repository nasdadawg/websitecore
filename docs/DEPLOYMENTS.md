# Production deployments

Deployment history for the CANTCLONE core backend (Vercel Production).
Each entry records the deployed commit, the prior production commit for
rollback, and the rollback procedure.

## M7 — Quick lead filters
- Deployed commit: c88561f76d0a9760378f1b1675daff26c69e7a71
- Status: READY
- Previous production rollback target:
  - Commit: 07b9d8c810efbf5e4f3fb68e3389980fab73ddec
  - Vercel deployment: flow-5vl4vvyls-nasdadawgs-projects.vercel.app
- Rollback procedure: promote the recorded Vercel deployment through
  the Vercel dashboard/CLI; do not alter production data as part of
  rollback.
