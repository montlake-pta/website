# Content authoring and handoff

## Who edits what

| Content | Editing location | Website behavior |
|---|---|---|
| Informational page bodies, including Enrichment, Advocacy, Budget, Donate and dated campaign pages | Wix CMS `WebsitePages`, selected by `slug` | Read during the next Pages build |
| Board roster | Wix CMS `BoardMembers` | Replaces the roster section of the board page |
| Posts, event details, products | Wix Blog, Events, Stores | Generated indexes and individual routes |
| Newsletter editions | Constant Contact public Email Archive | Public newsletter permalink embedded on the site |
| School dates | Public Google Calendar | Included in homepage upcoming events |
| Layout, navigation, design, fallback copy | Repository source | Deployed with the code change |

For a normal copy edit, change the existing CMS record, not the legacy Editor
text block, a generated HTML file, or the seed script. The seed script only
inserts missing rows. A successful sync cannot recover details that were never
put in the CMS.

### Source precedence and fallback behavior

The generator begins with `src/site.mjs`, overlays valid published
`WebsitePages` records, then applies specialized renderers. The board roster,
Blog/Events/Shop indexes and newsletter content have their own data sources;
editing an index's CMS body is not a reliable way to change generated cards or
newsletter editions. Layout and surrounding template copy remain in source.

For a static route that exists in `src/site.mjs`, deleting/unpublishing its CMS
record or leaving its body empty can expose the fallback again; it does **not**
necessarily remove the public page. Likewise, if there are no usable active
board records, the board page retains its CMS/static fallback. A deliberate
page withdrawal or roster-hiding requirement needs a coordinated source change,
not an assumption that an empty collection hides everything.

## What causes a website update

- **CMS `WebsitePages` and `BoardMembers`:** adding, editing or deleting records
  requests a rebuild.
- **Blog:** publishing, updating or deleting a published post requests a
  rebuild; saving a draft alone has no dedicated trigger.
- **Events:** creating, editing, canceling or deleting an event requests a
  rebuild.
- **Store products:** product edits, variants and stock changes request a
  rebuild; collection lifecycle changes are also connected.

Changes appear after deployment finishes. Rapid edits can be combined into a
newer queued build. Some imports, reference-only changes and deliberately
suppressed hooks may wait for hourly recovery. Newsletter editions and Google
Calendar changes are picked up on the next rebuild or hourly refresh, not by
the Wix mutation sender.

