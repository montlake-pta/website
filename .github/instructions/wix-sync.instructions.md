---
description: 'Rules for Wix Headless synchronization, CMS schema, snapshots, and dynamic content rendering'
applyTo: 'scripts/sync-wix.mjs,scripts/setup-wix-cms.mjs,scripts/bootstrap-wix-snapshot.mjs,scripts/render-wix-content.mjs,src/data/**,src/wix.config.json'
---

# Wix synchronization instructions

- Wix is authoritative for dynamic content. Keep the checked-in snapshot as a
  deterministic offline and disaster-recovery input, not a second authoring
  system.
- Never log, commit, or expose `WIX_API_KEY`.
- Keep authenticated failures explicit. Do not convert authorization, network,
  or malformed-response failures into empty successful snapshots.
- Optional missing CMS collections may return empty arrays with a clear warning.
- Preserve pagination for all Wix query builders.
- Normalize optional fields and slugs defensively. Skip records that cannot
  produce a safe stable route.
- Keep CMS setup idempotent and resumable after partial failure.
- Sanitize rich HTML and allow only required tags, classes, attributes, schemes,
  and iframe hosts.
- When changing snapshot schema, version it and update build validation in the
  same change.
