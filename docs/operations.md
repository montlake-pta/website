# Operations and fresh-session handoff

Use [AGENTS.md](../AGENTS.md) for repository rules, [README.md](../README.md)
for commands and integration setup, and [content-authoring.md](content-authoring.md)
for CMS ownership and repairs. [content-parity.md](content-parity.md) is a dated
audit and remediation record, not a list of defects that are all still open.

This handoff was reviewed on **September 11, 2026**. Recheck configuration and
open issues before acting; page counts, event dates and external permissions
are not permanent invariants.

## Start here

- GitHub Pages serves the new frontend at
  <https://montlake-pta.github.io/website/>.
- The existing Wix **Editor** site is still published at
  <https://www.montlakepta.org/>. Its site ID is in
  [src/wix.config.json](../src/wix.config.json). It has Velo enabled and uses
  **Stores Catalog V1**; do not substitute Catalog V3 contracts without a
  deliberate migration.
- Authenticated build-time sync and Wix-to-GitHub publishing are live.
  Ordinary publishing does **not** depend on the visitor Headless client.
- Visitor transaction activation remains off in
  [src/wix-client.config.json](../src/wix-client.config.json). The public client
  ID is empty; the active Welcome Back RSVP retains a marked legacy handoff.
  Its removal is blocked by [#4](https://github.com/montlake-pta/website/issues/4).
- Constant Contact's public archive is configured as `a07eh3xf9of0`, but the
  latest confirmed source response contained zero editions. Publishing
  editions is an editor action in
  [#3](https://github.com/montlake-pta/website/issues/3), not a missing OAuth flow.
- Current enrichment arrangements and the legacy Editor handoff remain in
  [#1](https://github.com/montlake-pta/website/issues/1). Dated school/program/fund
  confirmations remain in [#2](https://github.com/montlake-pta/website/issues/2).
  Restored historical content is not approval of current-year policies.

Useful read-only starting points:

```sh
git status --short
gh issue list --repo montlake-pta/website --state open
gh run list --repo montlake-pta/website --workflow pages.yml --limit 5
gh variable list --repo montlake-pta/website
```

Do not read secret values to diagnose an integration. `gh secret list` reports
names, not values. The known Actions variables are `WIX_SITE_ID`,
`WIX_SYNC_ENABLED=true` and `CONSTANT_CONTACT_ARCHIVE_ID`. `SITE_URL`,
`WIX_HEADLESS_ENABLED`, `WIX_HEADLESS_CLIENT_ID` and `WIX_ACCOUNT_ID` were not
configured at this review. Code defaults and current variables win over this
dated observation.

## Four different authentication boundaries

- **GitHub Actions reading/administering Wix:** `WIX_API_KEY` is an Actions
  secret. Routine sync requires read access; CMS repairs/seeding require
  write access. Account/OAuth-app administration has additional permissions.
  A working CMS query does not establish access to Headless setup APIs.
- **Wix publishing to GitHub:** a dedicated GitHub App signs requests using
  `github-publish-bridge-private-key` in **Wix Secrets Manager**, not GitHub's
  `WIX_API_KEY`. Public app/installation IDs and deployment instructions are
  in [README.md](../README.md#maintaining-the-wix-sender) and
  [the publisher source](../wix/backend/github-publish-core.js).
  The App's registration ownership and its organization installation are
  different: repository administration does not by itself grant permission to
  rotate the App's signing keys. Inspect the
  [public App page](https://github.com/apps/montlake-pta-publish-bridge) for
  current ownership before assuming it is registered under the organization.
- **Visitors registering/shopping:** the browser uses a public Headless client
  ID and visitor/member OAuth. No API key or app signing key belongs in browser
  configuration. The GitHub publishing App's client ID is **not** a Wix visitor
  client ID.
- **An agent using Wix MCP or the dashboard:** authentication is per operator.
  [.github/mcp.json](../.github/mcp.json) configures the remote HTTP endpoint,
  not a shared login. Being able to read a site or use Velo/Secrets Manager
  does not imply permission to manage Headless Settings. Do not rely on another
  session's browser profile, token, or temporary artifact.

Use an authorized operator's explicit authentication flow when a browser login
is needed. Do not collect passwords, reuse browser cookies as API credentials,
or dump hidden dashboard state/browser globals. Inspect only the controls and
public configuration needed for the task.

### The precise Headless permission blocker

Both Actions and Wix MCP OAuth-app setup calls returned HTTP 403. After
successful browser sign-in, **Headless Settings itself** showed an
insufficient-permissions message. Repeated network retries do not fix this.

Wix documents that standard collaborator roles do not include this permission.
An authorized owner must create/assign a custom role through
**Settings → Roles & Permissions → Manage Roles**, selecting
**Site Dashboard → Manage headless settings**, or perform the setup from an
account that already has access. Do not escalate permissions autonomously.

The manual [setup workflow](../.github/workflows/setup-wix-headless.yml)
can be used with suitable account/API-key permissions. Its helper queries the
documented Sites API for account context if `WIX_ACCOUNT_ID` is absent, then
plans/creates the named client. It preserves existing settings and refuses
missing redirect approvals rather than overwriting them. Its public output
file supplies a client ID; it does not activate production or prove checkout.

Official references:

- [Headless collaborator permissions](https://dev.wix.com/docs/go-headless/project-management/invite-collaborators#grant-collaborators-permissions-to-headless-settings)
- [Add a frontend to an existing Editor site](https://dev.wix.com/docs/go-headless/self-managed-headless/get-started/add-a-frontend-to-an-existing-wix-site)
- [Set up a Headless client](https://dev.wix.com/docs/go-headless/authentication/setup/set-up-a-headless-client)

No new Wix project is required merely to connect this existing Editor site's
business data to the external frontend.

## Diagnose publishing before changing content

The deployed sender consists of the shared **github-publish** automation Velo
action, sixteen business-event handlers in `backend/events.js`, and six CMS
hooks in `backend/data.js`. One additional active WebsitePages-update Automation
calls the same action. See [trigger coverage](../README.md#on-demand-publishing-from-wix).

1. Confirm the edit was made in an authoritative source. Legacy Editor text
   blocks do not update `WebsitePages`; newsletter and Google Calendar changes
   do not originate in Wix. Blog drafts have no dedicated handlers here.
2. In Wix **Developer Tools → Wix Logs**, look for
   `GitHub website publish requested` and its run ID. In Automations, the
   WebsitePages update automation also has a run log. An accepted dispatch
   means a run was requested, not that the new site is already deployed.
3. Inspect the matching GitHub run, including the failing step if any:

   ```sh
   gh run view RUN_ID --repo montlake-pta/website
   gh run watch RUN_ID --repo montlake-pta/website --exit-status
   ```

4. A burst can supersede pending runs; check the newest retained run rather
   than treating every canceled pending run as lost content. Running Pages
   deployments are not canceled by the configured concurrency group.
5. If dispatch succeeded but sync/build/deployment failed, fix that failure
   and rerun Pages. Do not rewrite CMS content merely to make another signal.
   Manual recovery is:

   ```sh
   gh workflow run pages.yml --repo montlake-pta/website --ref main
   ```

6. If no dispatch was requested, inspect hook coverage, the published Wix code,
   the GitHub App installation and the **name** of its Wix secret. Do not print
   the signing key, installation token, raw SDK errors or event payloads.

The sender retries selected transient HTTP status failures, not every
network/timeout error. A timeout can have an unknown dispatch outcome. There
is no durable outbox or exactly-once guarantee. CMS hooks report notification
failure but return the author's successfully saved item; hourly sync remains
recovery for missed signals and unsupported mutation paths.

Two implementation details matter when maintaining the Velo action:

- `wix-secrets-backend.v2` returns an object: use its `.value` **inside backend
  code only**. Returning the object to the signing function is not a key.
- The existing action's output schema is empty. Its `invoke` must return `{}`;
  it logs the non-secret GitHub run ID instead of returning extra fields.
  A schema error after dispatch can mean the GitHub run already exists; inspect
  the receipt before rerunning code.

Changing the GitHub repository does not update `wix/backend/` in Wix. Preserve
unrelated Wix edits, update the existing action using the documented bundle
command, and publish the intended backend-file changes. Never change the
established service-plugin import path without updating its callers.

The manual notification probe **mutates Wix** with temporary unpublished,
inactive or hidden records. It is not a routine documentation check, permission
probe, or substitute for testing RSVP/payment. If interrupted, inspect for its
`publishing-probe-` records before rerunning; clean up only confirmed probe
records. Existing live verification links are in the README.

## Finish cutover without breaking checkout

Before changing the live domain:

1. Resolve the Headless role/client setup. Approve the preview and intended
   final frontend return domains. Keep the existing site/data; do not create
   a separate empty backend or assume authentication implies authorization.
2. Validate visitor reads and actual registration/checkout behavior against
   the intended site. The current maintained adapter uses **RSVP v2**, not the
   removed/deprecated v1 candidate. Required guest fields and event policies
   must not be bypassed.
3. Confirm the selected checkout hosting strategy. Wix's Editor-to-headless
   migration can require a dedicated Wix-hosted subdomain, for example
   `checkout.montlakepta.org`, with both the project's **primary domain** and
   **Wix pages domain** configured appropriately. The **frontend link** used
   by notifications/return flows is a separate setting. A DNS CNAME change
   alone is not the complete migration.
4. Check the implementation against that strategy: the current
   [`validateRedirect`](../src/wix-visitor-api.mjs) permits specific Wix-branded
   hosts, but **does not yet allow a custom checkout subdomain**. Do not claim
   that example domain works today. If needed, add a narrowly validated,
   explicitly approved checkout origin with regression coverage; never allow
   arbitrary destinations or the current frontend origin.
5. Check event/product features. Member-only registration, structured
   `ADDRESS` form controls and assigned-seat ticket selection are not currently
   supported. Server-authorized form reads and mock tests do not prove visitor
   write permissions. No real RSVP, scarce-ticket reservation or payment was
   made during the earlier cutover work.
6. Enable/configure the visitor client deliberately and run the gates below.
   Preserve `data-legacy-transaction` handoffs until working replacements exist.
   Do not use a self-link or an unavailable widget to produce a zero-link count.
7. Coordinate Wix primary/pages-domain changes, GitHub Pages custom-domain
   setup and public DNS as one planned launch. Preserve MX/SPF/DKIM/DMARC and
   other unrelated records. Verify frontend routes, checkout/login returns,
   provider email links and old inbound URLs. Keep Wix backend apps/media
   running and retain a reviewed rollback plan.

The intended frontend mapping is GitHub Pages custom domain
`www.montlakepta.org`, its `www` CNAME targeting `montlake-pta.github.io`, and
`SITE_URL=https://www.montlakepta.org/`. This is a **plan**, not a record of a
completed DNS change. Inspect the authoritative DNS and Wix domain state first,
and handle the apex redirect separately.

Official migration guidance:
[how the domain roles fit together](https://dev.wix.com/docs/go-headless/self-managed-headless/migrate-from-an-existing-wix-site/about-wix-site-migration-to-a-self-managed-headless-project).

### Understand what each gate proves

- `npm run build && npm test`: generated-site checks and unit tests against
  the supplied snapshot/configuration.
- `npm run check:cutover`: static retired-link/resource checks and visitor
  catalog/event reads. It **does not submit an RSVP or complete checkout**.
- `npm run check:cutover -- --offline`: skips even those live visitor reads.
- `npm run check:cutover -- --if-enabled`: used by deployment; when cutover is
  not requested it reports that fact and exits successfully. A green ordinary
  deployment therefore does not certify cutover readiness.

`SITE_URL` controls canonical paths and callbacks; it is not a DNS-management
API. Environment overrides take precedence over the checked-in public client
settings. Do not commit a synthetic client ID used for local fixtures.

Public form metadata can be inspected with the manual snapshot-export
workflow's `inspect_event_forms=true` option. It prints field names/types,
not guest responses. The September 10 Welcome Back form used `firstName`,
`lastName`, `email`, numeric `additionalGuests`, and optional `guestNames`.
Re-read the current form rather than assuming those names for every event.
The browser fixture seam is `initializeTransactions(config, document,
{ api, navigate })`; `data-wix-manual-init` prevents auto-bootstrap in a local
fixture. Fixtures must not call production mutation APIs.

## Evidence pitfalls and local inspection

- Compare **live deployed content with live Wix content** when diagnosing
  parity. The old public-bootstrap snapshot used descriptions/excerpts;
  the production full post/event prose was not truncated. The real repaired
  loss was rich links, inline media and structure.
- Know the [merge precedence and fallback semantics](content-authoring.md#source-precedence-and-fallback-behavior).
  Removing a CMS record for a static route can restore its fallback, not remove
  the page. Specialized indexes and the board/newsletter renderers can override
  ordinary CMS body copy.
- `bootstrap:wix` overwrites the snapshot with a limited legacy-site extraction
  and empty CMS arrays. It is not a normal refresh or complete backup. Prefer
  a reviewed authenticated export; keep existing public snapshot data intact
  when credentials are unavailable.
- `assertPublicSnapshot` guards normalized exports. Do not persist raw nodes,
  conferencing/shared-access credentials, unpublished data or arbitrary CMS
  metadata. Supported file links retain the source's access controls.
- Full Wix DOM extraction may be required: inspect `main` or `#PAGES_CONTAINER`
  and skip `script`, `style`, `noscript` and `svg` by element name. A HEAD error,
  bot challenge or login wall is not by itself proof of a broken destination.
- Old aliases use reviewed record identities, not punctuation-stripping
  guesses. `5th-grade-promotion!` maps to the canceled `-2` record; the undated
  meet-and-greet alias maps to the November 5 record. Preserve that distinction.
- The event-title aliases for Welcome Back and Sounders are deliberately
  narrow and date-sensitive. Do not replace them with broad fuzzy matching.

For default `/website/` asset paths, inspect a deployment-shaped preview:

```sh
npm run build
preview="$(mktemp -d)"
mkdir "$preview/website"
cp -R dist/. "$preview/website/"
node .github/skills/impeccable/scripts/detect.mjs --json "$preview"
python3 -m http.server 4173 --bind 127.0.0.1 --directory "$preview"
```

Open `http://127.0.0.1:4173/website/`. Keep these shell commands together so
the temporary path is defined. Stop the preview server when finished and
remove only its specific temporary output. A plain Python server does not
emulate GitHub Pages' custom-404 routing; test recovery behavior on an
appropriate preview or deployment too. Never edit generated files to fix a
preview.

The static detector can misresolve root-relative styles in `dist/` alone.
Separate that artifact from actual defects; do not add broad ignores. A
previous donation-article em-dash advisory also overcounted compared with
visible DOM text; verify current evidence rather than changing authored copy
solely to silence a heuristic.
