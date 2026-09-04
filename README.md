# Montlake PTA website

A static website for Montlake Elementary PTA with Wix as its authoring and data
source.

**Preview:** <https://montlake-pta.github.io/website/>

## Edit the site

- Page copy, navigation, and external service URLs: `src/site.mjs`
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
- `.github/workflows/copilot-setup-steps.yml` for a deterministic Node.js 24
  cloud-agent environment
- GitHub issue and pull request templates for agent-ready requirements and
  handoffs

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

## Wix content sync

The deployed site reads Blog posts, Events, Store products and categories, PTA
board members, and CMS-managed pages from Wix during the GitHub Actions build.
The result is static HTML, so Wix credentials are never sent to visitors.

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

The workflow synchronizes on pushes, on manual runs, every hour, and when it
receives a `wix-content-updated` repository dispatch. A failed authenticated
sync stops deployment rather than publishing stale content.

For local authenticated sync:

```sh
cp .env.example .env
# Add WIX_API_KEY to .env, then:
node --env-file=.env scripts/sync-wix.mjs
npm run build
```

### CMS collections

Regular editor page blocks are not available through Wix Headless APIs. The
integration uses two CMS collections instead:

- `BoardMembers`: school year, role, names, email, display order, and active
- `WebsitePages`: slug, title, heading, kicker, description, accent, body, and
  published

Create and seed both collections from the current repository content:

```sh
node --env-file=.env scripts/setup-wix-cms.mjs
```

Alternatively, run the manual **Set Up Wix CMS** workflow after configuring the
repository secret:

```sh
gh workflow run setup-wix-cms.yml --repo montlake-pta/website
```

This setup command is idempotent: it creates missing collections and only adds
seed rows when a collection is empty. Afterward, editors can maintain those
records in Wix CMS and each site build will pull them automatically.

`npm run bootstrap:wix` refreshes the checked-in public snapshot. It is intended
only for initial migration or disaster recovery; normal deployments use the
authenticated SDK sync.

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

The existing site remains at `montlakepta.org` during the preview period. Do not
add a `CNAME` file or change DNS until authenticated synchronization is enabled
and the desired domain cutover date is confirmed.
