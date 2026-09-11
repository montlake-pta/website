import { randomUUID } from "node:crypto";
import { createClient, ApiKeyStrategy } from "@wix/sdk";
import { items } from "@wix/data";
import { products } from "@wix/stores";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export async function probeCollection(api, collectionId, fields, { id = randomUUID(), report = console.log } = {}) {
  const probe = { _id: id, ...fields };
  let inserted = false;
  try {
    const created = await api.insert(collectionId, probe);
    if (created?._id !== id) throw new Error("Unexpected publishing-probe identity.");
    inserted = true;
    report(JSON.stringify({ collectionId, operation: "insert", at: new Date().toISOString() }));
    const changeField = typeof fields.title === "string" ? "title" : "names";
    await api.update(collectionId, { ...created, ...fields, _id: id, [changeField]: `${fields[changeField]} updated` });
    report(JSON.stringify({ collectionId, operation: "update", at: new Date().toISOString() }));
  } finally {
    if (inserted) {
      await api.remove(collectionId, id);
      report(JSON.stringify({ collectionId, operation: "remove", at: new Date().toISOString() }));
    }
  }
}

export async function probeStore(api, collectionId, { name = `publishing-probe-${randomUUID()}`, report = console.log } = {}) {
  let id;
  try {
    const created = await api.createProduct({ name, productType: "physical", visible: false, priceData: { price: 1 } });
    id = created.product?._id;
    if (!id || created.product.visible !== false) throw new Error("Store probe was not confirmed hidden.");
    report(JSON.stringify({ resource: "Stores", operation: "create-hidden-product", at: new Date().toISOString() }));
    await api.updateProduct(id, { name: `${name} updated`, visible: false });
    report(JSON.stringify({ resource: "Stores", operation: "update-hidden-product", at: new Date().toISOString() }));
    await api.addProductsToCollection(collectionId, [id]);
    report(JSON.stringify({ resource: "Stores", operation: "add-hidden-product-to-collection", at: new Date().toISOString() }));
    await api.removeProductsFromCollection(collectionId, [id]);
    report(JSON.stringify({ resource: "Stores", operation: "remove-hidden-product-from-collection", at: new Date().toISOString() }));
  } finally {
    if (id) {
      await api.deleteProduct(id);
      report(JSON.stringify({ resource: "Stores", operation: "delete-hidden-product", at: new Date().toISOString() }));
    }
  }
}

async function main() {
  const { values } = parseArgs({ options: { "include-store": { type: "boolean", default: false } } });
  if (!process.env.WIX_API_KEY) throw new Error("WIX_API_KEY is required for the manual publishing probe.");
  const config = JSON.parse(await readFile(join(root, "src/wix.config.json"), "utf8"));
  const client = createClient({
    modules: { items, products },
    auth: ApiKeyStrategy({ apiKey: process.env.WIX_API_KEY, siteId: process.env.WIX_SITE_ID || config.siteId }),
  });
  const marker = `publishing-probe-${randomUUID()}`;
  await probeCollection(client.items, config.cms.pages, {
    slug: marker, title: "Unpublished publishing probe", description: marker,
    body: "<p>Temporary unpublished integration probe.</p>", published: false,
  });
  await probeCollection(client.items, config.cms.boardMembers, {
    role: marker, names: "Inactive publishing probe", active: false, displayOrder: 9999,
  });
  if (values["include-store"]) {
    const snapshot = JSON.parse(await readFile(join(root, "src/data/wix-content.json"), "utf8"));
    const collection = snapshot.storeCollections.find(item => item.slug === "2026-art-walk");
    if (!collection?.id) throw new Error("The reviewed public collection is unavailable for the hidden-product probe.");
    await probeStore(client.products, collection.id);
  }
  console.log("Temporary probes were removed. Inspect Wix notifications and GitHub runs to establish end-to-end delivery.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Publishing probe failed. Inspect the two CMS collections for temporary publishing-probe records before retrying; no raw SDK error is logged.");
    process.exitCode = 1;
  });
}
