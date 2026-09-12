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
- Page collection routing is explicit: CommonPages, FundraisingPages and
  metadata-only GeneratedPages. Read `cms.pageSource` in `src/wix.config.json`
  before operating on live data; legacy mode is only for staged migration or
  recovery. See the [copy/activate/retire procedure](content-authoring.md#splitting-the-legacy-page-collection).
  The split is complete: 13 common, 3 fundraising and 4 generated records were
  copied; WebsitePages is retained as **Legacy WebsitePages (backup)**.
- Full visitor transaction activation remains off in
  [src/wix-client.config.json](../src/wix-client.config.json). The public Headless
  client supports a separate read-only enhancement for live catalog and
  registration information; this mode does not show transaction forms or
  allow adapter mutations.
  The active Welcome Back RSVP retains a marked legacy handoff until the
  remaining visitor activation gates in [#4](https://github.com/montlake-pta/website/issues/4) are met.
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
  write access. Native publishing setup additionally requires automation
  read/create/validate permissions. The current key returned HTTP 403 for
  automation administration; initial native setup used authorized Wix MCP,
  without broadening the deployment key. Account/OAuth-app administration has additional permissions.
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

### Headless provisioning and activation

The earlier permission blocker is resolved for the operator account.
After the owner updated access, Wix MCP successfully created the dedicated
**Montlake PTA Website** Web/JavaScript client:
`b0a3701c-099d-4f99-8057-e3a0d1fb2d71`. This ID is public, not a secret.
Allowed redirect domains are `montlake-pta.github.io`, `montlakepta.org` and
`www.montlakepta.org`. Member-login redirect URIs have not been configured.

Anonymous visitor OAuth authenticated successfully, returned all 10 expected
public Store products, and read the Welcome Back event's registration/form
metadata. A new visitor's cart read returned the expected
`OWNED_CART_NOT_FOUND`/404. Those initial read-only probes created no RSVP,
ticket reservation or payment.

Provisioning is not full-transaction activation approval. At this checkpoint all 10 catalog
products were out of stock, and **Wix pages domain** was still
`https://www.montlakepta.org/`; the frontend link was unset. Keep full transactions
gated until the real browser paths and hosted-checkout destination are
verified. Do not change DNS or the existing site's publication implicitly.
Read-only enhancement uses `readOnly: true`, `enabled: false`; both flags must
not be true together. It retains static fallback information and the marked
Wix registration handoff. Read-only mode is enforced by this application's
adapter, not a new OAuth permission boundary.

The read-only SDK is deployed at commit `a5266ed`
([Pages run](https://github.com/montlake-pta/website/actions/runs/34675324093)).
Browser-origin product and event reads succeeded on the GitHub frontend.
Desktop/mobile, refresh focus, failed-read fallback and JavaScript-disabled
handoffs were exercised without transaction requests. Controlled write scenarios
were subsequently approved and exercised as described below. Production
transactions remain off; keep [issue #4](https://github.com/montlake-pta/website/issues/4)
open for the remaining checkout-hosting and activation gates.

### Approved transaction validation

Approved test resources use the `Montlake SDK validation ` name prefix and
explicit `{id, name}` entries in `src/wix.config.json`'s `validationFixtures`.
The sync excludes only matching registered identities and stops if an
unregistered public fixture appears or a registered identity changes.
Public snapshot validation also rejects fixture names. Register hidden/draft
fixtures before making them accessible for a controlled visitor test, and
delete them before clearing the registry. Do not reuse real fundraiser stock.

The first approved zero-price, non-tracked product scenario exercised actual
anonymous SDK cart creation, add, quantity update and removal through the real
UI components. Full-mode HTML was served only inside an isolated test browser;
the public site stayed read-only. The test cart was emptied and the owned
product was hidden and deleted. No order or payment was submitted.

The resulting checkout redirect started at `https://www.montlakepta.org/_api/`
and was correctly rejected. `useGenericWixPages` selects a standard Wix page
template; it does **not** guarantee a separate Wix-owned hostname. Keep the
redirect guard intact and resolve the Wix-hosted pages domain before full
activation. An uncompleted checkout must remain a neutral confirmation state.

The approved event scenarios used fresh draft RSVP/ticket events, far-future
dates and explicit test-only names. All eight event-scoped guest email switches
were set to false and read back before publication; custom automation inspection
found no event-created/publication broadcast. The GitHub exclusions were
deployed before publication. The old Wix listing does not provide a confirmed
global unlisted flag, so these were short-lived, clearly marked fixtures, not
real community events.

Actual anonymous UI/API calls created one confirmed test RSVP and one pending
free ticket reservation against non-scarce test capacity. The pending
reservation did not confirm payment. The RSVP was deleted; the reservation was
released and deleted; both events and the free ticket definition were deleted.
The automatically created synthetic non-member contact was removed from active
contacts. No paid order or real-community registration was submitted. The
isolated empty cart was also deleted; Wix can retain internal uncompleted
checkout/audit history.

The existing Wix-owned alias `https://tech1245.wixsite.com/montlake-pta-1/`
was verified against the site. A temporary client-only `redirectUrlWixPages`
override produced an initially permitted Wix URL, but the browser ultimately
returned to `www.montlakepta.org/checkout`. The override was restored to its
original empty value; primary domain, DNS and callback approvals were unchanged.
OAuth app updates returned HTTP 504 after applying, so read-back—not blind
retry—was required to establish both outcomes. A stable Wix-hosted checkout
domain still needs a coordinated domain decision before full activation.

Match real SDK schemas rather than synthetic fixtures: Wix Events v2 reports
`OPEN_RSVP`/`OPEN_TICKETS` registration statuses, and Catalog V1 stock quantity
may be omitted or null. Availability flags remain meaningful without a numeric
quantity; do not coerce an absent quantity to zero or invent an inventory count.
An unused `tickets.soldOut` flag can be true on an open RSVP event; apply that
flag only to ticketing events, not to RSVP eligibility.

Historically both Actions and Wix MCP setup returned HTTP 403 and the dashboard
denied access. Operator permissions and Actions-key scopes are separate; the
operator's fix does not automatically grant the key OAuth administration.

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
action, sixteen business-event handlers in `backend/events.js`, and six legacy
WebsitePages/BoardMembers hooks in `backend/data.js`. The three typed page
collections use nine native CMS automations, one per collection and
create/update/delete operation, invoking that same published action.
Their definitions and real IDs are in `wix/page-publishing.mjs` and
`wix/page-publishing.config.json`. The older WebsitePages-update automation is
retained for rollback compatibility. See [trigger coverage](../README.md#on-demand-publishing-from-wix).

1. Confirm the edit was made in an authoritative source. Legacy Editor text
   blocks do not update CommonPages/FundraisingPages; newsletter and Google Calendar changes
   do not originate in Wix. Blog drafts have no dedicated handlers here.
2. In Wix **Developer Tools → Wix Logs**, look for
   `GitHub website publish requested` and its run ID. The matching named
   `GitHub publish - COLLECTION EVENT` automation also has a run log. An accepted dispatch
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

6. If no dispatch was requested, inspect the native automation status/filter or
   applicable hook coverage, the published Wix action code,
   the GitHub App installation and the **name** of its Wix secret. Do not print
   the signing key, installation token, raw SDK errors or event payloads.

The sender retries selected transient HTTP status failures, not every
network/timeout error. A timeout can have an unknown dispatch outcome. There
is no durable outbox or exactly-once guarantee. CMS hooks report notification
failure but return the author's successfully saved item; hourly sync remains
recovery for missed signals and unsupported mutation paths.

CMS reads explicitly use `consistentRead: true` and `showDrafts: false`.
Default replica reads briefly omitted newly migrated GeneratedPages records
even though consistent read-back confirmed them. Do not diagnose missing live
content from such a stale read, or enable native drafts as a workaround.

Native CMS automation selectors bind one collection each. The deletion
trigger uses `deletedEntity.dataCollectionId`; create/update use
`dataCollectionId`. A single root action avoids duplicate dispatches from one
automation. Validate definitions before activating them and do not add
duplicate typed collection hooks.

Do not take over another operator's active Editor session to deploy publishing
changes. Native CMS automations can reuse the already-published Velo action
without an Editor publish. If actual backend code must change, coordinate the
Editor handoff instead of publishing another person's unsaved work.

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

1. Recheck the provisioned Headless client and approve the preview and intended
   final frontend return domains. Operator provisioning is now complete; do
   not create a duplicate client or empty backend. Do not assume anonymous
   read access proves transaction authorization.
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
6. Disable read-only enhancement and enable full transactions deliberately
   only after the remaining flow checks, then run the gates below.
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
