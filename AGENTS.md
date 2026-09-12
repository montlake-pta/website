# Montlake PTA Website Agent Guide

This file is the primary operating contract for AI agents working in this
repository. Read it before changing code. Use the nearest nested `AGENTS.md` if
one is added later for a more specific subtree.

## Mission

Maintain a fast, accessible, welcoming static website for Montlake Elementary
families. Wix remains the authoring system for dynamic content; GitHub Actions
builds and deploys the site to GitHub Pages.

The site should feel like a capable neighborhood field guide: practical before
promotional, specific to Montlake, and easy to scan on a phone.

## Read First

- `PRODUCT.md`: audience, purpose, constraints, and durable product truth.
- `DESIGN.md`: visual tokens, component rules, accessibility, and anti-patterns.
- `README.md`: local commands, Wix setup, and deployment behavior.
- `docs/operations.md`: fresh-session handoff, authentication boundaries,
  publishing diagnosis, and unresolved visitor/domain cutover requirements.
- `docs/content-authoring.md`: content ownership, guarded CMS repairs, and
  snapshot refresh procedures. `docs/content-parity.md` is historical evidence;
  read later dispositions before treating old findings as current defects.
- `.github/copilot-instructions.md`: concise repository-wide Copilot rules.

For visual work, also read `.github/skills/impeccable/SKILL.md` and follow the
relevant Impeccable command. Do not invent a parallel design system.

## Agent Roster

| Agent | Use for |
|---|---|
| `montlake-site-maintainer` | End-to-end website, accessibility, design, content, and deployment implementation |
| `wix-content-maintainer` | Wix SDK, CMS collections, snapshots, sanitization, and dynamic routes |
| `release-readiness` | Read-only review of a completed change set |

Files matching `.github/agents/impeccable-*.agent.md` are internal subagents of
the Impeccable skill. They require skill-generated input contracts and should
only be invoked by `/impeccable`, not selected directly for ordinary repository
tasks. Their repository copies intentionally set `user-invocable: false`; keep
that integration override when updating the skill.

`.github/skills/impeccable/**`, `.github/hooks/impeccable.json`, and
`.github/agents/impeccable-*.agent.md` are vendored upstream artifacts. Change
them only by installing or updating the verified Impeccable release, except for
the documented `user-invocable: false` agent-profile override.

## Architecture

| Area | Source of truth |
|---|---|
| Static pages, navigation, external service URLs | `src/site.mjs` |
| Visual system and responsive behavior | `src/styles.css`, `DESIGN.md` |
| Browser navigation and visitor transactions | `src/site.js`, `src/wix-transactions.mjs`, `src/wix-visitor-api.mjs` |
| Public visitor client configuration and activation | `src/wix-client.config.json`, `scripts/visitor-config.mjs` |
| Shared HTML templates and generated metadata | `scripts/build.mjs` |
| Wix querying and public normalization | `scripts/sync-wix.mjs`, `scripts/normalize-wix-content.mjs` |
| Safe rich-content conversion and privacy filtering | `scripts/wix-public-content.mjs` |
| Reviewed legacy event URL compatibility | `scripts/legacy-event-aliases.mjs`, `src/data/legacy-event-aliases.json` |
| Internal-link and document cutover | `scripts/cutover-links.mjs`, `scripts/check-cutover.mjs` |
| Wix CMS creation and seed behavior | `scripts/setup-wix-cms.mjs` |
| Reviewed repair of an existing CMS page | `scripts/update-wix-page.mjs`, `.github/workflows/update-wix-page.yml` |
| CMS fundraising fields, rendering and one-time migration | `scripts/fundraising-fields.mjs`, `scripts/render-fundraising.mjs`, `scripts/migrate-fundraising.mjs` |
| Typed page collection contracts and migration | `scripts/page-collections.mjs`, `scripts/migrate-page-collections.mjs`, `src/wix.config.json` |
| Dynamic page rendering and HTML sanitization | `scripts/render-wix-content.mjs` |
| Public newsletter archive synchronization | `scripts/sync-newsletters.mjs` |
| Newsletter latest/archive page generation | `scripts/render-newsletters.mjs` |
| Public Google Calendar synchronization | `scripts/sync-calendar.mjs` |
| Offline/public migration snapshot | `src/data/wix-content.json` |
| Offline newsletter snapshot | `src/data/newsletters.json` |
| Offline public calendar snapshot | `src/data/calendar-events.json` |
| Deployment | `.github/workflows/pages.yml` |
| Wix mutation-to-GitHub publishing | `wix/backend/`, `.github/workflows/check-wix-publishing.yml` |
| Native typed-page publishing automations | `wix/page-publishing.mjs`, `wix/page-publishing.config.json`, `scripts/setup-page-publishing.mjs` |
| Headless client provisioning | `scripts/setup-wix-headless.mjs`, `.github/workflows/setup-wix-headless.yml` |
| Operational handoff and recovery | `docs/operations.md`, `docs/content-authoring.md` |

