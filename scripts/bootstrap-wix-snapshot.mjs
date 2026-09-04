import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const baseUrl = "https://www.montlakepta.org";
const output = join(root, "src", "data", "wix-content.json");

const sitemapTypes = [
  ["blogPosts", "blog-posts-sitemap.xml", normalizeBlogPost],
  ["events", "event-pages-sitemap.xml", normalizeEvent],
  ["products", "store-products-sitemap.xml", normalizeProduct],
  ["storeCollections", "store-categories-sitemap.xml", normalizeCollection],
];

const snapshot = {
  schemaVersion: 1,
  source: "public-bootstrap",
  syncedAt: new Date().toISOString(),
  cms: { boardMembers: [], pages: [] },
  blogPosts: [],
  events: [],
  products: [],
  storeCollections: [],
};

for (const [key, sitemap, normalize] of sitemapTypes) {
  const xml = await fetchText(`${baseUrl}/${sitemap}`);
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => decodeXml(match[1]));
  snapshot[key] = await mapConcurrent(urls, 6, async (url) => {
    const html = await fetchText(url);
    const structuredData = extractStructuredData(html);
    return normalize(structuredData, url);
  });
  console.log(`Bootstrapped ${snapshot[key].length} ${key}`);
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Wrote ${output}`);

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Montlake PTA content migration" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response.text();
}

function extractStructuredData(html) {
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const value = JSON.parse(match[1]);
      if (["BlogPosting", "Event", "Product"].includes(value["@type"])) return value;
    } catch (error) {
      throw new Error(`Invalid JSON-LD: ${error.message}`, { cause: error });
    }
  }
  return {};
}

function normalizeBlogPost(data, url) {
  return {
    id: url,
    slug: lastPathSegment(url),
    title: decodeXml(data.headline || titleFromSlug(url)),
    excerpt: decodeXml(data.description || ""),
    contentText: decodeXml(data.description || ""),
    publishedAt: data.datePublished || null,
    updatedAt: data.dateModified || null,
    image: data.image?.url || null,
    sourceUrl: url,
  };
}

function normalizeEvent(data, url) {
  return {
    id: url,
    slug: lastPathSegment(url),
    title: decodeXml(data.name || titleFromSlug(url)),
    summary: decodeXml(data.description || ""),
    descriptionText: decodeXml(data.description || ""),
    startAt: data.startDate || null,
    endAt: data.endDate || null,
    location: decodeXml(data.location?.name || ""),
    address: decodeXml(typeof data.location?.address === "string" ? data.location.address : ""),
    image: data.image?.url || null,
    status: normalizeEventStatus(data.eventStatus),
    sourceUrl: url,
  };
}

function normalizeProduct(data, url) {
  const images = Array.isArray(data.image) ? data.image : data.image ? [data.image] : [];
  return {
    id: url,
    slug: lastPathSegment(url),
    name: decodeXml(data.name || titleFromSlug(url)),
    description: decodeXml(data.description || ""),
    price: data.offers?.price || null,
    currency: data.offers?.priceCurrency || "USD",
    availability: data.offers?.availability || null,
    image: images[0]?.contentUrl || images[0]?.url || null,
    visible: true,
    sourceUrl: url,
  };
}

function normalizeCollection(_data, url) {
  return {
    id: url,
    slug: lastPathSegment(url),
    name: titleFromSlug(url),
    image: null,
    sourceUrl: url,
  };
}

function lastPathSegment(url) {
  return normalizeSlug(decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).at(-1)));
}

function titleFromSlug(url) {
  return lastPathSegment(url)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function decodeXml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&amp;amp;", "&")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function normalizeSlug(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeEventStatus(value) {
  if (value === "https://schema.org/EventCancelled" || value === "CANCELLED") return "CANCELED";
  return value || null;
}

async function mapConcurrent(values, concurrency, callback) {
  const outputValues = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      outputValues[index] = await callback(values[index], index);
    }
  });
  await Promise.all(workers);
  return outputValues;
}