Edit page copy in `WebsitePages`, not independent legacy Editor text blocks.
For a saved edit that is not appearing, follow
[publishing diagnosis](operations.md#diagnose-publishing-before-changing-content)
instead of repeatedly changing the content.

## Reviewed one-time CMS repair

The manual **Update One Wix Page** workflow is for a deliberate migration
repair, not routine authoring. It uses the repository's Actions secret; do not
extract or print that secret. Its key needs Wix data-item read/write access.
GitHub permissions remain `contents: read`.

**Publication side effect:** a successful apply or CMS seed insertion can now
trigger the Wix-to-GitHub bridge immediately. That builds the repository's
current `main`, not the candidate branch used to author the repair. Before a
write, make sure production code can render the proposed content. Deploy
compatible presentation code first when needed; do not assume a feature-branch
plan isolates live CMS changes.

1. Commit and push the reviewed `src/site.mjs` candidate. Run a plan on that
   branch, for example:

   ```sh
   gh workflow run update-wix-page.yml --ref YOUR_BRANCH \
     -f mode=plan -f slug=enrichment
   ```

2. Download the run's public artifact with `gh run download RUN_ID --dir NEW_DIR`.
   Review `report.json` and `proposed-page.json`. Check for newer live copy and
   preserve any information the candidate does not contain. The report is
   sanitized public content, not a lossless full-item backup.
3. Run the same workflow in `apply` mode with the page's `slug`,
   `candidate_commit`, `expected_fingerprint`, and
   `expected_candidate_fingerprint` from `report.json`'s `applyInputs`.
   Apply checks out the exact planned commit. A changed record or candidate
   requires a new reviewed plan; never bypass the conditional update.
4. Require `applied` or `already-current` status and a verified
   `snapshot-page.json`. Merge only that page into the offline snapshot's
   `cms.pages`; retain unrelated pages, posts, events, products, and metadata.
5. Build and inspect the CMS-backed output and inspect the resulting `pages.yml`
   run. The repair workflow does not directly commit or deploy source, but the
   publishing bridge can already have requested a `main` deployment. Manually
   run Pages only when recovery is needed.

Run a separate plan/apply pair for each page. Avoid simultaneous CMS authoring
during a repair. A failed write or read-back can have an unknown outcome: inspect
a fresh plan before retrying. The workflow never inserts a missing record,
creates a collection, or automatically rolls back a completed write.

## Refreshing the offline snapshot

Use **Export Public Content Snapshot** after reviewing the normalizers at a
committed revision. Supply its full commit SHA as `candidate_commit`. The manual
workflow reads Wix, the public calendar and the public newsletter archive,
validates and exports only their normalized JSON snapshots, then builds and
checks the site. The artifact remains available to diagnose a later build
failure; it is not by itself a release approval. The workflow does not write to
Wix or deploy the site.

```sh
gh workflow run export-content-snapshot.yml --repo montlake-pta/website \
  --ref YOUR_BRANCH -f candidate_commit=FULL_REVIEWED_COMMIT_SHA
gh run download RUN_ID --repo montlake-pta/website \
  --name public-content-RUN_ID --dir NEW_REVIEW_DIRECTORY
```

The three exported JSON files are already normalized; review them before
copying them into `src/data/` and committing. The optional
`inspect_event_forms=true` input logs public form field names/types only.
It does not exercise visitor RSVP permissions.

Download the run's `public-content-RUN_ID` artifact, review the public fields and
restored links/media, and replace the corresponding files in `src/data/`.
Do not use raw SDK payloads or deployment logs as a snapshot. The public
normalization layer must remove private metadata and conferencing credentials;
fix that layer rather than hand-redacting each generated export.

An offline snapshot supports local builds and recovery. Its contents do not
prove what exists in the live CMS; compare the deployed pages or perform an
authenticated read before diagnosing missing live records.

The newsletter archive may be connected and still contain no public editions.
An editor must publish editions in Constant Contact before the site can show
them; this outstanding source action is tracked in
[issue #3](https://github.com/montlake-pta/website/issues/3).

## Enrichment content handoff

The restored guide preserves the public program's practical information:
registration preparation, management fees and assistance, first-class
checklist, Commons transition, dismissal options, pickup map, absence and
cancellation procedures, behavior plan, late-pickup guidance, and role-based
contacts.

The source still showed Spring 2026 dates on September 9, 2026. Those dates
are not a current-session schedule. The rebuilt guide instead directs families
to 6crickets and the coordinator until current session information is confirmed.
It distinguishes the published pickup policy from confirmation for the next
class. It does not claim the team has approved the restored text.

School-side confirmation and the legacy Editor handoff are tracked in
[issue #1](https://github.com/montlake-pta/website/issues/1).

The five-page parity audit also restores the dated February 2026 budget survey
link and the donation page's qualified tax-deductibility statement. Remaining
dated program, staffing-contact, and fund-policy questions are tracked in
[issue #2](https://github.com/montlake-pta/website/issues/2); neither issue implies
owner approval.

Before adding a current-session summary, the enrichment owner needs to confirm:

- session start/end dates, registration opening/closing dates, and no-class days;
- which coordinator and counselor currently cover the published role addresses;
- the current pickup gate, Commons transition, Launch and Let Grow arrangements;
- the 10-minute late-pickup transfer, 5:30 PM cutoff, and applicable fees;
- the currency of the behavior-plan and campus-map PDFs.

Use the same CMS body for the current-session summary and durable instructions
for now. Keep dates together, explicitly name the session/year, and retire
expired enrollment calls to action. A separate session collection is not
needed just to repair missing content.

## Stop parallel authoring

The existing live legacy site remains a separate Wix Editor presentation.
Changing `WebsitePages` does **not** modify those editor elements.

A site owner must make one deliberate Editor handoff:

1. Connect the legacy enrichment text to a read-only dataset for `WebsitePages`,
   filtered to `slug = enrichment`, if the legacy elements support it; publish
   and compare both versions.
2. If binding is not supported, replace the independently maintained legacy
   body with a short link to
   <https://montlake-pta.github.io/website/enrichment/> at the agreed handoff.
3. Keep the legacy `/enrichment` URL working. Do not switch the custom domain,
   remove a page, or replace unrelated Editor content without a separate
   cutover decision.

Until that Editor handoff is completed, tell content editors to use the CMS
for the new site and avoid making independent legacy-only updates. This is an
outstanding site-owner action, not a change the repository can make by itself.

## Retiring the legacy frontend

Known internal links are rewritten at generation time using the actual route
inventory. The two enrichment PDFs are repository assets; their original
`_files/ugd/` paths are also served byte-for-byte for old inbound links.
Unknown legacy destinations are errors, not silently retained dependencies.
Do not replace an event's registration button with a link to its own new
detail page.

The Fifth Grade Promotion page is a dated 2026 archive. Its old generic contact
form is replaced with the existing PTA events email; the old Wix corporate
social links and hidden submission-success text are not PTA functionality.
Its new CMS record can be seeded without affecting other collections:

```sh
npm run setup:wix-cms -- --page fifth-grade-promotion
```

The corresponding manual workflow accepts an optional `page` input. This
inserts only a missing record; it still never overwrites existing authored
content.

Wix visitor transactions require the public Headless client configuration in
[issue #4](https://github.com/montlake-pta/website/issues/4). Until permissions
or the public client ID are supplied, activation stays off. Working active
registration handoffs are explicitly marked as unresolved dependencies rather
than removed prematurely. Closed events and unavailable products do not need
legacy handoffs, and external ticket providers can be linked directly.
See [operations.md](operations.md#finish-cutover-without-breaking-checkout)
for the exact Headless role requirement, checkout-domain limitation and what
the readiness commands do and do not prove.

The old frontend must remain available until visitor registration/checkout is
verified, the strict cutover gate passes and the owner approves the domain
switch. Wix CMS, commerce services and media hosting remain in use afterward.

## Publication and completeness

- Compare the whole legacy page, including documents and expanded sections;
  a simplified webpage extractor may return only one subsection.
- Record each important fact, policy, link, and date in the
  [parity review](content-parity.md). Mark outdated or conflicting facts for
  confirmation, not silent removal or speculative correction.
- Improve section ordering and summaries without dropping exceptions, fees,
  responsibilities, or recovery instructions.
- Preserve safe HTML, link destinations, and guide navigation through the CMS
  sanitizer. Changes to wording should remain possible without locking every
  sentence into tests.
- Run the site build and tests with both fallback and CMS-delivered content.
  Inspect the deployed page after an authenticated sync, not only a local
  fallback build.
- Keep `src/site.mjs` fallback and `src/data/wix-content.json` offline CMS copy
  current after an approved repair. Do not publish repository copies back to
  Wix during routine scheduled builds.
- Confirm the mutation-triggered deployment for CMS edits. Use the hourly
  deployment or a manual `pages.yml` run as recovery, not as a required step
  for every ordinary edit.
