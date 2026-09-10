import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mergeWixContent, sanitizeCmsHtml } from "./render-wix-content.mjs";
import { assertPublicSnapshot, normalizeWixContent } from "./normalize-wix-content.mjs";
import { normalizeRichBody, publicHtml, publicText, publicUrl } from "./wix-public-content.mjs";
import { fetchAll, readWixContent } from "./sync-wix.mjs";
import { preserveCollectionRoutes } from "../src/site.mjs";

// Ricos fixtures use the installed Blog/Events SDK Node, Decoration, V1Media,
// FileSource, Gallery Item, and oEmbed shapes, not an invented HTML payload.
const text = (value, decorations = []) => ({ type: "TEXT", textData: { text: value, decorations } });
const paragraph = (...nodes) => ({ type: "PARAGRAPH", nodes });
const markedLink = (url) => ({ type: "LINK", linkData: { link: { url, target: "BLANK" } } });
const fileUrl = "https://school.sharepoint.com/:v:/s/PTA/reviewed-file?e=access-control&download=1";
const richFixture = {
  metadata: { token: "OMIT_METADATA" },
  nodes: [
    { type: "HEADING", headingData: { level: 2 }, nodes: [text("Ordering instructions")] },
    paragraph(text("Read "), text("the ", [{ type: "BOLD" }, markedLink("https://example.org/order?school=1")]),
      text("ordering guide", [markedLink("https://example.org/order?school=1")]), text(" & keep a copy.")),
    { type: "BULLETED_LIST", nodes: [
      { type: "LIST_ITEM", nodes: [
        paragraph(text("First step")),
        { type: "ORDERED_LIST", nodes: [{ type: "LIST_ITEM", nodes: [paragraph(text("Nested step", [{ type: "ITALIC" }]))] }] },
      ] },
    ] },
    { type: "IMAGE", imageData: {
      image: { src: { id: "school~mv2.png" }, width: 1200, height: 800 },
      altText: "Ordering steps, including school code",
      caption: "Use the school code shown in the graphic.",
      link: { url: "https://example.org/full-size" },
    } },
    { type: "IMAGE", imageData: {
      image: { src: { url: "https://static.wixstatic.com/media/survey.png" } },
      altText: "Survey results: 60% selected art",
    }, nodes: [{ type: "CAPTION", nodes: [text("Family survey results")] }] },
    { type: "GALLERY", galleryData: { items: [
      { image: { media: { src: { id: "nobel-photo-one.jpg" } } }, altText: "Students meeting the author", title: "Author visit" },
      { image: { media: { src: { id: "nobel-photo-two.jpg" } } }, altText: "Students reading together" },
    ] } },
    { type: "FILE", fileData: { src: { url: fileUrl, private: false }, name: "Meeting recording (school sign-in required)" } },
    { type: "EMBED", embedData: { src: "https://www.youtube.com/watch?v=public-video", oembed: {
      title: "Watch the public presentation", html: '<iframe src="https://unsafe.example/"></iframe>',
    } } },
    paragraph(text("Final public paragraph.")),
  ],
};
const raw = (overrides = {}) => ({
  blogPosts: [], events: [], products: [], storeCollections: [], boardMembers: [], cmsPages: [], ...overrides,
});
const normalize = (input, options = {}) => normalizeWixContent(raw(input), {
  syncedAt: "2026-09-10T00:00:00.000Z", warn: () => {}, ...options,
});
const staticPages = ["", "blog", "event-list", "shop", "pta-board"].map((slug) => ({
  slug, title: slug || "Home", description: "Static fallback", content: `<p>Fallback ${slug}</p>`,
}));
const page = (snapshot, slug, calendar = []) => mergeWixContent(staticPages, snapshot, calendar).find((item) => item.slug === slug);

