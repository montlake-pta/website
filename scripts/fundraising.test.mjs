import assert from "node:assert/strict";
import test from "node:test";
import { pages } from "../src/site.mjs";
import { assertPublicSnapshot, normalizeWixContent } from "./normalize-wix-content.mjs";
import { mergeWixContent } from "./render-wix-content.mjs";
import { emptyFundraisingFields, effectiveCampaignStatus, normalizeFundraisingFields } from "./fundraising-fields.mjs";
import { renderFundraisingOverview, renderFundraisingPage } from "./render-fundraising.mjs";
import { publicHtml, publicText, wixMediaUrl } from "./wix-public-content.mjs";
import { publicPage } from "./update-wix-page.mjs";

const options = { html: publicHtml, text: publicText, image: wixMediaUrl };
const now = new Date("2030-10-15T20:00:00Z");
const snapshot = cmsPages => normalizeWixContent({
  blogPosts: [], events: [], products: [], storeCollections: [], boardMembers: [], cmsPages,
}, { syncedAt: "2030-10-15T20:00:00Z" });
const candidate = slug => {
  const source = pages.find(page => page.slug === slug);
  return { slug, title: source.title, heading: source.heading, description: source.description,
    body: source.content, published: true, ...normalizeFundraisingFields(source, options) };
};

test("CMS campaign edits reach the landing page, Donate hub and homepage without template copy", () => {
  const data = snapshot([
    { ...candidate("donate"), heading: "Editor-owned hub heading", description: "Editor-owned hub introduction",
      primaryCtaLabel: "Support our students", primaryCtaUrl: "https://example.org/montlake-giving",
      heroImage: "wix:image://v1/editor-photo.jpg/photo.jpg", heroAlt: "Edited student photograph", heroCaption: "Edited caption",
      impactBody: "<h2>Updated funding priorities</h2><p>Edited impact statement.</p>",
      equityBody: "<h2>Everyone belongs</h2><p>Edited participation statement.</p>",
      trustBody: "<p>Edited nonprofit statement.</p>" },
    { ...candidate("annual-fund"), heading: "Our new annual campaign", title: "Annual Fund editor title",
      description: "Edited annual summary", campaignStatus: "active", schoolYear: "2030–2031",
      goalAmount: 200000, deadline: "2030-11-15", primaryCtaLabel: "Give to the Annual Fund",
      primaryCtaUrl: "https://example.org/annual", body: "<h2>Campaign details</h2><p>New campaign instructions.</p>" },
    candidate("spring-auction"),
  ]);
  assert.equal(data.schemaVersion, 2);
  assertPublicSnapshot(data);
  const merged = mergeWixContent(pages, data);
  const donate = renderFundraisingPage(merged.find(page => page.slug === "donate"), "../", merged, { now });
  for (const value of ["Editor-owned hub heading", "Edited caption", "Edited student photograph",
    "Edited impact statement.", "Edited participation statement.", "Edited nonprofit statement.",
    "Annual Fund editor title", "Edited annual summary", "https://static.wixstatic.com/media/editor-photo.jpg"]) assert.ok(donate.includes(value), value);
  assert.equal((donate.match(/href="https:\/\/example.org\/montlake-giving"/g) || []).length, 2);
  assert.doesNotMatch(donate, /75–80%|paypal\.com|91-1117733/);
  const annual = renderFundraisingPage(merged.find(page => page.slug === "annual-fund"), "../", merged, { now });
  for (const value of ["Our new annual campaign", "$200,000", "2030–2031", "November 15, 2030",
    "https://example.org/annual", "New campaign instructions."]) assert.ok(annual.includes(value), value);
  const home = renderFundraisingOverview(merged, "./", { home: true, now });
  for (const value of ["Editor-owned hub heading", "Editor-owned hub introduction", "Edited annual summary", "Campaign open", "2030–2031"]) assert.ok(home.includes(value), value);
  assert.doesNotMatch(home, /75–80%/);
});

test("cleared or removed optional fields never resurrect campaign fallback values", () => {
  const data = snapshot([{ slug: "donate", title: "Donate", heading: "Updated", description: "", body: "",
    published: true, campaignStatus: "evergreen", goalAmount: null, impactBody: "", heroImage: "" }]);
  const merged = mergeWixContent(pages, data);
  const model = merged.find(page => page.slug === "donate");
  for (const [key, value] of Object.entries(emptyFundraisingFields)) {
    if (key !== "campaignStatus") assert.equal(model[key], value, key);
  }
  const html = renderFundraisingPage(model, "../", [], { now });
  assert.doesNotMatch(html, /paypal|science-fair|75–80%|91-1117733|one-time|donate-equity|Campaign goal|Giving deadline/);
  assert.equal(model.content, "");
  assert.equal(model.description, "");
});

test("legacy v1 data retains useful fallbacks and all established fundraising routes", () => {
  const data = snapshot([]);
  data.schemaVersion = 1;
  assertPublicSnapshot(data);
  const merged = mergeWixContent(pages, data);
  for (const slug of ["donate", "annual-fund", "spring-auction", "fall-fundraiser-2025"]) assert.ok(merged.some(page => page.slug === slug));
  const donate = renderFundraisingPage(merged.find(page => page.slug === "donate"), "../", merged, { now });
  for (const value of ["paypal.com", "75–80%", "91-1117733", "tax-deductible to the extent allowed by law", 'id="employer-matching"']) assert.ok(donate.includes(value), value);
  assert.match(merged.find(page => page.slug === "fall-fundraiser-2025").content, /Past campaign: October 20–November 21, 2025/);
});

