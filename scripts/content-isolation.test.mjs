import assert from "node:assert/strict";
import { test } from "node:test";
import { pages } from "../src/site.mjs";
import { mergeWixContent } from "./render-wix-content.mjs";
import { rewriteCutoverLinks } from "./cutover-links.mjs";
import { ContentItemError, describeIsolatedItem, isolateContentFailures, itemForRoute, partialDeploymentProblems } from "./content-isolation.mjs";

const event = (slug, body = "<p>Details.</p>", id = slug) => ({
  id, slug, title: `Event ${slug}`, summary: "", descriptionText: "", bodyHtml: body,
  startAt: "2099-01-01T18:00:00.000Z", endAt: "2099-01-01T19:00:00.000Z", location: "", address: "", image: null,
  status: "SCHEDULED", sourceUrl: "",
});
const snapshot = (events, cmsPages = []) => ({
  schemaVersion: 3, source: "test", syncedAt: "2099-01-01T00:00:00Z",
  cms: { boardMembers: [], pages: cmsPages }, blogPosts: [], events, products: [], storeCollections: [],
});
const badLink = '<p><a href="https://www.montlakepta.org/not-a-page">More</a></p>';

// The build's merge and link pass, limited to routes owned by test items.
function render(content) {
  const rendered = mergeWixContent(pages, content, [], { transactionsEnabled: false, readOnly: false });
  const routes = new Set(rendered.map((page) => page.slug));
  const failures = [];
  const owned = new Set(content.cms.pages.map((page) => page.slug));
  for (const page of rendered.filter((item) => item.slug.startsWith("event-details/") || owned.has(item.slug))) {
    try {
      rewriteCutoverLinks(`<!doctype html><html><body>${page.content || ""}</body></html>`, {
        slug: page.slug, routes, baseUrl: "https://montlake-pta.github.io/website/",
      });
    } catch (error) {
      failures.push({ route: page.slug, error });
    }
  }
  return failures;
}

test("a failing new item is withheld and every other item still publishes", () => {
  const content = snapshot([event("good"), event("new", badLink)]);
  const result = isolateContentFailures({ content, fallback: snapshot([event("good")]), render });
  assert.deepEqual(result.content.events.map((item) => item.slug), ["good"]);
  assert.equal(result.isolated.length, 1);
  assert.equal(result.isolated[0].action, "withheld");
  assert.match(result.isolated[0].error, /Unknown cutover target: \/not-a-page/);
  assert.match(describeIsolatedItem(result.isolated[0]), /The event "Event new" was not published/);
  assert.deepEqual(content.events.map((item) => item.slug), ["good", "new"]);
});

test("a failing edit keeps the last deployed version of that item", () => {
  const deployed = event("existing", "<p>Deployed details.</p>");
  const result = isolateContentFailures({
    content: snapshot([event("existing", badLink), event("other")]),
    fallback: snapshot([deployed]),
    render,
  });
  assert.deepEqual(result.content.events[0], deployed);
  assert.equal(result.content.events[1].slug, "other");
  assert.equal(result.isolated[0].action, "kept-previous");
});

test("a previous version that also fails is withheld", () => {
  const result = isolateContentFailures({
    content: snapshot([event("existing", badLink)]),
    fallback: snapshot([event("existing", '<p><a href="https://www.montlakepta.org/also-missing">Old</a></p>')]),
    render,
  });
  assert.deepEqual(result.content.events, []);
  assert.equal(result.isolated[0].action, "withheld");
  assert.match(result.isolated[0].error, /not-a-page/);
});

test("a CMS record that cannot be merged is attributed to that record", () => {
  const broken = { pageType: "fundraising", slug: "annual-fund", title: "Annual Fund", description: "Give.", body: "<p>Give.</p>", published: true, campaignStatus: "not-a-status" };
  const result = isolateContentFailures({ content: snapshot([], [broken]), render });
  assert.deepEqual(result.content.cms.pages, []);
  assert.equal(result.isolated[0].type, "page");
  assert.match(result.isolated[0].error, /campaignStatus/);
});

test("failures that cannot be traced to one item, or too many items, stop the build", () => {
  assert.throws(() => isolateContentFailures({
    content: snapshot([]), render: () => [{ route: "", error: new Error("Homepage template failed") }],
  }), /Homepage template failed/);
  assert.throws(() => isolateContentFailures({
    content: snapshot([]), render: () => { throw new Error("Unsupported snapshot"); },
  }), /Unsupported snapshot/);
  const many = snapshot(["a", "b", "c", "d"].map((slug) => event(slug, badLink)));
  assert.throws(() => isolateContentFailures({ content: many, render }), /systemic problem; nothing was deployed/);
});

test("only routes owned by a single item are attributable", () => {
  const content = snapshot([event("one")], [{ pageType: "generated", slug: "blog" }, { pageType: "common", slug: "budget" }]);
  assert.deepEqual(itemForRoute(content, "event-details/one"), { collection: "events", key: "one" });
  assert.deepEqual(itemForRoute(content, "budget"), { collection: "cms.pages", key: "budget" });
  for (const route of ["", "blog", "event-list", "event-details/missing", "calendar"]) assert.equal(itemForRoute(content, route), null);
  assert.ok(new ContentItemError("events", "one", new Error("x")) instanceof Error);
});

test("sync failures and isolated items each make the deployment partial", () => {
  assert.deepEqual(partialDeploymentProblems({ wixSync: "success", calendarSync: "success", report: { isolated: [] } }), []);
  assert.deepEqual(partialDeploymentProblems({ wixSync: "skipped" }), []);
  const problems = partialDeploymentProblems({
    wixSync: "failure", calendarSync: "success",
    report: { isolated: [{ type: "post", title: "News", action: "withheld", error: "Unknown cutover target: /x" }] },
  });
  assert.deepEqual(problems, [
    "Could not read Wix content; the last deployed version was published again.",
    'The post "News" was not published (no earlier version exists): Unknown cutover target: /x',
  ]);
});