test("Ricos links, split marks, headings, lists, images, captions and galleries survive sanitization", () => {
  const warnings = [];
  const body = normalizeRichBody(richFixture, { warn: (message) => warnings.push(message) });
  assert.deepEqual(warnings, []);
  assert.match(body.bodyHtml, /<h2>Ordering instructions<\/h2>/);
  assert.match(body.bodyHtml, /<ul><li><p>First step<\/p><ol><li><p><em>Nested step<\/em>/);
  assert.match(body.bodyHtml, /<a href="https:\/\/example.org\/order\?school=1" target="_blank" rel="noopener noreferrer"><strong>the <\/strong><\/a>/);
  assert.match(body.text, /Read the ordering guide & keep a copy\./);
  assert.match(body.bodyHtml, /alt="Ordering steps, including school code"/);
  assert.match(body.bodyHtml, /<figcaption>Family survey results<\/figcaption>/);
  assert.equal((body.bodyHtml.match(/<img /g) || []).length, 4);
  assert.match(body.bodyHtml, /nobel-photo-two\.jpg/);
  assert.ok(body.bodyHtml.includes(fileUrl.replaceAll("&", "&amp;")));
  assert.match(body.bodyHtml, /Watch the public presentation<\/a>/);
  assert.doesNotMatch(body.bodyHtml, /<iframe|OMIT_METADATA|unsafe\.example/);
  assert.equal(sanitizeCmsHtml(body.bodyHtml), body.bodyHtml);
});

test("normalizer/renderer round trip preserves rich bodies and full plain text, not a 500-character excerpt", () => {
  const fullText = `${"Full public content, never shortened. ".repeat(45)}Final public paragraph.`;
  const snapshot = normalize({
    blogPosts: [{ _id: "post-id", slug: "rich-post", title: "Rich post", contentText: fullText,
      richContent: richFixture, hasUnpublishedChanges: true }],
    events: [{ _id: "event-id", slug: "rich-event", title: "Rich event", description: richFixture, status: "CANCELED" }],
  });
  assert.equal(snapshot.blogPosts[0].contentText, fullText);
  for (const slug of ["post/rich-post", "event-details/rich-event"]) {
    assert.match(page(snapshot, slug).content, /<h2>Ordering instructions<\/h2>/);
    assert.match(page(snapshot, slug).content, /<figcaption>Family survey results<\/figcaption>/);
    assert.ok(page(snapshot, slug).content.includes(fileUrl.replaceAll("&", "&amp;")));
  }
  assert.match(page(snapshot, "event-details/rich-event").content, /Canceled:/);
  assert.match(snapshot.events[0].descriptionText, /Read the ordering guide/);
  assert.match(snapshot.events[0].descriptionText, /Final public paragraph/);
  assert.doesNotMatch(JSON.stringify(snapshot), /richContent|textData|OMIT_METADATA/);
});

