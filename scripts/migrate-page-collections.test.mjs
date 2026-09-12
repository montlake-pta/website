import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collections, items } from "@wix/data";
import {
  legacyPageCollectionId, legacyPageCollectionLabel, pageCollectionDefinitions, pageFieldsForType, projectLegacyPage,
} from "./page-collections.mjs";
import { fingerprint } from "./update-wix-page.mjs";
import { migratePageCollections, parseOptions, publicMigrationItem } from "./migrate-page-collections.mjs";

const sourceCommit = "a".repeat(40);
const siteId = "fixture-site";
const permissions = { read: "ANYONE", insert: "ADMIN", update: "ADMIN", remove: "ADMIN" };
const config = { cms: {
  pageSource: "legacy", pages: legacyPageCollectionId, legacyPages: legacyPageCollectionId,
  ...Object.fromEntries(pageCollectionDefinitions.map(definition => [definition.configKey, definition.id])),
} };
const systemFields = ["_id", "_createdDate", "_updatedDate", "_owner"].map(key => ({ key, type: "TEXT", systemField: true }));
const legacySchema = () => ({
  _id: legacyPageCollectionId, displayName: "Website Pages", revision: "17",
  permissions: structuredClone(permissions), displayField: "title", collectionType: "NATIVE",
  fields: [
    ...pageCollectionDefinitions[1].fields, { key: "accent", type: "TEXT" }, { key: "kicker", type: "TEXT" },
    { key: "editorialNotes", type: "TEXT" }, ...systemFields,
  ],
  plugins: [{ type: "CMS", cmsOptions: { privateOption: "private-schema-marker" } }],
  capabilities: { collectionOperations: ["UPDATE"], dataOperations: ["INSERT", "FIND"] },
  _createdDate: new Date("2026-01-01T00:00:00Z"), _updatedDate: new Date("2026-09-10T00:00:00Z"),
});
const legacyItem = (slug, extra = {}) => ({
  _id: `id-${slug}`, _owner: "private-owner", _createdDate: new Date("2026-01-01T00:00:00Z"),
  _updatedDate: new Date("2026-09-10T00:00:00Z"),
  slug, title: `Title ${slug}`, heading: `Heading ${slug}`, description: `Description ${slug}`,
  body: '<p class="lead" onclick="bad()">Live authored <a href="/donate/">information</a>.</p><script>private-script-marker</script>',
  published: true, accent: "coral", kicker: "unused-kicker-marker",
  editorialNotes: "private-notes-marker", data: { privateCustomData: ["retain in legacy"] },
  ...extra,
});
const fixtures = () => [
  ...["about", "advocacy", "budget", "calendar", "community", "contact", "enrichment",
    "families", "volunteer", "membership", "programs", "resources", "fall-fundraiser-2025"].map(slug => legacyItem(slug)),
  ...["donate", "annual-fund", "spring-auction"].map(slug => legacyItem(slug, {
    campaignStatus: slug === "donate" ? "evergreen" : slug === "annual-fund" ? "upcoming" : "closed",
    goalAmount: slug === "spring-auction" ? 125000 : null,
    primaryCtaLabel: "Stored authored action", primaryCtaUrl: "https://example.org/give",
    heroImage: "wix:image://v1/abc~mv2.jpg/name.jpg", heroAlt: "Public photo",
    impactBody: "<p>Live impact text.</p>", equityBody: "<p>Live participation text.</p>",
    trustBody: "<p>Live donor information.</p>",
  })),
  ...["blog", "event-list", "shop", "pta-board"].map(slug => legacyItem(slug)),
];
const sdkError = (status = 403) => Object.assign(new Error("Authorization: private-secret-marker; raw SDK payload"), { status });
const targetSchema = definition => ({
  _id: definition.id, displayName: definition.displayName, permissions: structuredClone(permissions),
  revision: "9", fields: [...structuredClone(definition.fields), ...systemFields],
  collectionType: "NATIVE", plugins: [{ type: "CMS" }], capabilities: { collectionOperations: ["UPDATE"] },
});

