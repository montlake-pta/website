import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ApiKeyStrategy, createClient } from "@wix/sdk";
import { collections, items } from "@wix/data";
import {
  legacyPageCollectionId, legacyPageCollectionLabel, normalizePageSlug,
  pageCollectionDefinitions, projectLegacyPage, validatePagePlacement,
} from "./page-collections.mjs";
import { normalizeFundraisingFields } from "./fundraising-fields.mjs";
import { fingerprint } from "./update-wix-page.mjs";
import { publicHtml, publicText, wixMediaUrl } from "./wix-public-content.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sha256 = /^[a-f0-9]{64}$/;
const commitSha = /^[a-f0-9]{40}$/;
const readOptions = { consistentRead: true, showDrafts: true };
const publicHelpers = { html: publicHtml, text: publicText, image: wixMediaUrl };
const recovery = "This migration is not atomic. Review a fresh plan after any failure; no overwrite, delete, or rollback is attempted. Source activation and publishing setup are separate.";
class MigrationError extends Error {}
const requireCondition = (value, message) => { if (!value) throw new MigrationError(message); };
const safeError = error => error instanceof MigrationError ? error.message :
  "Page collection migration failed. SDK, HTTP, filesystem, and private record details are not logged.";
const equal = (a, b) => fingerprint({ value: a }) === fingerprint({ value: b });
const byId = (a, b) => a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
const withoutItemMetadata = ({ _createdDate, _updatedDate, _owner, ...data }) => data;
const withoutSchemaVersion = ({ revision, _updatedDate, ...schema }) => schema;
const definitionFor = type => pageCollectionDefinitions.find(definition => definition.type === type);
const isPublic = record => record?.published === true &&
  (!Object.hasOwn(record, "_publishStatus") || record._publishStatus === "PUBLISHED");

function validData(record, type) {
  try {
    requireCondition(!Object.hasOwn(record, "published") || typeof record.published === "boolean",
      "Invalid publication flag.");
    validatePagePlacement(type, normalizePageSlug(record.slug));
    for (const field of definitionFor(type).fields) {
      if (!Object.hasOwn(record, field.key) || record[field.key] == null) continue;
      if (["TEXT", "RICH_TEXT", "IMAGE"].includes(field.type)) {
        requireCondition(typeof record[field.key] === "string", "Invalid text field.");
      }
    }
    if (type === "fundraising") normalizeFundraisingFields(record, publicHelpers);
  } catch {
    throw new MigrationError(`Invalid ${type} page fields or placement; item fingerprint ${fingerprint(record)}. Unpublished content is not exported.`);
  }
}

// Reports describe published, applicable fields only. The original publication
// gate also applies to proposed copies, even when legacy defaults imply true.
export function publicMigrationItem(record, type, visible = isPublic(record)) {
  if (!record) return null;
  const identity = { kind: type, label: visible ? "Published item" : "Unpublished item", fingerprint: fingerprint(record) };
  if (!visible) return identity;
  const page = {};
  for (const field of definitionFor(type).fields) {
    if (!Object.hasOwn(record, field.key)) continue;
    if (field.type === "RICH_TEXT") page[field.key] = publicHtml(record[field.key]);
    else if (field.type === "TEXT") page[field.key] = publicText(record[field.key]);
    else if (field.type === "BOOLEAN") page[field.key] = record[field.key] === true;
  }
  page.slug = normalizePageSlug(record.slug);
  if (type === "fundraising") {
    try { Object.assign(page, normalizeFundraisingFields(record, publicHelpers)); }
    catch { throw new MigrationError("Public fundraising fields could not be normalized; no raw content is exported."); }
  }
  return { ...identity, page };
}

function missingCollection(error) {
  const code = error?.details?.applicationError?.code || error?.code;
  return error?.response?.status === 404 || error?.status === 404 ||
    ["WDE0025", "COLLECTION_NOT_FOUND"].includes(code);
}