test("private/conferencing nodes and credentials split across marks or paragraphs never enter stored bodies", () => {
  const warnings = [];
  const confidential = {
    nodes: [
      paragraph(text("Keep this public introduction.")),
      paragraph(text("Meeting ", [{ type: "BOLD" }]), text("ID:"), text(" 123 456 789")),
      paragraph(text("Pass"), text("code:", [{ type: "BOLD" }])),
      paragraph(text("SYNTHETIC_PASSCODE")),
      paragraph(text("Join ", [markedLink("https://district.zoom.us/j/123?pwd=SYNTHETIC_URL_TOKEN")]),
        text("https://meet."), text("google.com/abc-defg-hij")),
      paragraph(text("Teams https://teams.microsoft.com/l/meetup-join/SYNTHETIC_TEAMS")),
      { type: "VIDEO", videoData: { title: "PRIVATE_VIDEO_TITLE", video: {
        src: { url: "https://files.example/private?token=SYNTHETIC_PRIVATE_TOKEN", private: true },
      } } },
      { type: "FILE", fileData: { src: { id: "SYNTHETIC_PRIVATE_ID", private: true }, name: "PRIVATE_FILE_TITLE" } },
      { type: "IMAGE", imageData: { image: { src: { id: "SYNTHETIC_PRIVATE_IMAGE", private: true } } } },
      { type: "HTML", htmlData: { html: '<div>Passcode: SYNTHETIC_RAW_HTML</div><script>BAD_SCRIPT</script>' } },
      { type: "POLL", pollData: { creatorId: "SYNTHETIC_OWNER", poll: { title: "PRIVATE_POLL_TITLE" } } },
      { type: "APP_EMBED", appEmbedData: { url: "https://example.org/public-event", name: "Public event" } },
      { type: "FILE", fileData: { src: { url: fileUrl }, name: "Publicly linked recording" } },
      paragraph(text("Keep the public conclusion.")),
    ],
  };
  const snapshot = normalize({
    events: [{ slug: "meeting", title: "PTA meeting", description: confidential,
      onlineConferencing: { password: "SYNTHETIC_CONFERENCE_METADATA" } }],
    blogPosts: [{ slug: "meeting-notes", title: "Notes", richContent: confidential,
      contentText: "Public text.\nMeeting ID: 123 456 789\nPasscode: SYNTHETIC_PLAIN_SECRET\nConclusion." }],
  }, { warn: (message) => warnings.push(message) });
  const output = JSON.stringify(snapshot);
  assert.doesNotMatch(output, /SYNTHETIC_|PRIVATE_|123 456 789|zoom\.us|meet\.google|teams\.microsoft|BAD_SCRIPT/);
  assert.match(output, /Keep this public introduction/);
  assert.match(output, /Keep the public conclusion/);
  assert.match(output, /https:\/\/example.org\/public-event/);
  assert.match(output, /sharepoint\.com/);
  assert.ok(warnings.some((message) => message.includes("POLL")));
  assert.ok(warnings.some((message) => message.includes("HTML")));
  assert.doesNotMatch(warnings.join(" "), /https:|SYNTHETIC_|PRIVATE_/);
});