function mockWix({ source = fixtures(), targets = false, pageSize = 7, beforeFind, beforeGet, beforeWrite, afterWrite, beforeNext } = {}) {
  const state = {
    schemas: { [legacyPageCollectionId]: legacySchema() },
    rows: { [legacyPageCollectionId]: structuredClone(source) },
    writes: [], finds: [], gets: [], nexts: 0, forbidden: [],
  };
  if (targets) {
    for (const definition of pageCollectionDefinitions) {
      state.schemas[definition.id] = targetSchema(definition);
      state.rows[definition.id] = targets === "empty" ? [] : source.flatMap(item => {
        const projected = projectLegacyPage(item);
        return projected.type === definition.type ? [{
          _id: item._id, ...projected.data, _owner: "destination-private-owner",
          _createdDate: new Date("2026-09-11T00:00:00Z"), _updatedDate: new Date("2026-09-11T00:00:00Z"),
        }] : [];
      });
    }
  }
  const api = {
    query(id) {
      const query = { id };
      return {
        limit(limit) { query.limit = limit; return this; },
        async find(options) {
          state.finds.push({ ...query, options: structuredClone(options) });
          beforeFind?.(state, id);
          if (!state.schemas[id]) throw sdkError(404);
          const rows = structuredClone(state.rows[id] || []);
          const at = offset => ({
            items: rows.slice(offset, offset + pageSize),
            hasNext: () => offset + pageSize < rows.length,
            next: async () => { state.nexts++; beforeNext?.(state, id); return at(offset + pageSize); },
          });
          return at(0);
        },
      };
    },
    async insert(id, item, options) {
      const call = { kind: "insert", id, item: structuredClone(item), options: structuredClone(options) };
      state.writes.push(call);
      beforeWrite?.(state, call);
      if (!state.schemas[id] || state.rows[id].some(row => row._id === item._id)) throw sdkError(409);
      const inserted = {
        ...structuredClone(item), _owner: "destination-private-owner",
        _createdDate: new Date("2026-09-11T12:00:00Z"), _updatedDate: new Date("2026-09-11T12:00:00Z"),
      };
      state.rows[id].push(inserted);
      afterWrite?.(state, call);
      return structuredClone(inserted);
    },
  };
  const collectionApi = {
    async getDataCollection(id, options) {
      state.gets.push(id);
      assert.deepEqual(options, { consistentRead: true });
      beforeGet?.(state, id);
      if (!state.schemas[id]) throw sdkError(404);
      return structuredClone(state.schemas[id]);
    },
    async createDataCollection(definition, ...rest) {
      assert.equal(rest.length, 0);
      const call = { kind: "create", id: definition._id, definition: structuredClone(definition) };
      state.writes.push(call);
      beforeWrite?.(state, call);
      if (state.schemas[definition._id]) throw sdkError(409);
      state.schemas[definition._id] = {
        ...structuredClone(definition), revision: "9", collectionType: "NATIVE",
        fields: [...definition.fields.map(field => ({
          ...structuredClone(field), systemField: false, capabilities: { sortable: true },
        })), ...systemFields],
        plugins: [{ type: "CMS" }], capabilities: { collectionOperations: ["UPDATE"] },
        _createdDate: new Date("2026-09-11T12:00:00Z"), _updatedDate: new Date("2026-09-11T12:00:00Z"),
      };
      state.rows[definition._id] = [];
      afterWrite?.(state, call);
      return structuredClone(state.schemas[definition._id]);
    },
    async updateDataCollection(definition, ...rest) {
      assert.equal(rest.length, 0);
      const call = { kind: "retire", id: definition._id, definition: structuredClone(definition) };
      state.writes.push(call);
      beforeWrite?.(state, call);
      if (definition.revision !== state.schemas[definition._id]?.revision) throw sdkError(409);
      state.schemas[definition._id] = {
        ...structuredClone(definition), revision: String(BigInt(definition.revision) + 1n),
        _updatedDate: new Date("2026-09-11T12:00:00Z"),
      };
      afterWrite?.(state, call);
      return structuredClone(state.schemas[definition._id]);
    },
  };
  for (const name of ["save", "update", "remove", "bulkInsert", "deleteDataCollection"]) {
    api[name] = collectionApi[name] = () => { state.forbidden.push(name); throw sdkError(); };
  }
  return { api, collectionApi, state };
}
const options = (mock, overrides = {}) => ({
  api: mock.api, collectionApi: mock.collectionApi, config, siteId, sourceCommit, ...overrides,
});
const approval = plan => ({
  phase: plan.phase, mode: "apply", expectedCommit: plan.sourceCommit,
  expectedFingerprint: plan.expectedFingerprint, expectedCandidateFingerprint: plan.candidateFingerprint,
});
const capture = reports => async report => reports.push(structuredClone(report));
const retireConfig = { cms: { ...config.cms, pageSource: "typed" } };

test("copy plan is read-only, paginates all live rows and proposes exactly the typed renderer contracts", async () => {
  const mock = mockWix();
  const before = structuredClone({ schemas: mock.state.schemas, rows: mock.state.rows });
  const plan = await migratePageCollections(options(mock));
  assert.equal(plan.status, "planned");
  assert.equal(plan.records.length, 20);
  assert.deepEqual(plan.collections.map(entry => entry.fields.length), [7, 18, 6]);
  assert.deepEqual(plan.sourceProof.counts, {
    common: { total: 13, published: 13, unpublished: 0 },
    fundraising: { total: 3, published: 3, unpublished: 0 },
    generated: { total: 4, published: 4, unpublished: 0 },
  });
  assert.equal(plan.sourceProof.routes.some(route => route.slug === "newsletter"), false);
  assert.deepEqual(plan.applyInputs, {
    mode: "apply", phase: "copy", candidate_commit: sourceCommit,
    expected_fingerprint: plan.expectedFingerprint, expected_candidate_fingerprint: plan.candidateFingerprint,
  });
  assert.deepEqual({ schemas: mock.state.schemas, rows: mock.state.rows }, before);
  assert.equal(mock.state.writes.length, 0);
  assert.ok(mock.state.nexts > 0);
  for (const query of mock.state.finds) assert.deepEqual(query, {
    id: legacyPageCollectionId, limit: 100, options: { consistentRead: true, showDrafts: true },
  });
  assert.doesNotMatch(JSON.stringify(plan), /private-|unused-kicker-marker|onclick|<script>|editorialNotes|_owner/);
  for (const entry of plan.records) {
    assert.ok(Object.keys(entry.proposed.page).every(key => pageFieldsForType(entry.kind).includes(key)));
  }
});