async function readCollection(collectionApi, api, id, optional = false) {
  let schema;
  try { schema = await collectionApi.getDataCollection(id, { consistentRead: true }); }
  catch (error) {
    if (optional && missingCollection(error)) return { schema: null, items: [] };
    throw new MigrationError("Collection lookup failed. Only confirmed missing destination collections may be created.");
  }
  requireCondition(schema?._id === id && Array.isArray(schema.fields) &&
    schema.fields.every(field => typeof field?.key === "string" && field.key && typeof field.type === "string") &&
    new Set(schema.fields.map(field => field.key)).size === schema.fields.length &&
    ["insert", "update", "remove", "read"].every(key => typeof schema.permissions?.[key] === "string"),
  "Collection definition is incomplete or malformed; full fields and permissions are required.");
  // Native draft plugins use separate publication semantics that cannot safely
  // be flattened into the custom published column by this one-time copy.
  requireCondition(!schema.plugins?.some(plugin => plugin.type === "PUBLISH" || plugin.type === "DRAFT_ITEMS" ||
    plugin.publishOptions || plugin.draftItemsOptions),
  "Native draft/publish plugins require a separate reviewed migration. No draft content is exported.");
  let result;
  try { result = await api.query(id).limit(100).find(readOptions); }
  catch { throw new MigrationError("Collection item query failed; no incomplete result will be used."); }
  const rows = [];
  while (true) {
    requireCondition(Array.isArray(result?.items) && typeof result.hasNext === "function",
      "Invalid collection item query response.");
    rows.push(...result.items);
    if (!result.hasNext()) break;
    requireCondition(typeof result.next === "function", "Invalid collection pagination.");
    try { result = await result.next(); }
    catch { throw new MigrationError("Collection pagination failed; no incomplete result will be used."); }
  }
  requireCondition(rows.every(row => row && typeof row._id === "string" && row._id.length > 0) &&
    new Set(rows.map(row => row._id)).size === rows.length,
  "Collection items have missing or duplicate identities; no private values are logged.");
  return { schema, items: rows.sort(byId) };
}

function compatibleSchema(schema, definition, permissions) {
  if (!schema || !equal(schema.permissions, permissions)) return false;
  const custom = schema.fields.filter(field => field.systemField !== true);
  return custom.length === definition.fields.length && definition.fields.every(field =>
    custom.some(current => current.key === field.key && current.type === field.type));
}

function projections(legacyItems) {
  const slugs = new Set();
  return legacyItems.map(source => {
    let projected;
    try { projected = projectLegacyPage(source); }
    catch {
      throw new MigrationError(`Invalid legacy page placement; item fingerprint ${fingerprint(source)}. Unpublished content is not exported.`);
    }
    validData(source, projected.type);
    requireCondition(!Object.hasOwn(source, "_publishStatus") || source._publishStatus === "PUBLISHED",
      `Native draft status cannot be copied safely; item fingerprint ${fingerprint(source)}. Unpublished content is not exported.`);
    requireCondition(!slugs.has(projected.data.slug), "Duplicate normalized legacy route. Review records in Wix; no private route is logged.");
    slugs.add(projected.data.slug);
    return { source, type: projected.type, data: { _id: source._id, ...projected.data } };
  });
}

function sourceProof(projected) {
  return {
    counts: Object.fromEntries(pageCollectionDefinitions.map(({ type }) => {
      const rows = projected.filter(item => item.type === type);
      const published = rows.filter(item => isPublic(item.source)).length;
      return [type, { total: rows.length, published, unpublished: rows.length - published }];
    })),
    routes: projected.filter(item => isPublic(item.source)).map(item => ({ kind: item.type, slug: item.data.slug }))
      .sort((a, b) => a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0),
  };
}

