import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  candidateForPage, fingerprint, parseOptions, publicPage, readUniquePage, updateWixPage,
} from "./update-wix-page.mjs";

const sourceCommit = "a".repeat(40);
const pages = [{
  slug: "enrichment", title: "Enrichment", heading: "After-school enrichment",
  description: "Register and plan pickup.", content: '<h2>Register</h2><p class="lead">Public copy.</p>',
}];
const original = () => ({
  _id: "existing-page-id",
  _owner: "nonpublic-owner",
  _createdDate: new Date("2026-01-01T00:00:00.000Z"),
  _updatedDate: new Date("2026-09-01T00:00:00.000Z"),
  slug: "enrichment", title: "Old title", description: "Old description",
  body: "<p>Old body.</p>", published: true,
  kicker: "Montlake PTA", accent: "blue",
  editorialNotes: "nonpublic-note",
  customFields: { nested: ["preserve", { value: 1 }] },
  data: { unrelatedCustomField: "preserve-flat-item-data-property" },
});

function mockWix({ rows = [original()], pageSize = 1, pageSets, beforeRead, beforeUpdate, afterUpdate } = {}) {
  const state = {
    rows: structuredClone(rows), reads: 0, nexts: 0, writes: [], queries: [],
    forbidden: [],
  };
  const api = {
    query(collectionId) {
      const query = { collectionId };
      state.queries.push(query);
      return {
        eq(field, value) { query.field = field; query.value = value; return this; },
        limit(value) { query.limit = value; return this; },
        async find(options) {
          state.reads++;
          query.options = options;
          beforeRead?.(state);
          const matched = state.rows.filter((row) => row.slug === query.value);
          const sets = pageSets || Array.from(
            { length: Math.max(1, Math.ceil(matched.length / pageSize)) },
            (_, index) => matched.slice(index * pageSize, (index + 1) * pageSize),
          );
          const at = (index) => ({
            items: structuredClone(sets[index]),
            hasNext: () => index + 1 < sets.length,
            next: async () => { state.nexts++; return at(index + 1); },
          });
          return at(0);
        },
      };
    },
    async update(collectionId, item, options) {
      state.writes.push(structuredClone({ collectionId, item, options }));
      beforeUpdate?.(state);
      const current = state.rows.find((row) => row._id === item._id);
      assert.ok(options.condition, "Every update must be conditional");
      const condition = options.condition;
      if (!current || current._id !== condition._id.$eq ||
        current.slug !== condition.slug.$eq || current.published !== condition.published.$eq ||
        new Date(current._updatedDate).valueOf() !== condition._updatedDate.$eq.valueOf()) {
        throw new Error("SDK request headers: Authorization=nonpublic-secret");
      }
      const updated = { ...structuredClone(item), _updatedDate: new Date("2026-09-09T00:00:00.000Z") };
      state.rows = state.rows.map((row) => row._id === item._id ? updated : row);
      afterUpdate?.(state);
      return structuredClone(updated);
    },
  };
  for (const name of ["insert", "save", "createDataCollection"]) {
    api[name] = () => { state.forbidden.push(name); throw new Error("Forbidden operation"); };
  }
  return { api, state };
}

function options(mock, overrides = {}) {
  return {
    api: mock.api, collectionId: "WebsitePages", siteId: "public-site-id",
    pages, sourceCommit, ...overrides,
  };
}

function approval(plan) {
  return {
    mode: "apply",
    expectedCommit: plan.sourceCommit,
    expectedFingerprint: plan.currentRecordFingerprint,
    expectedCandidateFingerprint: plan.candidateFingerprint,
  };
}

test("fingerprints are deterministic, key-order independent, and include private fields without disclosing them", () => {
  const item = original();
  assert.equal(fingerprint(item), fingerprint(Object.fromEntries(Object.entries(item).reverse())));
  assert.equal(fingerprint(item), fingerprint({ ...item, _updatedDate: item._updatedDate.toISOString() }));
  assert.notEqual(fingerprint(item), fingerprint({ ...item, editorialNotes: "changed" }));
  assert.match(fingerprint(item), /^[a-f0-9]{64}$/);
});

test("candidate uses exact slug, not duplicate titles, and permits safe nested routes", () => {
  const nested = { ...pages[0], slug: "programs/enrichment" };
  assert.equal(candidateForPage([...pages, nested], nested.slug).slug, nested.slug);
  assert.equal(candidateForPage([{ ...pages[0], heading: undefined }]).heading, pages[0].title);
  assert.throws(() => candidateForPage([...pages, { ...pages[0] }]), /exactly one/);
  assert.throws(() => candidateForPage([]), /exactly one/);
  assert.throws(() => candidateForPage([{ ...pages[0], home: true }]), /exactly one/);
});