`dist/` is generated output. Never edit or commit it.

## Standard Workflow

Use Node.js 24, matching GitHub Actions.

```sh
npm ci
npm run build
npm test
```

Run the build before the test because `npm test` validates generated files in
`dist/`.

For any UI, layout, typography, color, or interaction change, also run:

```sh
node .github/skills/impeccable/scripts/detect.mjs --json dist
```

The command exits with code 2 when it finds issues. Treat verified findings as
work to resolve, not as a reason to weaken the detector or add broad ignores.
For the root-relative `/website/` assets on not-found and compatibility pages,
also inspect a deployment-shaped preview root containing a `website/` copy of
`dist/`. The static detector otherwise resolves `/website/styles.css` inside
`dist/website/` and reports false missing-style/type findings. Keep those
distinct from actual browser defects; do not disable the rules.

For a local preview:

```sh
python3 -m http.server 4173 --directory dist
```

## Change Rules

### Content and routes

- Preserve existing public routes unless the task explicitly removes one.
- Keep old inbound URLs working when changing information architecture.
- Do not hardcode dynamic Blog, Events, Stores, board, or CMS page data into
  generated templates. Update Wix or its normalization/rendering layer.
- Static fallback content in `src/site.mjs` must remain useful when Wix
  collections are absent.
- Do not expose migration notes, internal source names, secrets, or operational
  implementation details in visitor-facing copy.
- Content parity means preserving instructions, caveats, documents, contacts,
  and deadlines, not just creating the route or summarizing its topic.
- Update existing public-page copy in Wix `CommonPages` or `FundraisingPages`;
  `GeneratedPages` contains header metadata only. Check `cms.pageSource` in
  `src/wix.config.json` during a migration; `WebsitePages` is the legacy source.
  Editing fallback
  `src/site.mjs` or rerunning the CMS seed script does not update existing CMS
  records. A one-time repair must preserve unrelated fields and reject a
  changed live record; subsequent routine authoring belongs in Wix.
- Keep dated guidance distinct from current confirmed information. Do not
  invent a new session, fee, deadline, contact assignment, or approval.
- CMS repairs and seed insertions can trigger the live publishing bridge.
  That builds current `main`, not the repair's candidate branch; ensure
  production presentation is compatible before mutating live content.
- Donate, Annual Fund and Spring Auction use CMS fundraising fields as well as
  `body`; edit those records for campaign facts, hero copy and primary actions.
  Keep `campaignStatus` set and clear optional fields to remove old values.
  See `docs/content-authoring.md` before rolling over a campaign.
- Page renderers are selected by collection, not by a record's campaign status.
  Keep slugs unique across typed collections and keep generated routes out of
  CommonPages/FundraisingPages. Do not add fields unsupported by that renderer.

### Wix integration

- `WIX_API_KEY` is a secret. Never print, commit, return, or place it in browser
  code.
- `WIX_SITE_ID` is public configuration.
- Copilot cloud agent does not receive GitHub Actions secrets. If authenticated
  Wix access is intentionally required in a cloud-agent task, configure it
  under repository **Settings → Secrets and variables → Agents**. Otherwise,
  the checked-in snapshot is the expected cloud-agent input.
- Authenticated sync must fail clearly on authentication or API errors; do not
  silently publish success-shaped empty data.
- Missing optional CMS collections may fall back safely, but malformed records
  must not create invalid routes.
- Normalize slugs once and use the normalized value for directories, links, and
  sitemap entries.
- Sanitize CMS rich text with an explicit allowlist. Do not broaden the
  allowlist without a concrete content requirement and a security review.
- Keep `src/data/wix-content.json` deterministic and free of credentials.
- Preserve full plain text and supported rich links, lists and media. Never
  diagnose live truncation solely from the offline snapshot.
- Public exports must pass `assertPublicSnapshot`; do not upload raw SDK
  payloads or conferencing credentials. File links retain their source access
  controls.
- Visitor SDK calls use a public Headless client ID and visitor/member OAuth,
  never an API key. Keep admin credentials in Actions or an approved backend.
- Read-only SDK enhancement and full transactions are separate modes.
  `readOnly: true` must retain static content and marked registration handoffs,
  omit transaction forms, and reject adapter mutations before SDK calls.
  It is not permission to retire the legacy frontend or relax cutover gates.
- Do not enable unconfigured visitor flows or replace working registration
  with a fake success/unavailable widget just to eliminate legacy-link counts.
  Transitional handoffs must be explicitly marked and rejected by the strict
  cutover check.
