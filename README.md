# Montlake PTA website

A static website for Montlake Elementary PTA with Wix as its authoring and data
source.

**Preview:** <https://montlake-pta.github.io/website/>

**Start a fresh session:** read [AGENTS.md](AGENTS.md), then
[operations and current blockers](docs/operations.md). Content editors should
use [content authoring](docs/content-authoring.md); the
[parity report](docs/content-parity.md) records historical findings and repairs.

## Edit the site

- Routine page copy: Wix CMS → `CommonPages` or `FundraisingPages` (match by `slug`)
- Static fallback copy, navigation, and external service URLs: `src/site.mjs`
- Visual design and responsive styles: `src/styles.css`
- Mobile navigation: `src/site.js`
- Images and brand assets: `src/assets/`
- Shared page templates and metadata: `scripts/build.mjs`
- Wix content snapshot: `src/data/wix-content.json`
- Wix integration settings: `src/wix.config.json`
- Newsletter archive snapshot: `src/data/newsletters.json`
- Newsletter archive settings: `src/newsletter.config.json`
- Public calendar snapshot: `src/data/calendar-events.json`
- Public calendar settings: `src/calendar.config.json`
- Product and audience guidance: `PRODUCT.md`
- Visual system and design rules: `DESIGN.md`

The repository includes the project-scoped Impeccable skill under
`.github/skills/impeccable/`. In a new Copilot session, use `/impeccable` for
design audits and refinements; its hook checks direct UI edits against the
documented system.

## Agentic development

GitHub Copilot and other repository-aware agents should begin with `AGENTS.md`.
The harness also includes:

- `.github/copilot-instructions.md` for repository-wide Copilot context
- `.github/instructions/` for path-specific site, Wix, Actions, and harness rules
- `.github/agents/` for site implementation, Wix integration, release review,
  and Impeccable's internal design subagents
- `.github/mcp.json` for the project-scoped Wix MCP server
- `.github/workflows/copilot-setup-steps.yml` for a deterministic Node.js 24
  cloud-agent environment
- GitHub issue and pull request templates for agent-ready requirements and
  handoffs

Copilot CLI discovers the Wix HTTP MCP endpoint at
`https://mcp.wix.com/mcp` from the workspace configuration. Use `/mcp` to manage
the connection and authorize your Wix account when prompted. Do not put API
keys or OAuth tokens in the shared configuration. MCP authorization is
separate from the website's public Headless visitor-client configuration.

Validate these files with:

```sh
npm run check:agents
```

The generated `dist/` directory is intentionally ignored. GitHub Actions builds
it when changes reach `main`.

```sh
npm run build
npm test
```

To preview locally:

```sh
python3 -m http.server 4173 --directory dist
```

Then open <http://localhost:4173/>.

## Frontend cutover and visitor transactions

Wix remains the content, media and commerce backend. Retiring the legacy
Editor frontend is a separate step from deleting or unpublishing Wix services.

The build rewrites known legacy page links to the current frontend and hosts
the enrichment PDFs locally, including their old `_files/ugd/` paths. Missing
legacy targets fail the build instead of becoming silent broken links.
Historical promotion and unavailable Islandwood item routes remain useful.

Visitor transactions are controlled by `src/wix-client.config.json`, or the
public Actions variables `WIX_HEADLESS_CLIENT_ID` and `WIX_HEADLESS_ENABLED`.
Only a public Headless client ID belongs in browser configuration; never use
`WIX_API_KEY` there. The manual **Set Up Wix Headless Client** workflow can
plan/create the named client when the account/API-key permissions allow it.

