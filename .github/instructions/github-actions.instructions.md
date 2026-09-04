---
description: 'Rules for GitHub Actions, Pages deployment, Copilot setup, and repository automation'
applyTo: '.github/workflows/**/*.yml,.github/workflows/**/*.yaml'
---

# GitHub Actions instructions

- Use Node.js 24 and `npm ci`.
- Keep permissions at the minimum needed by each workflow.
- Do not expose secrets in logs, artifacts, cache keys, or command output.
- Pages deployment must run Wix sync when enabled, then build and test before
  uploading `dist/`.
- Keep deployment concurrency non-canceling once a Pages deploy has started.
- The Copilot environment workflow must contain one job named exactly
  `copilot-setup-steps`; use it only to prepare the ephemeral agent environment.
- Workflows that modify Wix data must remain manual unless an explicit safe,
  reviewable trigger is requested.
- Preserve manual dispatch for recovery and diagnosis.
