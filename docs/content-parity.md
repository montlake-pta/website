# Content parity review

Audited: **2026-09-09**  
Scope: five public page pairs — legacy Wix site (`https://www.montlakepta.org/{slug}`) vs. new GitHub Pages site (`https://montlake-pta.github.io/website/{slug}/`)  
At the initial audit, the local offline snapshot contained no page records, while authenticated production builds pulled live Wix CMS records. The local snapshot could not prove live CMS state. This review compared the deployed public pages directly; character counts and source quotations below record that pre-repair baseline.  
Methodology: full DOM text extracted with `htmlparser2`/`domutils`/`css-select`; `script`/`style` nodes skipped by element name; shared header/footer excluded. Key external links probed by HTTP HEAD; survey blog post content confirmed by GET.

## Repair disposition

- Enrichment: complete operational guide restored in the existing live
  `WebsitePages` record, including the documents, registration preparation,
  transitions, pickup, absences, and policies. Expired Spring 2026 dates were
  not republished as current. Owner confirmation and legacy Editor handoff:
  [#1](https://github.com/montlake-pta/website/issues/1).
- G-BUD-1 and G-DON-2: restored in the live Budget and Donate CMS records.
  All three repaired records were read back and copied to the offline snapshot;
  their fallback bodies carry the same information.
- Other dated or conflicting claims remain with content owners in
  [#2](https://github.com/montlake-pta/website/issues/2). In particular, the two
  legacy 10% claims use different denominators; do not merge them into one policy.

The repairs used the manual workflow's public plans and conditional updates.
They do not constitute school approval of current session details or a change
to the independent legacy Wix Editor presentation.

---

## Parity summary table

| Page | Legacy chars | New chars | Status | Priority gaps |
|---|---|---|---|---|
| welcome-new-families | 9 331 | 3 089 | ⚠ Reduced | School Choice deadlines; SPS office contact; Summer Buddy Program |
| special-education | 642 | 978 | ✅ Improved | None — new page is fuller |
| donate | 5 403 | 2 417 | ⚠ Reduced | Equity Fund mechanism; 10 % commitment (tax-deductibility restored) |
| budget | 3 085 | 1 348 | ⚠ Reduced | BLT timeline; Community Fund 10 % definition (survey link restored) |
| pta-board | 957 | 1 627 | ✅ Equivalent | Board roster identical; new page adds recruitment section |

---

## Page-by-page findings

### 1. welcome-new-families

**Legacy:** `https://www.montlakepta.org/welcome-new-families` (HTTP 200, 9 331 chars extracted)  
**New:** `https://montlake-pta.github.io/website/welcome-new-families/` (HTTP 200, 3 089 chars extracted)

#### Items matching across both pages
- Bell hours: 7:55 AM–2:25 PM M/Tu/Th/F; 7:55 AM–1:10 PM Wednesday.
- Kindergarten first day 2026–27: Tuesday September 8, 2026 (grades 1–5: September 2).
- Kindergarten Transition dates: August 25 and 26, 9 AM–12 PM.
- After-school providers and addresses/phones: all four match.
- Absence email: `montlake.attendance@seattleschools.org`.
- Volunteer clearance via SPS Volunteer website.
- Newsletter sign-up URL: `https://lp.constantcontactpages.com/sl/tG8wj2x/MontlakeSignUp`.
- Kindergarten incoming-family contact: `kelsey@montlakepta.org`.
- Outreach contact: `outreach@montlakepta.org`.

#### Priority gaps — action required

**G-WNF-1 · School Choice deadlines (REQUIRES CONTENT-OWNER CONFIRMATION)**  
Legacy text: *"School choice applications are typically due by January 31st, with late applications accepted through March 31st."*  
New site links to School Choice (`https://www.seattleschools.org/enroll/find-your-school/school-choice/`) but omits the deadline dates entirely.  
These dates should be confirmed with SPS for 2026–27 before restoring them; do not republish the legacy dates without confirmation.

**G-WNF-2 · SPS office assistant contact (REQUIRES CONTENT-OWNER CONFIRMATION)**  
Legacy text: *"If you have any questions, please contact our Office assistant, Missy Pody at mapody@seattleschools.org"* — context: volunteer clearance process.  
New site links to the SPS Volunteer website but names no school contact. Confirm whether Missy Pody is still in role before restoring the named contact. If confirmed, restore to the volunteer section.

**G-WNF-3 · Summer Buddy Program signup link absent**  
Legacy links to `https://forms.gle/nQ3KQHKceyHmEdTG8` (HEAD probe: 200, followed redirect to Google Forms) and reads: *"If you would like to be paired with a rising 1st/2nd grader to meet once this summer, please sign up here."*  
New site makes no mention of this program. The 2026 summer has passed (audit date: Sept 9, 2026). Confirm whether the program recurs; if so, restore the section and update the form link each year.

#### Improvements in new site (do not revert)

**I-WNF-1 · Meal payment system label corrected**  
Legacy labels the link "PayPAMS" but the URL points to `https://www.myschoolbucks.com/ver2/getmain?requestAction=home`. The new site labels the same link "MySchoolBucks", which matches the destination URL. Do not revert to the "PayPAMS" label.

**I-WNF-2 · Broken "The Source" link removed**  
Legacy contains two links for "The Source":
- `https://ps.seattleschools.org/` — HEAD probe returned **404**.
- `https://www.seattleschools.org/student-portal/technology-supports-for-families/source/` — HEAD probe returned **200**.

New site retains the SPS explanatory destination. Do not add the alternative
portal URL without confirming that it works for families.

#### Not restored (past events)
Summer meet-up dates (June 14, July 26, August 9, August 30, 2026) are past as of audit date. The new site directs families to the incoming-family list and newsletter for future scheduling — sufficient for the current year.

---

### 2. special-education

**Legacy:** `https://www.montlakepta.org/special-education` (HTTP 200, 642 chars extracted)  
**New:** `https://montlake-pta.github.io/website/special-education/` (HTTP 200, 978 chars extracted)

#### Status: new site is improved — no restoration needed

All legacy links are present and verified reachable:
- Child Find: `https://www.seattleschools.org/departments/early-learning/child-find/` (200 ✓)
- Special Education dept: `https://www.seattleschools.org/departments/special-education/` (200 ✓)
- Early Childhood Special Education: `https://www.seattleschools.org/departments/early-learning/early-childhood-special-education/` (200 ✓)
- BRIDGES transition program: `https://www.seattleschools.org/departments/special-education/bridges/` (200 ✓)
- Seattle Special Education PTSA: `https://seattlespecialeducationptsa.org/` (200 ✓)
- Guide to Special Education: `https://seattlespecialeducationptsa.org/resources/guide-to-special-education/` (200 ✓)

New site adds `sped@montlakepta.org` as a Montlake-specific contact (maps to Ana Dueñas, Special Education, Diversity & Inclusion, per the pta-board page). This contact was absent from the legacy page.

Legacy had a typo in its heading: "Resources for Familes" — not present on new site.

---

### 3. donate

**Legacy:** `https://www.montlakepta.org/donate` (HTTP 200, 5 403 chars extracted)  
**New:** `https://montlake-pta.github.io/website/donate/` (HTTP 200, 2 417 chars extracted)

#### Items matching across both pages
- PayPal donation URL: `https://www.paypal.com/donate/?hosted_button_id=L86AXUQZC74VN` (HEAD probe: 200) — identical in both.
- Check mailing address: Montlake PTA Annual Fund, 520 Ravenna Blvd NE, Seattle, WA 98105.
- Employer matching via Benevity or HR portals; examples: Google, Microsoft, Apple, Symetra, Alaska Airlines — both sites list the same employers.
- Volunteer-hour matching mentioned in both.
- Fundraising contact: `fundraising@montlakepta.org`.
- 501(c)(3) designation; Federal Tax ID 91-1117733.

#### Priority gaps — action required

**G-DON-1 · Equity Fund mechanism absent (REQUIRES CONTENT-OWNER CONFIRMATION)**  
Legacy text: *"donors will have the opportunity to donate to the Montlake PTA Equity Fund when donating online to the Annual Fund. The money in this fund will then be donated to schools without PTA fundraisers."*  
Legacy text: *"In this year's PTA budget, we have committed to donate 10% of our total expense budget to schools that do not have significant PTA fundraisers."*  
New site says only "equity support for schools with fewer fundraising resources" in passing. The Equity Fund as a separately named donation option and the 10 % commitment are both absent from the new donation page.  
The legacy text uses "Again this year" and "this year's PTA budget" — these are relative and require confirmation whether the Equity Fund and the 10 % commitment are still active for 2026–27 before restoring this language.

**G-DON-2 · Tax-deductibility phrase absent**  
Legacy: *"Your donation is tax-deductible to the extent allowed by law."*  
At audit, the new site stated 501(c)(3) status and Tax ID but omitted the
deductibility qualification. The repair restores the exact published legacy
qualification; it does not determine any individual donor's tax eligibility.

#### Minor omissions (lower priority)
Legacy mentions the IDEA project and STEM fair as specific funded programs. The new site uses broader categories (art, academic support, enrichment, library books, equipment, special projects). These specific programs should be confirmed still active before restoring named references.

---

### 4. budget

**Legacy:** `https://www.montlakepta.org/budget` (HTTP 200, 3 085 chars extracted)  
**New:** `https://montlake-pta.github.io/website/budget/` (HTTP 200, 1 348 chars extracted)

#### Items matching across both pages
- Staffing grant as 75–80 % of PTA budget — matches.
- PTA membership vote on budget — mentioned in both.
- `treasurer@montlakepta.org` contact — new site adds this; legacy does not list it on the budget page.

#### Priority gaps — action required

**G-BUD-1 · Family survey results link absent**  
Legacy text: *"We also collected feedback this year from our community. Read more about the results of that survey in our family survey blog post."*  
Links to `https://www.montlakepta.org/post/montlake-pta-family-survey-results` (HEAD probe returned 200; content confirmed by GET).  
Content: February 2026 survey of ~35 families about PTA budget priorities; Arts Programming topped the rankings. This is a substantive informational document.  
New site omits any reference to the survey or its results. Restore a link to the survey post. The "this year" language should be updated to "In February 2026" to avoid a relative-time ambiguity.

**G-BUD-2 · BLT decision process and timeline absent (REQUIRES CONTENT-OWNER CONFIRMATION)**  
Legacy includes a named process with months:  
- *January–February:* Families and staff surveyed; PTA Board proposes staffing grant amount; SPS provides preliminary budget numbers after enrollment closes.  
- *March:* BLT finalizes budget; union staff votes; PTA membership votes.  
- *July and onward:* PTA distributes staffing grant.  
- BLT composition: *"School leadership, Teachers and staff, Parent/PTA representatives."*  

New site says only "Budget decisions are voted on by PTA members." The BLT, the January survey, the March vote, the union approval step, and the July distribution are all absent.  
Confirm with school/board whether the timeline and BLT composition remain accurate for 2026–27 before restoring; do not republish legacy month-specific text without confirmation.

**G-BUD-3 · Community Fund 10 % definition absent**  
Legacy: *"we allocate 10% of the total Staffing Grant to the Community Fund. This fund is dedicated to supporting families who may need additional assistance, providing scholarships for afterschool programs, and contributing support to neighboring schools within our community."*  
New site references scholarships but does not name the Community Fund or state its 10 % allocation from the Staffing Grant. Confirm with treasurer whether this allocation is still in effect for 2026–27, then restore with the named fund and percentage.

---

### 5. pta-board

**Legacy:** `https://www.montlakepta.org/pta-board` (HTTP 200, 957 chars extracted)  
**New:** `https://montlake-pta.github.io/website/pta-board/` (HTTP 200, 1 627 chars extracted)

#### Status: equivalent (new site is fuller) — no restoration needed

Both pages are explicitly headed "2026–2027" (legacy) / "2026–27" (new). All 13 roles and all personal names are identical. All role email addresses match.

| Role | Names | Email | Match |
|---|---|---|---|
| Co-Presidents | Kari Frame, Cailyn Spurrell | president@ | ✓ |
| Vice President | Harold Pratt | president@ | ✓ |
| Secretary | Andrea Gimse | secretary@ | ✓ |
| Co-Treasurers | Liana Bowlin, Avery Caldwell | treasurer@ | ✓ |
| Communications | Ashley Kavanaugh, Lana Stojcic | communications@ | ✓ |
| Advocacy | Kelsey Miller | advocacy@ | ✓ |
| Fundraising | Kelsey Miller, Ewa Sack | fundraising@ | ✓ |
| Volunteers | Alicia Romano | volunteer@ | ✓ |
| Outreach | Britt Burritt | outreach@ | ✓ |
| Events | Megan McGiffin | events@ | ✓ |
| Special Education, Diversity & Inclusion | Ana Dueñas | sped@ | ✓ |
| BLT Representatives | Tom Burritt, Ben Vaught | blt@ | ✓ |
| After-School Enrichment | Diana Bitenas | enrichment@ | ✓ |

New site adds a "Join the work" section with a recruitment invitation. No legacy content was dropped.

---

## Prioritised action list

| ID | Page | Action | Confirmation needed? |
|---|---|---|---|
| G-BUD-1 | budget | Restore February 2026 family survey link with explicit date (not "this year") | Restored in CMS and fallback |
| G-DON-2 | donate | Restore "Your donation is tax-deductible to the extent allowed by law" | Restored in CMS and fallback |
| G-BUD-3 | budget | Restore Community Fund name and 10 % allocation from Staffing Grant | **Yes — confirm 2026–27 allocation with treasurer** |
| G-BUD-2 | budget | Restore BLT composition and decision timeline | **Yes — confirm accuracy with school/board** |
| G-WNF-2 | welcome-new-families | Restore named SPS office contact for volunteer questions | **Yes — confirm Missy Pody is still current contact** |
| G-DON-1 | donate | Restore Equity Fund as a named donation option with 10 % commitment | **Yes — confirm Equity Fund is still active for 2026–27** |
| G-WNF-1 | welcome-new-families | Restore School Choice deadline dates | **Yes — confirm January 31 / March 31 still apply for 2026–27** |
| G-WNF-3 | welcome-new-families | Evaluate Summer Buddy Program for next year | **Yes — confirm program recurs; update form link annually** |

---

## No-change surfaces

The following areas are **in parity or improved** in the new site; no restoration is needed:

- **special-education** — new page is more complete; all legacy links verified; new local contact added.
- **pta-board** — roster is identical for 2026–27; new page adds useful recruitment section.
- **donate PayPal link** — same URL on both sites; HEAD probe returned 200.
- **welcome-new-families bell hours** — identical across both pages; matches legacy but not independently verified against current SPS records.
- **welcome-new-families K dates** — September 8 (K) and September 2 (grades 1–5) match legacy; not independently verified against current SPS calendar.
- **welcome-new-families after-school provider list** — all four providers with addresses and phones match.
- **welcome-new-families MySchoolBucks label** — legacy label "PayPAMS" does not match the destination URL (`myschoolbucks.com`); new site label "MySchoolBucks" matches the destination. Do not revert.
- **welcome-new-families The Source link** — new site uses only the URL that returned 200 on HEAD probe; legacy's duplicate `ps.seattleschools.org` returned 404 on HEAD probe and was correctly excluded.

---

## Criteria for future page migrations

Use these as a checklist before marking any page migration complete:

1. **Full DOM extraction required.** Simplified fetch tools (e.g., `web_fetch`) may return only one subsection of a Wix page. Use `htmlparser2` or equivalent to parse the full document.
2. **Skip scripts/styles by element name**, not by node type alone; Wix injects inline scripts that may appear as tag nodes.
3. **Compare link destinations, not just link text.** Verify that the destination URL is unchanged, not just the anchor label (e.g., "PayPAMS" → "MySchoolBucks" revealed by comparing href values).
4. **Probe every external link.** Use HTTP HEAD to check reachability; follow with GET when content inspection is needed. A HEAD 404 from a formerly active URL warrants investigation but is not proof of permanent breakage.
5. **Resolve relative-time language.** Words like "this year," "again this year," and "this year's budget" must be updated to explicit year references before migration.
6. **Dates and deadlines require explicit content-owner confirmation.** Do not migrate school-choice deadlines, enrollment dates, or fee amounts without confirmation for the current school year.
7. **Named individuals require role confirmation.** Named staff contacts (e.g., school office assistant) may change annually; confirm before restoring.
8. **Document informational PDFs and linked documents separately.** Blog posts, survey results, and linked PDFs carry substantive data; verify each by GET and note in the parity record.
9. **Board roster requires year heading inspection.** Do not assume a flattened name list belongs to the current year; inspect headings for explicit school-year labels.
10. **CMS-rendered content must be checked post-sync.** `src/site.mjs` fallback and the deployed page may differ once a CMS sync runs; re-verify the live deployed page after any authenticated sync.
11. **Equity and Community Fund policies change annually.** The 10 % commitment to other schools and the Equity Fund mechanism are budget decisions, not standing policy. Confirm each year before publishing.

---

## Appendix: link status at audit date (2026-09-09)

| URL | Status | Used by |
|---|---|---|
| `https://www.paypal.com/donate/?hosted_button_id=L86AXUQZC74VN` | 200 ✓ | donate, budget (donate CTA) |
| `https://www.montlakepta.org/post/montlake-pta-family-survey-results` | 200 ✓ | budget (G-BUD-1; restored using the new site's matching post route) |
| `https://forms.gle/nQ3KQHKceyHmEdTG8` | 200 ✓ (→ Google Forms) | welcome-new-families (legacy only — Summer Buddy Program) |
| `https://forms.cloud.microsoft/r/Y9vi39Kxbq` | HEAD probe: 405 (live state unconfirmed) | welcome-new-families (K Transition registration) |
| `https://seattlespecialeducationptsa.org/resources/guide-to-special-education/` | 200 ✓ | special-education |
| `https://www.seattleschools.org/departments/early-learning/child-find/` | 200 ✓ | special-education |
| `https://launchlearning.org/enrollment/` | 200 ✓ | welcome-new-families |
| `https://benevity.com/` | 200 ✓ | donate |
| `https://www.myschoolbucks.com/ver2/getmain?requestAction=home` | 200 ✓ | welcome-new-families |
| `https://www.seattleschools.org/student-portal/technology-supports-for-families/source/` | 200 ✓ | welcome-new-families (The Source — correct link) |
| `https://ps.seattleschools.org/` | HEAD probe: 404 | welcome-new-families (legacy "The Source" duplicate — returned 404 on HEAD; excluded from new site) |

## Remaining-page audit

### Remediation status — September 10, 2026

The code repairs are implemented against an authenticated public snapshot.
The September 9 findings below are retained as the before-repair record, not
the current status of the repaired pages.

| Finding | Disposition |
|---|---|
| R-RICH-1 | Supported public links, formatting, lists and structured schedule tables restored. Rich headings are normalized under the page heading. |
| R-MEDIA-1 | Inline media restored, including ordering instructions, survey charts and additional story photographs; source captions/alt text retained. |
| R-ALIAS-1 | All 21 working event aliases map explicitly to their reviewed event identities. The two already-broken source aliases remain unknown paths. |
| R-HOME-1 | Reviewed Welcome Back Party and Sounders title variants are reconciled before the three-event limit, with Wix details preferred. |
| R-HOME-2 | School-specific introduction, OSPI report card and the original friends/alumni signup restored. The external signup's bot challenge remains an audit limitation, not evidence that the form is broken. |
| R-ADV-1 | Full published principles, the 5–10-year planning position and family-notification commitment restored in Wix `WebsitePages` and fallback. |
| R-FALL-1 | Goal, staffing/program details, per-student estimate and Equity Fund context restored as an explicitly dated Fall 2025 campaign. New gifts use current donation guidance. |
| R-AUCT-1 | The 2025–2026 spending chart and a readable list of all figures restored in Wix and fallback; current-year allocations still require the treasurer. |
| R-STOCK-1 | Shop cards and product details display known, unknown and partially unavailable stock states without guessing. |
| R-TREE-1 | The empty product description no longer promises future information; its out-of-stock state is explicit. |
| R-CAT-1 | Public category membership is queried and rendered; the 2026 Art Walk lists its nine products. Eight previously published category addresses retain useful shop fallbacks without exporting hidden collection records. |
| R-NEWS-1 | Connected-but-empty and unavailable archive states are distinct; the empty-page introduction no longer promises an available edition. Constant Contact still needs an editor to archive campaigns: [#3](https://github.com/montlake-pta/website/issues/3). |
| R-SNAPSHOT-1 | Full normalized public snapshot refreshed: 19 posts, 25 events, 10 products, one currently public collection, 13 board records and 18 CMS pages. All 83 previously published canonical routes remain available. |

The public snapshot retains 23 inline post images and four inline event images.
It preserves 167 body anchors. Of the audit's 170 legacy anchor occurrences,
two were Wix-generated numeric ranking hashtags (`#1` and `#2`), not authored
rich-content destinations; those ranking labels remain text. The other is a
conferencing link intentionally excluded from public repository content.
Approved file/recording links retain their original access controls.
Recognized conferencing and shared-access credentials are intentionally
excluded rather than copied from historical posts into the public snapshot.

The table allowlist change is limited to non-interactive structural tags, with
no new table attributes or iframe hosts. A narrow security review identified
cross-cell credential continuation; whole credential rows and their plain-text
counterparts are now redacted, with explicit regression coverage.

Snapshots pass a public-field/HTML export gate before artifact upload. The
manual export never writes Wix or deploys the site. Existing owner actions in
[#1](https://github.com/montlake-pta/website/issues/1) and
[#2](https://github.com/montlake-pta/website/issues/2), including current policy
confirmation and the independent legacy Editor handoff, remain owner decisions;
historical repairs do not imply current-year approval.

### September 9 audit baseline

Expanded audit date: **2026-09-09 PDT**. Source baseline: `4f28d0b`.
This is a content and task-completion audit, not a comprehensive accessibility
or performance score. The original audit did not change visitor-facing source
or Wix records; implementation is recorded separately above.

**Main result:** live editorial prose is preserved, but inline links and media
are not. The other high-priority findings are missing legacy event aliases and
the homepage's duplicated Welcome Back Party. There are 13 grouped findings
(four High, nine Medium), with full route coverage below.

The scope excludes the six pages already covered above: Enrichment, New
Families, Special Education, Donate, Budget, and Board. The live new sitemap
adds **77 remaining pages**: 14 main pages, 19 posts, 25 event details, 10
products, and 9 categories. The legacy sitemaps also expose 23 `/events-1/`
aliases that need a separate inbound-link comparison. Member profiles and
authenticated account/payment transactions are outside this public-content
migration audit.

Evidence comes from full public DOM text, headings, links, images and embedded
content, not word counts alone. Dynamic membership, calendar and program
states were also inspected in an isolated browser. External action probes use
GET; a bot challenge or login wall is recorded as a limitation, not a broken
destination. An empty or partial repository snapshot is **not** evidence that
the corresponding live CMS record is missing.
Key action destinations were inspected, but not every historical external
anchor was independently exercised. No checkout, form submission, authenticated
recording, or private member content was accessed.

### Community-page findings

| ID | Priority | Page | Finding and effect | Recommended source-layer correction |
|---|---|---|---|---|
| R-HOME-1 | High | Home | The September 25 Welcome Back Party occupies two of the three Coming up slots, displacing the September 26 Sounders event. | Reconcile the Google/Wix event identity before limiting the list; retain the richer Wix detail page and cancellation behavior. |
| R-HOME-2 | Medium | Home | The Friends/Alumni signup and OSPI school report-card link are gone. The distinct school introduction also lost its garden, art and Extended Resource program context. | Restore a concise school/resources section and a confirmed alumni signup destination; preserve the established school context rather than generic substitute copy. |
| R-ADV-1 | Medium | Advocacy | All seven principles remain as summaries, but the explicit 5–10-year planning position and the commitment to notify families about school-consolidation proposals are omitted. | Preserve the published principles and ongoing communication commitment in `WebsitePages`; distinguish dated legislative/consolidation background from current policy. |
| R-NEWS-1 | Medium | Newsletter | The configured archive returns zero editions, but the page says the archive is not connected. There is still no latest edition or archive to read. | Distinguish connected-but-empty from unconfigured; the editor must add editions to Constant Contact's public archive. Do not substitute private email/preference links. |

**R-HOME-1 evidence.** The rendered homepage shows both "PTA Welcome Back Party"
and "Montlake Elementary Welcome Back Party!" on September 25, 2026,
5:30–7:30 PM, at Montlake. One links to the calendar, the other to the Wix-backed
event detail route. The legacy homepage lists the Welcome Back Party and the
September 26 Sounders event separately. `scripts/render-wix-content.mjs:126–153`
deduplicates only equal normalized titles and local dates; the different
prefixes do not match. `scripts/render-wix-content.mjs:92–93` then limits the
result to three. Prefer an explicit shared identity or reviewed alias mapping,
not a broad fuzzy match that could merge genuinely different events.

**R-HOME-2 evidence.** The [legacy homepage](https://www.montlakepta.org/) links
"Join Friends/Alumni List" to
`https://lp.constantcontactpages.com/su/5wEdUw1/MontlakeFriends` and "More Data" to
the OSPI report card. Neither destination is in the new homepage, including its
header/footer. The OSPI link redirects successfully to the
[Montlake school report card](https://reportcard.ospi.k12.wa.us/ReportCard/ViewSchoolOrDistrict/101083)
and identifies the correct school. The alumni form triggers a Cloudflare
challenge in both HTTP and browser probes, so its present signup usability is
unverified. Do not label it broken or replace it with the different family
newsletter list. The legacy school introduction names the garden, art and
Extended Resource Special Education program; `scripts/build.mjs:134–163`
substitutes general PTA mission/funding copy.

**R-ADV-1 evidence.** The [legacy Advocacy page](https://www.montlakepta.org/advocacy)
states, "We believe everyone would benefit from longer term planning spanning
5 to 10 years into the future." It also commits to alert families by email and
newsletter about new specific closure/consolidation proposals. Neither
commitment appears on the new page; the summarized principles are in
`src/site.mjs:211–220`. The six distinct external learning/action destinations
and the advocacy contact are retained. Do not present the omitted 2024/25
closure discussion as a current update. WSPTA's live priorities page still
labels its five priorities **2025–2026**; any current-year local summary needs
an explicit date and owner review.

**R-NEWS-1 evidence.** The public endpoint
`https://campaignlp.constantcontact.com/v1/archive/a07eh3xf9of0/activities?limit=100`
returns HTTP 200 and `[]`. `src/newsletter.config.json:2` contains that archive
ID. `scripts/render-newsletters.mjs:42–48` uses "not connected yet" whenever
there is no edition, regardless of connection state. The old `/newsletter`
redirects to a Constant Contact signup form rather than an edition archive.
Both the old redirected form and the new signup destination encounter bot
verification during this audit; the new destination matches the legacy
homepage's family-newsletter signup. No form submission was attempted.

### Community-page coverage

| Route | Result |
|---|---|
| `/` | R-HOME-1 and R-HOME-2; current posts and event detail links otherwise remain available. |
| `/advocacy/` | R-ADV-1; principles/topics, contact and resource destinations largely retained, but not full policy wording. |
| `/newsletter/` | R-NEWS-1; signup retained, editions absent at the public source. |
| `/calendar/` | Same public calendar ID, Los Angeles timezone and ICS subscription URL. Legacy wrapper iframe confirmed in browser; ICS returns a valid calendar. No content loss found. |
| `/join/` | Annual renewal, voting, state/national affiliation, $20 single/$35 double rates, confidential free membership and contact retained. Givebacks renders both matching membership products. Checkout was not exercised. |
| `/donation-thank-you-page/` | Replaces the legacy direct-visit placeholders ("Donor Name", "$0", "#1000") with a generic thank-you. No actual receipt data was demonstrated by the public legacy page; do not restore fictitious transaction details. |
| `/challenges/` | Legacy widget renders "No available programs", including after JavaScript. New informational program links add useful navigation; no populated legacy program was found to migrate. |

### Fundraising and commerce findings

| ID | Priority | Page(s) | Finding and effect | Recommended correction |
|---|---|---|---|---|
| R-FALL-1 | Medium | Fall Fundraiser | The generic replacement drops the dated 2025 goal, detailed funded positions/programs, per-student support figure and named Equity Fund option. | Preserve an explicitly dated campaign record or obtain current-year figures before refreshing the live CMS page. Do not turn the old figures into current claims. |
| R-AUCT-1 | Medium | Spring Auction | The 2025–2026 budget chart is missing; its figures are not reproduced by the broad funding prose. | Restore an accessible, explicitly dated chart/table or link to the approved budget. Resolve the historical chart's 70% staffing share versus the site's general 75–80% statement with the treasurer. |
| R-STOCK-1 | Medium | Shop and all 10 products | Legacy product pages show Out of Stock, while new cards/details show prices without that status. A Wix availability link exists, but families must leave the new page to discover the items cannot currently be bought. | Render the normalized stock status on cards and details, retaining the external source/checkout link. |
| R-TREE-1 | Medium | Nordmann Fir product | An empty description becomes "More information will be posted soon" for an old, out-of-stock seasonal item. | Use a truthful empty-description/seasonal state; do not promise future content without an authoring commitment. |
| R-CAT-1 | Medium | 2026 Art Walk category | The legacy category lists nine raffle products. The replacement is a category image and generic shop link, not the promised collection listing. | Preserve category membership and list its products, including stock state; show an explicit empty state for empty collections. |

**R-FALL-1 evidence.** The
[legacy 2025 campaign](https://www.montlakepta.org/fall-fundraiser-2025)
states a $125,000 goal and approximately $1,500 annual PTA support per student.
Its funded-position breakdown includes 0.50 Art (PCP), 0.4 Academic Intervention
and 0.2 Office Assistant Hourly. It names the Equity Fund and example recipients
Lowell Elementary and the SE Seattle Schools Fundraising Alliance. The new
page and `src/site.mjs:358–376` retain giving methods and the fundraising contact
but not these details. The October–November 2025 campaign window and November
2025 celebration are expired; omitting an active call to attend is appropriate.
The missing historical information is not evidence that the live CMS record
does not exist. No authenticated CMS inventory was performed for this audit.

**R-AUCT-1 evidence.** The omitted
[chart image](https://static.wixstatic.com/media/0834d6_dc381b37e9ab455daed371f54dd0c561~mv2.png)
was downloaded and visually read; its content is not unknowable merely because
the legacy alt text is poor. Its title is "Where Your PTA Dollars Go
(2025–2026)". It labels Staffing Grant $197,202 (70%), Community Needs $29,000
(10%), Fundraising Costs $22,625 (8%), Programs & Outreach $12,075 (4%),
Supplies $10,900 (4%), PTA Admin $8,785 (3%), and Enrichment $1,900 (1%).
`src/site.mjs:349–354` retains only broad categories and the dated auction goal.
These figures belong to the labeled historical year, not an inferred 2026–27
budget. The auction catalog is closed; the new seasonal note and Donate
alternative are appropriate.

**R-STOCK-1 / R-TREE-1 evidence.** All ten legacy product pages display Out of
Stock during the audit. The new site preserves their names, descriptions where
present, prices and links to the corresponding Wix product, but omits the stock
warning. `scripts/sync-wix.mjs:118` normalizes availability;
`scripts/render-wix-content.mjs:273–285,356–365` does not display it. The Nordmann
Fir remains $85; the nine artwork tickets remain $25. The generic empty-body
promise comes from `scripts/render-wix-content.mjs:374–378`, not evidence of an
upcoming sale.

**R-CAT-1 evidence.** The
[legacy 2026 Art Walk category](https://www.montlakepta.org/category/2026-art-walk)
contains nine artwork products; the new counterpart contains only its image and
"Products in this seasonal collection appear in the PTA shop."
`scripts/render-wix-content.mjs:289–299` does not receive or render category
products. All nine items remain reachable through the all-products shop, so
this is a lost browsing capability, not lost product routes. Do not copy the
legacy category's apparently stale "2025 Art Walk Raffle" heading as a verified
year for the 2026 collection.

### Fundraising and commerce coverage

All 24 new routes below return HTTP 200. "No live counterpart" means a direct
legacy GET returned the Wix not-found page, not simply that its sitemap omitted
the URL.

| Route | Result |
|---|---|
| `/spring-auction/` | R-AUCT-1; goal, catalog and donation fallback retained; expired active-auction wording removed. |
| `/fall-fundraiser-2025/` | R-FALL-1; giving methods and contact retained. |
| `/appreciation/` | Volunteer URL and accolade PDF retained. Volunteer destination requires login; access beyond login is unverified. Old 2025 campaign/flyer is not a current schedule. |
| `/evergreens/` | Contact and volunteer URL retained. Old 2025 ordering/pickup dates are not current guidance; SignUpGenius's specific signup state is unverified. Legacy category/evergreens link itself returns not found. |
| `/shop/` | Added product hub, no live legacy /shop counterpart; R-STOCK-1. |
| `/product-page/nordmann-fir-tree-5-6/` | Name/price/source link retained; R-STOCK-1 and R-TREE-1. |
| `/product-page/mr-azer-artwork-raffle-ticket/` | Description/price/source link retained; R-STOCK-1. |
| `/product-page/mr-marshall-s-class-artwork-raffle-ticket/` | Description/price/source link retained; R-STOCK-1. |
| `/product-page/mr-b-s-class-artwork-raffle-ticket/` | Description/price/source link retained; R-STOCK-1. |
| `/product-page/teacher-margaret-mr-strasner-s-class-artwork-raffle-ticket/` | Description/price/source link retained; R-STOCK-1. |
| `/product-page/mrs-orse-s-class-artwork-raffle-ticket/` | Description/price/source link retained; R-STOCK-1. |
| `/product-page/ms-stryker-s-class-artwork-raffle-ticket/` | Description/price/source link retained; R-STOCK-1. |
| `/product-page/ms-stump-s-class-artwork-raffle-ticket/` | Description/price/source link retained; R-STOCK-1. |
| `/product-page/ms-martison-s-class-artwork-raffle-ticket/` | Description/price/source link retained; R-STOCK-1. |
| `/product-page/ms-podney-s-class-artwork-raffle-ticket/` | Description/price/source link retained; R-STOCK-1. |
| `/category/2026-art-walk/` | R-CAT-1; category image retained, product list absent. |
| `/category/all-products/` | Added route; no live legacy counterpart. |
| `/category/2025-art-walk-spring-concert/` | Added route; no live legacy counterpart. |
| `/category/24-25-welcome-pizza-party-raffle/` | Added route; no live legacy counterpart. |
| `/category/25-26-welcome-party-raffle/` | Added route; no live legacy counterpart. |
| `/category/evergreens/` | Added route; no live legacy counterpart. |
| `/category/holiday-night-market/` | Added route; no live legacy counterpart. |
| `/category/islandwood/` | Added route; no live legacy counterpart. |
| `/category/spring-auction-fundraiser/` | Added route; no live legacy counterpart. |

Seasonal owner follow-up: confirm current campaign dates, volunteer destinations,
fund allocations and pickup arrangements before activating the next campaign.
The existing preservation of closed-auction and seasonal caveats is useful;
expired details should be archived or explicitly dated, not silently promoted
to the new school year.

### Editorial and inbound-route findings

**The deployed post/event prose is not truncated.** All 19 post bodies match
their legacy counterparts after whitespace normalization. All 23 events with
an About section also match; the other two use their complete legacy short
descriptions. For example, the current school checklist has 4,366 characters
and all seven steps, the new-family post 2,290 characters, and Parents Night
Out 1,237 characters including its fee and activities. Comparing only the old
bootstrap snapshot would incorrectly suggest these live pages were excerpts.

The actual loss is rich-content functionality: links, inline media and
structure. Plain text equality is not full content parity.

| ID | Priority | Scope | Finding and effect | Recommended correction |
|---|---|---|---|---|
| R-RICH-1 | High | 18 posts and 20 event bodies | 170 legacy inline anchor occurrences become non-clickable text. Forms, enrollment, merchandise, volunteer and recording actions lose their destinations. Lists also lose their semantic structure. | Normalize and sanitize the original rich-content nodes, retaining supported links and structural tags instead of converting the body to plain text. |
| R-MEDIA-1 | High | Rich-content posts/events | Body media is not rendered. Confirmed losses include the Lands' End ordering instructions and February survey chart; a retained hero image does not replace them. | Preserve supported inline images/media and meaningful accessible descriptions; retain private recordings behind their existing access controls. |
| R-ALIAS-1 | High | 23 legacy `/events-1/` paths | All return 404 on the new site. Twenty-one currently serve correctly named events on Wix; the other two are already broken at the legacy source. | Preserve working aliases with explicit mappings to their canonical detail routes. Exercise encoded punctuation and ambiguous event names; do not guess targets by stripping characters. |
| R-SNAPSHOT-1 | Medium | Offline editorial snapshot | The bootstrap snapshot contains only 18 abbreviated posts and 23 summary-only events, while production has 19 full-text posts and 25 full-text events. Local/fallback output is not representative of production. | Refresh a reviewed public-safe snapshot after fixing rich-content normalization. Keep conferencing credentials and other nonpublic data out of repository artifacts. |

**R-RICH-1 evidence.** Every new `.article-body` has zero `<a>` elements.
Eighteen legacy post bodies contain 131 inline anchors; twenty event About
sections contain 39. These are anchor occurrences, not 170 unique destinations
or independently verified broken external services. Concrete examples:

- [Current school checklist](https://montlake-pta.github.io/website/post/start-of-school-to-do-list-1/):
  all seven steps survive, but its 25 body anchors do not. The source's forms,
  school-account and participation links cannot be followed from the new body.
- [School gear](https://montlake-pta.github.io/website/post/shop-montlake-elementary-gear-for-school-spirit/):
  "Order Montlake Elementary gear through the Lands' End school store" loses
  the link to the school-specific Lands' End store.
- [Launch enrollment](https://montlake-pta.github.io/website/post/launch-fall-26-27-school-year-registration-opens-april-22nd-2026/):
  the enrollment URL is visible, but no longer clickable.
- [February meeting recording](https://montlake-pta.github.io/website/post/montlake-pta-february-general-meeting-recording-1/):
  the video filename survives but its SharePoint link does not. This audit
  does not reproduce access parameters or claim the recording is publicly
  accessible without authorization.
- [Upcoming Sounders event](https://montlake-pta.github.io/website/event-details/join-the-montlake-pta-at-the-seattle-sounders/):
  the source's "Know Before You Go" and "Stadium Guide" links are lost. The
  ticket URL is already plain text on the legacy page, so its lack of an
  inline anchor is **not** a newly introduced loss. The new page's
  "Registration and event details" link still reaches Wix.

`scripts/sync-wix.mjs:25–27` requests Blog `RICH_CONTENT`, but
`scripts/sync-wix.mjs:79–89` retains only plain `contentText` and a hero image.
For Events, `scripts/sync-wix.mjs:139–151` extracts text leaves, not link/media
attributes. `scripts/render-wix-content.mjs:237–268,374–378` escapes the
result into paragraphs. Nine legacy posts and seven event bodies also contain
semantic lists; the new bodies contain none. Preserve the existing
`sanitizeCmsHtml()` allowlist rather than injecting raw remote HTML or broadly
allowing arbitrary embeds. A generic auto-linker cannot recover URLs whose
anchor labels contain no address.

**R-MEDIA-1 evidence.** The legacy gear post's
[ordering graphic](https://static.wixstatic.com/media/0834d6_8cf5fb08d7ff4caeb72470035959bcbf~mv2.png)
was visually read: it contains online/phone ordering steps and school number
900198474. The new page has a different hero image while still saying "Details
on how to order below". The legacy survey post's
[February 2026 chart](https://static.wixstatic.com/media/0834d6_8b54317b34e84f069c85cbf9435e0f2c~mv2.png)
shows the ranked funding priorities; the new page retains its prose and hero,
not that chart. The Nobel Prize story has seven legacy body photographs but
only its first image as a hero on the new page. Across the inventory, 15 posts
and four event bodies contain legacy images; some first images survive as
heroes, so that count must not be treated as 19 completely image-free pages.

**R-ALIAS-1 evidence.** All 23 literal paths in the table below were fetched on
both hosts. For the 21 legacy successes, page titles and main headings identify
the requested event rather than a generic homepage. Every new counterpart
returns HTTP 404 with "Page not found". Canonical `/event-details/` routes
remain available. The original custom-domain URLs still work on the legacy
site today; this is a compatibility gap in the replacement and a domain-cutover
risk, not a claim that Wix has already stopped serving them.

**R-SNAPSHOT-1 evidence.** `src/data/wix-content.json` identifies itself as
`public-bootstrap`. Its 18 post `contentText` values equal their excerpts
(at most 500 characters), and its 23 event descriptions equal their summaries.
That is not a limit of the deployed Wix `CONTENT_TEXT` field. The new gear
post, Welcome Back Party and Sounders event appear in production despite their
absence from that old offline sample. Do not "fix" nonexistent live truncation
or overwrite full live CMS bodies with the abbreviated fallback.

### Editorial route coverage

All 44 canonical detail URLs return HTTP 200 on both sites. Text comparison
ignores whitespace only; it does not certify media or interaction parity.
Numbers below count legacy body anchors lost by the new body, including
repeated links. The standalone Wix event CTA is retained separately.

The `/blog/` index links all 19 posts. `/event-list/` exposes the two upcoming
events and twelve recent-event detail links; it is a recent list, not an
exhaustive archive of all 25 events. Old canceled records are visibly labeled
as canceled. Their coexistence with active records does not justify deleting
source records without an owner decision.

| Post route suffix under `/post/` | Live body characters | Lost inline anchors | Text disposition |
|---|---:|---:|---|
| `shop-montlake-elementary-gear-for-school-spirit` | 300 | 1 | Preserved; ordering graphic missing |
| `start-of-school-to-do-list-1` | 4,366 | 25 | Preserved |
| `montlake-elementary-school-donation-options-and-matching-information` | 5,670 | 11 | Preserved |
| `launch-fall-26-27-school-year-registration-opens-april-22nd-2026` | 98 | 1 | Preserved |
| `montlake-pta-family-survey-results` | 1,036 | 2 | Preserved; chart missing |
| `montlake-pta-february-general-meeting-recording-1` | 337 | 1 | Preserved; recording link missing |
| `key-events-for-5th-grade-islandwood-parent-night-out-walk-a-thon-bake-sale-details` | 4,165 | 7 | Preserved |
| `attention-incoming-montlake-elementary-kindergarten-families-enroll-your-student-by-1-31` | 553 | 2 | Preserved |
| `congratulations-to-montlake-office-assistant-missy-pody-winner-of-an-sps-all-star-award` | 1,320 | 1 | Preserved |
| `it-s-the-most-wonderful-time-of-the-year-time-for-our-holiday-evergreens-sale` | 401 | 2 | Preserved |
| `looking-for-an-elementary-school-for-2026-you-re-invited-to-montlake-elementary-meet-greets` | 1,101 | 2 | Preserved |
| `montlake-pta-board-meetings-and-general-meeting-dates` | 1,291 | 0 | Schedule text preserved; list structure flattened |
| `after-school-enrichment-registration-open-sept-10-at-noon-sept-17-at-9pm-classes-begin-october-6` | 3,220 | 5 | Preserved as historical content |
| `welcome-new-and-prospective-families-26` | 2,290 | 12 | Preserved |
| `from-montlake-to-the-nobel-prize` | 2,984 | 5 | Preserved; additional photographs missing |
| `after-school-enrichment-fall-session-2024-information` | 10,811 | 16 | Preserved as historical content |
| `fall-session-activity-bus-information` | 5,058 | 10 | Preserved as historical content |
| `after-school-enrichment-and-activity-bus-information` | 5,494 | 5 | Preserved as historical content |
| `start-of-school-to-do-list` | 5,848 | 23 | Preserved as historical content |

| Event route suffix under `/event-details/` | Live body characters | Lost inline anchors | Text disposition |
|---|---:|---:|---|
| `join-the-montlake-pta-at-the-seattle-sounders` | 377 | 4 | About text preserved |
| `montlake-elementary-welcome-back-party` | 99 | 0 | About text preserved; RSVP via Wix |
| `5th-grade-promotion-2` | 477 | 1 | About text preserved; canceled state retained |
| `5th-grade-promotion` | 439 | 1 | About text preserved |
| `montlake-kindergarten-jumpstart` | 842 | 1 | About text preserved |
| `art-walk-concert-2026` | 828 | 3 | About text preserved |
| `montlake-elementary-spring-auction` | 1,572 | 4 | About text preserved |
| `parents-night-out` | 1,237 | 2 | Full fee/activity text preserved, not an empty placeholder |
| `2026-spring-auction-party-blooming-bright` | 87 | 0 | Complete legacy short description; no separate About section |
| `current-student-families-coffee-chat-with-principal-pearson-postponed-to-feb-26` | 293 | 0 | Complete legacy short description; no separate About section |
| `montlake-elementary-meet-and-greet-on-january-28-at-8-00am` | 1,083 | 2 | About text preserved |
| `register-for-the-2026-2027-school-year-by-january-31` | 453 | 2 | About text preserved; source uses an enrollment URL as location |
| `register-for-the-2026-2027-school-year-by-1-31` | 453 | 2 | About text preserved; canceled state retained |
| `mioposto-dine-out-february-3rd-2026` | 366 | 0 | About text preserved |
| `ai-social-media-a-parents-only-forum-with-uw-professor-katie-davis` | 695 | 1 | About text preserved |
| `join-us-for-a-student-panel-on-meany-middle-school` | 948 | 2 | About text preserved; meeting access details excluded from this report |
| `montlakes-first-creative-convergence-a-literary-celebration` | 1,615 | 3 | About text preserved |
| `montlake-elementary-holiday-night-market-and-winter-concert` | 492 | 1 | Full schedule text preserved |
| `join-us-for-uw-womens-basketball-vs-michigan-on-january-1` | 417 | 1 | About text preserved |
| `montlake-elementary-meet-and-greet-on-january-13-at-8-00am` | 1,076 | 2 | About text preserved |
| `evergreens-sale-pick-up` | 38 | 1 | Body URL retained as text, not as a link |
| `fall-fundraiser-event-flatstick-pub` | 752 | 0 | Full FAQ text preserved |
| `montlake-elementary-meet-greet-2025-11-05-13-30` | 1,161 | 2 | About text preserved |
| `montlake-elementary-meet-greet-2025-10-30-08-00` | 1,161 | 2 | About text preserved |
| `annual-fund-celebration` | 822 | 2 | About text preserved |

### Literal legacy event-alias coverage

Each suffix below is appended to `/events-1/`. Percent-encoded characters are
part of the tested URL representation. The two legacy failures should be
investigated as source issues, not counted as newly broken migration paths.

| Literal suffix | Legacy HTTP | New HTTP |
|---|---:|---:|
| `join-the-montlake-pta-at-the-seattle-sounders!` | 200 | 404 |
| `montlake-elementary-welcome-back-party!` | 200 | 404 |
| `5th-grade-promotion!` | 200 | 404 |
| `montlake-kindergarten-jumpstart!` | 200 | 404 |
| `art-walk-%26-concert-2026` | 200 | 404 |
| `montlake-elementary-spring-auction!` | 200 | 404 |
| `parent's-night-out!` | 200 | 404 |
| `2026-spring-auction-party-%E2%80%93-blooming-bright` | 200 | 404 |
| `current-student-families%3A-coffee-chat-with-principal-pearson-(postponed-to-feb-26)` | 200 | 404 |
| `montlake-elementary-meet-and-greet-on-january-28-at-8%3A00am` | 200 | 404 |
| `register-for-the-2026-2027-school-year-by-january-31!` | 200 | 404 |
| `register-for-the-2026-2027-school-year-by-1%2F31!` | 200 | 404 |
| `mioposto-dine-out---february-3rd%2C-2026` | 404 | 404 |
| `ai-%26-social-media---a-parents-only-forum-with-uw-professor%2C-katie-davis` | 404 | 404 |
| `join-us-for-a-student-panel-on-meany-middle-school!` | 200 | 404 |
| `montlake's-first%C2%A0creative-convergence%3A%C2%A0-a-literary-celebration!%C2%A0%C2%A0` | 200 | 404 |
| `montlake-elementary-holiday-night-market-and-winter-concert` | 200 | 404 |
| `join-us-for-uw-women's-basketball-vs-michigan-on-january-1!` | 200 | 404 |
| `montlake-elementary-meet-and-greet-on-january-13-at-8%3A00am` | 200 | 404 |
| `evergreens-sale-pick-up` | 200 | 404 |
| `fall-fundraiser-event-%40-flatstick-pub-` | 200 | 404 |
| `montlake-elementary-meet-%26-greet` | 200 | 404 |
| `annual-fund-celebration` | 200 | 404 |

### Prioritized disposition

The expanded audit records **13 grouped findings: four High and nine Medium**.
Resolve rich-content links/media and explicit legacy aliases first, then the
homepage duplicate. Address product availability, category browsing and the
newsletter empty state in the next implementation pass. Refresh the safe
offline snapshot alongside the normalization work, not before it.

Published policy wording, historical fund figures and future seasonal details
need a content-owner decision rather than invented replacements. Preserve
historical years, source access restrictions, useful seasonal caveats, working
membership/calendar behavior and existing RSVP/checkout handoffs.

## Frontend cutover follow-up — September 10, 2026

**The legacy frontend is not yet safe to retire.** Content dependencies have
been migrated, but activation of the visitor SDK remains blocked by
[#4](https://github.com/montlake-pta/website/issues/4). The existing Actions key
receives HTTP 403 from Headless OAuth-app setup and the documented account
context lookup. A connectivity retry produced the same authorization failure.

| Area | Disposition |
|---|---|
| Ordinary legacy links and visible URLs | Rewritten using the actual new route inventory. Unknown targets fail rather than remain hidden dependencies. |
| Enrichment documents | Both PDFs are local assets, with verified compatibility copies at their original `_files/ugd/` paths. |
| Fifth Grade Promotion | Historical event information is in a new Wix CMS record and fallback. The generic old contact form is replaced by the existing PTA events email, not a fabricated submission. |
| Unavailable Islandwood items | Both old product addresses now explain their unavailable state and provide background/contact links. Restricted gifts are not silently redirected into a general fund. |
| Closed events and sold-out products | Unnecessary legacy transaction handoffs removed. |
| Sounders tickets | Link directly to the FEVO destination in the Wix-authored summary. `registration.type = NONE` does not mean tickets are unnecessary. |
| Active Welcome Back RSVP | Working legacy handoff deliberately retained and marked until the Headless visitor client is configured and the replacement is verified. |
| Visitor SDK | Product selection, cart, RSVP v2, ticket checkout and neutral confirmation handling are implemented behind a disabled activation flag. No browser API key or deprecated RSVP v1 fallback. |
| Final-domain support | Canonicals, sitemap, callbacks and compatibility paths use `SITE_URL`. Changing the domain or activating transactions invokes the strict cutover gate. DNS and Wix publication settings were not changed. |

The actual upcoming RSVP form was read with the authorized server-side key.
Its NAME inputs are `firstName` and `lastName`; INPUT `email` is mandatory;
GUEST_CONTROL contains mandatory numeric `additionalGuests` and optional array
`guestNames`. This validates the request mapping, **not** anonymous creation
permissions. No real RSVP, ticket reservation, order or payment was submitted.

The transaction UI was exercised using isolated, no-network fixtures. Live
visitor authorization and hosted checkout behavior remain unverified without
a public Headless client ID. Member-only registration, structured ADDRESS
controls and assigned-seat selection are not silently bypassed; event types
requiring those capabilities need a supported flow before activation.

The ordinary site build can publish the staged content improvements while
preserving the marked RSVP handoff. `npm run check:cutover` still fails in that
state. An offline check does not certify live transactions, and a synthetic
client ID used in a local domain-layout fixture is never production
configuration.
