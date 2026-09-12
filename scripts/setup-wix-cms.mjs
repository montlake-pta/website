import { createClient, ApiKeyStrategy } from "@wix/sdk";
import { collections, items } from "@wix/data";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { boardMembers } from "../src/data/cms-seed.mjs";
import { pages } from "../src/site.mjs";
import { fundraisingFieldDefinitions, normalizeFundraisingFields } from "./fundraising-fields.mjs";
import { publicHtml, publicText, wixMediaUrl } from "./wix-public-content.mjs";
import { pageCollectionDefinitions, projectLegacyPage } from "./page-collections.mjs";
import { normalizeTypedPage } from "./normalize-wix-content.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { values } = parseArgs({ options: { page: { type: "string" } } });
const seedPages = pages.filter((page) => !page.home && (!values.page || page.slug === values.page));
if (values.page && seedPages.length !== 1) throw new Error("The selected --page must identify exactly one static fallback page.");
const config = JSON.parse(await readFile(join(root, "src", "wix.config.json"), "utf8"));
if (!["legacy", "typed"].includes(config.cms.pageSource || "legacy")) throw new Error("Unknown CMS page source configuration.");
const apiKey = process.env.WIX_API_KEY;
const siteId = process.env.WIX_SITE_ID || config.siteId;

if (!apiKey) throw new Error("WIX_API_KEY is required to create and seed CMS collections.");
if (!siteId) throw new Error("WIX_SITE_ID is required to create and seed CMS collections.");

const client = createClient({
  modules: { collections, items },
  auth: ApiKeyStrategy({ apiKey, siteId }),
});

if (!values.page) await ensureCollection({
  id: config.cms.boardMembers,
  displayName: "Board Members",
  fields: [
    field("schoolYear", "School Year", "TEXT"),
    field("role", "Role", "TEXT"),
    field("names", "Names", "TEXT"),
    field("email", "Email", "EMAIL"),
    field("displayOrder", "Display Order", "NUMBER"),
    field("active", "Active", "BOOLEAN"),
  ],
  seed: boardMembers,
  keyOf: (item) => `${item.schoolYear}:${item.role}`,
});

if (config.cms.pageSource === "typed") {
  const projected = seedPages.map(page => projectLegacyPage({ ...page, body: page.content }));
  for (const definition of pageCollectionDefinitions) {
    const selected = projected.filter(page => page.type === definition.type);
    if (values.page && !selected.length) continue;
    if (!config.cms[definition.configKey]) throw new Error("Missing typed CMS collection configuration.");
    await ensureCollection({
      id: config.cms[definition.configKey], displayName: definition.displayName, fields: definition.fields,
      seed: selected.map(({ data, type }) => {
        const { pageType, ...record } = normalizeTypedPage(data, type);
        return record;
      }),
      keyOf: item => item.slug,
    });
  }
} else await ensureCollection({
  id: config.cms.legacyPages || config.cms.pages,
  displayName: "Website Pages",
  fields: [
    field("slug", "Slug", "TEXT"),
    field("title", "Title", "TEXT"),
    field("heading", "Heading", "TEXT"),
    field("kicker", "Kicker", "TEXT"),
    field("description", "Description", "TEXT"),
    field("accent", "Accent", "TEXT"),
    field("body", "Body", "RICH_TEXT"),
    field("published", "Published", "BOOLEAN"),
    ...fundraisingFieldDefinitions,
  ],
  seed: seedPages
    .map((page) => ({
      slug: page.slug,
      title: page.title,
      heading: page.heading || page.title,
      kicker: page.kicker || "Montlake PTA",
      description: page.description,
      accent: page.accent || "",
      body: page.content,
      published: true,
      ...normalizeFundraisingFields(page, { html: publicHtml, text: publicText, image: wixMediaUrl }),
    })),
  keyOf: (item) => item.slug,
});

async function ensureCollection(definition) {
  let exists = true;
  try {
    await client.collections.getDataCollection(definition.id);
  } catch (error) {
    if (!isMissingCollection(error)) throw new Error("CMS collection lookup failed; check access and configuration.");
    exists = false;
  }

  if (!exists) {
    try {
      await client.collections.createDataCollection({
        _id: definition.id,
        displayName: definition.displayName,
        fields: definition.fields,
        permissions: { insert: "ADMIN", update: "ADMIN", remove: "ADMIN", read: "ANYONE" },
      });
    } catch {
      throw new Error("CMS collection creation failed; raw SDK details are not logged.");
    }
    console.log(`Created ${definition.displayName} (${definition.id})`);
  }

  const existing = await fetchAll(client.items.query(definition.id).limit(1000));
  const existingKeys = new Set(existing.map(definition.keyOf));
  const missing = definition.seed.filter((item) => !existingKeys.has(definition.keyOf(item)));
  for (const item of missing) {
    try { await client.items.insert(definition.id, item); }
    catch { throw new Error("CMS seed insertion failed; inspect the collection before retrying. Existing rows were not updated."); }
  }
  console.log(
    missing.length
      ? `Seeded ${missing.length} missing rows in ${definition.displayName}.`
      : `${definition.displayName} already contains all seed records.`,
  );
}

function field(key, displayName, type) {
  return { key, displayName, type };
}

async function fetchAll(builder) {
  const allItems = [];
  let result;
  try { result = await builder.find({ consistentRead: true }); }
  catch { throw new Error("CMS seed query failed; no incomplete data will be used."); }
  if (!Array.isArray(result.items)) throw new Error("CMS seed query returned invalid data.");
  allItems.push(...result.items);
  while (result.hasNext()) {
    try { result = await result.next(); }
    catch { throw new Error("CMS seed pagination failed; no incomplete data will be used."); }
    if (!Array.isArray(result.items)) throw new Error("CMS seed query returned invalid data.");
    allItems.push(...result.items);
  }
  return allItems;
}

function isMissingCollection(error) {
  const code = error?.details?.applicationError?.code || error?.code;
  const status = error?.response?.status || error?.status;
  return status === 404 || ["WDE0025", "COLLECTION_NOT_FOUND"].includes(code);
}