test("invalid slugs and empty required candidate fields fail closed", () => {
  for (const slug of ["", "/enrichment", "enrichment/", "../enrichment", "a//b", "A", "a%2fb", "a\\b", "a?b", "-a"]) {
    assert.throws(() => candidateForPage([{ ...pages[0], slug }], slug), /safe page slug/);
  }
  for (const key of ["title", "description", "content"]) {
    assert.throws(() => candidateForPage([{ ...pages[0], [key]: "" }]), /nonempty/);
  }
  assert.throws(() => candidateForPage([{ ...pages[0], content: "<script>only script</script>" }]), /nonempty/);
});

test("public artifacts allowlist fields and sanitize HTML without expanding renderer permissions", () => {
  const candidate = candidateForPage([{
    ...pages[0],
    content: '<script>unsafe-script</script><h2 id="private">Help</h2>' +
      '<p class="lead unknown" onclick="bad()">Text</p>' +
      '<a href="javascript:bad()" target="_blank">No</a>' +
      '<a href="../calendar/">Calendar</a>' +
      '<iframe src="https://unapproved.example/"></iframe>',
  }]);
  assert.doesNotMatch(candidate.body, /unsafe-script|onclick|javascript:|unapproved.example|class="unknown"|id=/);
  assert.match(candidate.body, /class="lead"/);
  assert.match(candidate.body, /rel="noopener noreferrer"/);
  assert.match(candidate.body, /href="\.\.\/calendar\/"/);
  const page = publicPage({ ...original(), ...candidate });
  assert.deepEqual(Object.keys(page), ["slug", "title", "heading", "kicker", "description", "accent", "body", "published"]);
  assert.doesNotMatch(JSON.stringify(page), /nonpublic-|customFields|unrelatedCustomField|_owner|_id/);
  assert.equal(publicPage({ slug: "enrichment", published: true }).body, "");
  assert.equal(publicPage({ heading: { private: "not text" } }).heading, "");
});

test("plan is read-only, persists only public before/proposed fields, and returns approval inputs", async () => {
  const mock = mockWix();
  const before = structuredClone(mock.state.rows);
  const saved = [];
  const report = await updateWixPage(options(mock, { saveReport: async (r) => saved.push(structuredClone(r)) }));
  assert.equal(report.status, "planned");
  assert.equal(report.before.body, "<p>Old body.</p>");
  assert.equal(report.proposed.body, candidateForPage(pages).body);
  assert.equal(report.after, null);
  assert.equal(report.writeAttempted, false);
  assert.equal(report.applyInputs.expected_fingerprint, report.currentRecordFingerprint);
  assert.equal(report.applyInputs.expected_candidate_fingerprint, report.candidateFingerprint);
  assert.equal(report.applyInputs.candidate_commit, sourceCommit);
  assert.equal(saved.length, 1);
  assert.deepEqual(mock.state.rows, before);
  assert.equal(mock.state.writes.length, 0);
  assert.deepEqual(mock.state.forbidden, []);
  assert.doesNotMatch(JSON.stringify(report), /nonpublic-|customFields|unrelatedCustomField|_owner/);
  assert.deepEqual(mock.state.queries[0], {
    collectionId: "WebsitePages", field: "slug", value: "enrichment", limit: 100,
    options: { consistentRead: true, showDrafts: false },
  });
});

test("read traverses empty pagination and detects duplicate slug on a later page", async () => {
  const paginated = mockWix({ pageSets: [[], [original()]] });
  assert.equal((await readUniquePage(paginated.api, "WebsitePages", "enrichment"))._id, original()._id);
  assert.equal(paginated.state.nexts, 1);
  const duplicate = mockWix({ rows: [original(), { ...original(), _id: "second", published: false }] });
  await assert.rejects(updateWixPage(options(duplicate)), /Duplicate slug/);
  assert.equal(duplicate.state.nexts, 1);
  assert.equal(duplicate.state.writes.length, 0);
});

test("empty collections, unpublished pages, missing identities and timestamps never create anything", async () => {
  for (const rows of [
    [], [{ ...original(), published: false }], [{ ...original(), published: undefined }],
    [{ ...original(), _id: undefined }], [{ ...original(), _updatedDate: undefined }],
    [{ ...original(), _updatedDate: "invalid" }],
  ]) {
    const mock = mockWix({ rows });
    await assert.rejects(updateWixPage(options(mock)));
    assert.equal(mock.state.writes.length, 0);
    assert.deepEqual(mock.state.forbidden, []);
  }
});

