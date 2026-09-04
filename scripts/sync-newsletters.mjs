import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const root = dirname(dirname(currentFile));

if (process.argv[1] === currentFile) await main();

async function main() {
  const config = JSON.parse(await readFile(join(root, "src", "newsletter.config.json"), "utf8"));
  const archiveId = process.env.CONSTANT_CONTACT_ARCHIVE_ID || config.archiveId;
  const output = join(root, "src", "data", "newsletters.json");
  const snapshot = await createNewsletterSnapshot({ archiveId });

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Synced ${snapshot.editions.length} public newsletter editions.`);
}

export async function createNewsletterSnapshot({
  archiveId,
  fetchImpl = fetch,
  syncedAt = new Date().toISOString(),
}) {
  if (!archiveId) {
    throw new Error("CONSTANT_CONTACT_ARCHIVE_ID is required to synchronize the public newsletter archive.");
  }
  if (!/^[a-z0-9]+$/i.test(archiveId)) {
    throw new Error("CONSTANT_CONTACT_ARCHIVE_ID contains unsupported characters.");
  }

  const endpoint = `https://campaignlp.constantcontact.com/v1/archive/${archiveId}/activities?limit=100`;
  const response = await fetchImpl(endpoint, {
    headers: { "user-agent": "Montlake PTA newsletter archive sync" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Constant Contact archive request failed: ${response.status} ${response.statusText}`);
  }

  const activities = await response.json();
  if (!Array.isArray(activities)) {
    throw new Error("Constant Contact archive returned an unexpected response.");
  }

  const editions = (await mapConcurrent(
    activities,
    6,
    (activity, index) => normalizeEdition(activity, index, fetchImpl),
  )).filter(Boolean);

  return {
    schemaVersion: 1,
    source: "public-archive",
    syncedAt,
    archiveId,
    editions,
  };
}

async function normalizeEdition(activity, index, fetchImpl) {
  const title = typeof activity?.subject === "string" ? activity.subject.trim() : "";
  const campaignUrl = await resolveCampaignUrl(activity?.campaignUrl, fetchImpl);
  if (!title || !campaignUrl) return null;
  const digest = createHash("sha256").update(campaignUrl).digest("hex").slice(0, 8);
  return {
    id: digest,
    slug: `${slugify(title) || "newsletter"}-${digest}`,
    title,
    publishedAt: dateFromTitle(title),
    campaignUrl,
    archiveOrder: index,
  };
}

function safeCampaignUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (!["conta.cc", "myemail.constantcontact.com"].includes(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function resolveCampaignUrl(value, fetchImpl) {
  const initialUrl = safeCampaignUrl(value);
  if (!initialUrl) return null;
  try {
    const response = await fetchImpl(initialUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const finalUrl = new URL(response.url);
    return finalUrl.protocol === "https:" && finalUrl.hostname === "myemail.constantcontact.com"
      ? finalUrl.href
      : null;
  } catch {
    return null;
  }
}

function dateFromTitle(title) {
  const isoMatch = title.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) return toIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);

  const monthMatch = title.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/i);
  if (!monthMatch) return null;
  const month = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ].indexOf(monthMatch[1].toLowerCase()) + 1;
  return toIsoDate(monthMatch[3], month, monthMatch[2]);
}

function toIsoDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
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