test("unsafe schemes, attributes and embeds stay blocked around supported table markup", () => {
  const html = publicHtml('<p onclick="evil()">Read <a href="javascript:alert(1)">unsafe</a> '
    + '<a href="../calendar/">calendar</a> <a href="https://safe.example/?q=1">safe</a></p>'
    + '<script>SECRET_SCRIPT</script><iframe src="https://evil.example/"></iframe>'
    + '<iframe src="https://calendar.google.com/calendar/embed?src=public"></iframe>'
    + '<img src="data:image/svg+xml,bad" onerror="evil()" alt="Good">'
    + '<table><tr><td>Table text</td></tr></table>');
  assert.doesNotMatch(html, /onclick|onerror|javascript:|SECRET_SCRIPT|evil\.example|data:image/);
  assert.match(html, /<table><tr><td>Table text<\/td><\/tr><\/table>/);
  assert.match(html, /href="\.\.\/calendar\/"/);
  assert.match(html, /src="https:\/\/calendar.google.com\/calendar\/embed/);
  assert.equal(publicUrl("https://school.sharepoint.com/file?e=allowed"), "https://school.sharepoint.com/file?e=allowed");
  assert.equal(publicUrl("https://aka.ms/public-file?download=1"), "https://aka.ms/public-file?download=1");
  for (const url of ["javascript:alert(1)", "data:text/html,evil", "//example.org/file", "https://user:password@example.org/",
    "https://district.zoom.us./j/1", "https://meet.google.com/abc-defg-hij", "https://aka.ms/JoinTeamsMeeting",
    "tel:+12065550100,,123456789#", "msteams://join"]) assert.equal(publicUrl(url), null);
  assert.equal(publicUrl("tel:+12065550100"), "tel:+12065550100");
  assert.equal(publicUrl(" \nhttps://example.org/volunteer\t "), "https://example.org/volunteer");
  assert.equal(publicUrl(" \tjavascript:alert(1) "), null);
  assert.equal(publicUrl("https://exa\nmple.org/"), null);
  assert.doesNotMatch(publicText("Access code: SYNTHETIC\nPublic.\nzoommtg://zoom.us/join?pwd=SYNTHETIC"), /SYNTHETIC/);
  assert.equal(sanitizeCmsHtml(html), html);
});

test("authored schedule tables retain rows, cells and links without active attributes", () => {
  const table = { type: "TABLE", nodes: [
    { type: "TABLE_ROW", nodes: [
      { type: "TABLE_CELL", nodes: [paragraph(text("Class"))] },
      { type: "TABLE_CELL", nodes: [paragraph(text("End time"))] },
    ] },
    { type: "TABLE_ROW", nodes: [
      { type: "TABLE_CELL", nodes: [paragraph(text("Lego club", [markedLink("https://example.org/class")]))] },
      { type: "TABLE_CELL", nodes: [paragraph(text("4:00 PM"))] },
    ] },
  ] };
  const { bodyHtml } = normalizeRichBody({ nodes: [table] }, { warn: (warning) => assert.fail(warning) });
  assert.equal((bodyHtml.match(/<tr>/g) || []).length, 2);
  assert.equal((bodyHtml.match(/<td>/g) || []).length, 4);
  assert.match(bodyHtml, /href="https:\/\/example.org\/class"/);
  const unsafe = publicHtml('<table onclick="bad()" style="background:url(javascript:bad())"><tbody><tr><td onmouseover="bad()">Public<svg onload="bad()"><script>UNSAFE_SCRIPT</script></svg><a href="javascript:bad()">Label</a></td></tr></tbody></table>');
  assert.match(unsafe, /<table><tbody><tr><td>Public/);
  assert.doesNotMatch(unsafe, /onclick|style=|onmouseover|onload|javascript:|<svg|UNSAFE_SCRIPT/);
  const privateRow = publicHtml('<table><tr><td>Meeting ID: 123</td><td>456 789</td></tr><tr><td>Class</td><td>4:00 PM</td></tr></table>');
  assert.doesNotMatch(privateRow, /123|456|789/);
  assert.match(privateRow, /Class/);
  assert.match(privateRow, /4:00 PM/);
  const protectedSnapshot = normalize({ blogPosts: [{
    slug: "private-table", contentText: "Meeting ID: 123\n456 789",
    richContent: { nodes: [{ type: "TABLE", nodes: [{ type: "TABLE_ROW", nodes: [
      { type: "TABLE_CELL", nodes: [paragraph(text("Meeting ID: 123"))] },
      { type: "TABLE_CELL", nodes: [paragraph(text("456 789"))] },
    ] }] }] },
  }] });
  assert.doesNotMatch(JSON.stringify(protectedSnapshot), /123|456|789/);
});

test("rich headings preserve sibling hierarchy without skipping below the page heading", () => {
  const { bodyHtml } = normalizeRichBody({ nodes: [
    { type: "HEADING", headingData: { level: 3 }, nodes: [text("First")] },
    { type: "HEADING", headingData: { level: 3 }, nodes: [text("Second")] },
    { type: "HEADING", headingData: { level: 5 }, nodes: [text("Child")] },
    { type: "HEADING", headingData: { level: 2 }, nodes: [text("Next section")] },
  ] });
  assert.equal(bodyHtml, "<h2>First</h2><h2>Second</h2><h3>Child</h3><h2>Next section</h2>");
});

test("old public category addresses survive hidden collections without overriding live listings", () => {
  const live = { slug: "category/evergreens", title: "Live collection", content: "Current products" };
  const result = preserveCollectionRoutes([live]);
  assert.equal(result.length, 8);
  assert.equal(result.find((page) => page.slug === live.slug), live);
  assert(result.find((page) => page.slug === "category/all-products").content.includes("../../shop/"));
  assert.equal(new Set(result.map((page) => page.slug)).size, result.length);
});

test("WebsitePages and BoardMembers export only their public fields and retain existing active/published defaults", () => {
  const snapshot = normalize({
    cmsPages: [
      { data: { slug: "school-info", title: "School", body: '<p>Public.</p><p>Passcode: SYNTHETIC_CMS</p>',
        published: true, _owner: "SECRET_OWNER", internalNotes: "SECRET_NOTES", password: "SECRET_FIELD" } },
      { slug: "default-public", title: "Existing semantics", body: "<p>Public by existing default.</p>" },
      { slug: "draft", title: "Hidden", published: false, body: "SECRET_DRAFT" },
    ],
    boardMembers: [
      { data: { schoolYear: "2026–27", role: "President", names: "Public Name", email: "president@example.org",
        displayOrder: 1, active: true, homeAddress: "SECRET_ADDRESS", _owner: "SECRET_OWNER" } },
      { role: "Treasurer", names: "Also public", email: "not-an-email", displayOrder: 2 },
      { role: "Former officer", names: "SECRET_INACTIVE", active: false },
    ],
    events: [{ slug: "canceled", status: "CANCELED" }, { slug: "ended", status: "ENDED" }, { slug: "draft", status: "DRAFT" }],
    blogPosts: [{ slug: "paid", pricingPlanIds: ["paid-plan"], contentText: "SECRET_PREMIUM" }],
  });
  assert.equal(snapshot.cms.pages.length, 2);
  assert.equal(snapshot.cms.boardMembers.length, 2);
  assert.deepEqual(Object.keys(snapshot.cms.pages[0]).sort(), ["accent", "body", "description", "heading", "kicker", "published", "slug", "title"]);
  assert.deepEqual(Object.keys(snapshot.cms.boardMembers[0]).sort(), ["active", "displayOrder", "email", "names", "role", "schoolYear"]);
  assert.equal(snapshot.cms.boardMembers[1].email, "");
  assert.deepEqual(snapshot.events.map((event) => event.status), ["CANCELED", "ENDED"]);
  assert.doesNotMatch(JSON.stringify(snapshot), /SECRET_|SYNTHETIC_|_owner|internalNotes|homeAddress/);
});

test("normalization is deterministic, tolerates optional fields and invalid slugs, and does not collide duplicate titles", () => {
  const products = [
    { _id: "b", slug: "Café item two", name: "Same title", stock: { inStock: false }, collectionIds: ["z", "a", "z"] },
    { _id: "a", slug: "Café item one", name: "Same title" },
    { slug: "///", name: "Invalid" },
    { slug: "hidden", visible: false },
  ];
  const a = normalize({ products });
  const b = normalize({ products: [...products].reverse() });
  assert.deepEqual(a, b);
  assert.deepEqual(a.products.map((item) => item.slug), ["cafe-item-one", "cafe-item-two"]);
  assert.deepEqual(a.products[1].collectionIds, ["a", "z"]);
  assert.equal(a.products[0].availability, null);
  assert.equal(a.products[0].sourceUrl, null);
  const missing = normalize({ events: [{ slug: "optional", dateAndTimeSettings: { startDate: "not a date" } }] }).events[0];
  assert.equal(missing.startAt, null);
  assert.equal(missing.descriptionText, "");
  assert.throws(() => normalize({ products: [{ slug: "Café" }, { slug: "cafe" }] }), /Duplicate normalized Product slug/);
});

test("nested CMS routes survive normalization without accepting traversal or encoded routes", () => {
  const snapshot = normalize({
    cmsPages: ["guides/pickup", "../escape", "guides//pickup", "guides/%2e%2e/escape"]
      .map((slug) => ({ slug, title: "Guide", description: "Guide information", body: "<p>Public guide.</p>" })),
  });
  assert.deepEqual(snapshot.cms.pages.map((page) => page.slug), ["guides/pickup"]);
});

test("public export gate rejects raw records, hidden fields, unsafe HTML and obsolete product shapes", () => {
  const snapshot = normalize({
    blogPosts: [{ _id: "post", slug: "rich", title: "Rich", richContent: richFixture }],
    cmsPages: [{ slug: "guide", title: "Guide", body: "<p>Public.</p>" }],
    products: [{ _id: "product", slug: "item", name: "Item", collectionIds: ["collection"] }],
  });
  assert.doesNotThrow(() => assertPublicSnapshot(snapshot));
  for (const mutate of [
    (copy) => { copy.cms.pages[0].internalNotes = "PRIVATE_FIELD"; },
    (copy) => { copy.blogPosts[0].contentText = { nodes: [{ private: true }] }; },
    (copy) => { delete copy.products[0].collectionIds; },
    (copy) => { copy.cms.pages[0].published = false; },
    (copy) => { copy.blogPosts[0].bodyHtml = '<p onclick="bad()">Unsafe</p>'; },
    (copy) => { copy.blogPosts[0].contentText = "Passcode: PRIVATE_VALUE"; },
  ]) {
    const copy = structuredClone(snapshot);
    mutate(copy);
    assert.throws(() => assertPublicSnapshot(copy), /normalized public export format/);
  }
});

test("stock states, factual empty descriptions and collection membership render with correct nested links", () => {
  const snapshot = normalize({
    products: [
      { _id: "tree", slug: "tree", name: "Tree", stock: { inStock: false }, collectionIds: ["winter"],
        productPageUrl: { base: "https://example.org", path: "/product/tree" } },
      { _id: "art", slug: "art", name: "Art", stock: { inventoryStatus: "IN_STOCK", inStock: false }, collectionIds: ["art"] },
      { _id: "other", slug: "other", name: "Unknown stock", collectionIds: [] },
      { _id: "part", slug: "partial", name: "Options", stock: { inventoryStatus: "PARTIALLY_OUT_OF_STOCK" } },
    ],
    storeCollections: [
      { _id: "art", slug: "art-walk", name: "Art Walk" },
      { _id: "empty", slug: "empty", name: "Empty" },
    ],
  });
  const shop = page(snapshot, "shop").content;
  for (const status of ["Out of stock", "In stock", "Availability not confirmed", "Some options are out of stock"]) assert.ok(shop.includes(status));
  assert.match(shop, /href="\.\.\/product-page\/tree\/"/);
  const tree = page(snapshot, "product-page/tree").content;
  assert.match(tree, /currently out of stock/);
  assert.doesNotMatch(tree, /View availability|data-legacy-transaction/);
  assert.doesNotMatch(tree, /will be posted|soon/);
  const collection = page(snapshot, "category/art-walk").content;
  assert.match(collection, /href="\.\.\/\.\.\/product-page\/art\/"/);
  assert.match(collection, /In stock/);
  assert.doesNotMatch(collection, /product-page\/tree/);
  assert.match(page(snapshot, "category/empty").content, /No public products are currently listed/);
  assert.match(page(normalize({}), "shop").content, /Fallback shop/);
  delete snapshot.products[0].collectionIds;
  assert.match(page(snapshot, "category/empty").content, /product list for this collection is not available here/);
});

test("old plain snapshot fallback remains supported and rich body is sanitized again on rendering", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../src/data/wix-content.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => mergeWixContent(staticPages, snapshot));
  for (const product of snapshot.products.filter((item) => item.availability === "https://schema.org/OutOfStock")) {
    assert.match(page(snapshot, `product-page/${product.slug}`).content, /Out of stock/);
  }
  const fallback = normalize({
    blogPosts: [{ slug: "plain", title: "Plain", contentText: "First complete paragraph.\n\nLast complete paragraph." }],
    events: [{ slug: "plain", title: "Plain", shortDescription: "Existing event summary." }],
  });
  assert.match(page(fallback, "post/plain").content, /<p>First complete paragraph\.<\/p><p>Last complete paragraph\.<\/p>/);
  assert.match(page(fallback, "event-details/plain").content, /Existing event summary/);
  fallback.blogPosts[0].bodyHtml = "<p><strong> </strong></p>";
  assert.match(page(fallback, "post/plain").content, /Last complete paragraph/);
  fallback.blogPosts[0].bodyHtml = '<script>UNSAFE</script><p><a href="javascript:bad()">Safe label</a></p>';
  assert.doesNotMatch(page(fallback, "post/plain").content, /UNSAFE|javascript:/);
});