test("copy preserves applicable raw values and source IDs while keeping the entire legacy backup untouched", async () => {
  const source = fixtures();
  source.find(row => row.slug === "donate").goalAmount = "125000";
  const mock = mockWix({ source });
  const before = structuredClone({ schema: mock.state.schemas[legacyPageCollectionId], items: mock.state.rows[legacyPageCollectionId] });
  const plan = await migratePageCollections(options(mock));
  const result = await migratePageCollections(options(mock, approval(plan)));
  assert.equal(result.status, "applied");
  assert.equal(result.parityProof.sourceItemsUnchanged, true);
  assert.equal(result.parityProof.destinationParity, true);
  assert.deepEqual({ schema: mock.state.schemas[legacyPageCollectionId], items: mock.state.rows[legacyPageCollectionId] }, before);
  assert.equal(mock.state.writes.filter(call => call.kind === "create").length, 3);
  assert.equal(mock.state.writes.filter(call => call.kind === "insert").length, 20);
  for (const row of source) {
    const { type, data } = projectLegacyPage(row);
    const id = pageCollectionDefinitions.find(definition => definition.type === type).id;
    const actual = mock.state.rows[id].find(item => item._id === row._id);
    const { _createdDate, _updatedDate, _owner, ...copied } = actual;
    assert.deepEqual(copied, { _id: row._id, ...data });
    assert.equal(Object.hasOwn(actual, "kicker"), false);
    assert.equal(Object.hasOwn(actual, "editorialNotes"), false);
    if (type === "generated") assert.equal(Object.hasOwn(actual, "body"), false);
    if (type === "fundraising") assert.equal(Object.hasOwn(actual, "accent"), false);
    if (type !== "generated") assert.equal(actual.body, row.body);
  }
  const donation = mock.state.rows.FundraisingPages.find(row => row.slug === "donate");
  assert.equal(donation.goalAmount, "125000");
  assert.equal(donation.heroImage, "wix:image://v1/abc~mv2.jpg/name.jpg");
  const publicDonation = result.records.find(entry => entry.source?.page?.slug === "donate").after.page;
  assert.equal(publicDonation.goalAmount, 125000);
  assert.equal(publicDonation.heroImage, "https://static.wixstatic.com/media/abc~mv2.jpg");
  assert.doesNotMatch(JSON.stringify(result), /private-|onclick|unused-kicker/);
  assert.deepEqual(mock.state.forbidden, []);
});

test("unpublished rows are copied but their slug, title, body, ID and field names never enter reports", async () => {
  const draft = legacyItem("draft-private-route", {
    _id: "draft-private-id", published: false, title: "draft-private-title", heading: "draft-private-heading",
    description: "draft-private-description", body: "<p>draft-private-body</p>",
    editorialNotes: "draft-private-note",
  });
  const mock = mockWix({ source: [legacyItem("about"), draft] });
  const reports = [];
  const plan = await migratePageCollections(options(mock, { saveReport: capture(reports) }));
  assert.deepEqual(plan.sourceProof.counts.common, { total: 2, published: 1, unpublished: 1 });
  const hidden = plan.records.find(entry => entry.source.label === "Unpublished item");
  for (const value of [hidden.source, hidden.proposed]) {
    assert.deepEqual(Object.keys(value), ["kind", "label", "fingerprint"]);
  }
  const applied = await migratePageCollections(options(mock, { ...approval(plan), saveReport: capture(reports) }));
  assert.equal(applied.status, "applied");
  assert.equal(mock.state.rows.CommonPages.find(row => row._id === draft._id).published, false);
  assert.equal(mock.state.rows.CommonPages.find(row => row._id === draft._id).body, draft.body);
  assert.doesNotMatch(JSON.stringify(reports), /draft-private-|editorialNotes|_owner/);
  assert.deepEqual(Object.keys(publicMigrationItem(draft, "common")), ["kind", "label", "fingerprint"]);
});

test("missing legacy publication defaults never expose that row in proposed or read-back public reports", async () => {
  const source = legacyItem("hidden-default-marker");
  delete source.published;
  const mock = mockWix({ source: [source] });
  const plan = await migratePageCollections(options(mock));
  const result = await migratePageCollections(options(mock, approval(plan)));
  assert.doesNotMatch(JSON.stringify(result), /hidden-default-marker/);
  assert.equal(mock.state.rows.CommonPages[0].published, true);
});

test("invalid unpublished pages fail with only an opaque fingerprint, never draft content", async () => {
  for (const change of [
    { slug: "../draft-private-route" }, { slug: "shop", campaignStatus: "active", published: "draft-private-flag" },
    { body: { private: "draft-private-body" } },
    { slug: "donate", goalAmount: -3 },
    { _publishStatus: "DRAFT", published: true },
  ]) {
    const source = legacyItem("draft-private-route", { published: false, title: "draft-private-title", ...change });
    const mock = mockWix({ source: [source] });
    const reports = [];
    await assert.rejects(migratePageCollections(options(mock, { saveReport: capture(reports) })), error => {
      assert.doesNotMatch(error.message, /draft-private-/);
      return true;
    });
    assert.equal(mock.state.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(reports), /draft-private-|raw SDK|Authorization/);
  }
});

test("native draft plugins block instead of silently publishing draft content into plain collections", async () => {
  const mock = mockWix();
  mock.state.schemas[legacyPageCollectionId].plugins.push({ type: "PUBLISH", publishOptions: { defaultStatus: "DRAFT" } });
  await assert.rejects(migratePageCollections(options(mock)), /Native draft\/publish plugins/);
  assert.equal(mock.state.writes.length, 0);
});

test("legacy normalized duplicates are caught across pagination without leaking private routes", async () => {
  const mock = mockWix({
    source: [legacyItem("Private Draft", { published: false }), legacyItem("private-draft", { published: false })],
    pageSize: 1,
  });
  const reports = [];
  await assert.rejects(migratePageCollections(options(mock, { saveReport: capture(reports) })), /Duplicate normalized legacy/);
  assert.equal(mock.state.nexts, 1);
  assert.doesNotMatch(JSON.stringify(reports), /Private Draft|private-draft/);
});

test("wrong typed placement and cross-destination normalized duplicates block migration", async () => {
  for (const duplicate of [false, true]) {
    const mock = mockWix({ targets: "empty" });
    mock.state.rows.CommonPages.push(legacyItem(duplicate ? "private-draft" : "shop", { published: false }));
    if (duplicate) mock.state.rows.FundraisingPages.push(legacyItem("Private Draft", { published: false, campaignStatus: "active" }));
    const reports = [];
    await assert.rejects(migratePageCollections(options(mock, { saveReport: capture(reports) })), /placement|Duplicate normalized destination/);
    assert.equal(mock.state.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(reports), /private-draft|Private Draft/);
  }
});