test("missing optional fields are repairable and unrelated records with duplicate titles are ignored", async () => {
  const row = original();
  delete row.heading;
  delete row.kicker;
  delete row.accent;
  delete row.body;
  const unrelated = { ...original(), slug: "programs", _id: "other-id" };
  const mock = mockWix({ rows: [row, unrelated] });
  const plan = await updateWixPage(options(mock));
  const applied = await updateWixPage(options(mock, approval(plan)));
  assert.equal(applied.status, "applied");
  assert.equal(applied.after.kicker, "");
  assert.deepEqual(mock.state.rows[1], unrelated);
  assert.equal(Object.hasOwn(mock.state.rows[0], "kicker"), false);
});

test("apply requires reviewed record, candidate, and exact source commit before reading Wix", async () => {
  const mock = mockWix();
  const plan = await updateWixPage(options(mock));
  const reads = mock.state.reads;
  for (const change of [
    { expectedFingerprint: undefined },
    { expectedFingerprint: "invalid" },
    { expectedCandidateFingerprint: undefined },
    { expectedCandidateFingerprint: "b".repeat(64) },
    { expectedCommit: undefined },
    { expectedCommit: "b".repeat(40) },
    { pages: [{ ...pages[0], content: "<p>Unreviewed change.</p>" }] },
  ]) {
    await assert.rejects(updateWixPage(options(mock, { ...approval(plan), ...change })));
  }
  assert.equal(mock.state.reads, reads);
  assert.equal(mock.state.writes.length, 0);
});

test("any changed live field, identity, site, or collection rejects a stale plan", async () => {
  for (const change of [
    { title: "Editor changed title" }, { editorialNotes: "new private note" },
    { _id: "replacement-id" }, { _updatedDate: new Date("2026-09-02T00:00:00.000Z") },
  ]) {
    const mock = mockWix();
    const plan = await updateWixPage(options(mock));
    Object.assign(mock.state.rows[0], change);
    await assert.rejects(updateWixPage(options(mock, approval(plan))), /changed since the plan/);
    assert.equal(mock.state.writes.length, 0);
  }
  for (const change of [{ siteId: "other-site" }, { collectionId: "OtherPages" }]) {
    const mock = mockWix();
    const plan = await updateWixPage(options(mock));
    await assert.rejects(updateWixPage(options(mock, { ...approval(plan), ...change })), /changed since the plan/);
    assert.equal(mock.state.writes.length, 0);
  }
});

test("successful apply preserves all unrelated fields and identity, verifies read-back, and is idempotent", async () => {
  const mock = mockWix();
  const plan = await updateWixPage(options(mock));
  const report = await updateWixPage(options(mock, approval(plan)));
  assert.equal(report.status, "applied");
  assert.deepEqual(report.after, report.proposed);
  assert.notEqual(report.verifiedRecordFingerprint, plan.currentRecordFingerprint);
  assert.equal(mock.state.reads, 4); // plan, apply, preflight, read-back
  assert.equal(mock.state.writes.length, 1);
  const write = mock.state.writes[0];
  assert.deepEqual(write.item, { ...original(), ...candidateForPage(pages) });
  assert.deepEqual(write.options, {
    showDrafts: false,
    condition: {
      _id: { $eq: original()._id },
      _updatedDate: { $eq: original()._updatedDate },
      slug: { $eq: "enrichment" }, published: { $eq: true },
    },
  });
  const rerun = await updateWixPage(options(mock, approval(plan)));
  assert.equal(rerun.status, "already-current");
  assert.equal(rerun.writeAttempted, false);
  assert.deepEqual(rerun.after, report.after);
  assert.equal(mock.state.writes.length, 1);
});

test("preflight recheck rejects edits or new duplicates made while saving the backup", async () => {
  for (const duplicate of [false, true]) {
    const mock = mockWix();
    const plan = await updateWixPage(options(mock));
    await assert.rejects(updateWixPage(options(mock, {
      ...approval(plan),
      saveReport: async (report) => {
        if (report.status !== "ready-to-apply") return;
        if (duplicate) mock.state.rows.push({ ...original(), _id: "duplicate" });
        else mock.state.rows[0].customFields.nested.push("concurrent edit");
      },
    })), duplicate ? /Duplicate slug/ : /changed during preflight/);
    assert.equal(mock.state.writes.length, 0);
  }
});