function planOperations(state, projected, phase, report) {
  const operations = [];
  const targetSlugs = new Set();
  for (const [index, definition] of pageCollectionDefinitions.entries()) {
    const target = state.targets[index];
    const compatible = !target.schema || compatibleSchema(target.schema, definition, state.legacy.schema.permissions);
    if (!compatible) report.blockers.push(`${definition.id} must have exactly its supported custom fields and the legacy permissions.`);
    if (!target.schema && phase === "retire") report.blockers.push(`${definition.id} is missing; copy must finish before retirement.`);
    const entry = {
      kind: definition.type, collection: definition.id,
      operation: target.schema ? compatible ? "preserve" : "blocked" : "create",
      fields: structuredClone(definition.fields),
      beforeFingerprint: fingerprint(target.schema), status: "pending", writeAttempted: false, verifiedFingerprint: null,
    };
    report.collections.push(entry);
    if (!target.schema && phase === "copy") {
      operations.push({ entry, kind: "create", index, definition });
    }
    for (const record of target.items) {
      validData(record, definition.type);
      const slug = normalizePageSlug(record.slug);
      requireCondition(!targetSlugs.has(slug), "Duplicate normalized destination route across typed collections. No private route is logged.");
      targetSlugs.add(slug);
    }
  }
  const recognized = new Set();
  for (const item of projected) {
    const index = pageCollectionDefinitions.findIndex(definition => definition.type === item.type);
    const target = state.targets[index];
    const existing = target.items.find(record => normalizePageSlug(record.slug) === item.data.slug) ||
      target.items.find(record => record._id === item.data._id) || null;
    item.destinationData = { ...item.data, _id: existing?._id ?? item.data._id };
    const matching = existing && equal(withoutItemMetadata(existing), item.destinationData);
    const operation = existing ? matching ? "preserve" : "blocked" : "insert";
    if (existing) recognized.add(`${index}:${existing._id}`);
    if (existing && !matching) report.blockers.push("An existing destination item conflicts with its live source. It will never be overwritten.");
    if (!existing && phase === "retire") report.blockers.push("A destination item is missing. Finish and review the copy before retirement.");
    const visible = isPublic(item.source) && (!existing || isPublic(existing));
    const entry = {
      kind: item.type, operation, status: "pending", writeAttempted: false, verifiedFingerprint: null,
      source: publicMigrationItem(item.source, item.type, visible),
      before: publicMigrationItem(existing, item.type, visible),
      proposed: publicMigrationItem(item.destinationData, item.type, visible), after: null,
    };
    report.records.push(entry);
    if (!existing && phase === "copy") operations.push({ entry, kind: "insert", index, item, visible });
  }
  for (const [index, target] of state.targets.entries()) {
    for (const record of target.items) {
      if (recognized.has(`${index}:${record._id}`)) continue;
      const type = pageCollectionDefinitions[index].type;
      report.blockers.push("A destination item has no matching legacy source. It is preserved and blocks migration.");
      report.records.push({
        kind: type, operation: "blocked", status: "pending", writeAttempted: false, verifiedFingerprint: null,
        source: null, before: publicMigrationItem(record, type), proposed: null, after: null,
      });
    }
  }
  if (phase === "retire") {
    const schema = state.legacy.schema;
    const rename = schema.displayName !== legacyPageCollectionLabel;
    if (rename && (typeof schema.revision !== "string" || !/^\d+$/.test(schema.revision))) {
      report.blockers.push("Retirement requires a valid current collection revision; an unguarded rename is forbidden.");
    }
    report.retirement = {
      operation: rename ? "rename" : "preserve", proposedLabel: legacyPageCollectionLabel,
      status: "pending", writeAttempted: false, verifiedFingerprint: null,
    };
    if (rename) operations.push({ entry: report.retirement, kind: "retire" });
  }
  return operations;
}

