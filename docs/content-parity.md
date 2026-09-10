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
