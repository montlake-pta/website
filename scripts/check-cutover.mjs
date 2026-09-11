import { readFile, readdir, access } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseDocument } from "htmlparser2";
import { selectAll } from "css-select";
import { createClient, OAuthStrategy } from "@wix/sdk";
import { products } from "@wix/stores";
import { wixEventsV2 } from "@wix/events";
import { visitorConfiguration } from "./visitor-config.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const retiredHosts = new Set(["www.montlakepta.org", "montlakepta.org"]);

export function cutoverRequested(config, env = process.env) {
  return Boolean(config.enabled || env.SITE_URL || retiredHosts.has(new URL(config.baseUrl).hostname));
}

export function cutoverLinkProblems(html, pageUrl, baseUrl) {
  const doc = parseDocument(html);
  const ownOrigin = new URL(baseUrl).origin;
  const problems = [];
  for (const node of selectAll("a[href],form[action],img[src],iframe[src],script[src],link[href]", doc)) {
    const value = node.attribs.href || node.attribs.action || node.attribs.src;
    if (node.attribs["data-legacy-transaction"] === "true") {
      problems.push("A visitor transaction still uses the legacy frontend");
      continue;
    }
    let url;
    try { url = new URL(value, pageUrl); }
    catch { problems.push("An invalid navigation or asset URL remains"); continue; }
    if (["https:", "http:"].includes(url.protocol) && retiredHosts.has(url.hostname) && url.origin !== ownOrigin) {
      problems.push(`Retiring frontend dependency: ${url.pathname}`);
    }
  }
  return problems;
}

export async function verifyVisitorAccess(config, snapshot) {
  const client = createClient({
    modules: { products, wixEventsV2 },
    auth: OAuthStrategy({ clientId: config.clientId, siteId: config.siteId }),
  });
  try {
    const catalog = await client.products.queryProducts().limit(10).find();
    const events = await client.wixEventsV2.queryEvents({ fields: ["DETAILS"], includeDrafts: false }).limit(10).find();
    if (!Array.isArray(catalog.items) || !Array.isArray(events.items)) throw new Error("Invalid response");
    for (const [actual, expected] of [[catalog.items, snapshot.products], [events.items, snapshot.events]]) {
      if (expected.length && !actual.some((item) => expected.some((record) => record.id === item._id))) {
        throw new Error("No matching public records");
      }
    }
  } catch {
    throw new Error("Visitor access could not be verified for this site's catalog and events. Check the public client ID, site and API permissions.");
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    offline: { type: "boolean", default: false },
    "if-enabled": { type: "boolean", default: false },
  } });
  const config = visitorConfiguration();
  if (values["if-enabled"] && !cutoverRequested(config)) {
    console.log("Visitor cutover is not activated. The strict readiness check remains pending; legacy transaction fallbacks are not retirement approval.");
    return;
  }
  const failures = [];
  if (!config.enabled) failures.push("Wix visitor transactions are not enabled; issue #4 must be resolved before retiring the old frontend.");
  if (!config.clientId) failures.push("A public Wix Headless client ID is not configured.");
  const output = join(root, "dist");
  for (const file of await htmlFiles(output)) {
    const path = relative(output, file).split("/").map(encodeURIComponent).join("/");
    for (const problem of cutoverLinkProblems(await readFile(file, "utf8"), new URL(path, config.baseUrl).href, config.baseUrl)) {
      failures.push(`${relative(output, file)}: ${problem}`);
    }
  }
  for (const file of [
    "assets/documents/enrichment-positive-behavior-support-plan.pdf",
    "assets/documents/enrichment-pickup-map.pdf",
    ...(config.enabled ? ["cart/index.html", "checkout/complete/index.html", "transactions.js"] : []),
  ]) {
    try { await access(join(output, file)); }
    catch { failures.push(`Missing cutover resource: ${file}`); }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  if (!values.offline) {
    await verifyVisitorAccess(config, JSON.parse(await readFile(join(root, "src/data/wix-content.json"), "utf8")));
  }
  console.log(values.offline
    ? "Static cutover checks passed; live visitor access and checkout are not certified by this offline run."
    : "Retired-frontend link checks and live visitor catalog/event access passed. Verify real checkout and RSVP flows before DNS changes.");
}

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
