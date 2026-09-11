import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, ApiKeyStrategy } from "@wix/sdk";
import { collections, items } from "@wix/data";
import { fundraisingFieldDefinitions, fundraisingFieldNames, normalizeFundraisingFields } from "./fundraising-fields.mjs";
import { assertPublicSnapshot } from "./normalize-wix-content.mjs";
import { fingerprint } from "./update-wix-page.mjs";
import { publicHtml, publicText, wixMediaUrl } from "./wix-public-content.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const targetSlugs = Object.freeze(["donate", "annual-fund", "spring-auction"]);
const managedFields = ["title", "heading", "description", "body", ...fundraisingFieldNames];
const readOptions = { consistentRead: true, showDrafts: false };
const sha256 = /^[a-f0-9]{64}$/;
const commitSha = /^[a-f0-9]{40}$/;
const publicHelpers = { html: publicHtml, text: publicText, image: wixMediaUrl };
const recovery = "Writes are not atomic. Do not roll back or blindly retry; inspect and review a fresh plan. Live CMS writes can build current main.";

class MigrationError extends Error {}

function requireCondition(condition, message) {
  if (!condition) throw new MigrationError(message);
}

function safeError(error) {
  return error instanceof MigrationError ? error.message :
    "Fundraising migration failed. SDK, HTTP, filesystem, and private record details are not logged.";
}

function fundraisingFields(record) {
  try {
    return normalizeFundraisingFields(record, publicHelpers);
  } catch {
    throw new MigrationError("Invalid fundraising fields. Review field types, status, date, amounts, and safe URLs before planning.");
  }
}

export function publicMigrationPage(record) {
  const page = {
    ...Object.fromEntries(["slug", "title", "heading", "kicker", "description", "accent"]
      .map(key => [key, publicText(record[key])])),
    body: publicHtml(record.body),
    published: record.published === true,
    ...fundraisingFields(record),
  };
  assertPublicSnapshot({
    schemaVersion: 2, source: "wix-headless", cms: { pages: [page], boardMembers: [] },
    blogPosts: [], events: [], products: [], storeCollections: [],
  });
  return page;
}

export function fundraisingCandidates(pages) {
  requireCondition(Array.isArray(pages), "The source must export pages.");
  return targetSlugs.map(slug => {
    const matches = pages.filter(page => page.slug === slug && !page.home);
    requireCondition(matches.length === 1, `The source must contain exactly one non-home ${slug} page.`);
    const page = matches[0];
    requireCondition(fundraisingFieldNames.every(key => Object.hasOwn(page, key)),
      `The ${slug} candidate must explicitly define every fundraising field; blanks intentionally clear old values.`);
    const candidate = publicMigrationPage({
      ...page, heading: page.heading || page.title, body: page.content, published: true,
    });
    requireCondition(["title", "heading", "description", "body"]
      .every(key => typeof candidate[key] === "string" && candidate[key].trim()),
    `The ${slug} candidate needs nonempty title, heading, description, and sanitized body.`);
    requireCondition(!candidate.heroImage || candidate.heroAlt,
      `The ${slug} candidate needs alt text for its hero image.`);
    return candidate;
  });
}