**Activation is currently blocked by [issue #4](https://github.com/montlake-pta/website/issues/4).**
The current key cannot query Headless clients or discover the required account
context, and authenticated dashboard access also lacked the custom
**Manage headless settings** permission. Standard collaborator roles do not
include it. See [the precise permission handoff](docs/operations.md#the-precise-headless-permission-blocker).
Until resolved, activation stays off and a still-needed, explicitly marked
registration handoff is retained rather than breaking the working signup path.
Wix-to-GitHub content publishing is already live and is independent of this
visitor-client blocker.

Run `npm run build && npm test && npm run check:cutover` before retiring the
old frontend. The strict check rejects unconfigured visitor access and
remaining legacy handoffs. `--offline` skips live visitor probes, so an offline
pass is not transaction approval. No tests should submit real RSVPs, reserve
limited tickets or charge payments without explicit authorization.

Set `SITE_URL` only when the target domain is ready: it controls canonicals,
sitemap URLs, compatibility paths and transaction callbacks. The default
remains `https://montlake-pta.github.io/website/`; the eventual custom-domain
value is `https://www.montlakepta.org/`. Enabling transactions or setting an
explicit `SITE_URL` activates the strict cutover gate in Pages deployment.
Verify checkout return domains and actual visitor flows before changing DNS;
the automation does not change DNS or unpublish the old site.

The final domain switch needs a coordinated plan for GitHub Pages **and**
Wix's primary domain, Wix-hosted checkout domain, frontend link and callback
settings; changing a CNAME alone is insufficient. A dedicated checkout
subdomain is not yet allowed by the current redirect validator. Follow
[the cutover sequence and remaining implementation checks](docs/operations.md#finish-cutover-without-breaking-checkout)
before activating it. Preserve mail records and the Wix backend.

## Wix content sync

The deployed site reads Blog posts, Events, Store products and categories, PTA
board members, and CMS-managed pages from Wix during the GitHub Actions build.
The result is static HTML, so Wix credentials are never sent to visitors.

Supported Blog and Event rich content retains links, lists and inline images
through the same explicit HTML allowlist used for CMS pages. Normalized
snapshots contain public fields only, with conferencing access details
removed. The checked-in snapshot is an offline recovery input, not evidence
of current CMS state; use the
[manual snapshot export](docs/content-authoring.md#refreshing-the-offline-snapshot)
to refresh it from a reviewed source revision.

Reviewed legacy `/events-1/` aliases are generated as static redirects to the
matching event record. An exact-path recovery script runs only on the
not-found page for host encoding differences; unrelated missing paths remain
404s. These are not server-side HTTP 301 redirects.

The homepage **Coming up** list combines future Wix Events with the public
Google school calendar. Matching title/date records prefer Wix so visitors get
the richer detail page; calendar-only records link to the full calendar.

Refresh the checked-in public calendar snapshot with:

```sh
npm run sync:calendar
```

Only titles, dates, all-day state, locations, and identifiers are stored.
Calendar descriptions and conferencing details are intentionally discarded.

Create a Wix API key with read access to Blog, Events, Stores, and CMS data,
then configure the repository:

```sh
gh secret set WIX_API_KEY --repo montlake-pta/website
gh variable set WIX_SITE_ID --body f17e8f26-4d30-4997-bca1-82f1599221bb --repo montlake-pta/website
gh variable set WIX_SYNC_ENABLED --body true --repo montlake-pta/website
```

The workflow synchronizes on pushes, manual runs, every hour, and when Wix
requests a deployment. The older `wix-content-updated` repository-dispatch
trigger remains supported. A failed authenticated sync stops deployment rather
than publishing stale content.

### On-demand publishing from Wix

The live Wix backend calls GitHub's **workflow dispatch** endpoint when
authoritative content changes. This uses a dedicated GitHub App with
**Actions write and Metadata read**, installed only on `montlake-pta/website`;
it does not reuse a personal token or require Contents write.

- **CMS `CommonPages`, `FundraisingPages`, `GeneratedPages`, and `BoardMembers`:**
  add, edit or delete a record.
- **Blog:** publish, update or delete a published post; draft-only edits have
  no dedicated handler.
- **Events:** create, edit, cancel or delete an event.
- **Store products:** add, edit or delete products; change variants or stock.
- **Store collections:** create, edit or delete collections.

Changes appear after the rebuild finishes, not instantly on Save. Legacy
Editor text/layout changes do not update the new site's page copy.

Typed page collections use nine native CMS automations: one per collection and
item-added, item-updated or item-deleted trigger. Each calls the same existing
server action once. Their definitions and IDs are maintained in
`wix/page-publishing.mjs` and `wix/page-publishing.config.json`. Native automations
do not require publishing Editor code or taking over another operator's session.
The legacy **GitHub publish - WebsitePages updated** automation and legacy data
hooks remain for rollback compatibility; legacy copy is not read after cutover.
Overlapping notifications and bulk changes can create several dispatches:
GitHub's existing concurrency group keeps the running deployment and coalesces
pending runs. Pending runs marked canceled are expected; the newest pending
run refreshes the complete site. Wix-origin runs allow 15 seconds for source
changes to become visible before querying the APIs.

The signing key is stored only in Wix Secrets Manager as
`github-publish-bridge-private-key`. The sender creates short-lived,
repository-limited installation tokens and posts only `{"ref":"main"}`.
No CMS records, event guests, product payloads or credentials are sent to
GitHub in the dispatch body. Transient GitHub status failures receive bounded
retries; notification failures are logged explicitly. CMS hooks preserve the
author's successful write even if notification fails.

**Recovery and scope:** keep the hourly sync. Explicitly suppressed data hooks,
reference-only writes and CSV import paths are not guaranteed immediate
notifications by this integration. Nor do Constant Contact or Google Calendar
changes originate in Wix; those feeds still refresh during deployments and
the hourly run. Velo hook/event delivery is not claimed to have the
acknowledgment/retry guarantees of an external Wix App webhook subscription.

#### Maintaining the Wix sender

The source-controlled files in `wix/backend/` correspond to these live files:

- `events.js` and `data.js`: the reserved Velo backend event and data-hook files.
- `github-publish.js` and `github-publish-core.js`: bundle into the existing
  **github-publish** automation Velo action. This action lives at
  `backend/___spi___/automations-velo-action-provider/github-publish/github-publish.js`.

Prepare the standalone action without embedding credentials:

```sh
npm run build:wix-publisher -- --outfile=/tmp/montlake-github-publish.js
```

Update the existing action rather than creating a differently named one;
backend handlers import its established path. Save the action and publish
changed backend files in Wix. A GitHub push does not deploy these Wix files.
Keep unrelated Wix page/code changes intact.

For typed page notifications, manage the native automations instead of adding
duplicate hooks. `pagePublishingAutomations()` builds their configurations from
the existing action; validate them through Wix's **Validate Automation** API
before activation. The deletion event uses `deletedEntity.dataCollectionId`.
Retain a single root action, even if an older template has duplicate root IDs.
The manual **Set Up Typed Page Publishing** workflow provides guarded plan/apply
setup using the Actions Wix key, without copying credentials into the browser
or relying on an MCP session. It requires automation read/create/validate
permissions and never overwrites a conflicting named automation.
The currently configured Actions key returned HTTP 403 for automation
administration; initial setup used the authorized Wix MCP APIs instead.
Ordinary CMS sync and publishing do not require granting that key additional
permissions. The dashboard cannot duplicate Velo-code automations.

Public integration identifiers: GitHub App **4906160**
(`montlake-pta-publish-bridge`), installation **160793888**, repository
**1356687632**, and Wix automation
**ea50b8de-0b25-446e-a80f-70765e472cef**. These are not credentials.
To rotate the signing key, generate a key for that same GitHub App, replace
the Wix secret, confirm a successful dispatch, then revoke the superseded key.

The manual **Verify Wix Publish Notifications** workflow creates, updates and
removes temporary **unpublished/inactive** CMS records. Its optional Store
probe does the same with a **hidden** product and adds/removes only that
product's collection membership; it never purchases anything.

```sh
gh workflow run check-wix-publishing.yml --repo montlake-pta/website \
  -f include_store=true
```

Successful live probes included
[CMS notifications](https://github.com/montlake-pta/website/actions/runs/34569314086)
and [Store/membership notifications](https://github.com/montlake-pta/website/actions/runs/34569616637).
They produced app-origin deployment runs, including the successful
[resulting Pages deployment](https://github.com/montlake-pta/website/actions/runs/34569653752).
The temporary records were removed. These are end-to-end examples, not a
guarantee that suppressed hooks or every import mechanism emits a signal.
See [publishing diagnosis](docs/operations.md#diagnose-publishing-before-changing-content)
for failure handling, action return-schema details and safe recovery. Do not
run mutation probes merely to validate documentation.

### Local authenticated sync

For local authenticated sync:

```sh
cp .env.example .env
# Add WIX_API_KEY to .env, then:
node --env-file=.env scripts/sync-wix.mjs
npm run build
```

### CMS collections

Regular editor page blocks are not available through Wix Headless APIs. The
integration uses these CMS collections instead:

- `BoardMembers`: school year, role, names, email, display order, and active
- `CommonPages`: ordinary page slug, title, heading, description, tone, body,
  and content-use checkbox.
- `FundraisingPages`: complete fundraising page records, including campaign,
  image, action and rich-content fields. No unused tone or kicker columns.
- `GeneratedPages`: header metadata for Blog, Events, Shop, PTA Board and
  optionally Newsletter. No body or campaign columns.

`cms.pageSource` in `src/wix.config.json` selects `legacy` during preparation and
`typed` after the reviewed split. `WebsitePages` is retained as a labeled backup,
not a second authoring location after activation. See the
[typed migration procedure](docs/content-authoring.md#splitting-the-legacy-page-collection).

Create and seed the configured collections from the current repository content:

```sh
node --env-file=.env scripts/setup-wix-cms.mjs
```

Alternatively, run the manual **Set Up Wix CMS** workflow after configuring the
repository secret:

```sh
gh workflow run setup-wix-cms.yml --repo montlake-pta/website
```

This setup command creates missing collections and inserts missing seed rows;
it never updates an existing record or upgrades an existing collection schema.
Use **Split CMS Page Collections** to migrate an existing WebsitePages site.
The older **Migrate Fundraising Pages** workflow is historical and refuses to
run after typed activation. Rerunning setup does
not publish edits to `src/site.mjs`. After setup, maintain existing page records in Wix CMS and each
site build will pull them automatically.

For a reviewed repair to an existing record, use the manual **Update One Wix
Page** workflow: plan, inspect the public before/after report, then apply with
that plan's exact commit and fingerprints. This requires Wix data-item write
access. The repair workflow does not itself deploy, but **its live CMS write
can trigger the publishing bridge to build current `main` automatically**.
The candidate branch is not promoted by that signal. See the
[repair procedure](docs/content-authoring.md#reviewed-one-time-cms-repair).

### One editing location

`CommonPages` and `FundraisingPages` are the editing locations for their page
types; `GeneratedPages` contains header overrides only. `BoardMembers` owns the board roster; use Wix Blog, Events, and Stores for
their respective content. Editing a regular legacy Wix Editor text block does
not update any of these collections.

Do not maintain two independent enrichment pages. In the Wix Editor, connect
the legacy enrichment text to the same `CommonPages` record if its elements
support a CMS dataset. Otherwise replace the legacy body with a link to the
new enrichment page during the agreed content handoff. Do not delete the
legacy route or change DNS as part of that handoff.

See [content authoring and handoff](docs/content-authoring.md) for the repair
workflow, review responsibilities, and publication checklist, and
[content parity](docs/content-parity.md) for the priority-page comparison.

`npm run bootstrap:wix` is a limited legacy-site extraction, not a normal
snapshot refresh. It overwrites `wix-content.json`, leaves CMS arrays empty,
and uses descriptions rather than full rich bodies. Prefer the
[authenticated public export](docs/content-authoring.md#refreshing-the-offline-snapshot)
or the existing reviewed snapshot; do not discard the latter because a local
API key is unavailable.

## Newsletter archive

The `/newsletter/` page uses Constant Contact's public Email Archive feed, so it
does not require OAuth or an API secret. It displays the newest archived
campaign by default, generates a stable page for every archived edition, and
keeps signup calls to action above and below the current issue.

In Constant Contact, open **Campaigns → Settings → Email Archive**, enable the
archive, select the campaigns to publish, and copy the widget code. Find the
public value in `data-m="..."`, then configure it as a repository variable:

```sh
gh variable set CONSTANT_CONTACT_ARCHIVE_ID --body '<data-m value>' --repo montlake-pta/website
gh workflow run pages.yml --repo montlake-pta/website
```

The hourly Pages workflow requests:

```text
https://campaignlp.constantcontact.com/v1/archive/<data-m>/activities?limit=100
```

The response contains public campaign subjects and permanent URLs. The build
embeds the selected campaign in a sandboxed iframe rather than injecting remote
email HTML into the site.

## Existing services retained

The redesign keeps the PTA's current operational tools in place:

- Constant Contact for the weekly newsletter
- Givebacks for PTA membership
- PayPal and employer portals for donations
- Google Calendar for live dates and events
- 6crickets for enrichment registration
- SchoolAuction.net for the seasonal auction

The existing site remains at `montlakepta.org` during the preview period.
Authenticated synchronization alone is not cutover approval. Do not change
DNS or add a `CNAME` file until visitor flows, the strict cutover gate and the
coordinated Wix/GitHub domain plan are ready and the owner approves the launch.
