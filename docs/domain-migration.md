# Montlake PTA domain migration: maintainer handoff

**Audience:** the people who maintain the PTA's domain and Wix account. No
terminal commands or programming are required for their steps.

**Status, September 18, 2026:** this is a launch procedure, not a record of a
completed domain move. The public domain still points to Wix. The GitHub site
is live at its preview address and uses the visitor SDK in read-only mode.
The website maintainer must finish the checkout-domain implementation before
authorizing the live switch.

**Do not start Phase 2 without the website maintainer present and an explicit
"ready to switch" confirmation.** Earlier permission to create test resources
was not permission to move the public domain.

## What is changing

We are keeping the existing Wix site, its account and its data. We are changing
which service displays the public website.

| Address | After the move |
| --- | --- |
| `https://www.montlakepta.org/` | The new public website on GitHub Pages |
| `https://montlakepta.org/` | Sends visitors to the `www` address |
| `https://checkout.montlakepta.org/` | Wix-hosted checkout and related services |
| PTA email addresses | Continue working as before |

Wix continues to hold the CMS pages, blog, events, products, registration data
and publishing automations. Content managers continue editing Wix, and those
edits continue to trigger GitHub builds.

**Do not delete or unpublish the Wix site, cancel its plan, transfer the domain,
or change its nameservers.** Do not disable the publishing automations or
remove Wix business apps.

### A few terms used below

| Term | Plain-language meaning |
| --- | --- |
| DNS | The internet's address book: it tells browsers and email services where to go. |
| Nameservers | The service maintaining that address book. We are not changing this service. |
| A record | A website address pointing to a numeric IP address. |
| CNAME record | A website address pointing to another hostname. |
| TXT / MX records | Settings that can protect the domain or make email work. Leave existing ones alone. |
| `@` | The root address, `montlakepta.org`, without `www` or another prefix. |
| TTL | How long other computers remember a DNS answer before checking again. |
| Primary domain in Wix | The address Wix treats as the main address of its own site. |
| Frontend | The public-facing website; after the move this is GitHub Pages. |

## People and access needed

One person may hold multiple roles, but agree who owns each before starting.

| Role | Access needed | Responsibility |
| --- | --- | --- |
| Domain maintainer | DNS editing for `montlakepta.org` | Back up and edit the specific website records, preserving email. |
| Wix maintainer | Domain management and Headless Settings for **Montlake PTA Website** | Keep the existing site and move its hosted pages to the checkout subdomain. |
| Website/GitHub maintainer | Code/deployment access, repository administration and an organization owner for verification | Prepare the release, configure GitHub, run technical checks and coordinate rollback. |

Use your own account access. Do not exchange passwords, API keys or recovery
codes in email. A sign-in or two-factor prompt should be completed by that
account's authorized holder.

Public DNS currently uses `ns57.domaincontrol.com` and
`ns58.domaincontrol.com`, indicating GoDaddy DNS infrastructure. The steps below
use GoDaddy's interface. If the domain is not in your GoDaddy account, ask the
domain owner which account or reseller manages it; do not transfer it or
create a replacement domain.

## Phase 1: prepare without moving the public website

### 1. Agree on a launch window

Choose a time when all three roles can work together without interruption.
Avoid fundraising deadlines and registration openings.

Allow time for troubleshooting. DNS and HTTPS certificate changes can take
**up to 24-48 hours** to settle, even if some visitors see the change much
sooner. Lowering the TTL helps, but it does not guarantee an instant launch.

Record who can make the rollback decision. If somebody must leave halfway
through, postpone the live switch.

### 2. Save the current settings

**Domain maintainer:**

1. Sign in to GoDaddy and open **Domain Portfolio**.
2. Select **montlakepta.org**.
3. Select **DNS** to see its records.
4. From **Actions**, select **Export Zone File**. Save the download with the
   launch date in its filename.
5. Take screenshots of the DNS records and nameservers as well.

The authoritative website records observed on September 18, 2026 were:

| Type | Name | Observed value | Observed TTL |
| --- | --- | --- | --- |
| A | `@` | `185.230.63.107` | 3600 seconds / 1 hour |
| CNAME | `www` | `pointing.wixdns.net` | 3600 seconds / 1 hour |
| AAAA | `@` | No record returned | Not applicable |
| CNAME | `checkout` | No record returned | Not applicable |

**Use the values visible in the account on launch day as the rollback record.**
If they differ from this table, have the website maintainer review the
difference before proceeding.