test("upcoming and past campaigns retain information without exposing their primary giving action", () => {
  for (const campaignStatus of ["upcoming", "closed", "archived", ""]) {
    const page = { ...pages.find(page => page.slug === "annual-fund"), campaignStatus,
      primaryCtaLabel: "Give now", primaryCtaUrl: "https://example.org/closed", deadline: "", goalAmount: null };
    const html = renderFundraisingPage(page, "../", [], { now });
    assert.doesNotMatch(html, /example.org\/closed|Give now/);
    assert.match(html, /href="\.\.\/donate\/"/);
  }
  const annual = pages.find(page => page.slug === "annual-fund");
  assert.equal(annual.goalAmount, null);
  assert.equal(annual.deadline, "");
  assert.equal(annual.schoolYear, "");
});

test("giving deadlines close after the entire Seattle calendar date, including daylight saving boundaries", () => {
  const page = { campaignStatus: "active", deadline: "2030-11-03" };
  assert.equal(effectiveCampaignStatus(page, new Date("2030-11-04T07:59:59Z")), "active");
  assert.equal(effectiveCampaignStatus(page, new Date("2030-11-04T08:00:00Z")), "closed");
  assert.equal(effectiveCampaignStatus({ ...page, campaignStatus: "upcoming" }, now), "upcoming");
  const expired = { ...pages.find(page => page.slug === "annual-fund"), campaignStatus: "active", deadline: "2030-10-14",
    primaryCtaLabel: "Expired action", primaryCtaUrl: "https://example.org/expired" };
  assert.doesNotMatch(renderFundraisingPage(expired, "../", [], { now }), /Expired action|example.org\/expired/);
  assert.match(renderFundraisingOverview([expired], "./", { now }), /Campaign closed/);
});

test("fundraising fields reuse public filtering and reject malformed goals, dates and action/image URLs", () => {
  const fields = normalizeFundraisingFields({ impactBody: '<h2>Impact</h2><script>bad()</script><p onclick="bad()">Public</p>',
    equityBody: "<p>Meeting ID: 1234567</p>", heroImage: "wix:image://v1/photo.jpg/title.jpg" }, options);
  assert.doesNotMatch(fields.impactBody, /script|onclick|bad\(\)/);
  assert.doesNotMatch(fields.equityBody, /1234567/);
  assert.equal(fields.heroImage, "https://static.wixstatic.com/media/photo.jpg");
  for (const value of [
    { campaignStatus: "finished" }, { goalAmount: -1 }, { goalAmount: true }, { goalAmount: "nonsense" },
    { deadline: "2030-02-30" }, { deadline: "next Friday" }, { primaryCtaUrl: "javascript:alert(1)" },
    { primaryCtaUrl: "//evil.example/" }, { primaryCtaUrl: "/\\evil.example/" },
    { primaryCtaUrl: "https://user:secret@example.org/" }, { primaryCtaUrl: "/%2e%2e/admin/" },
    { heroImage: "data:image/svg+xml,unsafe" }, { heroImage: "http://example.org/photo.jpg" },
    { heroImage: "/private/photo.jpg" },
  ]) assert.throws(() => normalizeFundraisingFields(value, options), /Invalid WebsitePages/);
  const contaminated = snapshot([candidate("donate")]);
  contaminated.cms.pages[0].impactBody = '<script>unsafe()</script>';
  assert.throws(() => assertPublicSnapshot(contaminated));
});

test("nested campaign routes use correct local action and image paths and require photo descriptions", () => {
  const page = { ...pages.find(page => page.slug === "annual-fund"), slug: "giving/campaign",
    campaignStatus: "active", primaryCtaLabel: "See giving options", primaryCtaUrl: "/donate/",
    heroImage: "/assets/school.jpg", heroAlt: "Montlake Elementary building" };
  const html = renderFundraisingPage(page, "../../", [], { now });
  assert.match(html, /href="\.\.\/\.\.\/donate\/"/);
  assert.match(html, /src="\.\.\/\.\.\/assets\/school.jpg"/);
  assert.throws(() => renderFundraisingPage({ ...page, heroAlt: "" }, "../../"), /alt text/);
  const data = snapshot([{ ...candidate("annual-fund"), slug: "giving/campaign", campaignStatus: "archived" }]);
  assert.equal(mergeWixContent(pages, data).find(page => page.slug === "giving/campaign").layout, "fundraising");
});

test("blank fundraising columns do not turn ordinary CMS pages into campaign layouts", () => {
  const data = snapshot([{ slug: "calendar", title: "Calendar", description: "School dates", body: "<p>Calendar content</p>",
    published: true, ...emptyFundraisingFields }]);
  const calendar = mergeWixContent(pages, data).find(page => page.slug === "calendar");
  assert.notEqual(calendar.layout, "fundraising");
  assert.match(calendar.content, /Calendar content/);
});

test("ordinary page repairs preserve fundraising fields in the public read-back export", () => {
  const record = { ...candidate("donate"), _owner: "PRIVATE_OWNER", internalNotes: "PRIVATE_NOTES" };
  const exported = publicPage(record);
  assert.equal(exported.primaryCtaUrl, record.primaryCtaUrl);
  assert.equal(exported.impactBody, record.impactBody);
  assert.doesNotMatch(JSON.stringify(exported), /PRIVATE_/);
  const data = snapshot([]);
  data.cms.pages.push(exported);
  assertPublicSnapshot(data);
});
