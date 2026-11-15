import assert from "node:assert/strict";
import test from "node:test";
import { confirmDiff, describeLink, diffPage, diffSnapshots, normalizeLines, normalizeLink, parseSitemap, reconcile, renderReport } from "./legacy-drift.mjs";

test("sitemap parsing keeps only legacy-origin page slugs, including the homepage", () => {
  const xml = `<urlset><url><loc>https://www.montlakepta.org</loc></url>
    <url><loc>https://www.montlakepta.org/fall-fundraiser</loc></url>
    <url><loc>https://example.org/elsewhere</loc></url>
    <url><loc>https://www.montlakepta.org/fall-fundraiser</loc></url></urlset>`;
  assert.deepEqual(parseSitemap(xml), ["", "fall-fundraiser"]);
});

test("an error page or truncated sitemap is rejected rather than read as page removals", () => {
  assert.throws(() => parseSitemap("<html>Service unavailable</html>"), /incomplete/);
  assert.throws(() => parseSitemap("<urlset><url><loc>https://www.montlakepta.org/donate</loc></url>"), /incomplete/);
});

test("links are compared with their labels so swapped destinations are detected", () => {
  assert.equal(describeLink({ label: " Give\ntoday ", href: "https://www.montlakepta.org/donate/#monthly" }), "Give today → /donate#monthly");
  const before = { text: [], links: [describeLink({ label: "Register", href: "/register" }), describeLink({ label: "Donate", href: "/donate" })] };
  const after = { text: [], links: [describeLink({ label: "Register", href: "/donate" }), describeLink({ label: "Donate", href: "/register" })] };
  assert.equal(diffPage(before, after).addedLinks.length, 2);
});

test("the baseline candidate accepts only pages whose two captures agree", () => {
  const page = (...text) => ({ text, links: [] });
  const baseline = { pages: { stable: page("A"), edited: page("Old"), flaky: page("Old"), gone: page("Gone"), missing: page("Kept") } };
  const first = { pages: { stable: page("A"), edited: page("New"), flaky: page("New", "noise"), fresh: page("Hello"), missing: page("Kept") },
    unreachable: [] };
  delete first.pages.missing;
  first.unreachable.push("missing");
  const { report, snapshot } = reconcile({
    baseline, first,
    recaptures: { edited: page("New"), flaky: page("New"), fresh: page("Hello") },
    sitemapAgain: new Set(["stable", "edited", "flaky", "fresh", "missing"]),
  });
  assert.deepEqual(Object.keys(report.changedPages).sort(), ["edited", "flaky"]);
  assert.deepEqual(report.changedPages.flaky.addedText, ["New"]);
  assert.deepEqual(report.newPages, ["fresh"]);
  assert.deepEqual(report.removedPages, ["gone"]);
  assert.deepEqual(report.unstable, ["flaky"]);
  assert.deepEqual(report.unreachable, ["missing"]);
  assert.equal(report.complete, false);
  assert.deepEqual(snapshot.pages.edited, page("New"));
  assert.deepEqual(snapshot.pages.flaky, page("Old"));
  assert.deepEqual(snapshot.pages.missing, page("Kept"));
  assert.equal(snapshot.pages.gone, undefined);

  const unconfirmedRemoval = reconcile({ baseline: { pages: { gone: page("Gone") } }, first: { pages: {}, unreachable: [] },
    recaptures: {}, sitemapAgain: new Set(["gone"]) });
  assert.deepEqual(unconfirmedRemoval.report.removedPages, []);
  assert.deepEqual(unconfirmedRemoval.snapshot.pages.gone, page("Gone"));
});

test("Editor text normalization ignores invisible spacing differences and duplicates", () => {
  assert.deepEqual(normalizeLines("Session Dates:\u00a0 October 7\u200b\n\n Session Dates: October 7 \nx\nNo classes"),
    ["Session Dates: October 7", "No classes"]);
  assert.equal(normalizeLink("https://www.montlakepta.org/donate/"), "/donate");
  assert.equal(normalizeLink("mailto:enrichment@montlakepta.org"), "mailto:enrichment@montlakepta.org");
  assert.equal(normalizeLink("javascript:void(0)"), null);
});