test("reviewed Welcome Back aliases dedupe before the three-slot limit, without fuzzy/date collisions", () => {
  const start = "2099-09-26T00:30:00.000Z"; // Sep 25, 17:30 in Seattle.
  const end = "2099-09-26T02:30:00.000Z";
  const wix = { slug: "welcome", title: "Montlake Elementary Welcome Back Party!", startAt: start, endAt: end };
  const calendar = [
    { id: "earlier", title: "Earlier event", startAt: "2099-09-24T20:00:00Z" },
    { id: "party", title: "PTA Welcome Back Party", startAt: start, endAt: end },
    { id: "sounders", title: "Montlake @ Sounders Game", startAt: "2099-09-27T00:00:00Z" },
  ];
  const snapshot = normalize({});
  snapshot.events = [wix, {
    slug: "sounders", title: "Join the Montlake PTA at the Seattle Sounders!",
    startAt: calendar[2].startAt,
  }];
  const feed = page(snapshot, "", calendar).homeFeed;
  assert.match(feed, /Sounders/);
  assert.match(feed, /event-details\/welcome/);
  assert.match(feed, /event-details\/sounders/);
  assert.doesNotMatch(feed, />PTA Welcome Back Party</);
  assert.doesNotMatch(feed, />Montlake @ Sounders Game</);
  snapshot.events = [{ ...wix, status: "CANCELED" }];
  assert.doesNotMatch(page(snapshot, "", calendar).homeFeed, /Welcome Back/);
  snapshot.events = [{ ...wix, slug: "superseded-party", status: "CANCELED" }, wix];
  assert.match(page(snapshot, "", calendar).homeFeed, /event-details\/welcome/);
  assert.doesNotMatch(page(snapshot, "", calendar).homeFeed, />PTA Welcome Back Party</);
  snapshot.events = [wix, { ...wix, slug: "another-day", startAt: "2099-09-27T00:30:00Z", endAt: "2099-09-27T02:30:00Z" }];
  assert.equal((page(snapshot, "", []).homeFeed.match(/Montlake Elementary Welcome Back Party!/g) || []).length, 2);
  snapshot.events = [wix];
  assert.match(page(snapshot, "", [{ id: "distinct", title: "PTA Welcome Back Party volunteers", startAt: start }]).homeFeed, /Party volunteers/);
});

