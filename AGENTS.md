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
| Browser interactions | `src/site.js` |
| Shared HTML templates and generated metadata | `scripts/build.mjs` |
| Wix-to-site data normalization | `scripts/sync-wix.mjs` |
| Wix CMS creation and seed behavior | `scripts/setup-wix-cms.mjs` |
| Dynamic page rendering and HTML sanitization | `scripts/render-wix-content.mjs` |
| Public newsletter archive synchronization | `scripts/sync-newsletters.mjs` |
| Newsletter latest/archive page generation | `scripts/render-newsletters.mjs` |
| Public Google Calendar synchronization | `scripts/sync-calendar.mjs` |
| Offline/public migration snapshot | `src/data/wix-content.json` |
| Offline newsletter snapshot | `src/data/newsletters.json` |
| Offline public calendar snapshot | `src/data/calendar-events.json` |
| Deployment | `.github/workflows/pages.yml` |

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