test("snapshot comparison reports new, removed and edited pages but not unreachable ones", () => {
  const baseline = { pages: {
    enrichment: { text: ["Session: Spring", "Questions?"], links: ["mailto:old@seattleschools.org"] },
    budget: { text: ["Budget"], links: [] },
    advocacy: { text: ["Advocacy"], links: [] },
  } };
  const current = { pages: {
    enrichment: { text: ["Session: Fall", "Questions?"], links: ["mailto:new@seattleschools.org"] },
    "fall-fundraiser": { text: ["Give today"], links: [] },
  }, unreachable: ["advocacy"] };
  const report = diffSnapshots(baseline, current);
  assert.equal(report.changed, true);
  assert.deepEqual(report.newPages, ["fall-fundraiser"]);
  assert.deepEqual(report.removedPages, ["budget"]);
  assert.deepEqual(report.unreachable, ["advocacy"]);
  assert.deepEqual(report.changedPages.enrichment, {
    addedText: ["Session: Fall"], removedText: ["Session: Spring"],
    addedLinks: ["mailto:new@seattleschools.org"], removedLinks: ["mailto:old@seattleschools.org"],
  });
  assert.equal(diffSnapshots(baseline, { pages: baseline.pages }).changed, false);
});

test("only differences seen in both captures are confirmed", () => {
  const first = diffPage({ text: ["A"], links: [] }, { text: ["A", "B", "flaky"], links: [] });
  const second = diffPage({ text: ["A"], links: [] }, { text: ["A", "B"], links: [] });
  assert.deepEqual(confirmDiff(first, second).addedText, ["B"]);
});

test("issue report fences untrusted legacy text and stays within the issue size limit", () => {
  const report = { changed: true, newPages: [], removedPages: [], unreachable: [],
    changedPages: { enrichment: { addedText: ["```\n# injected", "x".repeat(70000)], removedText: [], addedLinks: [], removedLinks: [] } } };
  const body = renderReport(report, { runUrl: "https://github.com/montlake-pta/website/actions/runs/1" });
  assert.ok(body.length < 61000);
  assert.equal(body.match(/```/g).length % 2, 0);
  assert.match(body, /```text\n'''/);
  assert.match(body, /truncated/);
});

test("legacy edit automation reads the public site only and cannot write Wix or repository contents directly", async () => {
  const { readFile } = await import("node:fs/promises");
  const detector = await readFile(new URL("../.github/workflows/legacy-drift.yml", import.meta.url), "utf8");
  assert.match(detector, /^permissions:\n  contents: read$/m);
  assert.match(detector, /persist-credentials: false/);
  assert.doesNotMatch(detector, /WIX_API_KEY|contents: write|actions: write|secrets\.|workflow run/);
  assert.match(detector, /steps\.detect\.outputs\.changed == 'false' && steps\.detect\.outputs\.complete == 'true'/);

  const agent = await readFile(new URL("../.github/workflows/port-legacy-edits.md", import.meta.url), "utf8");
  const frontmatter = agent.split(/^---$/m)[1];
  assert.match(frontmatter, /draft: true/);
  assert.match(frontmatter, /^if: vars\.LEGACY_PORT_AGENT == 'true'$/m);
  assert.match(frontmatter, /jq -r \.complete/);
  assert.match(frontmatter, /deployed-content/);
  assert.match(frontmatter, /labels: \[legacy-site-edits\]/);
  assert.deepEqual(frontmatter.split("allowed-files:")[1].trim().split("\n").map((line) => line.trim()),
    ["- src/site.mjs", "- src/data/legacy-editor-baseline.json", "- scripts/cutover-links.mjs", "- scripts/cutover-links.test.mjs"]);
  assert.doesNotMatch(frontmatter, /WIX_API_KEY|contents: write|bash: true/);
  assert.match(agent, /untrusted data/);

  const lock = await readFile(new URL("../.github/workflows/port-legacy-edits.lock.yml", import.meta.url), "utf8");
  assert.doesNotMatch(lock, /WIX_API_KEY/);
  assert.match(lock, /port-legacy-edits\.md/);
});