test("matching existing targets are preserved, while conflicting data or undeclared fields block", async () => {
  const complete = mockWix({ targets: true });
  const original = structuredClone(complete.state);
  const plan = await migratePageCollections(options(complete));
  assert.ok(plan.records.every(entry => entry.operation === "preserve"));
  assert.equal((await migratePageCollections(options(complete, approval(plan)))).status, "already-current");
  assert.equal(complete.state.writes.length, 0);
  assert.deepEqual(complete.state.rows, original.rows);
  for (const mutate of [
    row => { row.body = "<p>New authored destination body.</p>"; },
    row => { row.editorialNotes = "private-target-extra"; },
    row => { row.slug = "About"; },
  ]) {
    const mock = mockWix({ targets: true });
    mutate(mock.state.rows.CommonPages[0]);
    const before = structuredClone(mock.state.rows);
    const conflict = await migratePageCollections(options(mock));
    assert.equal(conflict.status, "blocked");
    assert.ok(conflict.records.some(entry => entry.operation === "blocked"));
    await assert.rejects(migratePageCollections(options(mock, approval(conflict))), /blocked/);
    assert.deepEqual(mock.state.rows, before);
    assert.equal(mock.state.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(conflict), /private-target-extra/);
  }
});

test("matching destinations keep their own identities and fingerprints through copy and retire", async () => {
  const mock = mockWix({ targets: true });
  for (const definition of pageCollectionDefinitions) {
    for (const row of mock.state.rows[definition.id]) row._id = `independent-${row._id}`;
  }
  const before = structuredClone(mock.state.rows);
  const plan = await migratePageCollections(options(mock));
  assert.equal(plan.status, "planned");
  assert.ok(plan.records.every(entry => entry.operation === "preserve"));
  const result = await migratePageCollections(options(mock, approval(plan)));
  assert.equal(result.status, "already-current");
  assert.equal(mock.state.writes.length, 0);
  for (const entry of result.records) {
    const definition = pageCollectionDefinitions.find(value => value.type === entry.kind);
    const existing = before[definition.id].find(row => row.slug === entry.before.page.slug);
    assert.equal(entry.verifiedFingerprint, fingerprint(existing));
    assert.equal(entry.after.fingerprint, fingerprint(existing));
  }
  assert.deepEqual(mock.state.rows, before);
  const retire = await migratePageCollections(options(mock, { phase: "retire", config: retireConfig }));
  assert.equal((await migratePageCollections(options(mock, { ...approval(retire), config: retireConfig }))).status, "applied");
  assert.deepEqual(mock.state.rows, before);
  assert.equal(mock.state.writes.length, 1);
  assert.equal(mock.state.writes[0].kind, "retire");
});

test("partial copies preserve independent existing IDs and use source IDs only for missing rows", async () => {
  const mock = mockWix({ source: [legacyItem("about"), legacyItem("budget")], targets: true });
  const existing = mock.state.rows.CommonPages.find(row => row.slug === "about");
  existing._id = "independent-about-id";
  const before = structuredClone(existing);
  mock.state.rows.CommonPages = [existing];
  const plan = await migratePageCollections(options(mock));
  assert.deepEqual(plan.records.map(entry => entry.operation), ["preserve", "insert"]);
  const result = await migratePageCollections(options(mock, approval(plan)));
  assert.equal(result.status, "applied");
  assert.equal(mock.state.writes.length, 1);
  assert.equal(mock.state.writes[0].item._id, "id-budget");
  assert.deepEqual(mock.state.rows.CommonPages.find(row => row.slug === "about"), before);
  assert.equal(result.parityProof.destinationParity, true);
});

test("existing slug matches take priority over unused legacy IDs, but new-insert ID collisions block", async () => {
  const mock = mockWix({ source: [legacyItem("about"), legacyItem("budget")], targets: true });
  mock.state.rows.CommonPages[0]._id = "id-budget";
  mock.state.rows.CommonPages[1]._id = "id-about";
  const before = structuredClone(mock.state.rows.CommonPages);
  const plan = await migratePageCollections(options(mock));
  assert.equal((await migratePageCollections(options(mock, approval(plan)))).status, "already-current");
  assert.deepEqual(mock.state.rows.CommonPages, before);
  assert.equal(mock.state.writes.length, 0);

  mock.state.rows.CommonPages = mock.state.rows.CommonPages.filter(row => row.slug === "budget");
  const collision = await migratePageCollections(options(mock));
  assert.equal(collision.status, "blocked");
  await assert.rejects(migratePageCollections(options(mock, approval(collision))), /blocked/);
  assert.equal(mock.state.writes.length, 0);
});

test("a matching target identity change after approval invalidates the complete live fingerprint", async () => {
  const mock = mockWix({ targets: true });
  mock.state.rows.CommonPages[0]._id = "independent-original-id";
  const plan = await migratePageCollections(options(mock));
  mock.state.rows.CommonPages[0]._id = "independent-replacement-id";
  await assert.rejects(migratePageCollections(options(mock, approval(plan))), /changed since the plan/);
  assert.equal(mock.state.writes.length, 0);
  const fresh = await migratePageCollections(options(mock));
  assert.equal((await migratePageCollections(options(mock, approval(fresh)))).status, "already-current");
  assert.equal(mock.state.rows.CommonPages[0]._id, "independent-replacement-id");
});

