import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collections, items } from "@wix/data";
import { fundraisingFieldDefinitions, fundraisingFieldNames } from "./fundraising-fields.mjs";
import { fingerprint } from "./update-wix-page.mjs";
import { publicHtml } from "./wix-public-content.mjs";
import {
  annualFundId, fundraisingCandidates, migrateFundraising, parseOptions, publicMigrationPage, targetSlugs,
} from "./migrate-fundraising.mjs";

const sourceCommit = "a".repeat(40);
const collectionId = "WebsitePages";
const siteId = "public-site";
const emptyFields = Object.fromEntries(fundraisingFieldNames.map(key => [key, key === "goalAmount" ? null : ""]));
const pages = targetSlugs.map(slug => ({
  slug, title: "Same title", heading: `Heading for ${slug}`, description: `Description for ${slug}`,
  content: `<h2>${slug}</h2><p>Reviewed replacement with <a href="/donate/">giving instructions</a>.</p>`,
  kicker: "Public kicker", accent: "coral", ...emptyFields, campaignStatus: "evergreen",
}));
const original = slug => ({
  _id: `existing-${slug}`, _owner: "nonpublic-owner",
  _createdDate: new Date("2026-01-01T00:00:00Z"), _updatedDate: new Date("2026-09-01T00:00:00Z"),
  slug, title: "Same title", description: "Old description", body: "<p>Existing authored copy.</p>", published: true,
  kicker: "Keep existing kicker", accent: "blue", editorialNotes: "nonpublic-notes",
  nested: { unrelated: [1, { preserve: true }] }, data: { unrelated: "flat SDK data property" },
});
const schema = () => ({
  _id: collectionId, revision: "42", displayName: "Website Pages", displayField: "title", collectionType: "NATIVE",
  fields: [{ key: "slug", type: "TEXT", displayName: "Slug", systemField: false, capabilities: { sortable: true } },
    { key: "body", type: "RICH_TEXT", displayName: "Body" }],
  permissions: { read: "ANYONE", insert: "ADMIN", update: "ADMIN", remove: "ADMIN" },
  plugins: [{ type: "CMS", cmsOptions: { nonpublicMetadata: "nonpublic-schema" } }],
  capabilities: { collectionOperations: ["UPDATE"], dataOperations: ["GET", "FIND", "UPDATE", "INSERT"] },
  _createdDate: new Date("2026-01-01T00:00:00Z"), _updatedDate: new Date("2026-09-01T00:00:00Z"),
});
const secretError = () => new Error("Authorization: nonpublic-secret; private SDK response");

function mockWix({ rows = [original("donate"), original("spring-auction"), original("fall-fundraiser-2025")],
  definition = schema(), beforeRead, beforeSchemaRead, beforeWrite, afterWrite, pageSets } = {}) {
  const state = {
    rows: structuredClone(rows), schema: structuredClone(definition), writes: [], queries: [],
    reads: {}, schemaReads: 0, nexts: 0, forbidden: [],
  };
  const api = {
    query(id) {
      const query = { collectionId: id };
      state.queries.push(query);
      return {
        eq(key, slug) { Object.assign(query, { key, slug }); return this; },
        limit(limit) { query.limit = limit; return this; },
        async find(options) {
          query.options = options;
          state.reads[query.slug] = (state.reads[query.slug] || 0) + 1;
          beforeRead?.(state, query.slug);
          const matches = state.rows.filter(row => row.slug === query.slug);
          const sets = pageSets?.[query.slug] || (matches.length ? matches.map(row => [row]) : [[]]);
          const at = index => ({
            items: structuredClone(sets[index]), hasNext: () => index + 1 < sets.length,
            next: async () => { state.nexts++; return at(index + 1); },
          });
          return at(0);
        },
      };
    },
    async update(id, item, options) {
      const call = { kind: "update", collectionId: id, item, options };
      state.writes.push(structuredClone(call));
      beforeWrite?.(state, call);
      const current = state.rows.find(row => row._id === item._id);
      const condition = options.condition;
      assert.ok(condition, "No unconditional item writes");
      if (!current || current._id !== condition._id.$eq || current.slug !== condition.slug.$eq ||
        current.published !== condition.published.$eq ||
        new Date(current._updatedDate).valueOf() !== condition._updatedDate.$eq.valueOf()) throw secretError();
      const updated = { ...structuredClone(item), _updatedDate: new Date("2026-09-11T00:00:00Z") };
      state.rows = state.rows.map(row => row._id === item._id ? updated : row);
      afterWrite?.(state, call);
      return structuredClone(updated);
    },
    async insert(id, item, options) {
      const call = { kind: "insert", collectionId: id, item, options };
      state.writes.push(structuredClone(call));
      beforeWrite?.(state, call);
      if (state.rows.some(row => row._id === item._id)) throw secretError();
      const inserted = {
        ...structuredClone(item), _owner: "nonpublic-owner",
        _createdDate: new Date("2026-09-11T00:00:00Z"), _updatedDate: new Date("2026-09-11T00:00:00Z"),
      };
      state.rows.push(inserted);
      afterWrite?.(state, call);
      return structuredClone(inserted);
    },
  };
  const collectionApi = {
    async getDataCollection(id, options) {
      assert.equal(id, collectionId);
      assert.deepEqual(options, { consistentRead: true });
      state.schemaReads++;
      beforeSchemaRead?.(state);
      return structuredClone(state.schema);
    },
    async updateDataCollection(definition, ...extra) {
      assert.equal(extra.length, 0, "SDK expects a single flat collection argument");
      const call = { kind: "schema", definition };
      state.writes.push(structuredClone(call));
      beforeWrite?.(state, call);
      if (state.schema.revision !== definition.revision) throw secretError();
      state.schema = {
        ...structuredClone(definition), revision: String(BigInt(definition.revision) + 1n),
        _updatedDate: new Date("2026-09-11T00:00:00Z"),
      };
      afterWrite?.(state, call);
      return structuredClone(state.schema);
    },
  };
  for (const name of ["save", "remove", "bulkUpdate", "createDataCollection", "deleteDataCollection"]) {
    api[name] = collectionApi[name] = () => { state.forbidden.push(name); throw secretError(); };
  }
  return { api, collectionApi, state };
}