test("conditional update rejects an edit after preflight without an unguarded retry or secret leakage", async () => {
  const mock = mockWix({
    beforeUpdate: (state) => Object.assign(state.rows[0], {
      title: "Concurrent editor wins", _updatedDate: new Date("2026-09-09T01:00:00.000Z"),
    }),
  });
  const plan = await updateWixPage(options(mock));
  const reports = [];
  await assert.rejects(updateWixPage(options(mock, {
    ...approval(plan), saveReport: async (report) => reports.push(structuredClone(report)),
  })), (error) => {
    assert.match(error.message, /Conditional Wix update failed/);
    assert.doesNotMatch(error.message, /nonpublic-secret|Authorization|headers/);
    return true;
  });
  assert.equal(mock.state.rows[0].title, "Concurrent editor wins");
  assert.equal(mock.state.writes.length, 1);
  assert.equal(reports.at(-1).status, "failed");
  assert.equal(reports.at(-1).writeAttempted, true);
  assert.equal(reports.at(-1).after, null);
  assert.doesNotMatch(JSON.stringify(reports), /nonpublic-secret|Authorization|headers/);
});

test("read-back rejects changed body, unrelated fields, identity, and new duplicate slugs", async () => {
  for (const afterUpdate of [
    (state) => { state.rows[0].body = "<p>Hook changed body.</p>"; },
    (state) => { state.rows[0].customFields.nested = ["lost"]; },
    (state) => { state.rows[0]._id = "changed-id"; },
    (state) => { state.rows.push({ ...state.rows[0], _id: "new-duplicate" }); },
  ]) {
    const mock = mockWix({ afterUpdate });
    const plan = await updateWixPage(options(mock));
    const reports = [];
    await assert.rejects(updateWixPage(options(mock, {
      ...approval(plan), saveReport: async (report) => reports.push(structuredClone(report)),
    })), /Read-back|Duplicate slug/);
    assert.equal(mock.state.writes.length, 1);
    assert.equal(reports.at(-1).status, "failed");
    assert.equal(reports.at(-1).after, null);
  }
});

test("query failures and malformed pagination are explicit and do not leak SDK errors", async () => {
  const queryFailure = mockWix({ beforeRead: () => {
    throw new Error("Authorization: nonpublic-secret; full HTTP request");
  } });
  await assert.rejects(updateWixPage(options(queryFailure)), (error) => {
    assert.match(error.message, /query failed/);
    assert.doesNotMatch(error.message, /Authorization|nonpublic-secret|HTTP request/);
    return true;
  });
  const failingPagination = mockWix();
  failingPagination.api.query = () => ({
    eq() { return this; }, limit() { return this; },
    async find() {
      return {
        items: [], hasNext: () => true,
        next: async () => { throw new Error("nonpublic-secret"); },
      };
    },
  });
  await assert.rejects(updateWixPage(options(failingPagination)), /pagination failed/);
  const malformed = mockWix({ pageSets: [undefined] });
  await assert.rejects(updateWixPage(options(malformed)), /invalid page query response/);
});

test("CLI defaults to a plan and handles missing credentials without network or raw stack traces", () => {
  assert.equal(parseOptions([]).mode, "plan");
  assert.equal(parseOptions([]).slug, "enrichment");
  assert.throws(() => parseOptions(["--unknown"]), /Invalid arguments/);
  const child = spawnSync(process.execPath, ["scripts/update-wix-page.mjs"], {
    cwd: fileRoot(), env: { ...process.env, WIX_API_KEY: "" }, encoding: "utf8",
  });
  assert.equal(child.status, 1);
  assert.equal(child.stdout, "");
  assert.match(child.stderr, /WIX_API_KEY is required/);
  assert.doesNotMatch(child.stderr, /at main|ApiKeyStrategy|Authorization/);
});

function fileRoot() {
  return new URL("../", import.meta.url);
}

test("checked-in enrichment candidate and offline snapshot can be processed without credentials", async () => {
  const { pages: sourcePages } = await import("../src/site.mjs");
  const candidate = candidateForPage(sourcePages);
  assert.equal(candidate.slug, "enrichment");
  assert.match(candidate.body, /<h2>/);
  const snapshot = JSON.parse(await readFile(new URL("../src/data/wix-content.json", import.meta.url), "utf8"));
  const source = snapshot.cms.pages.find((page) => page.slug === "enrichment");
  if (source) assert.equal(publicPage(source).slug, "enrichment");
  else assert.deepEqual(snapshot.cms.pages.filter((page) => page.slug === "enrichment"), []);
});
