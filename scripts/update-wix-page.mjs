import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, ApiKeyStrategy } from "@wix/sdk";
import { items } from "@wix/data";
import { sanitizeCmsHtml } from "./render-wix-content.mjs";
import { normalizeFundraisingFields } from "./fundraising-fields.mjs";
import { publicHtml, publicText, wixMediaUrl } from "./wix-public-content.mjs";
import { normalizeTypedPage } from "./normalize-wix-content.mjs";
import { generatedPageSlugs, pageCollectionDefinitions } from "./page-collections.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const managedFields = ["title", "heading", "description", "body"];
const readOptions = { consistentRead: true, showDrafts: false };
const sha256 = /^[a-f0-9]{64}$/;
const commitSha = /^[a-f0-9]{40}$/;

class PageUpdateError extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new PageUpdateError(message);
}

function validSlug(slug) {
  return typeof slug === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(slug);
}

// The backup is intentionally sanitized public copy, not a full-item restore.
function sanitizeBody(value) {
  return sanitizeCmsHtml(typeof value === "string" ? value : "");
}

export function fingerprint(value) {
  function sorted(input) {
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map(sorted);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.keys(input).sort().map((key) => [key, sorted(input[key])]));
    }
    return input;
  }
  return createHash("sha256").update(JSON.stringify(sorted(value))).digest("hex");
}

export function candidateForPage(pages, slug = "enrichment") {
  requireCondition(validSlug(slug), "Use an exact, safe page slug (nested routes are supported).");
  const matches = pages.filter((page) => page.slug === slug && !page.home);
  requireCondition(matches.length === 1, "The source must contain exactly one non-home page with this slug.");
  const page = matches[0];
  const candidate = {
    slug,
    title: page.title,
    heading: page.heading || page.title,
    description: page.description,
    body: sanitizeBody(page.content),
  };
  requireCondition(managedFields.every((key) =>
    typeof candidate[key] === "string" && candidate[key].trim()),
  "The proposed title, heading, description, and sanitized body must all be nonempty.");
  return candidate;
}

export function publicPage(item, pageType) {
  if (pageType) return normalizeTypedPage(item, pageType);
  const text = (key) => typeof item[key] === "string" ? item[key] : "";
  return {
    slug: text("slug"),
    title: text("title"),
    heading: text("heading"),
    kicker: text("kicker"),
    description: text("description"),
    accent: text("accent"),
    body: sanitizeBody(item.body),
    published: item.published === true,
    ...normalizeFundraisingFields(item, { html: publicHtml, text: publicText, image: wixMediaUrl }),
  };
}

// @wix/data items.query() returns flat items, not REST { data: ... } envelopes.
// Do not query the whole collection, filter by title, include references, or
// hide duplicate slugs by filtering on the custom "published" field.
export async function readUniquePage(api, collectionId, slug) {
  requireCondition(validSlug(slug), "Use an exact, safe page slug (nested routes are supported).");
  let result;
  try {
    result = await api.query(collectionId).eq("slug", slug).limit(100).find(readOptions);
  } catch {
    throw new PageUpdateError("Wix page query failed. Check collection access and credentials; no collection was created.");
  }
  const matches = [];
  while (true) {
    requireCondition(Array.isArray(result?.items) && typeof result.hasNext === "function",
      "Wix returned an invalid page query response.");
    matches.push(...result.items);
    requireCondition(matches.length <= 1, "Duplicate slug: more than one existing record matches. Nothing can be safely replaced.");
    if (!result.hasNext()) break;
    requireCondition(typeof result.next === "function", "Wix returned invalid pagination.");
    try {
      // The installed SDK's next() retains the initial find options.
      result = await result.next();
    } catch {
      throw new PageUpdateError("Wix page pagination failed. No incomplete result will be used.");
    }
  }
  requireCondition(matches.length === 1, "No existing page matches this slug. This repair never inserts records or creates collections.");
  const item = matches[0];
  requireCondition(item?.slug === slug && item.published === true,
    "The unique existing page must have the exact slug and published=true.");
  requireCondition(typeof item._id === "string" && item._id.length > 0,
    "The existing Wix page is missing its item identity.");
  requireCondition((item._updatedDate instanceof Date || typeof item._updatedDate === "string") &&
    Number.isFinite(new Date(item._updatedDate).valueOf()),
  "The existing Wix page needs a valid _updatedDate for a conditional update.");
  return item;
}

