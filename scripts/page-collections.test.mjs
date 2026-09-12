import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pages } from "../src/site.mjs";
import { normalizeWixContent, assertPublicSnapshot } from "./normalize-wix-content.mjs";
import { mergeWixContent } from "./render-wix-content.mjs";
import { mergeNewsletterContent } from "./render-newsletters.mjs";
import { readWixContent } from "./sync-wix.mjs";
import { publicPage, updateWixPage } from "./update-wix-page.mjs";
import { fundraisingFieldNames } from "./fundraising-fields.mjs";
import { legacyPageType, normalizePageSlug, pageCollectionDefinitions, pageFieldsForType, projectLegacyPage, validatePagePlacement } from "./page-collections.mjs";

const raw = overrides => ({ blogPosts: [], events: [], products: [], storeCollections: [], boardMembers: [], ...overrides });
const typed = overrides => normalizeWixContent(raw({
  pageSource: "typed", commonPages: [], fundraisingPages: [], generatedPages: [], ...overrides,
}));
const row = (slug, more = {}) => ({ slug, title: slug, heading: `${slug} heading`, description: `${slug} description`,
  body: "<h2>Authored details</h2><p>Keep this content.</p>", published: true, ...more });

test("collection schemas contain only fields supported by each renderer", () => {
  assert.deepEqual(pageCollectionDefinitions.map(d => d.id), ["CommonPages", "FundraisingPages", "GeneratedPages"]);
  assert.deepEqual(pageFieldsForType("common"), ["slug", "title", "heading", "description", "accent", "body", "published"]);
  assert(!pageFieldsForType("generated").includes("body"));
  assert(!pageFieldsForType("fundraising").includes("accent"));
  for (const type of ["common", "generated"]) {
    assert(fundraisingFieldNames.every(key => !pageFieldsForType(type).includes(key)));
  }
  assert(pageCollectionDefinitions.every(d => !d.fields.some(f => f.key === "kicker" || f.key === "pageType")));
});

test("migration classifies legacy rows once and retains only applicable raw authoring fields", () => {
  const legacy = row("Donate", { _id: "source", kicker: "unused", accent: "blue", campaignStatus: "evergreen", privateNotes: "PRIVATE" });
  const projected = projectLegacyPage(legacy);
  assert.equal(projected.type, "fundraising");
  assert.equal(projected.data.slug, "donate");
  assert.equal(projected.data.body, legacy.body);
  assert.equal(projected.data.campaignStatus, "evergreen");
  assert(!Object.hasOwn(projected.data, "accent"));
  assert(!Object.hasOwn(projected.data, "privateNotes"));
  assert.equal(legacyPageType(row("pta-board", { campaignStatus: "active" })), "generated");
  assert.equal(legacyPageType(row("giving/new-campaign", { campaignStatus: "active" })), "fundraising");
  assert.equal(projectLegacyPage(row("draft", { published: false })).data.published, false);
  assert.equal(normalizePageSlug("Family Guides/Píckup"), "family-guides/pickup");
});

test("typed normalization strips irrelevant fields and private metadata, never deriving renderer from row fields", () => {
  const snapshot = typed({
    commonPages: [row("advocacy", { campaignStatus: "active", goalAmount: 500, kicker: "unused", privateNotes: "PRIVATE" })],
    fundraisingPages: [row("annual-fund", { campaignStatus: "", heroImage: "", accent: "blue", kicker: "unused" })],
    generatedPages: [row("blog", { body: "<p>DO_NOT_RENDER</p>", campaignStatus: "active" })],
  });
  assert.equal(snapshot.schemaVersion, 3);
  assertPublicSnapshot(snapshot);
  const merged = mergeWixContent(pages, snapshot);
  assert.notEqual(merged.find(p => p.slug === "advocacy").layout, "fundraising");
  assert.equal(merged.find(p => p.slug === "annual-fund").layout, "fundraising");
  assert.equal(snapshot.cms.pages.find(p => p.slug === "annual-fund").campaignStatus, "");
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE|DO_NOT_RENDER|kicker/);
  assert(!Object.hasOwn(snapshot.cms.pages.find(p => p.slug === "blog"), "body"));
  assert(!Object.hasOwn(snapshot.cms.pages.find(p => p.slug === "advocacy"), "campaignStatus"));
});

test("typed exports reject wrong types, unsupported fields, reserved routes and cross-collection duplicates", () => {
  for (const [type, slug] of [["common", "donate"], ["fundraising", "blog"], ["generated", "enrichment"],
    ["common", "post/a"], ["fundraising", "newsletter/an-edition"], ["common", "../escape"]]) {
    assert.throws(() => validatePagePlacement(type, slug));
  }
  assert.throws(() => typed({ commonPages: [row("a")], fundraisingPages: [row("A")] }), /Duplicate normalized/);
  assert.throws(() => typed({ commonPages: [row("donate")] }), /different page collection/);
  assert.throws(() => typed({ pageSource: "mistyped" }), /Unknown CMS page source/);
  assert.throws(() => typed({ commonPages: undefined }), /Missing typed CMS/);
  for (const extra of [{ kicker: "unused" }, { goalAmount: 25 }, { pageType: "unknown" }]) {
    const snapshot = typed({ commonPages: [row("enrichment")] });
    Object.assign(snapshot.cms.pages[0], extra);
    assert.throws(() => assertPublicSnapshot(snapshot));
  }
  const snapshot = typed({ generatedPages: [row("shop")] });
  snapshot.cms.pages[0].body = "<p>Unsupported</p>";
  assert.throws(() => assertPublicSnapshot(snapshot));
});