test("unmatched destination records block without overwrite or exposure of unpublished comparisons", async () => {
  const mock = mockWix({ targets: true });
  mock.state.rows.CommonPages.push(legacyItem("draft-private-extra", { published: false }));
  const plan = await migratePageCollections(options(mock));
  assert.equal(plan.status, "blocked");
  assert.doesNotMatch(JSON.stringify(plan), /draft-private-extra/);
  assert.equal(plan.records.at(-1).before.label, "Unpublished item");
  await assert.rejects(migratePageCollections(options(mock, approval(plan))), /blocked/);
  assert.equal(mock.state.writes.length, 0);
});

test("target schema must match the exact custom fields/types and full permissions; system fields are allowed", async () => {
  for (const mutate of [
    schema => { schema.fields.push({ key: "private-unused-field", type: "TEXT" }); },
    schema => { schema.fields = schema.fields.filter(field => field.key !== "body"); },
    schema => { schema.fields.find(field => field.key === "body").type = "TEXT"; },
    schema => { schema.fields.find(field => field.key === "title").systemField = true; },
    schema => { schema.permissions.read = "ADMIN"; },
  ]) {
    const mock = mockWix({ targets: "empty" });
    mutate(mock.state.schemas.CommonPages);
    const plan = await migratePageCollections(options(mock));
    assert.equal(plan.status, "blocked");
    assert.doesNotMatch(JSON.stringify(plan), /private-unused-field/);
    await assert.rejects(migratePageCollections(options(mock, approval(plan))), /blocked/);
    assert.equal(mock.state.writes.length, 0);
  }
  const mock = mockWix({ targets: "empty" });
  mock.state.schemas.CommonPages.fields.find(field => field.key === "body").displayName = "Existing editor label";
  assert.equal((await migratePageCollections(options(mock))).status, "planned");
});

test("creation accepts server-added metadata and revisions, retains existing schemas, and never broadens access", async () => {
  const mock = mockWix();
  mock.state.schemas[legacyPageCollectionId].permissions.read = "SITE_MEMBER";
  const plan = await migratePageCollections(options(mock));
  await migratePageCollections(options(mock, approval(plan)));
  for (const definition of pageCollectionDefinitions) {
    const created = mock.state.writes.find(call => call.kind === "create" && call.id === definition.id);
    assert.deepEqual(created.definition, {
      _id: definition.id, displayName: definition.displayName, fields: definition.fields,
      permissions: { ...permissions, read: "SITE_MEMBER" },
    });
    assert.equal(mock.state.schemas[definition.id].revision, "9");
    assert.ok(mock.state.schemas[definition.id].fields.some(field => field.systemField));
  }
  const unsafe = mockWix();
  unsafe.state.schemas[legacyPageCollectionId].permissions.insert = "ANYONE";
  await assert.rejects(migratePageCollections(options(unsafe)), /admin-only/);
  assert.equal(unsafe.state.writes.length, 0);
});

test("malformed source schemas and read/auth/pagination failures stop without success-shaped empty data", async () => {
  for (const hooks of [
    { beforeGet: () => { throw sdkError(403); } },
    { beforeGet: (_state, id) => { if (id === legacyPageCollectionId) throw sdkError(404); } },
    { beforeFind: () => { throw sdkError(); } },
    { beforeNext: () => { throw sdkError(); } },
  ]) {
    const mock = mockWix(hooks);
    const reports = [];
    await assert.rejects(migratePageCollections(options(mock, { saveReport: capture(reports) })));
    assert.equal(reports.at(-1).status, "failed");
    assert.equal(mock.state.writes.length, 0);
    assert.doesNotMatch(JSON.stringify(reports), /Authorization|private-secret-marker|SDK payload/);
  }
  const invalid = mockWix();
  delete invalid.state.schemas[legacyPageCollectionId].permissions;
  await assert.rejects(migratePageCollections(options(invalid)), /incomplete or malformed/);
});

test("commit, mode, phase and config guards reject unsafe inputs before any SDK calls", async () => {
  const mock = mockWix();
  const plan = await migratePageCollections(options(mock));
  const reads = mock.state.gets.length;
  for (const change of [
    { expectedCommit: undefined }, { expectedCommit: "main" }, { expectedCommit: "b".repeat(40) },
    { sourceCommit: "HEAD" }, { sourceCommit: "A".repeat(40) },
    { expectedFingerprint: "" }, { expectedCandidateFingerprint: "not-a-hash" },
    { mode: "automatic" }, { phase: "delete" },
    { config: { cms: { ...config.cms, commonPages: "OtherPages" } } },
  ]) await assert.rejects(migratePageCollections(options(mock, { ...approval(plan), ...change })));
  assert.equal(mock.state.gets.length, reads);
  assert.equal(mock.state.writes.length, 0);
});

test("approval fingerprints cover private state, source fields, target absence and schema metadata", async () => {
  for (const mutate of [
    state => { state.rows[legacyPageCollectionId][0].editorialNotes = "changed-private-note"; },
    state => { state.rows[legacyPageCollectionId][0].body += "<p>Later live authoring.</p>"; },
    state => { state.schemas[legacyPageCollectionId].plugins[0].cmsOptions.privateOption = "changed"; },
    state => { state.schemas.CommonPages = targetSchema(pageCollectionDefinitions[0]); state.rows.CommonPages = []; },
  ]) {
    const mock = mockWix();
    const plan = await migratePageCollections(options(mock));
    mutate(mock.state);
    await assert.rejects(migratePageCollections(options(mock, approval(plan))), /changed since the plan/);
    assert.equal(mock.state.writes.length, 0);
  }
  const mock = mockWix({ targets: true });
  const plan = await migratePageCollections(options(mock));
  mock.state.rows.CommonPages[0]._owner = "concurrent-private-owner";
  await assert.rejects(migratePageCollections(options(mock, approval(plan))), /changed since the plan/);
  assert.equal(mock.state.writes.length, 0);
});