**Wix maintainer:** take screenshots of the current primary domain, Wix pages
domain, frontend link and Headless client redirect settings. Do not include
API-key or secret values in screenshots shared with others.

**GitHub maintainer:** record the current Pages custom-domain setting,
deployment revision and public configuration variables.

### 3. Protect email and unrelated services

Existing email DNS points to Google's mail servers. Leave all of the following
alone:

- MX records.
- Existing TXT records, including Google verification, SPF and DMARC.
- Email-related CNAME records, including DKIM.
- Unrelated subdomains and service-verification records.
- Nameservers.

**Do not use "replace all DNS records," "reset DNS," or "change nameservers."**
Only the specific website records listed in Phase 2 should change. Adding
GitHub's separate verification TXT record is safe; replacing existing TXT
records is not.

### 4. Lower the website TTL in advance

About **24-48 hours before launch**, edit the existing `@` A record and `www`
CNAME record:

1. Select the pencil/**Edit** beside the record.
2. Change **TTL** to **300 seconds / 5 minutes**, if offered.
3. Leave the destination unchanged.
4. Select **Save**.

If five minutes is unavailable, use the lowest supported setting and tell the
website maintainer. Record the original TTL so it can be restored later.

### 5. Verify domain ownership with GitHub

**GitHub organization owner starts this step:**

1. Open the **montlake-pta organization's Settings**, not a personal account's
   settings and not the website repository's settings.
2. Open **Pages** and add `montlakepta.org` for domain verification.
3. Give the domain maintainer the **exact DNS TXT name and value GitHub shows**.

**Domain maintainer:**

1. In GoDaddy's DNS screen, select **Add New Record**.
2. Choose **TXT**.
3. Enter the name and value supplied by GitHub.
4. Save without editing existing TXT records.

GoDaddy's **Name** field normally expects only the prefix, not the repeated
domain suffix. Have the GitHub maintainer confirm the displayed full record
name before saving if the interfaces use different formats.

The GitHub owner then selects **Verify**. Keep this TXT record after
verification. Verifying the root domain also protects its immediate
subdomains for this GitHub organization.

### 6. Prepare the checkout subdomain in Wix

**Wix maintainer:**

1. Open the existing **Montlake PTA Website** dashboard.
2. Go to **Settings → Domains**.
3. Begin connecting a domain you already own.
4. Select the **existing Montlake site**, not a new or test site.
5. Enter `checkout.montlakepta.org`.
6. Use DNS **pointing**, where offered, so GoDaddy remains the DNS provider.
7. Save or screenshot the exact DNS instructions Wix supplies.

The checkout record will normally be a CNAME named `checkout`, but **its
destination must come from Wix's connection instructions**. Do not guess it
or copy an example such as `www123.wixdns.net`.

The domain maintainer may add only that checkout-specific record ahead of
launch if the Wix process allows it **without changing the current primary
domain**. Record the exact value for Phase 2.

**Do not make checkout the primary Wix domain yet.** Doing so prematurely can
redirect visitors away from the current public site. A secondary checkout
address redirecting to `www` at this stage is not proof that the final checkout
flow works.

If Wix asks to reconnect the whole root domain, change nameservers, choose a
different site or change the primary domain immediately, stop. Give Wix
support this message:

> We are moving the public frontend of our existing Montlake PTA Wix Editor
> site to GitHub Pages. We need checkout.montlakepta.org connected to the same
> Wix site for Wix-hosted checkout. DNS must remain at GoDaddy. Please help us
> prepare the subdomain without changing the current primary domain until our
> coordinated launch window. We are not deleting, unpublishing or replacing
> the Wix backend.

### 7. Obtain the website maintainer's "ready to switch" confirmation

**Do not begin Phase 2 until this is received.**

The website maintainer must have a prepared final-domain release and confirm:

- The code accepts the specific approved Wix checkout host.
- Final URLs use `https://www.montlakepta.org/`, **without `/website/`**.
- Registration, cart and checkout-return paths are implemented, with the
  controlled scenario results and remaining post-switch checks understood.
- Images, old inbound paths, documents and fundraising archive preparation
  work with the final-domain build.
- Applicable build and cutover checks pass; none were disabled to get a green
  result.
- A known rollback release and coordinated settings rollback are recorded.

**Production remains read-only; it has not switched domains.** Code support for
the exact checkout origin and an isolated final-domain rehearsal are now
prepared. Neither configures the checkout hostname or proves that its final
redirect chain works. Existing controlled tests proved cart operations,
RSVP submission and ticket reservation, but the checkout URL still returned
to the old primary domain. These are engineering prerequisites, not problems
the DNS maintainer should solve by trial and error.

The checkout subdomain's final behavior and certificate can only be confirmed
after its connection and domain switch. Agree on the final verification and
rollback decision before starting that transition.

## Phase 2: make the coordinated live switch

**Complete this phase together, from start to finish. Do not stop halfway.**

### 1. Configure GitHub Pages before changing the public DNS

**Website/GitHub maintainer:**

1. Open [the website repository's Pages settings](https://github.com/montlake-pta/website/settings/pages).
2. Keep the publishing source as **GitHub Actions**.
3. Under **Custom domain**, enter `www.montlakepta.org`.
4. Select **Save**.
5. Coordinate deployment of the prepared final-domain release.

The Custom domain field takes a hostname: **no `https://`, trailing slash or
`/website/`**. Do not choose `fundraising-archive` as the publishing source.
This repository uses an Actions workflow, so no repository `CNAME` file is
required.

Do this in the agreed launch window: assigning a custom domain can change
where the GitHub preview address redirects. It is different from the earlier
TXT ownership-verification step.

### 2. Point the public website DNS records to GitHub

**Domain maintainer, in GoDaddy → montlakepta.org → DNS:**

Edit the existing `www` CNAME:

| Field | Enter |
| --- | --- |
| Type | CNAME |
| Name | `www` |
| Value | `montlake-pta.github.io` |
| TTL | 300 seconds, or the agreed minimum |

The destination must **not** include `https://` or `/website/`. Edit the
existing record; do not add a second competing `www` record.

For the root address, replace the old website A destination with GitHub's four
A records:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

GoDaddy may show **Add another value** instead of four separate rows. Either
presentation is fine if all four addresses are saved.

**Do not leave the old Wix A address alongside the GitHub addresses.** That can
send different visitors to different sites.

No root AAAA record was returned during preflight. If one appears by launch
day, have the website maintainer review it; an old IPv6 destination must not
continue sending some visitors to Wix. Do not guess replacement IPv6 values.

Keep the checkout-specific Wix record, email records, nameservers and
unrelated records unchanged. Do not add wildcard records or use domain
forwarding/masking as a substitute for this configuration.

### 3. Make the checkout subdomain Wix's primary domain

**Wix maintainer, after the public DNS changes have been saved:**

1. Return to **Settings → Domains** for the existing Montlake site.
2. Finish connecting `checkout.montlakepta.org` using Wix's exact subdomain
   instructions. Coordinate any outstanding checkout-only DNS entry with the
   domain maintainer.
3. Set **checkout.montlakepta.org as the Wix site's primary domain**.
4. Unassign `www.montlakepta.org` and the root `montlakepta.org` from the Wix
   site wherever they remain assigned.

**Unassigning does not mean canceling domain ownership or deleting the site.**
If the screen offers site deletion, subscription cancellation or a domain
transfer, stop and contact the website maintainer/Wix support.

This order follows Wix's migration guidance: point the main domain at the
external host **before** changing Wix's primary domain. Some visitors may
temporarily see the old setup while cached DNS answers expire.

### 4. Confirm the Headless URL settings

**Wix maintainer:** open **Settings → Development & integrations → Headless
Settings** in the same site.

Under **Manage URLs**, confirm:

| Setting | Required value |
| --- | --- |
| Wix pages domain | `https://checkout.montlakepta.org/` |
| Frontend link | `https://www.montlakepta.org/` |

Use **Manage domain** for the Wix pages domain and **Add Link/Edit Link** for
the frontend link. These are different settings; changing one does not prove
the other is correct.

Under **Headless clients**, use the **More Actions → Settings** menu for the
existing **Montlake PTA Website** client. Its public ID is:

```text
b0a3701c-099d-4f99-8057-e3a0d1fb2d71
```

Confirm **Allowed redirect domains** includes:

```text
www.montlakepta.org
montlakepta.org
montlake-pta.github.io
```

Keep the preview domain during the launch and rollback period. Do not replace
the entire list and accidentally remove an approved destination.

**Do not create a new client or change its ID.** Leave **Login URL** empty.
The current site does not implement member login. Do not invent a login
callback or put checkout-return URLs under **Authorization redirect URIs**;
that separate field is for exact member-login callbacks.

The website maintainer configures checkout returns in application code:

```text
https://www.montlakepta.org/checkout/complete/
https://www.montlakepta.org/cart/
```

These are return addresses on the public frontend, not DNS records and not
the Wix checkout domain.

### 5. Wait for HTTPS and confirm the release

**GitHub maintainer:** check Pages settings until the domain/certificate is
ready, then select **Enforce HTTPS** when available. GitHub says this option
can take up to 24 hours to become available.

**Wix maintainer:** confirm Wix has secured `checkout.montlakepta.org`.

Do not tell families to bypass browser security warnings. If either
certificate remains unavailable, have the website maintainer investigate
rather than repeatedly deleting and recreating DNS records.

The website maintainer confirms the final deployment and transaction settings.
A green read-only deployment is not proof that full checkout is ready.

## Phase 3: check before announcing the launch

Use a private/incognito browser window, then repeat key checks on a phone
using cellular data instead of Wi-Fi.

| Check | Expected result |
| --- | --- |
| Open `https://www.montlakepta.org/` | The new design appears, with no security warning. |
| Open `https://montlakepta.org/` | The address changes to `https://www.montlakepta.org/`. |
| Open the HTTP versions | They redirect to HTTPS. |
| Open Enrichment, Donate, Annual Fund, Spring Auction and Calendar | Correct pages, images and documents load. |
| Try old newsletter/bookmark links | They reach the intended new page or an intentional not-found page. |
| Check registration | The intended registration flow works and validates required fields. |
| Exercise an approved checkout scenario | It reaches `checkout.montlakepta.org` and returns to the official public website. |
| Back out of checkout | It returns safely and does not falsely confirm payment. |
| Send and receive PTA email | Both directions still work. |
| Inspect the latest deployment and fundraising archive run | Both completed successfully. |

**The website maintainer handles transaction testing.** Do not buy fundraiser
products, reserve real event tickets or submit community registrations just to
check the launch. Use only the agreed controlled scenario.

Do not treat the checkout hostname's homepage loading as sufficient proof:
the actual cart/ticket redirect and return paths must be exercised.

GitHub Pages can provide canonical hostname/HTTPS redirects. Existing legacy
event compatibility pages use static HTML/browser redirects, not configurable
server-side 301 rules. Any requirement for additional server-side path redirects
belongs to the website maintainer, not to a DNS record or a new Wix Editor
redirect after Wix no longer serves `www`.

Announce the launch only when the maintainers agree the checks pass.

## If something goes wrong

**Stop further changes and contact the website maintainer. Do not improvise.**

Send the address you opened, what you expected, what appeared instead, a
screenshot and the approximate time. Do not include passwords, API keys,
payment information or a checkout URL containing a session token.

Common warning signs:

| Symptom | What to do |
| --- | --- |
| `www` sends visitors to checkout | Ask the website/Wix maintainer to check domain assignments and cached redirects. |
| The page loads without styling or images | Ask the website maintainer to check final-domain paths; do not change DNS repeatedly. |
| A browser security warning appears | Stop and have the maintainers check certificate readiness. Do not bypass the warning. |
| Email stops working | Immediately compare the saved mail records; do not delete or recreate the whole DNS zone. |
| Checkout says it is unavailable | Have the website maintainer inspect the actual redirect destination and release configuration. Do not disable the redirect guard. |

### Coordinated rollback

The website maintainer decides whether to roll back using the recorded
pre-launch settings. **Rollback must restore both DNS and Wix configuration.**
Restoring only DNS may still send visitors to checkout if Wix's primary
domain has changed.

The coordinated rollback restores:

- The original `@` and `www` website DNS destinations from the saved record.
- The original Wix domain assignment, primary/pages domain and frontend link.
- The appropriate GitHub custom-domain setting, application variables and
  known deployment.

Email records remain untouched. DNS caches mean rollback may not be
instantaneous. Never substitute "delete Wix" or "delete GitHub Pages" for the
reviewed rollback.

## After a successful launch

Monitor the public pages and Wix-hosted flows for 24-48 hours. Once stable,
restore the original website TTL values, retain GitHub's verification TXT
record and keep domain renewals/Wix services active.

The website maintainer should check old inbound links, canonicals, sitemap,
notification links, any domain-dependent backend URLs and search indexing.
Only remove obsolete preview redirect approvals after the rollback period.
No manual action is needed to maintain the fundraising snapshots.

## Website maintainer's technical release notes

This section is for the technical role, not the domain editor.

- The intended `https://checkout.montlakepta.org` origin is explicitly supported
  in `validateRedirect()` with unsafe host/URL regression coverage. Confirm
  the actual Wix redirect chain; an allowed initial alias is not enough.
- Prepare `SITE_URL=https://www.montlakepta.org/`. At the approved full launch,
  `WIX_HEADLESS_READ_ONLY=false` and `WIX_HEADLESS_ENABLED=true` must agree with
  the public configuration. Do not set them prematurely on routine production
  runs or weaken the deployment gate to accommodate a half-switched site.
- Run the final-domain build and ordinary tests, plus strict cutover checks
  and controlled browser scenarios. Check nested callback/compatibility paths,
  and archive preparation with existing media URLs after the base URL changes.
- The Wix client's allowed redirects, GitHub Actions publishing settings,
  Wix domain settings and DNS must be coordinated. The `fundraising-archive`
  branch is storage only.
- Do not claim member login, successful payment or domain cutover from
  read-only probes. Current controlled write evidence and remaining blockers
  are in [operations](operations.md#approved-transaction-validation) and
  [issue #4](https://github.com/montlake-pta/website/issues/4).
- Before launch, fill in Wix's actual checkout DNS target and refresh the
  public DNS backup. This document intentionally does not invent that target.

### Running the prepared checks

The website maintainer can run **Rehearse official-domain launch** in the
repository's **Actions** tab, choosing **Run workflow → main**. Leave
**Refresh public content** selected to test current public Wix content.
This workflow cannot deploy or change DNS/settings. A successful run produces
an artifact with `report.json`, desktop/mobile screenshots and fundraising
archive captures.

The rehearsal tests a private local copy as though it were on the official
domain. Wix API requests are blocked in that browser. Therefore, a pass means
the prepared code, paths and page output work; it is not proof of the live
checkout hostname or a completed payment.

For actual public addresses, use **Check public launch readiness** in Actions.
Choose **preview** before launch and **launch** after the coordinated switch.
The report explains each result in plain language. The launch profile should
report **NOT READY** while DNS and Wix/GitHub settings still describe the old
site. It does not change anything to make itself pass.

### Using the reviewed launch and rollback presets

**Only the website/GitHub maintainer should do this during an approved launch
or rollback. Do not do it now just to rehearse.**

1. Open the website repository's **Settings → Secrets and variables →
   Actions → Variables**.
2. Record the current settings. Remove conflicting individual overrides named
   `SITE_URL`, `WIX_HEADLESS_ENABLED` and `WIX_HEADLESS_READ_ONLY` when moving
   to the complete profile. Do not remove `WIX_SITE_ID`, `WIX_SYNC_ENABLED`,
   `WIX_HEADLESS_CLIENT_ID` or unrelated variables/secrets.
3. Add or edit the repository variable **DEPLOYMENT_PROFILE**:
   use `launch` for the approved official-domain/full-transaction release, or
   `preview` for the GitHub-preview/read-only application rollback.
4. In **Actions → Deploy GitHub Pages**, select **Run workflow → main** at the
   agreed point in the coordinated domain procedure. Changing a variable alone
   does not deploy a new build.
5. Inspect the deployment and rerun the corresponding public readiness check.

The presets select the URL and both visitor-mode flags together, preventing a
mixture of preview and launch values. Conflicting overrides stop the build
with an explanation; do not weaken the check.

**The rollback preset does not restore DNS or Wix domain assignments.**
Follow the coordinated rollback section as well, including GitHub's custom
domain setting. Domain ownership verification and mail records remain intact.

## Official references

Checked September 18, 2026. Dashboard wording may change; if a screen does not
match the intent described here, stop rather than guessing.

- [Wix: migrate an existing site to a self-managed frontend](https://dev.wix.com/docs/go-headless/self-managed-headless/migrate-from-an-existing-wix-site/migrate-a-wix-site-to-a-self-managed-headless-project)
- [GitHub: configure a custom Pages domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [GitHub: verify domain ownership](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
- [GoDaddy: export DNS records](https://www.godaddy.com/help/export-my-domains-zone-file-records-4166)
- [GoDaddy: edit a CNAME record](https://www.godaddy.com/help/edit-a-cname-record-19237)
- [GoDaddy: edit an A record](https://www.godaddy.com/help/edit-an-a-record-19239)
- [Wix: configure allowed redirects](https://dev.wix.com/docs/go-headless/authentication/setup/allow-redirect-uris-and-domains)
- [Wix: set the frontend link](https://dev.wix.com/docs/go-headless/project-management/add-a-frontend-link)
