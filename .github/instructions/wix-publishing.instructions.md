---
description: 'Rules for the Wix backend mutation-to-GitHub publishing bridge and its live verification'
applyTo: 'wix/backend/**/*.js,wix/page-publishing.mjs,wix/page-publishing.config.json,scripts/setup-page-publishing*.mjs,scripts/check-wix-publishing.mjs,scripts/wix-publisher.test.mjs,.github/workflows/check-wix-publishing.yml,.github/workflows/setup-page-publishing.yml'
---

# Wix publishing bridge instructions

- Read `AGENTS.md` and `docs/operations.md`. Keep the integration identifiers
  and deployment procedure in README aligned with the deployed Wix sender.
- The sender uses GitHub `workflow_dispatch` to the fixed `pages.yml`/`main`
  destination. The older `repository_dispatch` receiver is not its request
  format; do not send `event_type` to the workflow-dispatch API.
- Keep the App installed only on the website repository with Actions write
  and Metadata read. Its Wix signing-key secret and short-lived tokens must
  never appear in public code, event payloads, logs or repository artifacts.
- `wix-secrets-backend.v2` returns a secret object; use `.value` only inside
  backend code. The shared automation action returns `{}` to satisfy its
  output schema and logs only the non-secret run ID.
- Preserve the stable shared action import path. Bundle the source for that
  existing Velo action; publish `backend/events.js` and `backend/data.js`
  separately in Wix. Git commits do not deploy those Wix files.
- Do not replace published Velo handlers with unsupported SDK subscriptions
  inside an Editor site. Retain collection-specific after-hooks and complete
  business lifecycle/stock coverage without forwarding raw entity data.
- A CMS after-hook notification failure must be reported without invalidating
  the already successful authoring operation. Keep hourly recovery; do not
  claim exactly-once delivery or guaranteed CSV/suppressed-hook coverage.
- Validate with `node --test scripts/wix-publisher.test.mjs`. Live probes
  require intentional verification work, use only their own temporary
  unpublished/inactive/hidden records, and must clean up those records.
- A dispatch receipt is not deployment completion. Correlate the returned run
  ID with GitHub's outcome; inspect existing runs before retrying an operation
  whose outcome was unknown.
- CommonPages, FundraisingPages and GeneratedPages use native CMS automations,
  one for each collection and create/update/delete event. Each invokes the
  same existing published GitHub Velo action once. Keep the inventory in
  `wix/page-publishing.config.json` aligned with actual Wix configuration.
- The CMS deletion trigger filters `deletedEntity.dataCollectionId`, unlike
  create/update's `dataCollectionId`. Use the verified trigger catalog IDs and
  validate configurations before activation. Never take over an active Editor
  merely to configure native automations or add duplicate typed data hooks.