test("candidate hash binds phase/config/definitions and projected live values, not fallback source pages", async () => {
  const mock = mockWix({ targets: true });
  const copy = await migratePageCollections(options(mock));
  const retire = await migratePageCollections(options(mock, { phase: "retire", config: retireConfig }));
  assert.notEqual(copy.candidateFingerprint, retire.candidateFingerprint);
  await assert.rejects(migratePageCollections(options(mock, {
    ...approval(copy), phase: "retire", config: retireConfig,
  })), /candidate or phase differs/);
  await assert.rejects(migratePageCollections(options(mock, {
    ...approval(copy), expectedCandidateFingerprint: "b".repeat(64),
  })), /candidate or phase differs/);
  assert.equal(mock.state.writes.length, 0);
});

test("query ordering does not change fingerprints", async () => {
  const mock = mockWix({ targets: true, beforeFind: (state, id) => state.rows[id].reverse() });
  const first = await migratePageCollections(options(mock));
  const second = await migratePageCollections(options(mock));
  assert.equal(first.expectedFingerprint, second.expectedFingerprint);
  assert.equal(first.candidateFingerprint, second.candidateFingerprint);
  assert.equal((await migratePageCollections(options(mock, approval(first)))).status, "already-current");
});

test("null/absence differences remain raw conflicts and stale approvals, not normalized equivalence", async () => {
  const mock = mockWix({ targets: true });
  const original = mock.state.rows.FundraisingPages.find(row => row.slug === "annual-fund");
  assert.equal(original.goalAmount, null);
  delete original.goalAmount;
  const plan = await migratePageCollections(options(mock));
  assert.equal(plan.status, "blocked");
  await assert.rejects(migratePageCollections(options(mock, approval(plan))), /blocked/);
  const absent = mockWix();
  const first = await migratePageCollections(options(absent));
  absent.state.rows[legacyPageCollectionId][0].heading = null;
  await assert.rejects(migratePageCollections(options(absent, approval(first))), /changed since the plan/);
});

test("each create/insert rechecks the whole original source and current destination state after report persistence", async () => {
  for (const stage of ["first-create", "second-create", "first-insert", "second-insert"]) {
    const mock = mockWix({ source: [legacyItem("about"), legacyItem("budget")] });
    const plan = await migratePageCollections(options(mock));
    const reports = [];
    let changed = false;
    await assert.rejects(migratePageCollections(options(mock, {
      ...approval(plan), saveReport: async report => {
        reports.push(structuredClone(report));
        const index = stage.startsWith("first") ? 0 : 1;
        const entry = stage.endsWith("create") ? report.collections[index] : report.records[index];
        if (!changed && entry?.status === "write-attempted") {
          mock.state.rows[legacyPageCollectionId][0].editorialNotes = "concurrent-private-edit";
          changed = true;
        }
      },
    })), /changed during preflight/);
    const expectedWrites = { "first-create": 0, "second-create": 1, "first-insert": 3, "second-insert": 4 }[stage];
    assert.equal(mock.state.writes.length, expectedWrites);
    assert.equal(reports.at(-1).status, expectedWrites ? "partial-failure" : "failed");
    assert.equal(reports.at(-1).writeAttempted, expectedWrites > 0);
    assert.doesNotMatch(JSON.stringify(reports), /concurrent-private-edit/);
  }
});

test("creation and insertion races cannot overwrite independently created destinations", async () => {
  for (const kind of ["create", "insert"]) {
    const mock = mockWix({ beforeWrite: (state, call) => {
      if (call.kind !== kind) return;
      if (kind === "create") {
        state.schemas[call.id] = { ...targetSchema(pageCollectionDefinitions[0]), displayName: "Another editor" };
        state.rows[call.id] = [];
      } else state.rows[call.id].push({ ...call.item, title: "Another editor" });
    } });
    const plan = await migratePageCollections(options(mock));
    await assert.rejects(migratePageCollections(options(mock, approval(plan))), /outcome is unknown/);
    assert.equal(mock.state.writes.filter(call => call.kind === kind).length, 1);
    assert.deepEqual(mock.state.forbidden, []);
    if (kind === "create") assert.equal(mock.state.schemas.CommonPages.displayName, "Another editor");
    else assert.equal(mock.state.rows.CommonPages[0].title, "Another editor");
  }
});

test("create read-back verifies contract/permissions and unrelated state, without assuming revision one", async () => {
  for (const mutate of [
    (state, id) => { state.schemas[id].permissions.read = "ADMIN"; },
    (state, id) => { state.schemas[id].fields = state.schemas[id].fields.filter(field => field.key !== "body"); },
    state => { state.rows[legacyPageCollectionId][0].body = "<p>Concurrent edit</p>"; },
  ]) {
    const mock = mockWix({ afterWrite: (state, call) => { if (call.kind === "create") mutate(state, call.id); } });
    const plan = await migratePageCollections(options(mock));
    await assert.rejects(migratePageCollections(options(mock, approval(plan))), /read-back|Read-back/);
    assert.equal(mock.state.writes.length, 1);
  }
});

test("insert read-back requires exact applicable raw fields and ID; only three server metadata fields may differ", async () => {
  for (const mutate of [
    row => { row.body = "<p>Hook replaced raw content.</p>"; },
    row => { row._id = "changed-id"; },
    row => { delete row.description; },
    row => { row.unrecognized = "private-injected-field"; },
  ]) {
    const mock = mockWix({ afterWrite: (state, call) => {
      if (call.kind === "insert") mutate(state.rows[call.id].find(row => row._id === call.item._id));
    } });
    const plan = await migratePageCollections(options(mock));
    const reports = [];
    await assert.rejects(migratePageCollections(options(mock, {
      ...approval(plan), saveReport: capture(reports),
    })), /Inserted item read-back/);
    assert.equal(reports.at(-1).records[0].after, null);
    assert.equal(reports.at(-1).records[0].verifiedFingerprint, null);
    assert.equal(mock.state.writes.filter(call => call.kind === "insert").length, 1);
    assert.doesNotMatch(JSON.stringify(reports), /private-injected-field/);
  }
});

