import assert from "node:assert/strict";
import test from "node:test";
import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import { textContent } from "domutils";
import { mergeWixContent } from "./render-wix-content.mjs";
import { visitorConfiguration } from "./visitor-config.mjs";
import { preserveRetiredProductRoutes } from "../src/site.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const empty = { schemaVersion: 1, blogPosts: [], events: [], products: [], storeCollections: [], cms: { pages: [], boardMembers: [] } };
const future = { id, slug: "future", title: "Future event", startAt: "2099-01-01T10:00:00Z", endAt: "2099-01-01T12:00:00Z", sourceUrl: "https://www.montlakepta.org/event-details/future" };

function eventContent(event, enabled) {
  return mergeWixContent([], { ...empty, events: [event] }, [], { transactionsEnabled: enabled })
    .find((page) => page.slug === `event-details/${event.slug}`).content;
}

test("active event interactions are gated without removing the working registration fallback", () => {
  const staged = eventContent(future, false);
  assert.match(staged, /data-legacy-transaction="true"/);
  assert.match(staged, /https:\/\/www\.montlakepta\.org\/event-details\/future/);
  const enabled = eventContent(future, true);
  assert.match(enabled, /data-wix-event-id="11111111/);
  assert.doesNotMatch(enabled, /data-legacy-transaction|href="https:\/\/www\.montlakepta\.org/);
  assert.match(enabled, /<noscript>/);
});

test("ended and canceled events have no registration handoff; external tickets go directly to the provider", () => {
  for (const event of [{ ...future, status: "CANCELED" }, { ...future, endAt: "2000-01-01T12:00:00Z" }]) {
    assert.doesNotMatch(eventContent(event, true), /data-wix-event-id|data-legacy-transaction/);
  }
  const external = eventContent({ ...future, descriptionText: "Tickets: https://www.gofevo.com/event/montlakeelementary2" }, false);
  assert.match(external, /href="https:\/\/www\.gofevo\.com\/event\/montlakeelementary2"/);
  assert.doesNotMatch(external, /data-legacy-transaction/);
  const summaryLink = eventContent({ ...future, summary: "Tickets: https://www.gofevo.com/event/montlakeelementary2", descriptionText: "Full event information and FAQs." }, false);
  assert.match(summaryLink, /Get tickets with FEVO/);
  const lookalike = eventContent({ ...future, descriptionText: "https://www.gofevo.com.evil.example/event/x" }, false);
  assert.doesNotMatch(lookalike, /Get tickets with FEVO/);
});

test("sold-out product displays do not send visitors to the retired frontend", () => {
  const snapshot = { ...empty, products: [{ id, slug: "sold-out", name: "Past item", price: 25, currency: "USD", availability: "OutOfStock", sourceUrl: "https://www.montlakepta.org/product-page/sold-out" }] };
  const staged = mergeWixContent([], snapshot, [], { transactionsEnabled: false })[0].content;
  assert.match(staged, /Out of stock/);
  assert.doesNotMatch(staged, /data-legacy-transaction|href="https:\/\/www\.montlakepta\.org/);
  const enabled = mergeWixContent([], snapshot, [], { transactionsEnabled: true })[0].content;
  assert.match(enabled, /data-wix-product-id/);
  assert.match(enabled, /<noscript>/);
});

test("visitor configuration cannot activate without a real-shaped public client ID", () => {
  const missing = { enabled: false, clientId: "" };
  assert.equal(visitorConfiguration({}, missing).enabled, false);
  assert.throws(() => visitorConfiguration({ WIX_HEADLESS_ENABLED: "true" }, missing), /public Wix Headless client ID/);
  assert.throws(() => visitorConfiguration({}, { enabled: false, clientId: "not-a-public-client-id" }), /public Wix Headless client ID/);
  assert.equal(visitorConfiguration({}, { enabled: true, clientId: id }).enabled, true);
  assert.throws(() => visitorConfiguration({ WIX_HEADLESS_ENABLED: "yes" }), /true or false/);
  const config = visitorConfiguration({ WIX_HEADLESS_ENABLED: "true", WIX_HEADLESS_READ_ONLY: "false", WIX_HEADLESS_CLIENT_ID: id, WIX_API_KEY: "NEVER_EXPORT" });
  assert.equal(config.enabled, true);
  assert.doesNotMatch(JSON.stringify(config), /NEVER_EXPORT|WIX_API_KEY/);
});

test("read-only configuration requires a client, accepts explicit overrides, and rejects conflicting modes", () => {
  const missing = { enabled: false, readOnly: false, clientId: "" };
  assert.throws(() => visitorConfiguration({ WIX_HEADLESS_READ_ONLY: "true" }, missing), /public Wix Headless client ID/);
  assert.throws(() => visitorConfiguration({ WIX_HEADLESS_READ_ONLY: "yes" }, missing), /true or false/);
  assert.throws(() => visitorConfiguration({}, { enabled: true, readOnly: true, clientId: id }), /not both/);
  const readOnly = visitorConfiguration({ WIX_HEADLESS_READ_ONLY: "true", WIX_HEADLESS_CLIENT_ID: id }, missing);
  assert.equal(readOnly.enabled, false);
  assert.equal(readOnly.readOnly, true);
  assert.equal(visitorConfiguration({ WIX_HEADLESS_READ_ONLY: "false" }, { ...missing, readOnly: true, clientId: id }).readOnly, false);
  assert.equal(visitorConfiguration({}, { ...missing, readOnly: true, clientId: id }).readOnly, true);
});

test("read-only event slots preserve existing marked registration links and useful no-JavaScript guidance", () => {
  const html = mergeWixContent([], { ...empty, events: [future] }, [], { transactionsEnabled: false, readOnly: true })[0].content;
  const doc = parseDocument(html);
  assert.equal(selectAll("[data-wix-event-id]", doc).length, 1);
  assert.equal(selectAll("[data-legacy-transaction]", doc).length, 1);
  assert.equal(selectOne("[data-legacy-transaction]", doc).attribs.href, future.sourceUrl);
  assert.match(textContent(selectOne("noscript", doc)), /Published details and links remain available/);
  assert.equal(selectAll("form,input,select,textarea,button", doc).length, 0);
  assert.doesNotMatch(html, /data-transaction-loading/);
});

test("read-only product slots keep visible SSR metadata, descriptions and existing availability links", () => {
  const product = {
    id, slug: "school-shirt", name: "School shirt", price: 25, currency: "USD", availability: "InStock",
    description: "Keep this authored description.", sourceUrl: "https://www.montlakepta.org/product-page/school-shirt",
  };
  const html = mergeWixContent([], { ...empty, products: [product] }, [], { transactionsEnabled: false, readOnly: true })[0].content;
  const doc = parseDocument(html);
  const metadata = selectOne("[data-wix-product-metadata]", doc);
  assert.ok(metadata);
  assert.equal(selectAll(".product-price", doc).length, 1);
  assert.match(textContent(metadata), /25/);
  assert.equal(selectOne("noscript .product-price", doc), null, "SSR prices remain readable when JavaScript is disabled or fails");
  assert.equal(selectOne("[data-legacy-transaction]", doc).attribs.href, product.sourceUrl);
  assert.match(textContent(selectOne(".article-body", doc)), /Keep this authored description/);
  assert.equal(selectAll("form,input,select,textarea,button", doc).length, 0);
});
test("retired restricted-fund items get truthful pages without overriding a reactivated product", () => {
  const live = { slug: "product-page/islandwood-donation", content: "Active product" };
  const result = preserveRetiredProductRoutes([live]);
  assert.equal(result.length, 2);
  assert.equal(result.find((page) => page.slug === live.slug), live);
  const retired = result.find((page) => page.slug.endsWith("islandwood-bake-sale"));
  assert.match(retired.content, /not automatically designated for Islandwood/);
  assert.doesNotMatch(retired.content, /paypal\.com|montlakepta\.org\/product-page/);
});