export function annualFundId(siteId, collectionId) {
  const hash = fingerprint({ migration: "fundraising-v1", siteId, collectionId, slug: "annual-fund" });
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

// Flat @wix/data items, exact slugs, including custom unpublished rows in the
// duplicate check. Absence is planned explicitly; only Annual Fund may insert.
async function readPage(api, collectionId, slug) {
  let result;
  try {
    result = await api.query(collectionId).eq("slug", slug).limit(100).find(readOptions);
  } catch {
    throw new MigrationError(`Wix ${slug} query failed. Check collection access and credentials.`);
  }
  const matches = [];
  while (true) {
    requireCondition(Array.isArray(result?.items) && typeof result.hasNext === "function",
      "Wix returned an invalid page query response.");
    matches.push(...result.items);
    requireCondition(matches.length <= 1, `Duplicate slug: ${slug}. No record can be safely replaced.`);
    if (!result.hasNext()) break;
    requireCondition(typeof result.next === "function", "Wix returned invalid page pagination.");
    try { result = await result.next(); }
    catch { throw new MigrationError("Wix page pagination failed; incomplete results cannot be used."); }
  }
  if (!matches.length) return null;
  const item = matches[0];
  requireCondition(item?.slug === slug && item.published === true,
    `The existing ${slug} record must have the exact slug and published=true.`);
  requireCondition(typeof item._id === "string" && item._id.length > 0 &&
    (item._updatedDate instanceof Date || typeof item._updatedDate === "string") &&
    Number.isFinite(new Date(item._updatedDate).valueOf()),
  `The existing ${slug} record needs an identity and valid _updatedDate for conditional updates.`);
  return item;
}

async function readSchema(api, collectionId) {
  let schema;
  try { schema = await api.getDataCollection(collectionId, { consistentRead: true }); }
  catch { throw new MigrationError("WebsitePages schema lookup failed; this migration never creates a collection."); }
  requireCondition(schema?._id === collectionId && Array.isArray(schema.fields) && schema.fields.length > 0 &&
    schema.fields.every(field => typeof field?.key === "string" && field.key && typeof field.type === "string") &&
    new Set(schema.fields.map(field => field.key)).size === schema.fields.length,
  "Wix returned an invalid or duplicate-field collection definition.");
  requireCondition(["insert", "update", "remove", "read"].every(key => typeof schema.permissions?.[key] === "string"),
    "The full collection permissions are required; a limited public schema cannot be used.");
  return schema;
}

const managed = candidate => Object.fromEntries(managedFields.map(key => [key, candidate[key]]));
const sameValue = (a, b) => fingerprint({ value: a }) === fingerprint({ value: b });
const sameCandidate = (record, candidate) => record && managedFields.every(key =>
  Object.hasOwn(record, key) && sameValue(record[key], candidate[key]));
const withoutUpdatedDate = ({ _updatedDate, ...value }) => value;
const schemaMetadata = ({ revision, _updatedDate, fields, ...value }) => value;

function verifySchema(before, after, missing) {
  requireCondition(/^\d+$/.test(after.revision || "") &&
    BigInt(after.revision) === BigInt(before.revision) + 1n &&
    fingerprint(schemaMetadata(before)) === fingerprint(schemaMetadata(after)) &&
    after.fields.length === before.fields.length + missing.length &&
    before.fields.every(field => sameValue(field, after.fields.find(next => next.key === field.key))) &&
    missing.every(field => {
      const added = after.fields.find(next => next.key === field.key);
      return added?.type === field.type && added.displayName === field.displayName;
    }),
  "Schema read-back verification failed. Permissions, metadata, or existing fields changed, or an addition was not confirmed.");
}

export async function migrateFundraising({
  api, collectionApi, collectionId, siteId, pages, mode = "plan", sourceCommit,
  expectedFingerprint, expectedCandidateFingerprint, expectedCommit, saveReport = async () => {},
}) {
  const report = {
    schemaVersion: 1, mode: null, status: "failed", sourceCommit: null,
    expectedFingerprint: null, candidateFingerprint: null, verifiedFingerprint: null,
    canApply: false, blockers: [], schema: null, records: [], applyInputs: null,
    writeAttempted: false, atomic: false, recovery,
  };
  let schemaWriteSent = false;
  const pageWritesSent = new Set();
  const persist = async () => {
    try { await saveReport(structuredClone(report)); }
    catch { throw new MigrationError("The safe public report could not be saved. Inspect live state before retrying; do not assume no writes occurred."); }
  };
  try {
    requireCondition(["plan", "apply"].includes(mode), "Mode must be plan or apply.");
    report.mode = mode;
    requireCondition(typeof collectionId === "string" && collectionId.length > 0 &&
      typeof siteId === "string" && siteId.length > 0, "A configured Wix site and WebsitePages collection are required.");
    requireCondition(commitSha.test(sourceCommit || ""), "A full lowercase source commit SHA is required.");
    requireCondition(!expectedCommit || commitSha.test(expectedCommit), "candidate_commit must be a full lowercase commit SHA.");
    requireCondition(!expectedCommit || expectedCommit === sourceCommit, "Source commit differs from the planned candidate commit.");
    const candidates = fundraisingCandidates(pages);
    report.sourceCommit = sourceCommit;
    report.candidateFingerprint = fingerprint({ sourceCommit, candidates, fields: fundraisingFieldDefinitions });
    if (mode === "apply") {
      requireCondition(sha256.test(expectedFingerprint || "") && sha256.test(expectedCandidateFingerprint || "") &&
        expectedCommit === sourceCommit, "Apply requires the exact commit and both fingerprints from a reviewed plan.");
      requireCondition(expectedCandidateFingerprint === report.candidateFingerprint,
        "Candidate fingerprint differs from the approved plan. Review a new plan.");
    }

    const liveFingerprint = state => fingerprint({ siteId, collectionId, ...state });
    const readState = async () => {
      const schema = await readSchema(collectionApi, collectionId);
      const records = [];
      for (const slug of targetSlugs) records.push(await readPage(api, collectionId, slug));
      return { schema, records };
    };
    const original = await readState();
    // Hash complete records/schema/absence, but persist only public allowlists.
    report.expectedFingerprint = liveFingerprint(original);
    const missing = fundraisingFieldDefinitions.filter(field => !original.schema.fields.some(current => current.key === field.key));
    report.schema = {
      status: missing.length ? "pending" : "already-current",
      writeAttempted: false, verifiedFingerprint: null,
      beforeFingerprint: fingerprint(original.schema),
      fields: fundraisingFieldDefinitions.map(field => {
        const current = original.schema.fields.find(item => item.key === field.key);
        const incompatible = current && current.type !== field.type;
        if (incompatible) report.blockers.push(`Incompatible WebsitePages field type: ${field.key}.`);
        return {
          key: field.key, beforeType: current ? publicText(current.type) : null,
          proposedType: field.type, action: incompatible ? "blocked" : current ? "preserve" : "add",
        };
      }),
      additions: structuredClone(missing),
    };
    if (missing.length && !/^\d+$/.test(original.schema.revision || "")) {
      report.blockers.push("Schema additions require the current Wix collection revision; an unguarded update is forbidden.");
    }
    const proposed = original.records.map((record, index) => {
      const candidate = candidates[index];
      const slug = candidate.slug;
      const value = record ? { ...structuredClone(record), ...managed(candidate) } :
        { ...candidate, _id: annualFundId(siteId, collectionId) };
      let operation = sameCandidate(record, candidate) ? "preserve" : record ? "update" : "insert";
      if (!record && slug !== "annual-fund") {
        operation = "blocked";
        report.blockers.push(`The existing ${slug} record is missing; only annual-fund may be inserted.`);
      } else if (record && slug === "annual-fund" && operation !== "preserve") {
        operation = "blocked";
        report.blockers.push("An authored annual-fund already exists and differs from the candidate. Reconcile the candidate with Wix and review a new plan; this migration will not overwrite it.");
      }
      report.records.push({
        slug, operation, status: "pending", writeAttempted: false,
        beforeFingerprint: fingerprint(record), verifiedFingerprint: null,
        before: record ? publicMigrationPage(record) : null,
        proposed: publicMigrationPage(value), after: null,
      });
      return value;
    });
    report.canApply = report.blockers.length === 0;
    report.applyInputs = {
      mode: "apply", candidate_commit: sourceCommit,
      expected_fingerprint: report.expectedFingerprint,
      expected_candidate_fingerprint: report.candidateFingerprint,
    };
    report.status = mode === "plan" ? report.canApply ? "planned" : "blocked" : "ready-to-apply";
    await persist();
    if (mode === "plan") return report;

    requireCondition(report.canApply, "Migration blocked by the public plan. Resolve its blockers before any write.");
    requireCondition(expectedFingerprint === report.expectedFingerprint,
      "Live records, absence, or schema changed since the plan. Review a fresh plan, even for a retry.");
    requireCondition(liveFingerprint(await readState()) === expectedFingerprint,
      "Live state changed during preflight. Nothing was written; review a new plan.");

    let verifiedSchema = original.schema;
    if (missing.length) {
      report.writeAttempted = report.schema.writeAttempted = true;
      report.schema.status = "write-attempted";
      await persist();
      const latest = await readSchema(collectionApi, collectionId);
      requireCondition(fingerprint(latest) === fingerprint(original.schema),
        "Schema changed during preflight; no schema replacement was attempted.");
      try {
        // Installed @wix/data collections API: one flat collection argument,
        // including revision. This replaces the definition, not just fields.
        schemaWriteSent = true;
        await collectionApi.updateDataCollection({
          ...structuredClone(latest), fields: [...structuredClone(latest.fields), ...structuredClone(missing)],
        });
      } catch {
        throw new MigrationError("Revision-guarded Wix schema update failed or its outcome is unknown. No unguarded retry was attempted.");
      }
      verifiedSchema = await readSchema(collectionApi, collectionId);
      verifySchema(original.schema, verifiedSchema, missing);
      report.schema.status = "applied";
      report.schema.verifiedFingerprint = fingerprint(verifiedSchema);
      await persist();
    } else {
      report.schema.verifiedFingerprint = fingerprint(verifiedSchema);
    }

    const verifiedRecords = [];
    for (const [index, entry] of report.records.entries()) {
      const before = original.records[index];
      if (entry.operation !== "preserve") {
        report.writeAttempted = entry.writeAttempted = true;
        entry.status = "write-attempted";
        await persist();
      }
      requireCondition(fingerprint(await readSchema(collectionApi, collectionId)) === fingerprint(verifiedSchema),
        "Schema changed before a page operation. Stop and review a fresh plan.");
      // Repeat the original full-record/absence check immediately before EACH
      // write, including after earlier operations triggered publisher hooks.
      const latest = await readPage(api, collectionId, entry.slug);
      requireCondition(fingerprint(latest) === fingerprint(before),
        `The ${entry.slug} record or absence changed during preflight. Stop and review a fresh plan.`);
      if (entry.operation === "preserve") {
        entry.status = "already-current";
        verifiedRecords.push(latest);
      } else {
        try {
          pageWritesSent.add(entry.slug);
          if (before) {
            await api.update(collectionId, { ...structuredClone(latest), ...managed(candidates[index]) }, {
              showDrafts: false,
              condition: {
                _id: { $eq: latest._id }, _updatedDate: { $eq: new Date(latest._updatedDate) },
                slug: { $eq: entry.slug }, published: { $eq: true },
              },
            });
          } else {
            // insert, never save: a stable ID prevents duplicate retry inserts.
            await api.insert(collectionId, structuredClone(proposed[index]), { showDrafts: false });
          }
        } catch {
          throw new MigrationError(`Guarded Wix ${entry.slug} write failed or its outcome is unknown. No fallback write or delete rollback was attempted.`);
        }
        const verified = await readPage(api, collectionId, entry.slug);
        requireCondition(verified && verified._id === proposed[index]._id &&
          sameCandidate(verified, candidates[index]), `Read-back verification failed for ${entry.slug}.`);
        if (before) {
          requireCondition(fingerprint(withoutUpdatedDate(verified)) === fingerprint(withoutUpdatedDate(proposed[index])),
            `Read-back found unrelated field changes for ${entry.slug}. No rollback was attempted.`);
        } else {
          requireCondition(Object.entries(proposed[index]).every(([key, value]) => sameValue(verified[key], value)),
            "Annual Fund insert read-back did not preserve the full proposed public page.");
        }
        entry.status = "applied";
        verifiedRecords.push(verified);
      }
      entry.after = publicMigrationPage(verifiedRecords[index]);
      entry.verifiedFingerprint = fingerprint(verifiedRecords[index]);
      await persist();
    }
    const final = await readState();
    requireCondition(liveFingerprint(final) === liveFingerprint({ schema: verifiedSchema, records: verifiedRecords }),
      "Live state changed after read-back. Earlier verified writes are recorded, but whole migration success cannot be confirmed.");
    report.verifiedFingerprint = liveFingerprint(final);
    report.status = report.writeAttempted ? "applied" : "already-current";
    await persist();
    return report;
  } catch (error) {
    // The pre-write report conservatively records intent in case the process
    // stops. A caught preflight failure can say precisely that no call was sent.
    if (report.schema?.writeAttempted && !schemaWriteSent) {
      report.schema.writeAttempted = false;
      report.schema.status = "not-written";
    }
    for (const entry of report.records) {
      if (entry.writeAttempted && !pageWritesSent.has(entry.slug)) {
        entry.writeAttempted = false;
        entry.status = "not-written";
      }
    }
    report.writeAttempted = schemaWriteSent || pageWritesSent.size > 0;
    report.status = report.writeAttempted ? "partial-failure" : "failed";
    report.error = safeError(error);
    await persist();
    throw new MigrationError(report.error);
  }
}

export function parseOptions(args) {
  try {
    return parseArgs({
      args, allowPositionals: false,
      options: {
        mode: { type: "string", default: "plan" },
        "output-dir": { type: "string" },
        "expected-fingerprint": { type: "string" },
        "expected-candidate-fingerprint": { type: "string" },
        "expected-commit": { type: "string" },
      },
    }).values;
  } catch {
    throw new MigrationError("Invalid arguments. Use --mode plan|apply, --output-dir, and the three --expected-* approval values for apply. Slug targets are fixed.");
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const output = options["output-dir"] ? resolve(options["output-dir"]) :
    await mkdtemp(join(tmpdir(), "wix-fundraising-"));
  if (options["output-dir"]) {
    try { await mkdir(output); }
    catch { throw new MigrationError("Choose a new output directory with an existing parent; reports must not mix with an earlier run."); }
  }
  const saveReport = report => writeFile(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  try {
    requireCondition(process.env.WIX_API_KEY, "WIX_API_KEY is required. Use the manual Actions workflow when unavailable locally.");
    const config = JSON.parse(await readFile(join(root, "src/wix.config.json"), "utf8"));
    const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const sourceCommit = git(["rev-parse", "--verify", "HEAD^{commit}"]);
    requireCondition(!git(["status", "--porcelain", "--untracked-files=normal", "--",
      "src", "scripts", "package.json", "package-lock.json", ".github/workflows/migrate-fundraising.yml"]),
    "Commit the candidate source, scripts, configuration, workflow, and dependencies before planning or applying.");
    const { pages } = await import("../src/site.mjs");
    const siteId = process.env.WIX_SITE_ID || config.siteId;
    const client = createClient({
      modules: { collections, items },
      auth: ApiKeyStrategy({ apiKey: process.env.WIX_API_KEY, siteId }),
    });
    const report = await migrateFundraising({
      api: client.items, collectionApi: client.collections, collectionId: config.cms?.pages, siteId, pages,
      sourceCommit, mode: options.mode, expectedCommit: options["expected-commit"],
      expectedFingerprint: options["expected-fingerprint"],
      expectedCandidateFingerprint: options["expected-candidate-fingerprint"], saveReport,
    });
    const summary = [
      `Fundraising migration: ${report.status}`,
      `candidate_commit: ${report.sourceCommit}`,
      `expected_fingerprint: ${report.expectedFingerprint}`,
      `expected_candidate_fingerprint: ${report.candidateFingerprint}`,
      "Review report.json: schema additions and every public before/proposed page.",
      recovery,
      "No deployment or repository commit was performed. Refresh the full public snapshot after successful apply.",
    ].join("\n");
    console.log(summary);
    console.log(`Public report directory: ${output}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Fundraising migration\n\n\`\`\`text\n${summary}\n\`\`\`\n`);
    }
    if (!report.canApply) process.exitCode = 1;
  } catch (error) {
    // Do not replace a migration's detailed partial report with an early error.
    try { await readFile(join(output, "report.json")); }
    catch (readError) {
      if (readError.code !== "ENOENT") throw new MigrationError("Public report availability could not be confirmed; inspect live state before retrying.");
      await saveReport({ schemaVersion: 1, status: "failed", writeAttempted: false, atomic: false, error: safeError(error), recovery });
    }
    throw new MigrationError(safeError(error));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
