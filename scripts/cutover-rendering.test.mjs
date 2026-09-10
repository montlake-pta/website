import assert from "node:assert/strict";
import test from "node:test";
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
  assert.throws(() => visitorConfiguration({ WIX_HEADLESS_ENABLED: "yes" }), /true or false/);
  const config = visitorConfiguration({ WIX_HEADLESS_ENABLED: "true", WIX_HEADLESS_CLIENT_ID: id, WIX_API_KEY: "NEVER_EXPORT" });
  assert.equal(config.enabled, true);
  assert.doesNotMatch(JSON.stringify(config), /NEVER_EXPORT|WIX_API_KEY/);
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
