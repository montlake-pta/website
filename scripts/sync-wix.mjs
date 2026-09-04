import { createClient, ApiKeyStrategy } from "@wix/sdk";
import { posts } from "@wix/blog";
import { items } from "@wix/data";
import { wixEventsV2 } from "@wix/events";
import { collections as storeCollections, products } from "@wix/stores";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(await readFile(join(root, "src", "wix.config.json"), "utf8"));
const output = join(root, "src", "data", "wix-content.json");
const apiKey = process.env.WIX_API_KEY;
const siteId = process.env.WIX_SITE_ID || config.siteId;

if (!apiKey) throw new Error("WIX_API_KEY is required for an authenticated content sync.");
if (!siteId) throw new Error("WIX_SITE_ID is required for an authenticated content sync.");

const client = createClient({
  modules: { posts, items, wixEventsV2, products, storeCollections },
  auth: ApiKeyStrategy({ apiKey, siteId }),
});

const [blogPosts, events, storeProducts, collections, boardMembers, cmsPages] = await Promise.all([
  fetchAll(client.posts.queryPosts({ fieldsets: ["URL", "CONTENT_TEXT", "RICH_CONTENT"] }).limit(100)),
  fetchAll(client.wixEventsV2.queryEvents({ fields: ["DETAILS", "TEXTS", "URLS"] }).limit(100)),
  fetchAll(client.products.queryProducts().limit(100)),
  fetchAll(client.storeCollections.queryCollections().limit(100)),
  queryCmsCollection(config.cms.boardMembers),
  queryCmsCollection(config.cms.pages),
]);

const snapshot = {
  schemaVersion: 1,
  source: "wix-headless",
  syncedAt: new Date().toISOString(),
  cms: {
    boardMembers: boardMembers.map(normalizeCmsItem),
    pages: cmsPages.map(normalizeCmsItem),
  },
  blogPosts: blogPosts.map(normalizeBlogPost),
  events: events.map(normalizeEvent),
  products: storeProducts.filter((product) => product.visible !== false).map(normalizeProduct),
  storeCollections: collections.map(normalizeCollection),
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(
  `Synced ${snapshot.blogPosts.length} posts, ${snapshot.events.length} events, ` +
  `${snapshot.products.length} products, ${snapshot.cms.boardMembers.length} board members, ` +
  `and ${snapshot.cms.pages.length} CMS pages.`,
);

async function queryCmsCollection(collectionId) {
  if (!collectionId) return [];
  try {
    return await fetchAll(client.items.query(collectionId).limit(1000));
  } catch (error) {
    if (isMissingCollection(error)) {
      console.warn(`CMS collection ${collectionId} does not exist yet; skipping it.`);
      return [];
    }
    throw new Error(`Failed to query CMS collection ${collectionId}: ${error.message}`, { cause: error });
  }
}

async function fetchAll(builder) {
  const allItems = [];
  let result = await builder.find();
  allItems.push(...(result.items || []));
  while (result.hasNext()) {
    result = await result.next();
    allItems.push(...(result.items || []));
  }
  return allItems;
}

function normalizeBlogPost(post) {
  return {
    id: post._id,
    slug: normalizeSlug(post.slug),
    title: post.title,
    excerpt: post.excerpt || excerpt(post.contentText),
    contentText: post.contentText || "",
    publishedAt: toIso(post.firstPublishedDate),
    updatedAt: toIso(post.lastPublishedDate),
    image: wixMediaUrl(post.media?.wixMedia?.image || post.heroImage),
    sourceUrl: post.url || null,
  };
}

function normalizeEvent(event) {
  return {
    id: event._id,
    slug: normalizeSlug(event.slug),
    title: event.title,
    summary: event.shortDescription || richContentText(event.description),
    descriptionText: richContentText(event.description) || event.shortDescription || "",
    startAt: toIso(event.dateAndTimeSettings?.startDate),
    endAt: toIso(event.dateAndTimeSettings?.endDate),
    location: event.location?.name || "",
    address: formatAddress(event.location?.address),
    image: wixMediaUrl(event.mainImage),
    status: event.status || null,
    sourceUrl: event.eventPageUrl || null,
  };
}

function normalizeProduct(product) {
  return {
    id: product._id,
    slug: normalizeSlug(product.slug),
    name: product.name,
    description: stripHtml(product.description || ""),
    price: product.priceData?.discountedPrice ?? product.priceData?.price ?? null,
    currency: product.priceData?.currency || "USD",
    availability: product.stock?.inStock === false ? "OutOfStock" : "InStock",
    image: wixMediaUrl(product.media?.mainMedia?.image?.url),
    visible: product.visible !== false,
    sourceUrl: pageUrl(product.productPageUrl),
  };
}

function normalizeCollection(collection) {
  return {
    id: collection._id,
    slug: normalizeSlug(collection.slug),
    name: collection.name,
    image: wixMediaUrl(collection.media?.mainMedia?.image?.url),
    sourceUrl: null,
  };
}

function normalizeCmsItem(item) {
  return item.data && typeof item.data === "object" ? item.data : item;
}

function richContentText(content) {
  const values = [];
  walk(content?.nodes);
  return values.join("\n\n");

  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (node.textData?.text) values.push(node.textData.text);
      walk(node.nodes);
    }
  }
}

function wixMediaUrl(value) {
  if (!value || typeof value !== "string") return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const match = value.match(/^wix:image:\/\/v1\/([^/]+)/);
  return match ? `https://static.wixstatic.com/media/${match[1]}` : null;
}

function formatAddress(address) {
  if (!address) return "";
  return [
    address.addressLine1 || address.streetAddress?.name,
    address.city,
    address.subdivision,
    address.postalCode,
  ].filter(Boolean).join(", ");
}

function pageUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.base && value.path ? new URL(value.path, value.base).href : null;
}

function excerpt(value, maxLength = 220) {
  if (!value) return "";
  return value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}…`;
}

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function normalizeSlug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isMissingCollection(error) {
  const code = error?.details?.applicationError?.code || error?.code;
  const status = error?.response?.status || error?.status;
  return status === 404 || ["WDE0025", "COLLECTION_NOT_FOUND"].includes(code);
}