export async function migratePageCollections({
  api, collectionApi, config, siteId, sourceCommit, phase = "copy", mode = "plan",
  expectedCommit, expectedFingerprint, expectedCandidateFingerprint, saveReport = async () => {},
}) {
  const report = {
    schemaVersion: 1, phase: null, mode: null, status: "failed", sourceCommit: null,
    expectedFingerprint: null, candidateFingerprint: null, verifiedFingerprint: null,
    canApply: false, blockers: [], collections: [], records: [], retirement: null,
    sourceProof: null, parityProof: null, applyInputs: null,
    atomic: false, writeAttempted: false, recovery,
  };
  const sent = new Set();
  const persist = async () => {
    try { await saveReport(structuredClone(report)); }
    catch { throw new MigrationError("The safe report could not be saved. Inspect live state before retrying; writes may already have occurred."); }
  };
  try {
    requireCondition(["copy", "retire"].includes(phase) && ["plan", "apply"].includes(mode),
      "Use phase copy|retire and mode plan|apply.");
    report.phase = phase;
    report.mode = mode;
    requireCondition(typeof siteId === "string" && siteId.length > 0, "A configured Wix site is required.");
    requireCondition(commitSha.test(sourceCommit || "") && (!expectedCommit || commitSha.test(expectedCommit)),
      "A full lowercase commit SHA is required.");
    requireCondition(!expectedCommit || expectedCommit === sourceCommit, "Check out the exact planned source commit.");
    requireCondition(config?.cms && ["legacy", "typed"].includes(config.cms.pageSource ?? "legacy") &&
      (config.cms.legacyPages ?? config.cms.pages) === legacyPageCollectionId &&
      pageCollectionDefinitions.every(definition => config.cms[definition.configKey] === definition.id),
    "Configuration must select the fixed legacy and typed page collection IDs.");
    requireCondition(phase !== "retire" || config.cms.pageSource === "typed",
      "Retirement requires cms.pageSource=typed on the planned source commit.");
    if (mode === "apply") {
      requireCondition(expectedCommit === sourceCommit && sha256.test(expectedFingerprint || "") &&
        sha256.test(expectedCandidateFingerprint || ""), "Apply requires the exact commit and both fingerprints from a reviewed plan.");
    }
    report.sourceCommit = sourceCommit;
    const readState = async () => {
      const legacy = await readCollection(collectionApi, api, legacyPageCollectionId);
      const targets = [];
      for (const definition of pageCollectionDefinitions) {
        targets.push(await readCollection(collectionApi, api, definition.id, true));
      }
      return { legacy, targets };
    };
    const stateFingerprint = state => fingerprint({ siteId, legacyPageCollectionId, targetIds: pageCollectionDefinitions.map(d => d.id), state });
    let current = await readState();
    report.expectedFingerprint = stateFingerprint(current);
    requireCondition(["insert", "update", "remove"].every(key => current.legacy.schema.permissions[key] === "ADMIN"),
      "Legacy writes must remain admin-only; permissions are copied, never broadened.");
    const projected = projections(current.legacy.items);
    report.sourceProof = sourceProof(projected);
    report.candidateFingerprint = fingerprint({
      sourceCommit, phase, pageSource: config.cms.pageSource ?? "legacy",
      definitions: pageCollectionDefinitions, legacyPageCollectionId, legacyPageCollectionLabel,
      copies: projected.map(({ type, data }) => ({ type, data })),
    });
    const operations = planOperations(current, projected, phase, report);
    report.canApply = report.blockers.length === 0;
    report.applyInputs = {
      mode: "apply", phase, candidate_commit: sourceCommit,
      expected_fingerprint: report.expectedFingerprint,
      expected_candidate_fingerprint: report.candidateFingerprint,
    };
    report.status = mode === "plan" ? report.canApply ? "planned" : "blocked" : "ready-to-apply";
    await persist();
    if (mode === "plan") return report;
    requireCondition(expectedFingerprint === report.expectedFingerprint,
      "Live source, destinations, or schema changed since the plan. Review a fresh plan, including after a partial migration.");
    requireCondition(expectedCandidateFingerprint === report.candidateFingerprint,
      "The candidate or phase differs from the approved plan. Review a fresh plan.");
    requireCondition(report.canApply, "Migration blocked by the public report. Nothing was written.");
    const originalLegacy = structuredClone(current.legacy);
    for (const entry of [...report.collections, ...report.records, ...(report.retirement ? [report.retirement] : [])]) {
      if (entry.operation === "preserve") {
        entry.status = "already-current";
        entry.verifiedFingerprint = entry.before?.fingerprint ?? entry.beforeFingerprint ?? fingerprint(current.legacy.schema);
        if (Object.hasOwn(entry, "after")) entry.after = entry.before;
      }
    }
    for (const operation of operations) {
      const { entry, kind, index } = operation;
      // Persist conservative intent before preflight so interruption can never
      // look like proof that no write happened. Caught preflight failures reset it.
      report.writeAttempted = entry.writeAttempted = true;
      entry.status = "write-attempted";
      await persist();
      const latest = await readState();
      requireCondition(stateFingerprint(latest) === stateFingerprint(current),
        "Live source or destination state changed during preflight. No next write was sent; review a fresh plan.");
      sent.add(entry);
      try {
        if (kind === "create") {
          const { definition } = operation;
          await collectionApi.createDataCollection({
            _id: definition.id, displayName: definition.displayName, fields: structuredClone(definition.fields),
            permissions: structuredClone(latest.legacy.schema.permissions),
          });
        } else if (kind === "insert") {
          // insert with the source ID is create-if-absent, never save/upsert.
          // Native collection drafts are rejected; custom published=false stays false.
          await api.insert(pageCollectionDefinitions[index].id, structuredClone(operation.item.data), { showDrafts: false });
        } else {
          await collectionApi.updateDataCollection({
            ...structuredClone(latest.legacy.schema), displayName: legacyPageCollectionLabel,
          });
        }
      } catch {
        throw new MigrationError("Guarded Wix write failed or its outcome is unknown. Review a fresh plan; no overwrite or rollback was attempted.");
      }
      const observed = await readState();
      const next = structuredClone(current);
      if (kind === "create") {
        const target = observed.targets[index];
        requireCondition(compatibleSchema(target.schema, operation.definition, current.legacy.schema.permissions) &&
          target.schema.displayName === operation.definition.displayName && target.items.length === 0,
        "Created collection read-back did not confirm the intended fields, permissions, name, and empty item set.");
        next.targets[index] = target;
        entry.verifiedFingerprint = fingerprint(target.schema);
      } else if (kind === "insert") {
        const verified = observed.targets[index].items.find(record => record._id === operation.item.data._id);
        requireCondition(verified && equal(withoutItemMetadata(verified), operation.item.data),
          "Inserted item read-back failed: ID, applicable raw fields, or unexpected fields differ. No private content is logged.");
        next.targets[index].items.push(verified);
        next.targets[index].items.sort(byId);
        entry.verifiedFingerprint = fingerprint(verified);
        entry.after = publicMigrationItem(verified, operation.item.type, operation.visible);
      } else {
        const before = current.legacy.schema;
        const after = observed.legacy.schema;
        requireCondition(typeof after.revision === "string" && /^\d+$/.test(after.revision) &&
          BigInt(after.revision) === BigInt(before.revision) + 1n &&
          equal(withoutSchemaVersion(after), { ...withoutSchemaVersion(before), displayName: legacyPageCollectionLabel }),
        "Retirement read-back failed. Only the legacy display name and server-managed revision/date may change.");
        next.legacy.schema = after;
        entry.verifiedFingerprint = fingerprint(after);
      }
      requireCondition(stateFingerprint(observed) === stateFingerprint(next),
        "Read-back found concurrent or unrelated changes. Per-operation results are not whole-migration approval.");
      current = observed;
      entry.status = "applied";
      await persist();
    }
    const final = await readState();
    requireCondition(stateFingerprint(final) === stateFingerprint(current),
      "Live state changed after the last operation. Review a fresh plan before claiming complete parity.");
    requireCondition(equal(final.legacy.items, originalLegacy.items) &&
      (phase === "retire" || equal(final.legacy.schema, originalLegacy.schema)),
    "The complete legacy backup changed; source preservation could not be confirmed.");
    requireCondition(pageCollectionDefinitions.every((definition, index) => {
      const copies = projected.filter(item => item.type === definition.type);
      return compatibleSchema(final.targets[index].schema, definition, final.legacy.schema.permissions) &&
        final.targets[index].items.length === copies.length && copies.every(item =>
          final.targets[index].items.some(record => equal(withoutItemMetadata(record), item.destinationData)));
    }), "Final destination parity failed. No deletion or corrective overwrite was attempted.");
    report.parityProof = { sourceItemsUnchanged: true, destinationParity: true, ...sourceProof(projected) };
    report.verifiedFingerprint = stateFingerprint(final);
    report.status = sent.size ? "applied" : "already-current";
    report.writeAttempted = sent.size > 0;
    await persist();
    return report;
  } catch (error) {
    for (const entry of [...report.collections, ...report.records, ...(report.retirement ? [report.retirement] : [])]) {
      if (entry.writeAttempted && !sent.has(entry)) {
        entry.writeAttempted = false;
        entry.status = "not-written";
      }
      if (entry.status === "write-attempted") {
        entry.verifiedFingerprint = null;
        if (Object.hasOwn(entry, "after")) entry.after = null;
      }
    }
    report.writeAttempted = sent.size > 0;
    report.status = sent.size ? "partial-failure" : "failed";
    report.error = safeError(error);
    await persist();
    throw new MigrationError(report.error);
  }
}