test("Unicode and symbol-only mixed-source identities remain distinct", () => {
  const snapshot = normalize({});
  snapshot.events = [
    { slug: "cafe", title: "Café Night", startAt: "2099-01-01T20:00:00Z" },
    { slug: "chinese", title: "家长会", startAt: "2099-01-02T20:00:00Z" },
  ];
  const feed = page(snapshot, "", [
    { id: "cafe", title: "Cafe Night", startAt: "2099-01-01T20:00:00Z" },
    { id: "distinct", title: "家庭日", startAt: "2099-01-02T20:00:00Z" },
  ]).homeFeed;
  assert.equal((feed.match(/Café Night|Cafe Night/g) || []).length, 1);
  assert.match(feed, /家长会/);
  assert.match(feed, /家庭日/);
  snapshot.events = [];
  const symbols = page(snapshot, "", [
    { id: "one", title: "★", startAt: "2099-01-02T20:00:00Z" },
    { id: "two", title: "♥", startAt: "2099-01-02T20:00:00Z" },
  ]).homeFeed;
  assert.match(symbols, /★/);
  assert.match(symbols, /♥/);
});

function builder(pages, onLimit = () => {}) {
  function result(index) {
    return { items: pages[index], hasNext: () => index + 1 < pages.length, next: async () => result(index + 1) };
  }
  return { limit(size) { onLimit(size); return this; }, find: async () => result(0) };
}
function fakeClient() {
  const calls = [];
  const client = {
    posts: { queryPosts(options) { calls.push(["posts", options]); return builder([[]]); } },
    wixEventsV2: { queryEvents(options) { calls.push(["events", options]); return builder([[]]); } },
    storeCollections: { queryCollections: () => builder([[{ _id: "art", slug: "art" }]]) },
    products: { queryProducts() {
      const query = builder([[{ _id: "one", slug: "one" }], [{ _id: "two", slug: "two" }]]);
      query.hasSome = (field, ids) => { calls.push(["membership", field, ids]); return builder([[{ _id: "one" }], [{ _id: "two" }]]); };
      return query;
    } },
    items: { query: () => builder([[]]) },
  };
  return { client, calls };
}
const config = { cms: { boardMembers: "BoardMembers", pages: "WebsitePages" } };