test("a different-ID duplicate slug or an edit to a previously copied record fails whole-state read-back", async () => {
  for (const concurrent of [
    (state, call) => state.rows[call.id].push({ ...call.item, _id: "competing-id" }),
    state => { state.rows[legacyPageCollectionId][0].editorialNotes = "concurrent"; },
  ]) {
    const mock = mockWix({ afterWrite: (state, call) => { if (call.kind === "insert") concurrent(state, call); } });
    const plan = await migratePageCollections(options(mock));
    await assert.rejects(migratePageCollections(options(mock, approval(plan))), /concurrent or unrelated/);
    assert.equal(mock.state.writes.filter(call => call.kind === "insert").length, 1);
  }
});

test("partial copy resumes from a fresh plan without recreating schemas or reinserting successfully copied IDs", async () => {
  for (const failedKind of ["create", "insert"]) {
    let fail = true;
    const mock = mockWix({ afterWrite: (_state, call) => {
      if (call.kind === failedKind && fail) { fail = false; throw sdkError(); }
    } });
    const first = await migratePageCollections(options(mock));
    const reports = [];
    await assert.rejects(migratePageCollections(options(mock, {
      ...approval(first), saveReport: capture(reports),
    })), /outcome is unknown/);
    assert.equal(reports.at(-1).status, "partial-failure");
    await assert.rejects(migratePageCollections(options(mock, approval(first))), /changed since the plan/);
    const fresh = await migratePageCollections(options(mock));
    assert.equal(fresh.status, "planned");
    const result = await migratePageCollections(options(mock, approval(fresh)));
    assert.equal(result.status, "applied");
    assert.equal(mock.state.writes.filter(call => call.kind === "create").length, 3);
    assert.equal(mock.state.writes.filter(call => call.kind === "insert").length, 20);
    const current = await migratePageCollections(options(mock));
    const writes = mock.state.writes.length;
    assert.equal((await migratePageCollections(options(mock, approval(current)))).status, "already-current");
    assert.equal(mock.state.writes.length, writes);
  }
});

test("retire cannot be planned before typed configuration or applied without complete matching copies", async () => {
  const legacy = mockWix({ targets: true });
  await assert.rejects(migratePageCollections(options(legacy, { phase: "retire" })), /pageSource=typed/);
  assert.equal(legacy.state.gets.length, 0);
  for (const mode of ["missing-collections", "missing-row", "changed-row"]) {
    const mock = mockWix({ targets: mode !== "missing-collections" });
    if (mode === "missing-row") mock.state.rows.CommonPages.pop();
    if (mode === "changed-row") mock.state.rows.CommonPages[0].title = "Newer authored target";
    const plan = await migratePageCollections(options(mock, { phase: "retire", config: retireConfig }));
    assert.equal(plan.status, "blocked");
    await assert.rejects(migratePageCollections(options(mock, { ...approval(plan), config: retireConfig })), /blocked/);
    assert.equal(mock.state.writes.length, 0);
  }
});

test("retire only renames the legacy schema with its exact revision, preserving all rows, fields and permissions", async () => {
  const mock = mockWix({ targets: true });
  const old = structuredClone(mock.state.schemas[legacyPageCollectionId]);
  const rows = structuredClone(mock.state.rows);
  const targetSchemas = pageCollectionDefinitions.map(definition => structuredClone(mock.state.schemas[definition.id]));
  const plan = await migratePageCollections(options(mock, { phase: "retire", config: retireConfig }));
  const result = await migratePageCollections(options(mock, { ...approval(plan), config: retireConfig }));
  assert.equal(result.status, "applied");
  assert.equal(mock.state.writes.length, 1);
  assert.deepEqual(mock.state.writes[0], {
    kind: "retire", id: legacyPageCollectionId, definition: { ...old, displayName: legacyPageCollectionLabel },
  });
  assert.deepEqual(mock.state.rows, rows);
  assert.deepEqual(pageCollectionDefinitions.map(definition => mock.state.schemas[definition.id]), targetSchemas);
  assert.equal(mock.state.schemas[legacyPageCollectionId].revision, "18");
  const fresh = await migratePageCollections(options(mock, { phase: "retire", config: retireConfig }));
  assert.equal((await migratePageCollections(options(mock, { ...approval(fresh), config: retireConfig }))).status, "already-current");
  assert.equal(mock.state.writes.length, 1);
});

test("retire revision races and read-back changes fail without unconditional retries or rollback", async () => {
  for (const hooks of [
    { beforeWrite: (state, call) => { if (call.kind === "retire") state.schemas[legacyPageCollectionId].revision = "18"; } },
    { afterWrite: (state, call) => { if (call.kind === "retire") state.schemas[legacyPageCollectionId].permissions.read = "ADMIN"; } },
    { afterWrite: (state, call) => { if (call.kind === "retire") state.rows[legacyPageCollectionId][0].editorialNotes = "changed"; } },
  ]) {
    const mock = mockWix({ targets: true, ...hooks });
    const plan = await migratePageCollections(options(mock, { phase: "retire", config: retireConfig }));
    const reports = [];
    await assert.rejects(migratePageCollections(options(mock, {
      ...approval(plan), config: retireConfig, saveReport: capture(reports),
    })), /unknown|read-back|Read-back/);
    assert.equal(reports.at(-1).status, "partial-failure");
    assert.equal(reports.at(-1).retirement.verifiedFingerprint, null);
    assert.equal(mock.state.writes.length, 1);
    assert.deepEqual(mock.state.forbidden, []);
  }
});