export function parseOptions(args) {
  try {
    return parseArgs({
      args, allowPositionals: false, options: {
        mode: { type: "string", default: "plan" }, phase: { type: "string", default: "copy" },
        "expected-commit": { type: "string" }, "expected-fingerprint": { type: "string" },
        "expected-candidate-fingerprint": { type: "string" }, "output-dir": { type: "string" },
      },
    }).values;
  } catch {
    throw new MigrationError("Use --mode plan|apply, --phase copy|retire, --output-dir, and the three --expected-* approval values. Collection targets are fixed.");
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const output = options["output-dir"] ? resolve(options["output-dir"]) : await mkdtemp(join(tmpdir(), "wix-page-collections-"));
  if (options["output-dir"]) {
    try { await mkdir(output); }
    catch { throw new MigrationError("Choose a new output directory with an existing parent; reports never mix with an earlier run."); }
  }
  const saveReport = report => writeFile(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  try {
    requireCondition(process.env.WIX_API_KEY, "WIX_API_KEY is required. Use the manual Actions workflow when unavailable locally.");
    const config = JSON.parse(await readFile(join(root, "src/wix.config.json"), "utf8"));
    const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const sourceCommit = git(["rev-parse", "--verify", "HEAD^{commit}"]);
    requireCondition(!git(["status", "--porcelain", "--untracked-files=normal", "--",
      "scripts", "src", "package.json", "package-lock.json", ".github/workflows/migrate-page-collections.yml"]),
    "Commit the migration, shared scripts, configuration, workflow, and dependencies before planning or applying.");
    const siteId = process.env.WIX_SITE_ID || config.siteId;
    const client = createClient({ modules: { collections, items }, auth: ApiKeyStrategy({ apiKey: process.env.WIX_API_KEY, siteId }) });
    const report = await migratePageCollections({
      api: client.items, collectionApi: client.collections, config, siteId, sourceCommit,
      phase: options.phase, mode: options.mode, expectedCommit: options["expected-commit"],
      expectedFingerprint: options["expected-fingerprint"],
      expectedCandidateFingerprint: options["expected-candidate-fingerprint"], saveReport,
    });
    const summary = [
      `Page collection migration: ${report.phase} ${report.status}`,
      `candidate_commit: ${report.sourceCommit}`, `expected_fingerprint: ${report.expectedFingerprint}`,
      `expected_candidate_fingerprint: ${report.candidateFingerprint}`,
      "Review only report.json. Applicable values are copied from live WebsitePages, never fallback candidates.",
      recovery, "No source activation, deployment, repository commit, or snapshot export was performed.",
    ].join("\n");
    console.log(summary);
    console.log(`Public report directory: ${output}`);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Split CMS Page Collections\n\n\`\`\`text\n${summary}\n\`\`\`\n`);
    if (!report.canApply) process.exitCode = 1;
  } catch (error) {
    try { await readFile(join(output, "report.json")); }
    catch (readError) {
      if (readError.code !== "ENOENT") throw new MigrationError("Public report availability could not be confirmed; inspect live state before retrying.");
      await saveReport({ schemaVersion: 1, status: "failed", writeAttempted: false, atomic: false, error: safeError(error), recovery });
    }
    throw new MigrationError(safeError(error));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
}