test("SDK queries explicitly exclude drafts, preserve Blog fieldsets, paginate membership and retain IDs", async () => {
  const { client, calls } = fakeClient();
  const result = await readWixContent(client, config);
  assert.deepEqual(calls.find(([name]) => name === "posts")[1].fieldsets, ["URL", "CONTENT_TEXT", "RICH_CONTENT"]);
  assert.equal(calls.find(([name]) => name === "events")[1].includeDrafts, false);
  assert.deepEqual(calls.find(([name]) => name === "membership"), ["membership", "collectionIds", ["art"]]);
  assert.deepEqual(result.products.map((product) => product.collectionIds), [["art"], ["art"]]);
  assert.equal(normalizeWixContent(result).products.length, 2);
  assert.deepEqual(await fetchAll(builder([[{ _id: "a" }], [{ _id: "b" }]])), [{ _id: "a" }, { _id: "b" }]);
});

test("empty queries are valid; malformed/pagination/API failures are not success-shaped empties or raw secret errors", async () => {
  assert.deepEqual(await fetchAll(builder([[]])), []);
  await assert.rejects(fetchAll({ find: async () => ({ hasNext: () => false }) }), /Malformed Wix query response/);
  await assert.rejects(fetchAll({ find: async () => ({ items: [], hasNext: () => true }) }), /Malformed Wix pagination/);
  const { client } = fakeClient();
  client.products.queryProducts = () => {
    const query = builder([[]]);
    query.hasSome = () => ({ limit() { throw new Error("SYNTHETIC_TOKEN https://secret.example/"); } });
    return query;
  };
  await assert.rejects(readWixContent(client, config), (error) => {
    assert.equal(error.message, "Failed to query Store collection membership; sync stopped.");
    assert.equal(error.cause, undefined);
    return true;
  });
  const optional = fakeClient().client;
  const warnings = [];
  optional.items.query = () => { throw { status: 404, message: "SYNTHETIC_MISSING_URL" }; };
  assert.deepEqual((await readWixContent(optional, config, { warn: (message) => warnings.push(message) })).cmsPages, []);
  assert.equal(warnings.length, 2);
  assert.doesNotMatch(warnings.join(" "), /SYNTHETIC_/);
  optional.items.query = () => { throw { status: 403, message: "SYNTHETIC_FORBIDDEN_URL" }; };
  await assert.rejects(readWixContent(optional, config), (error) => {
    assert.match(error.message, /Failed to query CMS/);
    assert.doesNotMatch(error.message, /SYNTHETIC_/);
    assert.equal(error.cause, undefined);
    return true;
  });
});
