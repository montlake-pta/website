import { fundraisingFieldDefinitions } from "./fundraising-fields.mjs";

export class PageCollectionError extends Error {}

const field = (key, displayName, type = "TEXT") => ({ key, displayName, type });
const headers = [
  field("slug", "Page URL slug"), field("title", "Page title"),
  field("heading", "Page heading"), field("description", "Page description"),
];
const published = field("published", "Use this page content", "BOOLEAN");
const body = field("body", "Page content", "RICH_TEXT");
const accent = field("accent", "Page tone (coral, blue, yellow)");

export const pageCollectionDefinitions = [
  { type: "common", configKey: "commonPages", id: "CommonPages", displayName: "CommonPages",
    fields: [...headers, accent, body, published] },
  { type: "fundraising", configKey: "fundraisingPages", id: "FundraisingPages", displayName: "FundraisingPages",
    fields: [...headers, body, published, ...fundraisingFieldDefinitions] },
  { type: "generated", configKey: "generatedPages", id: "GeneratedPages", displayName: "GeneratedPages",
    fields: [...headers, accent, published] },
];

export const generatedPageSlugs = ["blog", "event-list", "shop", "pta-board", "newsletter"];
export const fundraisingPageSlugs = ["donate", "annual-fund", "spring-auction"];
export const legacyPageCollectionId = "WebsitePages";
export const legacyPageCollectionLabel = "Legacy WebsitePages (not published)";

export function normalizePageSlug(value) {
  if (typeof value !== "string" || /[\\?#%]/.test(value)) return "";
  const parts = value.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) return "";
  const normalized = parts.map(part => part.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replaceAll("&", " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  return normalized.every(Boolean) ? normalized.join("/") : "";
}

// Used only for migration/old snapshots. Live typed records take their type
// from the collection, never from a row's campaign status or arbitrary fields.
export function legacyPageType(record) {
  const slug = normalizePageSlug(record.slug);
  if (generatedPageSlugs.includes(slug)) return "generated";
  return fundraisingPageSlugs.includes(slug) || Boolean(record.campaignStatus) ? "fundraising" : "common";
}

export function pageFieldsForType(type) {
  const definition = pageCollectionDefinitions.find(value => value.type === type);
  if (!definition) throw new PageCollectionError("Unknown CMS page collection type.");
  return definition.fields.map(value => value.key);
}

export function validatePagePlacement(type, slug) {
  if (!slug || normalizePageSlug(slug) !== slug
    || /^(?:post|event-details|product-page|category|newsletter)\//.test(slug)
    || ["404", "cart", "checkout/complete"].includes(slug)) {
    throw new PageCollectionError("CMS page has an invalid or reserved route.");
  }
  pageFieldsForType(type);
  if ((type === "generated") !== generatedPageSlugs.includes(slug)
    || (type !== "fundraising" && fundraisingPageSlugs.includes(slug))) {
    throw new PageCollectionError("CMS page belongs in a different page collection.");
  }
}

export function projectLegacyPage(record) {
  const type = legacyPageType(record);
  const slug = normalizePageSlug(record.slug);
  validatePagePlacement(type, slug);
  const data = Object.fromEntries(pageFieldsForType(type).filter(key => Object.hasOwn(record, key))
    .map(key => [key, structuredClone(record[key])]));
  return { type, data: { ...data, slug, published: record.published !== false } };
}