test("final source or target changes prevent parity approval even after every individual operation was verified", async () => {
  const mock = mockWix({ source: [legacyItem("about")] });
  const plan = await migratePageCollections(options(mock));
  const reports = [];
  let changed = false;
  await assert.rejects(migratePageCollections(options(mock, {
    ...approval(plan), saveReport: async report => {
      reports.push(structuredClone(report));
      if (!changed && report.records[0]?.status === "applied") {
        mock.state.rows[legacyPageCollectionId][0].editorialNotes = "private-final-change";
        changed = true;
      }
    },
  })), /changed after the last operation/);
  assert.equal(reports.at(-1).parityProof, null);
  assert.equal(reports.at(-1).verifiedFingerprint, null);
  assert.equal(reports.at(-1).records[0].status, "applied");
});

test("installed SDK wire contracts use flat schemas, single-argument create/update, revision and non-upserting insert", async () => {
  const requests = [];
  const http = {
    request: async factory => {
      const request = factory({ host: "https://www.wixapis.com" });
      requests.push(request);
      if (request.data?.collection) return { data: { collection: structuredClone(request.data.collection) } };
      if (request.data?.dataItem) return { data: { dataItem: structuredClone(request.data.dataItem) } };
      if (/\/items\/query(?:\?|$)/.test(request.url)) return { data: { dataItems: [], pagingMetadata: { count: 0, total: 0, offset: 0 } } };
      return { data: { collection: { id: legacyPageCollectionId, revision: "17", fields: [], permissions } } };
    },
  };
  const schema = await collections.getDataCollection(http)(legacyPageCollectionId, { consistentRead: true });
  assert.equal(schema._id, legacyPageCollectionId);
  assert.equal(schema.revision, "17");
  assert.equal(requests[0].params.get("consistentRead"), "true");
  const definition = pageCollectionDefinitions[0];
  const creation = { _id: definition.id, displayName: definition.displayName, fields: definition.fields, permissions };
  assert.equal((await collections.createDataCollection(http)(creation))._id, definition.id);
  assert.deepEqual(requests[1].data.collection, {
    id: definition.id, displayName: definition.displayName, fields: definition.fields, permissions,
  });
  await collections.updateDataCollection(http)({ ...schema, displayName: legacyPageCollectionLabel });
  assert.equal(requests[2].data.collection.revision, "17");
  assert.equal(requests[2].data.collection.displayName, legacyPageCollectionLabel);
  assert.deepEqual(requests[2].data.collection.permissions, permissions);
  const item = { _id: "same-source-id", ...projectLegacyPage(legacyItem("about")).data };
  const result = await items.insert(http)(definition.id, item, { showDrafts: false });
  assert.deepEqual(result, item);
  assert.equal(requests[3].method, "POST");
  assert.match(requests[3].url, /\/v2\/items$/);
  assert.equal(requests[3].data.dataItem.id, item._id);
  assert.equal(requests[3].data.publishPluginOptions.includeDraftItems, false);
  assert.equal(requests[3].data.suppressHooks, undefined);
  assert.equal(Object.hasOwn(requests[3].data, "condition"), false);
  const queried = await items.query(http)(legacyPageCollectionId).limit(100).find({ consistentRead: true, showDrafts: true });
  assert.deepEqual(queried.items, []);
  const queryUrl = new URL(requests[4].url, "https://www.wixapis.com");
  const query = JSON.parse(Buffer.from(queryUrl.searchParams.get(".r"), "base64").toString("utf8"));
  assert.equal(query.publishPluginOptions.includeDraftItems, true);
  assert.equal(query.consistentRead, true);
});

test("CLI defaults to copy plan, writes only a fresh safe report, and refuses absent credentials without network", async () => {
  assert.equal(parseOptions([]).mode, "plan");
  assert.equal(parseOptions([]).phase, "copy");
  assert.throws(() => parseOptions(["--slug", "about"]), /targets are fixed/);
  const parent = await mkdtemp(join(tmpdir(), "page-collections-test-"));
  const output = join(parent, "report");
  const invoke = () => spawnSync(process.execPath, ["scripts/migrate-page-collections.mjs", "--output-dir", output], {
    cwd: new URL("../", import.meta.url), env: { ...process.env, WIX_API_KEY: "" }, encoding: "utf8",
  });
  try {
    const child = invoke();
    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.match(child.stderr, /WIX_API_KEY is required/);
    assert.doesNotMatch(child.stderr, /at main|Authorization/);
    assert.deepEqual(await readdir(output), ["report.json"]);
    const first = await readFile(join(output, "report.json"), "utf8");
    assert.equal(JSON.parse(first).writeAttempted, false);
    assert.match(invoke().stderr, /new output directory/);
    assert.equal(await readFile(join(output, "report.json"), "utf8"), first);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("workflow is manual, exact-commit, least-privilege and uploads only the phase-specific public report", async () => {
  const workflow = await readFile(new URL("../.github/workflows/migrate-page-collections.yml", import.meta.url), "utf8");
  assert.match(workflow, /^name: Split CMS Page Collections\n/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n  (push|schedule|pull_request|workflow_run):/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /group: wix-page-repair\n  cancel-in-progress: false/);
  assert.match(workflow, /ref: \$\{\{ inputs.candidate_commit \|\| github.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: node --test scripts\/migrate-page-collections.test.mjs/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /name: wix-page-collections-\$\{\{ inputs.phase \}\}-\$\{\{ inputs.mode \}\}-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/wix-page-collections\/report.json/);
  assert.match(workflow, /retention-days: 14/);
  assert.doesNotMatch(workflow, /contents: write|deploy-pages|git (commit|push)/);
  for (const block of workflow.matchAll(/        run: \|\n((?:          .*\n)+)/g)) assert.doesNotMatch(block[1], /\$\{\{/);
});