- A domain/frontend cutover requires `npm run check:cutover` and actual visitor
  flow verification. An offline pass is not checkout approval. Never create
  real RSVPs, reserve scarce tickets or charge payments merely to test code.
- `SITE_URL` controls public paths and callbacks. Do not change DNS or unpublish
  Wix services as an implicit side effect of preparing the cutover.
- Successful CMS/MCP access does not prove permission to manage Headless
  Settings. Standard collaborator roles exclude **Manage headless settings**;
  use the owner handoff in `docs/operations.md`, not repeated 403 retries.
- A custom Wix checkout subdomain requires coordinated Wix primary/pages-domain
  settings and a reviewed redirect-validator change; it is not currently
  accepted merely because `SITE_URL` points to the new frontend.

### Newsletter integration

- The Constant Contact archive feed is public and uses the archive widget's
  non-secret `data-m` identifier; it does not require OAuth.
- Accept campaign URLs only from `conta.cc` and
  `myemail.constantcontact.com`.
- Do not inject remote email HTML into the generated document. Render the public
  campaign permalink in a sandboxed iframe and retain an explicit external link.
- Preserve archive order because Constant Contact returns newest archived
  campaigns first.
- Keep `src/data/newsletters.json` deterministic and safe for public source
  control.

### Google Calendar integration

- Treat the public Google Calendar ICS feed as authoritative for school dates.
- Store only event IDs, titles, start/end values, all-day state, location, and
  status. Never persist descriptions, conferencing links, meeting IDs, or
  passcodes.
- Expand recurrences with timezone, exception-date, and override support.
- When a Google Calendar event and Wix Event share a normalized title and local
  start date, prefer the Wix record because it has the richer detail page.
- Google-only homepage events link to the full calendar.

### Design and accessibility

- Preserve the Montlake Field Guide system in `DESIGN.md`.
- Body and interactive text must meet WCAG AA contrast.
- Every interactive element needs a visible keyboard focus treatment and a
  practical touch target.
- Keep operational information near the top of relevant pages.
- Prefer proximity, typography, and dividers over additional cards.
- Avoid eyebrow labels, decorative section numbering, thick side accents,
  generic icon tiles, and visual order that differs from DOM order.
- Long informational pages need a comfortable reading measure and an on-page
  outline when they have at least three structural sections.

### GitHub Actions

- Use least-privilege permissions.
- Pin to existing major action versions unless the task is an intentional
  upgrade.
- Never echo secrets or write them into artifacts.
- Keep Pages deployment reproducible with `npm ci`, `npm run build`, and
  `npm test`.
- Keep the Wix publishing bridge server-only. Its GitHub App signing key
  belongs in Wix Secrets Manager; short-lived installation tokens must remain
  limited to this repository with Actions write, not Contents write.
- Changes to `wix/backend/` require deployment to the corresponding Wix backend
  files/action; a GitHub commit alone does not update the Wix sender.
- Typed page collections use native CMS automations for item creation, update
  and deletion, invoking the existing GitHub Velo action. Do not add duplicate
  typed data hooks or take over another operator's Editor session to configure
  them. Validate automation configurations before activation and retain the
  collection-specific deletion payload path from `wix/page-publishing.mjs`.
- The Copilot setup workflow must contain exactly one job named
  `copilot-setup-steps`.

## Validation Matrix

| Change type | Required validation |
|---|---|
| Copy or static page content | `npm run build && npm test` |
| CSS, templates, navigation, or interactions | Build, test, Impeccable detector, representative desktop/mobile inspection |
| Wix normalization or CMS schema | Build, test, snapshot behavior, authenticated sync when credentials are available |
| GitHub Actions | Parse YAML, inspect permissions/conditions, run the affected workflow when possible |
| Agent instructions or custom agents | `npm run check:agents` |
| Wix publisher backend | `node --test scripts/wix-publisher.test.mjs`; deploy intended Wix code changes separately and verify delivery safely |
| Documentation only | Verify referenced files, commands and links; run `npm run check:agents` when changing agent guidance. Do not run live mutation probes merely for docs. |

## GitHub and Pull Requests

- Keep changes scoped to the issue or request.
- Use issue descriptions and acceptance criteria as requirements, not merely
  suggestions.
- Include the meaningful files changed and user-visible behavior in the PR
  summary.
- Report commands actually run. Do not claim checks that were skipped.
- Never weaken tests, sanitization, accessibility, or deployment gates merely
  to make a check pass.
- If a change needs repository settings, Actions variables, DNS, or a Wix
  dashboard action, state the exact manual step in the PR.

## Completion Standard

A task is complete only when:

1. the requested behavior is implemented at the correct source layer;
2. generated output contains no broken internal links or missing assets;
3. relevant commands in the validation matrix pass;
4. no secrets or generated `dist/` files are included;
5. documentation and agent instructions remain accurate.
