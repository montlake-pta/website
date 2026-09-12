import { createClient, ApiKeyStrategy } from "@wix/sdk";
import { posts } from "@wix/blog";
import { items } from "@wix/data";
import { wixEventsV2 } from "@wix/events";
import { collections as storeCollections, products } from "@wix/stores";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPublicSnapshot, normalizeWixContent, WixContentError } from "./normalize-wix-content.mjs";
import { pageCollectionDefinitions } from "./page-collections.mjs";
import { excludeValidationFixtures, ValidationFixtureError } from "./validation-fixtures.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export async function readWixContent(client, config, { warn = console.warn } = {}) {
  const pageSource = config.cms.pageSource || "legacy";
  if (!["legacy", "typed"].includes(pageSource)) throw new WixContentError("Unknown CMS page source configuration.");
  const [blogPosts, events, storeProducts, collections, boardMembers, pageData] = await Promise.all([
    query(() => client.posts.queryPosts({ fieldsets: ["URL", "CONTENT_TEXT", "RICH_CONTENT"] }).limit(100), "Blog posts"),
    query(() => client.wixEventsV2.queryEvents({ fields: ["DETAILS", "TEXTS", "URLS"], includeDrafts: false }).limit(100), "Events"),
    query(() => client.products.queryProducts().limit(100), "Store products"),
    query(() => client.storeCollections.queryCollections().limit(100), "Store collections"),
    queryCmsCollection(config.cms.boardMembers, "board members"),
    pageSource === "legacy"
      ? queryCmsCollection(config.cms.legacyPages || config.cms.pages, "legacy website pages").then(cmsPages => ({ cmsPages }))
      : readTypedPages(),
  ]);

  // Stores v1 Product.collectionIds is string[]. The installed SDK supports
  // hasSome('collectionIds', ids), not eq(). Query membership explicitly, even
  // when an unfiltered response omits collectionIds. All queries are paginated.
  const membership = new Map();
  for (const collection of collections.filter((item) => item.visible !== false)) {
    if (typeof collection._id !== "string" || !collection._id) {
      throw new WixContentError("Store collection is missing its membership ID; sync stopped.");
    }
    const members = await query(
      () => client.products.queryProducts().hasSome("collectionIds", [collection._id]).limit(100),
      "Store collection membership",
    );
    for (const product of members) {
      if (typeof product._id !== "string" || !product._id) {
        throw new WixContentError("Collection product is missing its ID; sync stopped.");
      }
      const ids = membership.get(product._id) || [];
      ids.push(collection._id);
      membership.set(product._id, ids);
    }
  }
  return {
    blogPosts, events: excludeValidationFixtures("events", events, config.validationFixtures?.events, warn),
    boardMembers, ...pageData, storeCollections: collections,
    products: excludeValidationFixtures("products", storeProducts, config.validationFixtures?.products, warn).map((product) => ({
      ...product, collectionIds: membership.get(product._id) || [],
    })),
  };

  async function readTypedPages() {
    const groups = await Promise.all(pageCollectionDefinitions.map(async ({ configKey, id }) =>
      [configKey, await queryCmsCollection(config.cms[configKey], id, true)]));
    return { pageSource: "typed", ...Object.fromEntries(groups) };
  }

  async function queryCmsCollection(collectionId, label, required = false) {
    if (!collectionId) {
      if (required) throw new WixContentError(`Missing configured CMS collection: ${label}.`);
      return [];
    }
    try {
      return await fetchAll(client.items.query(collectionId).limit(1000), { consistentRead: true, showDrafts: false });
    } catch (error) {
      if (!required && isMissingCollection(error)) {
        warn(`Optional CMS collection for ${label} does not exist; skipping it.`);
        return [];
      }
      throw new WixContentError(`Failed to query CMS ${label}; sync stopped.`);
    }
  }
}

async function query(builder, label) {
  try { return await fetchAll(builder()); }
  catch { throw new WixContentError(`Failed to query ${label}; sync stopped.`); }
}

export async function fetchAll(builder, options) {
  const allItems = [];
  let result = await builder.find(options);
  while (true) {
    if (!Array.isArray(result?.items) || typeof result.hasNext !== "function"
      || result.items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
      throw new WixContentError("Malformed Wix query response; sync stopped.");
    }
    allItems.push(...result.items);
    if (!result.hasNext()) return allItems;
    if (typeof result.next !== "function") throw new WixContentError("Malformed Wix pagination; sync stopped.");
    result = await result.next();
  }
}

function isMissingCollection(error) {
  const code = error?.details?.applicationError?.code || error?.code;
  const status = error?.response?.status || error?.status;
  return status === 404 || ["WDE0025", "COLLECTION_NOT_FOUND"].includes(code);
}

async function main() {
  const config = JSON.parse(await readFile(join(root, "src", "wix.config.json"), "utf8"));
  const apiKey = process.env.WIX_API_KEY;
  const siteId = process.env.WIX_SITE_ID || config.siteId;
  if (!apiKey) throw new WixContentError("WIX_API_KEY is required for an authenticated content sync.");
  if (!siteId) throw new WixContentError("WIX_SITE_ID is required for an authenticated content sync.");
  const client = createClient({
    modules: { posts, items, wixEventsV2, products, storeCollections },
    auth: ApiKeyStrategy({ apiKey, siteId }),
  });
  const snapshot = normalizeWixContent(await readWixContent(client, config));
  assertPublicSnapshot(snapshot);
  const output = join(root, "src", "data", "wix-content.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Synced ${snapshot.blogPosts.length} posts, ${snapshot.events.length} events, ` +
    `${snapshot.products.length} products, ${snapshot.cms.boardMembers.length} board members, ` +
    `and ${snapshot.cms.pages.length} CMS pages.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // SDK errors can contain headers, request URLs, or signed destinations.
  // Neither raw messages nor error causes may reach the public Actions log.
  main().catch((error) => {
    console.error(error instanceof WixContentError || error instanceof ValidationFixtureError ? error.message
      : "Wix content sync failed. Check credentials, permissions, response validity, and collection configuration.");
    process.exitCode = 1;
  });
}