export async function updateWixPage({
  api, collectionId, siteId, pages, slug = "enrichment", mode = "plan", sourceCommit,
  expectedFingerprint, expectedCandidateFingerprint, expectedCommit,
  saveReport = async () => {}, pageType = pageCollectionDefinitions.find(definition => definition.id === collectionId)?.type,
}) {
  requireCondition(!pageType || ["common", "fundraising"].includes(pageType),
    "This body-repair workflow supports CommonPages and FundraisingPages. Edit GeneratedPages metadata in Wix.");
  requireCondition(["plan", "apply"].includes(mode), "Mode must be plan or apply.");
  requireCondition(typeof collectionId === "string" && collectionId.length > 0 &&
    typeof siteId === "string" && siteId.length > 0, "A configured Wix site and page collection are required.");
  requireCondition(commitSha.test(sourceCommit || ""), "A full source commit SHA is required.");
  const candidate = candidateForPage(pages, slug);
  const managed = Object.fromEntries(managedFields.map((key) => [key, candidate[key]]));
  const candidateFingerprint = fingerprint({ sourceCommit, candidate });
  if (mode === "apply") {
    requireCondition(sha256.test(expectedFingerprint || ""),
      "Apply requires the plan's expected record fingerprint (64 lowercase hexadecimal characters).");
    requireCondition(expectedCommit === sourceCommit,
      "Source commit differs from the approved plan. Check out the plan's exact commit.");
    requireCondition(expectedCandidateFingerprint === candidateFingerprint,
      "Candidate fingerprint differs from the approved plan. Run and review a new plan.");
  }

  // Hash the entire record (including identity, metadata, and unrelated fields)
  // but never persist or log those nonpublic fields.
  const recordFingerprint = (item) => fingerprint({ siteId, collectionId, item });
  const current = await readUniquePage(api, collectionId, slug);
  const currentRecordFingerprint = recordFingerprint(current);
  const proposed = { ...current, ...managed };
  const report = {
    schemaVersion: 1,
    mode,
    status: mode === "plan" ? "planned" : "ready-to-apply",
    slug,
    sourceCommit,
    currentRecordFingerprint,
    candidateFingerprint,
    before: publicPage(current, pageType),
    proposed: publicPage(proposed, pageType),
    after: null,
    verifiedRecordFingerprint: null,
    writeAttempted: false,
    applyInputs: {
      mode: "apply",
      slug,
      candidate_commit: sourceCommit,
      expected_fingerprint: currentRecordFingerprint,
      expected_candidate_fingerprint: candidateFingerprint,
    },
  };
  await saveReport(report);
  if (mode === "plan") return report;

  try {
    // A rerun may use its original plan hash only when no write is needed.
    // This does not bypass the fingerprint guard on any replacement.
    if (managedFields.every((key) => current[key] === managed[key])) {
      report.status = "already-current";
      report.after = publicPage(current, pageType);
      report.verifiedRecordFingerprint = currentRecordFingerprint;
    } else {
      requireCondition(expectedFingerprint === currentRecordFingerprint,
        "Live record changed since the plan. Nothing was written; review a new plan.");
      // Recheck both uniqueness and all fields after persisting the safe backup.
      const latest = await readUniquePage(api, collectionId, slug);
      requireCondition(recordFingerprint(latest) === expectedFingerprint,
        "Live record changed during preflight. Nothing was written; review a new plan.");
      report.writeAttempted = true;
      await saveReport(report);
      try {
        // The installed SDK forwards options.condition to UpdateDataItem.
        // Never retry without the condition, use save(), or fall back to insert().
        await api.update(collectionId, { ...structuredClone(latest), ...managed }, {
          showDrafts: false,
          condition: {
            _id: { $eq: latest._id },
            _updatedDate: { $eq: new Date(latest._updatedDate) },
            slug: { $eq: slug },
            published: { $eq: true },
          },
        });
      } catch {
        throw new PageUpdateError("Conditional Wix update failed or its outcome is unknown. Inspect a fresh plan before retrying; no unguarded retry was attempted.");
      }
      const verified = await readUniquePage(api, collectionId, slug);
      requireCondition(verified._id === current._id &&
        managedFields.every((key) => verified[key] === managed[key]),
      "Read-back verification failed after the write. Inspect Wix and run a fresh plan; do not assume the repair succeeded.");
      // _updatedDate is Wix-managed; all other fields must survive replacement.
      const withoutUpdatedDate = ({ _updatedDate, ...fields }) => fields;
      requireCondition(fingerprint(withoutUpdatedDate(verified)) ===
        fingerprint(withoutUpdatedDate(proposed)),
      "Read-back found unrelated field changes after the write. Inspect Wix; no rollback was attempted.");
      report.status = "applied";
      report.after = publicPage(verified, pageType);
      report.verifiedRecordFingerprint = recordFingerprint(verified);
    }
    await saveReport(report);
    return report;
  } catch (error) {
    report.status = "failed";
    report.error = safeError(error);
    await saveReport(report);
    throw error;
  }
}