test("typed field clearing preserves fundraising layout without campaign-status inference or stale fallback values", () => {
  const snapshot = typed({ fundraisingPages: [row("donate", { body: "", campaignStatus: "" })] });
  const page = mergeWixContent(pages, snapshot).find(p => p.slug === "donate");
  assert.equal(page.layout, "fundraising");
  assert.equal(page.content, "");
  assert.equal(page.primaryCtaUrl, "");
  assert.equal(page.impactBody, "");
  assert.equal(page.heroImage, "");
});

test("generated pages use their metadata while their contents remain owned by their data sources", () => {
  const snapshot = typed({
    generatedPages: [row("pta-board", { description: "Authored board introduction" }), row("newsletter", { description: "Authored newsletter introduction" })],
    boardMembers: [{ role: "Treasurer", names: "Volunteer", schoolYear: "2030–31", active: true }],
  });
  const merged = mergeNewsletterContent(mergeWixContent(pages, snapshot),
    { schemaVersion: 1, source: "public-archive", archiveId: "test", editions: [] }, "https://example.org/signup");
  assert.equal(merged.find(p => p.slug === "pta-board").description, "Authored board introduction");
  assert.match(merged.find(p => p.slug === "pta-board").content, /Volunteer/);
  assert.equal(merged.find(p => p.slug === "newsletter").description, "Authored newsletter introduction");
  assert.match(merged.find(p => p.slug === "newsletter").content, /No editions have been added/);
  assert.doesNotMatch(merged.find(p => p.slug === "pta-board").content, /Keep this content/);
});

test("all current pages retain headings, bodies, URLs and layout after a typed migration", async () => {
  const legacy = JSON.parse(await readFile(new URL("../src/data/wix-content.json", import.meta.url)));
  const groups = { commonPages: [], fundraisingPages: [], generatedPages: [] };
  for (const item of legacy.cms.pages) {
    const { type, data } = projectLegacyPage(item);
    groups[pageCollectionDefinitions.find(d => d.type === type).configKey].push(data);
  }
  const next = { ...legacy, schemaVersion: 3, cms: { ...legacy.cms, pages: typed(groups).cms.pages } };
  assertPublicSnapshot(next);
  const before = mergeWixContent(pages, legacy);
  const after = mergeWixContent(pages, next);
  const visible = list => list.map(p => Object.fromEntries(["slug", "title", "heading", "description", "content", "layout"]
    .map(key => [key, p[key]])));
  assert.deepEqual(visible(after), visible(before));
});

function builder(records = []) {
  return { limit() { return this; }, find: async () => ({ items: records, hasNext: () => false }) };
}
function client(query) {
  return {
    posts: { queryPosts: () => builder() }, wixEventsV2: { queryEvents: () => builder() },
    products: { queryProducts: () => builder() }, storeCollections: { queryCollections: () => builder() },
    items: { query },
  };
}
const config = { cms: { boardMembers: "BoardMembers", pageSource: "typed", legacyPages: "WebsitePages",
  ...Object.fromEntries(pageCollectionDefinitions.map(d => [d.configKey, d.id])) } };

test("typed sync reads all required collections and never falls back to legacy on missing/failed queries", async () => {
  const queried = [];
  const data = await readWixContent(client(id => { queried.push(id); return builder(); }), config);
  assert.equal(data.pageSource, "typed");
  assert.deepEqual(queried.sort(), ["BoardMembers", "CommonPages", "FundraisingPages", "GeneratedPages"]);
  for (const status of [404, 403]) {
    await assert.rejects(readWixContent(client(id => {
      if (id === "CommonPages") throw { status, message: "PRIVATE" };
      return builder();
    }), config), error => /Failed to query CMS CommonPages/.test(error.message) && !error.message.includes("PRIVATE"));
  }
  await assert.rejects(readWixContent(client(() => builder()), { cms: { ...config.cms, commonPages: "" } }), /Missing configured CMS/);
  assert(!queried.includes("WebsitePages"));
});

test("typed repair read-back stays valid and generated body repair is rejected before reading Wix", async () => {
  const page = publicPage(row("enrichment", { kicker: "unused" }), "common");
  const snapshot = typed({});
  snapshot.cms.pages.push(page);
  assertPublicSnapshot(snapshot);
  assert.equal(page.pageType, "common");
  assert(!Object.hasOwn(page, "kicker"));
  await assert.rejects(updateWixPage({ pageType: "generated" }), /Edit GeneratedPages metadata/);
});