const options = (mock, overrides = {}) => ({
  api: mock.api, collectionApi: mock.collectionApi, collectionId, siteId, pages, sourceCommit, ...overrides,
});
const approval = plan => ({
  mode: "apply", expectedCommit: plan.sourceCommit,
  expectedFingerprint: plan.expectedFingerprint, expectedCandidateFingerprint: plan.candidateFingerprint,
});
const capture = reports => async report => reports.push(structuredClone(report));

test("candidates use only exact fixed slugs, flat fundraising fields, and content as body", () => {
  const candidates = fundraisingCandidates([...pages, { ...pages[0], slug: "other", content: "Untouched" }]);
  assert.deepEqual(candidates.map(page => page.slug), targetSlugs);
  assert.equal(candidates[0].body, pages[0].content);
  assert.equal(candidates[0].goalAmount, null);
  assert.equal(candidates[0].heroImage, "");
  assert.equal(Object.hasOwn(candidates[0], "content"), false);
  assert.throws(() => fundraisingCandidates([...pages, pages[0]]), /exactly one/);
  assert.throws(() => fundraisingCandidates(pages.slice(1)), /exactly one/);
  assert.throws(() => fundraisingCandidates([{ ...pages[0], home: true }, ...pages.slice(1)]), /exactly one/);
  for (const key of fundraisingFieldNames) {
    const candidate = { ...pages[0] };
    delete candidate[key];
    assert.throws(() => fundraisingCandidates([candidate, ...pages.slice(1)]), /explicitly define/);
  }
});

test("candidate validation reuses shared status, date, amount, image and URL guards", () => {
  for (const change of [
    { campaignStatus: "draft" }, { deadline: "2026-02-30" }, { goalAmount: -1 },
    { primaryCtaUrl: "javascript:alert(1)" }, { primaryCtaUrl: "//evil.example" },
    { heroImage: "/private.png" }, { heroImage: "/assets/test.jpg", heroAlt: "" },
    { content: "<script>empty</script>" },
  ]) assert.throws(() => fundraisingCandidates([{ ...pages[0], ...change }, ...pages.slice(1)]));
  for (const image of ["/assets/test.jpg", "https://example.org/image.jpg", "wix:image://v1/abc~mv2.jpg/name.jpg"]) {
    const candidate = fundraisingCandidates([{ ...pages[0], heroImage: image, heroAlt: "A public image" }, ...pages.slice(1)])[0];
    assert.match(candidate.heroImage, /^(?:\/assets\/|https:\/\/)/);
  }
  for (const url of ["https://example.org/donate", "mailto:fundraising@montlakepta.org", "/donate/"]) {
    assert.equal(fundraisingCandidates([{ ...pages[0], primaryCtaUrl: url }, ...pages.slice(1)])[0].primaryCtaUrl, url);
  }
});

test("migration preserves blank statuses and stored actions without calculating derived campaign state", () => {
  for (const status of ["", "upcoming", "closed", "archived", "active", "evergreen"]) {
    const candidate = fundraisingCandidates([{
      ...pages[0], campaignStatus: status, deadline: "2020-01-01",
      primaryCtaLabel: "Stored action", primaryCtaUrl: "https://example.org/giving",
    }, ...pages.slice(1)])[0];
    assert.equal(candidate.campaignStatus, status);
    assert.equal(candidate.deadline, "2020-01-01");
    assert.equal(candidate.primaryCtaLabel, "Stored action");
    assert.equal(candidate.primaryCtaUrl, "https://example.org/giving");
  }
});

test("public reports sanitize all copy and redact conferencing credentials without exporting metadata", () => {
  const page = publicMigrationPage({
    ...original("donate"), ...emptyFields, campaignStatus: "active",
    title: "Public title\nPasscode: nonpublic-secret",
    body: '<p>Welcome</p><script>evil-script</script><p>Meeting ID: nonpublic-secret</p>',
    equityBody: '<p onclick="evil()">Everyone belongs.</p><p>Password: nonpublic-secret</p>',
  });
  assert.doesNotMatch(JSON.stringify(page), /nonpublic-|_owner|_id|editorialNotes|nested|onclick|evil-script/);
  assert.equal(page.title, "Public title");
  assert.equal(page.campaignStatus, "active");
});