function safeError(error) {
  return error instanceof PageUpdateError ? error.message :
    "Page repair failed. No SDK, HTTP, or filesystem error details are logged.";
}

export function parseOptions(args) {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        mode: { type: "string", default: "plan" },
        slug: { type: "string", default: "enrichment" },
        "output-dir": { type: "string" },
        "expected-fingerprint": { type: "string" },
        "expected-candidate-fingerprint": { type: "string" },
        "expected-commit": { type: "string" },
      },
      allowPositionals: false,
    }));
  } catch {
    throw new PageUpdateError("Invalid arguments. Use --mode plan|apply, --slug, --output-dir, and the three expected plan values for apply.");
  }
  return values;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const config = JSON.parse(await readFile(join(root, "src/wix.config.json"), "utf8"));
  requireCondition(process.env.WIX_API_KEY, "WIX_API_KEY is required. Use the manual Actions workflow when it is unavailable locally.");
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--",
      "src/site.mjs", "src/wix.config.json", "scripts", "package.json", "package-lock.json"],
    { cwd: root, stdio: "ignore" });
  } catch {
    throw new PageUpdateError("Commit the candidate source, repair script, configuration, and dependency changes before planning or applying.");
  }
  const { pages } = await import("../src/site.mjs");
  const pageType = config.cms.pageSource === "typed"
    ? generatedPageSlugs.includes(options.slug) ? "generated"
      : pages.find(page => page.slug === options.slug)?.layout === "fundraising" ? "fundraising" : "common"
    : undefined;
  const collectionId = pageType
    ? config.cms[pageCollectionDefinitions.find(definition => definition.type === pageType).configKey]
    : config.cms.legacyPages || config.cms.pages;
  const siteId = process.env.WIX_SITE_ID || config.siteId;
  const client = createClient({ modules: { items }, auth: ApiKeyStrategy({ apiKey: process.env.WIX_API_KEY, siteId }) });
  // Fresh directories prevent a failed run from uploading an older success.
  const output = options["output-dir"] ? resolve(options["output-dir"]) :
    await mkdtemp(join(tmpdir(), "wix-page-repair-"));
  if (options["output-dir"]) {
    try {
      await mkdir(output);
    } catch {
      throw new PageUpdateError("Choose a new output directory with an existing parent; reports are never mixed with an earlier run.");
    }
  }
  const writeJson = (name, value) => writeFile(join(output, name), `${JSON.stringify(value, null, 2)}\n`);
  const report = await updateWixPage({
    api: client.items, collectionId, siteId, pages, pageType,
    mode: options.mode, slug: options.slug, sourceCommit,
    expectedFingerprint: options["expected-fingerprint"],
    expectedCandidateFingerprint: options["expected-candidate-fingerprint"],
    expectedCommit: options["expected-commit"],
    saveReport: async (value) => {
      await writeJson("report.json", value);
      await writeJson("proposed-page.json", value.proposed);
      if (["applied", "already-current"].includes(value.status)) {
        await writeJson("snapshot-page.json", value.after);
      }
    },
  });
  const summary = [
    `Wix page repair: ${report.status} (${report.slug})`,
    `candidate_commit: ${report.sourceCommit}`,
    `expected_fingerprint: ${report.currentRecordFingerprint}`,
    `expected_candidate_fingerprint: ${report.candidateFingerprint}`,
    "Review report.json and proposed-page.json before applying.",
    "Only a successful apply produces snapshot-page.json; merge that ONE page into cms.pages.",
    "No deployment, whole-CMS snapshot, or automatic repository commit was performed.",
  ].join("\n");
  console.log(summary);
  console.log(`Public report directory: ${output}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Wix page repair\n\n\`\`\`text\n${summary}\n\`\`\`\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
