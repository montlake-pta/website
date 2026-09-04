import { createClient, ApiKeyStrategy } from "@wix/sdk";
import { collections, items } from "@wix/data";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { boardMembers } from "../src/data/cms-seed.mjs";
import { pages } from "../src/site.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = JSON.parse(await readFile(join(root, "src", "wix.config.json"), "utf8"));
const apiKey = process.env.WIX_API_KEY;
const siteId = process.env.WIX_SITE_ID || config.siteId;

if (!apiKey) throw new Error("WIX_API_KEY is required to create and seed CMS collections.");
if (!siteId) throw new Error("WIX_SITE_ID is required to create and seed CMS collections.");

const client = createClient({
  modules: { collections, items },
  auth: ApiKeyStrategy({ apiKey, siteId }),
});

await ensureCollection({
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

await ensureCollection({
  id: config.cms.pages,
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
  ],
  seed: pages
    .filter((page) => !page.home)
    .map(({ slug, title, heading, kicker, description, accent, content }) => ({
      slug,
      title,
      heading: heading || title,
      kicker: kicker || "Montlake PTA",
      description,
      accent: accent || "",
      body: content,
      published: true,
    })),
  keyOf: (item) => item.slug,
});

async function ensureCollection(definition) {
  let exists = true;
  try {
    await client.collections.getDataCollection(definition.id);
  } catch (error) {
    if (!isMissingCollection(error)) throw error;
    exists = false;
  }

  if (!exists) {
    await client.collections.createDataCollection({
      _id: definition.id,
      displayName: definition.displayName,
      fields: definition.fields,
      permissions: { insert: "ADMIN", update: "ADMIN", remove: "ADMIN", read: "ANYONE" },
    });
    console.log(`Created ${definition.displayName} (${definition.id})`);
  }

  const existing = await fetchAll(client.items.query(definition.id).limit(1000));
  const existingKeys = new Set(existing.map(definition.keyOf));
  const missing = definition.seed.filter((item) => !existingKeys.has(definition.keyOf(item)));
  for (const item of missing) await client.items.insert(definition.id, item);
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
  let result = await builder.find();
  allItems.push(...(result.items || []));
  while (result.hasNext()) {
    result = await result.next();
    allItems.push(...(result.items || []));
  }
  return allItems;
}

function isMissingCollection(error) {
  const code = error?.details?.applicationError?.code || error?.code;
  const status = error?.response?.status || error?.status;
  return status === 404 || ["WDE0025", "COLLECTION_NOT_FOUND"].includes(code);
}