test("plan reads schema and only exact targets; fingerprints full private state but exports public before/proposed", async () => {
  const mock = mockWix();
  const before = structuredClone(mock.state.rows);
  const reports = [];
  const plan = await migrateFundraising(options(mock, { saveReport: capture(reports) }));
  assert.equal(plan.status, "planned");
  assert.equal(plan.canApply, true);
  assert.deepEqual(plan.records.map(record => record.operation), ["update", "insert", "update"]);
  assert.equal(plan.records[1].before, null);
  assert.equal(plan.schema.additions.length, fundraisingFieldNames.length);
  assert.deepEqual(plan.applyInputs, {
    mode: "apply", candidate_commit: sourceCommit, expected_fingerprint: plan.expectedFingerprint,
    expected_candidate_fingerprint: plan.candidateFingerprint,
  });
  assert.match(plan.expectedFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(plan.atomic, false);
  assert.match(plan.recovery, /not atomic/);
  assert.equal(plan.writeAttempted, false);
  assert.deepEqual(mock.state.rows, before);
  assert.equal(mock.state.writes.length, 0);
  assert.deepEqual(mock.state.forbidden, []);
  assert.doesNotMatch(JSON.stringify(reports), /nonpublic-|permissions|capabilities|editorialNotes|_owner|_createdDate/);
  assert.deepEqual(mock.state.queries.map(query => query.slug), targetSlugs);
  for (const query of mock.state.queries) {
    assert.equal(query.key, "slug");
    assert.equal(query.limit, 100);
    assert.deepEqual(query.options, { consistentRead: true, showDrafts: false });
  }
});

test("duplicate slugs on subsequent pages, including custom unpublished records, fail closed", async () => {
  const mock = mockWix({ rows: [original("donate"), { ...original("donate"), _id: "duplicate", published: false }] });
  await assert.rejects(migrateFundraising(options(mock)), /Duplicate slug/);
  assert.equal(mock.state.nexts, 1);
  assert.equal(mock.state.writes.length, 0);
  const emptyFirstPage = mockWix({ pageSets: { donate: [[], [original("donate")]] } });
  assert.equal((await migrateFundraising(options(emptyFirstPage))).status, "planned");
});

test("missing required existing records are public plan blockers, never insertions", async () => {
  for (const slug of ["donate", "spring-auction"]) {
    const mock = mockWix({ rows: [original("donate"), original("spring-auction")].filter(row => row.slug !== slug) });
    const plan = await migrateFundraising(options(mock));
    assert.equal(plan.status, "blocked");
    assert.match(plan.blockers.join(" "), /only annual-fund may be inserted/);
    await assert.rejects(migrateFundraising(options(mock, approval(plan))), /blocked/);
    assert.equal(mock.state.writes.length, 0);
  }
});

test("existing authored Annual Fund is shown but blocked unless it exactly matches the managed candidate", async () => {
  const mock = mockWix();
  mock.state.rows.push(original("annual-fund"));
  const plan = await migrateFundraising(options(mock));
  assert.equal(plan.status, "blocked");
  assert.equal(plan.records[1].before.body, "<p>Existing authored copy.</p>");
  assert.equal(plan.records[1].operation, "blocked");
  assert.match(plan.blockers.join(" "), /will not overwrite/);
  await assert.rejects(migrateFundraising(options(mock, approval(plan))), /blocked/);
  assert.equal(mock.state.writes.length, 0);

  const current = { ...original("annual-fund"), ...fundraisingCandidates(pages)[1], customAnnualFact: "retain" };
  const match = mockWix({ rows: [original("donate"), current, original("spring-auction")] });
  const matchingPlan = await migrateFundraising(options(match));
  assert.equal(matchingPlan.records[1].operation, "preserve");
  await migrateFundraising(options(match, approval(matchingPlan)));
  assert.deepEqual(match.state.rows.find(row => row.slug === "annual-fund"), current);
  assert.equal(match.state.writes.filter(write => write.item?.slug === "annual-fund").length, 0);
});

test("invalid existing identities, dates, publication and malformed pagination never produce writes", async () => {
  for (const change of [{ _id: "" }, { _updatedDate: null }, { _updatedDate: "invalid" }, { published: false }, { published: undefined }]) {
    const mock = mockWix({ rows: [{ ...original("donate"), ...change }] });
    await assert.rejects(migrateFundraising(options(mock)), /existing donate record/);
    assert.equal(mock.state.writes.length, 0);
  }
  const malformed = mockWix({ pageSets: { donate: [undefined] } });
  await assert.rejects(migrateFundraising(options(malformed)), /invalid page query/);
});

test("incompatible schema types and missing revisions are reviewable plan blockers", async () => {
  for (const change of [
    current => current.fields.push({ key: "goalAmount", type: "TEXT", displayName: "Do not overwrite" }),
    current => { delete current.revision; },
  ]) {
    const definition = schema();
    change(definition);
    const mock = mockWix({ definition });
    const plan = await migrateFundraising(options(mock));
    assert.equal(plan.status, "blocked");
    assert.equal(plan.canApply, false);
    await assert.rejects(migrateFundraising(options(mock, approval(plan))), /blocked/);
    assert.equal(mock.state.writes.length, 0);
  }
  for (const change of [
    current => { delete current.permissions; },
    current => current.fields.push(current.fields[0]),
    current => { current._id = "other"; },
  ]) {
    const definition = schema();
    change(definition);
    await assert.rejects(migrateFundraising(options(mockWix({ definition }))));
  }
});

test("apply rejects missing, malformed or changed commit/candidate approval before any Wix read", async () => {
  const mock = mockWix();
  const plan = await migrateFundraising(options(mock));
  const reads = mock.state.schemaReads;
  for (const change of [
    { expectedCommit: undefined }, { expectedCommit: "main" }, { expectedCommit: "b".repeat(40) },
    { sourceCommit: "HEAD" }, { sourceCommit: "A".repeat(40) },
    { expectedFingerprint: "" }, { expectedFingerprint: "x".repeat(64) },
    { expectedCandidateFingerprint: "b".repeat(64) },
    { pages: [{ ...pages[0], content: "<p>Unreviewed copy.</p>" }, ...pages.slice(1)] },
  ]) await assert.rejects(migrateFundraising(options(mock, { ...approval(plan), ...change })));
  assert.equal(mock.state.schemaReads, reads);
  assert.equal(mock.state.writes.length, 0);
  await assert.rejects(migrateFundraising(options(mock, { expectedCommit: "refs/heads/main" })), /candidate_commit/);
});

test("full live approval includes private record data, schema permissions/metadata, and Annual Fund absence", async () => {
  for (const mutate of [
    state => { state.rows[0].editorialNotes = "changed-private-note"; },
    state => { state.rows[0]._id = "different-identity"; },
    state => { state.rows[0].trustBody = "<p>Newly authored donor information.</p>"; },
    state => { state.schema.permissions.read = "ADMIN"; },
    state => { state.schema.plugins[0].cmsOptions.nonpublicMetadata = "changed"; },
    state => { state.schema.revision = "43"; },
    state => { state.rows.push({ ...original("annual-fund"), ...fundraisingCandidates(pages)[1] }); },
  ]) {
    const mock = mockWix();
    const plan = await migrateFundraising(options(mock));
    mutate(mock.state);
    await assert.rejects(migrateFundraising(options(mock, approval(plan))), /changed since the plan/);
    assert.equal(mock.state.writes.length, 0);
  }
  const mock = mockWix();
  const plan = await migrateFundraising(options(mock));
  await assert.rejects(migrateFundraising(options(mock, { ...approval(plan), siteId: "other-site" })), /changed since the plan/);
});

test("live approval distinguishes genuinely absent optional fields from explicit null clears in either direction", async () => {
  for (const initiallyPresent of [false, true]) {
    const mock = mockWix();
    mock.state.rows[0].campaignStatus = "active";
    if (initiallyPresent) mock.state.rows[0].goalAmount = null;
    assert.equal(Object.hasOwn(mock.state.rows[0], "goalAmount"), initiallyPresent);
    const plan = await migrateFundraising(options(mock));
    assert.equal(Object.hasOwn(plan.records[0].before, "goalAmount"), initiallyPresent);
    if (initiallyPresent) assert.equal(plan.records[0].before.goalAmount, null);
    if (initiallyPresent) delete mock.state.rows[0].goalAmount;
    else mock.state.rows[0].goalAmount = null;
    assert.equal(Object.hasOwn(mock.state.rows[0], "goalAmount"), !initiallyPresent);
    const nextPlan = await migrateFundraising(options(mock));
    assert.notEqual(nextPlan.expectedFingerprint, plan.expectedFingerprint);
    assert.equal(nextPlan.candidateFingerprint, plan.candidateFingerprint);
    await assert.rejects(migrateFundraising(options(mock, approval(plan))), /changed since the plan/);
    assert.equal(mock.state.writes.length, 0);
  }
});

test("no-op detection requires explicit candidate clears rather than treating absence as null", async () => {
  for (const initiallyPresent of [false, true]) {
    const rows = fundraisingCandidates(pages).map(candidate => ({ ...original(candidate.slug), ...candidate }));
    if (!initiallyPresent) delete rows[0].goalAmount;
    const definition = schema();
    definition.fields.push(...fundraisingFieldDefinitions);
    const mock = mockWix({ rows, definition });
    const plan = await migrateFundraising(options(mock));
    assert.equal(plan.records[0].operation, initiallyPresent ? "preserve" : "update");
    const result = await migrateFundraising(options(mock, approval(plan)));
    assert.equal(result.status, initiallyPresent ? "already-current" : "applied");
    assert.equal(mock.state.writes.length, initiallyPresent ? 0 : 1);
    assert.equal(Object.hasOwn(mock.state.rows[0], "goalAmount"), true);
    assert.equal(mock.state.rows[0].goalAmount, null);
    assert.deepEqual(mock.state.rows[0].nested, rows[0].nested);
    assert.equal(mock.state.rows[0].editorialNotes, rows[0].editorialNotes);
  }
});

test("apply adds only missing fields, preserving full schema and every unrelated item field/archive", async () => {
  const definition = schema();
  definition.fields.push({ ...fundraisingFieldDefinitions[0], displayName: "Preserve editor label", encrypted: false });
  const mock = mockWix({ definition });
  const before = structuredClone(mock.state.rows);
  const plan = await migrateFundraising(options(mock));
  const result = await migrateFundraising(options(mock, approval(plan)));
  assert.equal(result.status, "applied");
  assert.deepEqual(result.records.map(record => record.status), ["applied", "applied", "applied"]);
  assert.deepEqual(mock.state.writes.map(write => write.kind), ["schema", "update", "insert", "update"]);
  const schemaWrite = mock.state.writes[0].definition;
  assert.deepEqual(schemaWrite, {
    ...definition, fields: [...definition.fields, ...fundraisingFieldDefinitions.slice(1)],
  });
  assert.equal(mock.state.schema.revision, "43");
  for (const slug of ["donate", "spring-auction"]) {
    const item = mock.state.rows.find(row => row.slug === slug);
    const old = before.find(row => row.slug === slug);
    for (const key of ["_id", "_owner", "_createdDate", "kicker", "accent", "editorialNotes", "nested", "data"]) {
      assert.deepEqual(item[key], old[key]);
    }
    const write = mock.state.writes.find(call => call.item?.slug === slug);
    assert.deepEqual(write.options, {
      showDrafts: false, condition: {
        _id: { $eq: old._id }, _updatedDate: { $eq: old._updatedDate },
        slug: { $eq: slug }, published: { $eq: true },
      },
    });
  }
  assert.deepEqual(mock.state.rows.find(row => row.slug === "fall-fundraiser-2025"), before[2]);
  const annual = mock.state.rows.find(row => row.slug === "annual-fund");
  assert.equal(annual._id, annualFundId(siteId, collectionId));
  assert.equal(annual.kicker, pages[1].kicker);
  assert.deepEqual(mock.state.forbidden, []);
  assert.match(result.verifiedFingerprint, /^[a-f0-9]{64}$/);
});

test("already-current requires a fresh reviewed plan and performs no schema or item writes", async () => {
  const mock = mockWix();
  const firstPlan = await migrateFundraising(options(mock));
  await migrateFundraising(options(mock, approval(firstPlan)));
  const writes = mock.state.writes.length;
  await assert.rejects(migrateFundraising(options(mock, approval(firstPlan))), /changed since the plan/);
  const freshPlan = await migrateFundraising(options(mock));
  assert.equal(freshPlan.schema.additions.length, 0);
  const result = await migrateFundraising(options(mock, approval(freshPlan)));
  assert.equal(result.status, "already-current");
  assert.equal(result.writeAttempted, false);
  assert.deepEqual(result.records.map(record => record.status), ["already-current", "already-current", "already-current"]);
  assert.equal(mock.state.writes.length, writes);
});

test("explicit blanks clear prior campaign facts and content rather than preserving old values", async () => {
  const mock = mockWix();
  const clearedPages = [{ ...pages[0], campaignStatus: "" }, ...pages.slice(1)];
  Object.assign(mock.state.rows[0], {
    campaignStatus: "active", schoolYear: "2025-2026", goalAmount: 50000, deadline: "2026-05-01",
    primaryCtaLabel: "Old ask", primaryCtaUrl: "https://example.org/past",
    heroImage: "https://example.org/old.jpg", heroAlt: "Old image", heroCaption: "Old caption",
    impactBody: "<p>Old impact</p>", equityBody: "<p>Old equity</p>", trustBody: "<p>Old trust</p>",
  });
  const plan = await migrateFundraising(options(mock, { pages: clearedPages }));
  assert.equal(plan.records[0].before.goalAmount, 50000);
  assert.equal(plan.records[0].proposed.goalAmount, null);
  await migrateFundraising(options(mock, { ...approval(plan), pages: clearedPages }));
  const row = mock.state.rows.find(item => item.slug === "donate");
  for (const key of fundraisingFieldNames) assert.equal(row[key], clearedPages[0][key]);
});

test("preflight detects edits made while the safe report is being persisted", async () => {
  const mock = mockWix();
  const plan = await migrateFundraising(options(mock));
  await assert.rejects(migrateFundraising(options(mock, {
    ...approval(plan),
    saveReport: async report => {
      if (report.status === "ready-to-apply") mock.state.rows[0].nested.unrelated.push("concurrent edit");
    },
  })), /changed during preflight/);
  assert.equal(mock.state.writes.length, 0);
});

test("a caught last-moment preflight failure reports no write when no API write was sent", async () => {
  for (const schemaReady of [false, true]) {
    const definition = schema();
    if (schemaReady) definition.fields.push(...fundraisingFieldDefinitions);
    const mock = mockWix({ definition });
    const plan = await migrateFundraising(options(mock));
    const reports = [];
    let mutated = false;
    await assert.rejects(migrateFundraising(options(mock, {
      ...approval(plan), saveReport: async report => {
        reports.push(structuredClone(report));
        if (mutated) return;
        if (!schemaReady && report.schema?.status === "write-attempted") {
          mock.state.schema.displayName = "Concurrent schema edit";
          mutated = true;
        } else if (schemaReady && report.records[0]?.status === "write-attempted") {
          mock.state.rows[0].editorialNotes = "Concurrent item edit";
          mutated = true;
        }
      },
    })), /changed during preflight/);
    assert.equal(mock.state.writes.length, 0);
    assert.equal(reports.at(-1).writeAttempted, false);
    assert.equal(reports.at(-1).status, "failed");
    assert.equal(schemaReady ? reports.at(-1).records[0].status : reports.at(-1).schema.status, "not-written");
  }
});

test("schema revision race after preflight fails without an unguarded retry or leaked SDK data", async () => {
  const mock = mockWix({ beforeWrite: (state, call) => {
    if (call.kind === "schema") state.schema.revision = "43";
  } });
  const plan = await migrateFundraising(options(mock));
  const reports = [];
  await assert.rejects(migrateFundraising(options(mock, { ...approval(plan), saveReport: capture(reports) })), /Revision-guarded/);
  assert.equal(mock.state.writes.length, 1);
  assert.equal(reports.at(-1).status, "partial-failure");
  assert.equal(reports.at(-1).schema.status, "write-attempted");
  assert.doesNotMatch(JSON.stringify(reports), /nonpublic-|Authorization|SDK response/);
});

test("schema read-back rejects lost permissions, metadata, old fields, or missing additions before any item write", async () => {
  for (const mutate of [
    state => { state.schema.permissions.read = "ADMIN"; },
    state => { state.schema.displayField = "slug"; },
    state => { state.schema.fields[0].displayName = "Unexpected"; },
    state => { state.schema.fields.pop(); },
    state => { state.schema.revision = "42"; },
  ]) {
    const mock = mockWix({ afterWrite: (state, call) => { if (call.kind === "schema") mutate(state); } });
    const plan = await migrateFundraising(options(mock));
    await assert.rejects(migrateFundraising(options(mock, approval(plan))), /Schema read-back/);
    assert.equal(mock.state.writes.length, 1);
  }
});

test("each original record/absence is rechecked after earlier successful writes", async () => {
  for (const slug of ["annual-fund", "spring-auction"]) {
    const mock = mockWix({ afterWrite: (state, call) => {
      if (call.item?.slug !== "donate") return;
      if (slug === "annual-fund") state.rows.push(original(slug));
      else state.rows.find(row => row.slug === slug).editorialNotes = "concurrent later-page edit";
    } });
    const plan = await migrateFundraising(options(mock));
    const reports = [];
    await assert.rejects(migrateFundraising(options(mock, { ...approval(plan), saveReport: capture(reports) })), /changed during preflight/);
    assert.equal(mock.state.writes.filter(call => call.item?.slug === slug).length, 0);
    assert.equal(reports.at(-1).status, "partial-failure");
    assert.equal(reports.at(-1).records[0].status, "applied");
  }
});

test("item conditional race preserves the editor change with no fallback retry", async () => {
  const mock = mockWix({ beforeWrite: (state, call) => {
    if (call.kind === "update" && call.item.slug === "donate") {
      Object.assign(state.rows[0], { title: "Concurrent edit wins", _updatedDate: new Date("2026-09-11T01:00:00Z") });
    }
  } });
  const plan = await migrateFundraising(options(mock));
  await assert.rejects(migrateFundraising(options(mock, approval(plan))), /Guarded Wix donate write failed/);
  assert.equal(mock.state.rows[0].title, "Concurrent edit wins");
  assert.deepEqual(mock.state.writes.map(call => call.kind), ["schema", "update"]);
});

test("read-back verifies page content, identity, unrelated fields, and unique slug", async () => {
  for (const mutate of [
    state => { state.rows[0].body = "<p>Hook changed body</p>"; },
    state => { delete state.rows[0].heroImage; },
    state => { state.rows[0]._id = "changed"; },
    state => { state.rows[0].nested.unrelated.pop(); },
    state => { state.rows.push({ ...state.rows[0], _id: "duplicate" }); },
  ]) {
    const mock = mockWix({ afterWrite: (state, call) => { if (call.item?.slug === "donate") mutate(state); } });
    const plan = await migrateFundraising(options(mock));
    const reports = [];
    await assert.rejects(migrateFundraising(options(mock, { ...approval(plan), saveReport: capture(reports) })), /Read-back|Duplicate slug/);
    assert.equal(reports.at(-1).records[0].after, null);
    assert.equal(reports.at(-1).records[0].status, "write-attempted");
    assert.equal(mock.state.writes.length, 2);
  }
});

test("every new rich-text field is read-back guarded against replacement, deletion and null", async () => {
  const richPages = [{
    ...pages[0],
    impactBody: "<h2>Impact</h2><p>Reviewed impact information.</p>",
    equityBody: "<h2>Participation</h2><p>Reviewed participation information.</p>",
    trustBody: '<h2>Donor information</h2><p><a href="/donate/">Reviewed donor guidance</a>.</p>',
  }, ...pages.slice(1)];
  for (const key of ["impactBody", "equityBody", "trustBody"]) {
    for (const change of ["replace", "delete", "null"]) {
      const mock = mockWix({ afterWrite: (state, call) => {
        if (call.item?.slug !== "donate") return;
        if (change === "delete") delete state.rows[0][key];
        else state.rows[0][key] = change === "null" ? null : "<p>Unreviewed hook replacement.</p>";
      } });
      const plan = await migrateFundraising(options(mock, { pages: richPages }));
      const reports = [];
      await assert.rejects(migrateFundraising(options(mock, {
        ...approval(plan), pages: richPages, saveReport: capture(reports),
      })), /Read-back verification failed for donate/);
      assert.equal(reports.at(-1).status, "partial-failure");
      assert.equal(reports.at(-1).records[0].after, null);
      assert.equal(reports.at(-1).records[0].verifiedFingerprint, null);
      assert.equal(mock.state.writes.length, 2);
      assert.deepEqual(mock.state.rows[0].nested, original("donate").nested);
      assert.deepEqual(mock.state.forbidden, []);
    }
  }
});

test("deterministic insert IDs reject collisions, and post-insert duplicates fail verification without deletion", async () => {
  assert.equal(annualFundId(siteId, collectionId), annualFundId(siteId, collectionId));
  assert.notEqual(annualFundId(siteId, collectionId), annualFundId("other-site", collectionId));
  assert.match(annualFundId(siteId, collectionId), /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  const collision = mockWix();
  collision.state.rows.push({ ...original("unrelated"), _id: annualFundId(siteId, collectionId) });
  const plan = await migrateFundraising(options(collision));
  await assert.rejects(migrateFundraising(options(collision, approval(plan))), /Guarded Wix annual-fund write failed/);
  assert.equal(collision.state.rows.filter(row => row.slug === "annual-fund").length, 0);
  const duplicate = mockWix({ afterWrite: (state, call) => {
    if (call.kind === "insert") state.rows.push({ ...original("annual-fund"), _id: "concurrent-insert" });
  } });
  const duplicatePlan = await migrateFundraising(options(duplicate));
  await assert.rejects(migrateFundraising(options(duplicate, approval(duplicatePlan))), /Duplicate slug/);
  assert.equal(duplicate.state.rows.filter(row => row.slug === "annual-fund").length, 2);
  assert.deepEqual(duplicate.state.forbidden, []);
});

test("partial apply reports confirmed writes and unknown outcome; a new reviewed plan safely resumes", async () => {
  let failOnce = true;
  const mock = mockWix({ afterWrite: (_state, call) => {
    if (call.kind === "insert" && failOnce) { failOnce = false; throw secretError(); }
  } });
  const firstPlan = await migrateFundraising(options(mock));
  const reports = [];
  await assert.rejects(migrateFundraising(options(mock, { ...approval(firstPlan), saveReport: capture(reports) })), /outcome is unknown/);
  const failure = reports.at(-1);
  assert.equal(failure.status, "partial-failure");
  assert.equal(failure.schema.status, "applied");
  assert.equal(failure.records[0].status, "applied");
  assert.equal(failure.records[1].status, "write-attempted");
  assert.equal(failure.records[1].after, null);
  assert.equal(failure.records[2].status, "pending");
  assert.equal(failure.verifiedFingerprint, null);
  assert.doesNotMatch(JSON.stringify(failure), /nonpublic-|Authorization/);
  await assert.rejects(migrateFundraising(options(mock, approval(firstPlan))), /changed since the plan/);
  const nextPlan = await migrateFundraising(options(mock));
  assert.deepEqual(nextPlan.records.map(record => record.operation), ["preserve", "preserve", "update"]);
  assert.equal((await migrateFundraising(options(mock, approval(nextPlan)))).status, "applied");
  assert.equal(mock.state.writes.filter(call => call.kind === "insert").length, 1);
  assert.equal(mock.state.writes.filter(call => call.kind === "schema").length, 1);
});

test("final consistency check catches an earlier page edited after its read-back", async () => {
  const mock = mockWix({ afterWrite: (state, call) => {
    if (call.item?.slug === "spring-auction") state.rows[0].editorialNotes = "changed after verified";
  } });
  const plan = await migrateFundraising(options(mock));
  const reports = [];
  await assert.rejects(migrateFundraising(options(mock, { ...approval(plan), saveReport: capture(reports) })), /changed after read-back/);
  assert.equal(reports.at(-1).status, "partial-failure");
  assert.equal(reports.at(-1).verifiedFingerprint, null);
  assert.deepEqual(reports.at(-1).records.map(record => record.status), ["applied", "applied", "applied"]);
});

test("query, schema, pagination, and report-save errors stay explicit and do not leak raw error details", async () => {
  for (const hooks of [{ beforeRead: () => { throw secretError(); } }, { beforeSchemaRead: () => { throw secretError(); } }]) {
    const mock = mockWix(hooks);
    const reports = [];
    await assert.rejects(migrateFundraising(options(mock, { saveReport: capture(reports) })), /failed/);
    assert.equal(reports.at(-1).status, "failed");
    assert.doesNotMatch(JSON.stringify(reports), /nonpublic-|Authorization/);
  }
  const pagination = mockWix();
  pagination.api.query = () => ({
    eq() { return this; }, limit() { return this; },
    async find() { return { items: [], hasNext: () => true, next: async () => { throw secretError(); } }; },
  });
  await assert.rejects(migrateFundraising(options(pagination)), /pagination failed/);
  const mock = mockWix();
  const plan = await migrateFundraising(options(mock));
  await assert.rejects(migrateFundraising(options(mock, {
    ...approval(plan), saveReport: async () => { throw secretError(); },
  })), /public report could not be saved/);
  assert.equal(mock.state.writes.length, 0);
});

test("installed SDK getters/updates use flat collections and forward revisions and item date conditions", async () => {
  const requests = [];
  const http = {
    request: async factory => {
      const request = factory({ host: "https://www.wixapis.com" });
      requests.push(request);
      return { data: request.data?.collection ? { collection: structuredClone(request.data.collection) } :
        request.data?.dataItem ? { dataItem: structuredClone(request.data.dataItem) } :
          { collection: { id: collectionId, revision: "42", fields: [] } } };
    },
  };
  const got = await collections.getDataCollection(http)(collectionId, { consistentRead: true });
  assert.equal(got._id, collectionId);
  assert.equal(got.revision, "42");
  assert.equal(Object.hasOwn(got, "collection"), false);
  assert.equal(requests[0].params.get("consistentRead"), "true");
  const definition = schema();
  const updated = await collections.updateDataCollection(http)(definition);
  assert.equal(requests[1].data.collection.id, collectionId);
  assert.equal(requests[1].data.collection.revision, definition.revision);
  assert.deepEqual(requests[1].data.collection.permissions, definition.permissions);
  assert.equal(updated._id, collectionId);
  const row = original("donate");
  const condition = {
    _id: { $eq: row._id }, _updatedDate: { $eq: row._updatedDate },
    slug: { $eq: row.slug }, published: { $eq: true },
  };
  assert.deepEqual(await items.update(http)(collectionId, row, { condition, showDrafts: false }), row);
  assert.deepEqual(requests[2].data.condition.filter, {
    ...condition, _updatedDate: { $eq: { $date: row._updatedDate.toISOString() } },
  });
  assert.equal(requests[2].data.publishPluginOptions.includeDraftItems, false);
  assert.equal(requests[2].data.suppressHooks, undefined);
  const insertion = { _id: annualFundId(siteId, collectionId), ...fundraisingCandidates(pages)[1] };
  assert.deepEqual(await items.insert(http)(collectionId, insertion, { showDrafts: false }), insertion);
  assert.equal(requests[3].data.dataItem.id, insertion._id);
  assert.equal(requests[3].data.publishPluginOptions.includeDraftItems, false);
});

test("CLI defaults to fixed-target plan, refuses missing credentials, and writes only a safe fresh report", async () => {
  assert.equal(parseOptions([]).mode, "plan");
  assert.throws(() => parseOptions(["--slug", "fall-fundraiser-2025"]), /targets are fixed/);
  const parent = await mkdtemp(join(tmpdir(), "fundraising-test-"));
  const output = join(parent, "report");
  try {
    const child = spawnSync(process.execPath, ["scripts/migrate-fundraising.mjs", "--output-dir", output], {
      cwd: new URL("../", import.meta.url), env: { ...process.env, WIX_API_KEY: "" }, encoding: "utf8",
    });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, "");
    assert.match(child.stderr, /WIX_API_KEY is required/);
    assert.doesNotMatch(child.stderr, /at main|Authorization|ApiKeyStrategy/);
    assert.deepEqual(await readdir(output), ["report.json"]);
    const reportText = await readFile(join(output, "report.json"), "utf8");
    assert.equal(JSON.parse(reportText).writeAttempted, false);
    const repeat = spawnSync(process.execPath, ["scripts/migrate-fundraising.mjs", "--output-dir", output], {
      cwd: new URL("../", import.meta.url), env: { ...process.env, WIX_API_KEY: "" }, encoding: "utf8",
    });
    assert.equal(repeat.status, 1);
    assert.match(repeat.stderr, /new output directory/);
    assert.equal(await readFile(join(output, "report.json"), "utf8"), reportText);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("repository source candidates and offline public snapshot can be inspected without credentials", async () => {
  const { pages: sourcePages } = await import("../src/site.mjs");
  assert.deepEqual(fundraisingCandidates(sourcePages).map(page => page.slug), targetSlugs);
  const snapshot = JSON.parse(await readFile(new URL("../src/data/wix-content.json", import.meta.url), "utf8"));
  for (const row of snapshot.cms.pages.filter(page => targetSlugs.includes(page.slug))) {
    assert.equal(publicMigrationPage(row).slug, row.slug);
  }
});

test("ready source bodies and all campaign fields survive a mocked migration without replacing unrelated data", async () => {
  const { pages: sourcePages } = await import("../src/site.mjs");
  const candidates = fundraisingCandidates(sourcePages);
  const mock = mockWix();
  const before = structuredClone(mock.state.rows);
  const plan = await migrateFundraising(options(mock, { pages: sourcePages }));
  const result = await migrateFundraising(options(mock, { ...approval(plan), pages: sourcePages }));
  assert.equal(result.status, "applied");
  for (const [index, candidate] of candidates.entries()) {
    const source = sourcePages.find(page => page.slug === candidate.slug);
    const verified = mock.state.rows.find(row => row.slug === candidate.slug);
    assert.equal(verified.body, publicHtml(source.content));
    assert.equal(result.records[index].after.body, publicHtml(source.content));
    for (const key of fundraisingFieldNames) {
      assert.equal(Object.hasOwn(verified, key), true);
      assert.equal(verified[key], candidate[key]);
      assert.equal(result.records[index].after[key], candidate[key]);
    }
    for (const key of ["impactBody", "equityBody", "trustBody"]) {
      assert.equal(verified[key], publicHtml(source[key].trim()));
    }
    const old = before.find(row => row.slug === candidate.slug);
    if (old) {
      const replacement = Object.fromEntries(["title", "heading", "description", "body", ...fundraisingFieldNames]
        .map(key => [key, candidate[key]]));
      assert.deepEqual(verified, { ...old, ...replacement, _updatedDate: verified._updatedDate });
    }
  }
  assert.deepEqual(mock.state.rows.find(row => row.slug === "fall-fundraiser-2025"), before[2]);
});

test("manual workflow uses pinned candidate, Node 24, focused tests, and one allowlisted short-lived artifact", async () => {
  const workflow = await readFile(new URL("../.github/workflows/migrate-fundraising.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n  (push|pull_request|schedule|workflow_run):/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /ref: \$\{\{ inputs.candidate_commit \|\| github.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: node --test scripts\/migrate-fundraising.test.mjs/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/wix-fundraising\/report.json/);
  assert.match(workflow, /retention-days: 14/);
  assert.doesNotMatch(workflow, /contents: write|deploy-pages|git (commit|push)|--slug/);
  for (const runBlock of workflow.matchAll(/        run: \|\n((?:          .*\n)+)/g)) {
    assert.doesNotMatch(runBlock[1], /\$\{\{/);
  }
});
