import assert from "node:assert/strict";
import test from "node:test";
import { setupPagePublishing } from "./setup-page-publishing.mjs";
import { publisherActionMapping, templateAutomationId } from "../wix/page-publishing.mjs";

const sourceCommit = "a".repeat(40);
function fixture() {
  const state = { items: [], writes: 0, validation: "VALID" };
  const template = { id: templateAutomationId, revision: "6", configuration: { actions: {
    "24c5330f-804a-4ca5-a33c-aab30d27012c": {
      id: "24c5330f-804a-4ca5-a33c-aab30d27012c", type: "APP_DEFINED", namespace: "wix_automations-velo_action-2",
      appDefinedInfo: { appId: "139ef4fa-c108-8f9a-c7be-d5f492a2c939", actionKey: "wix_automations-velo_action",
        inputMapping: publisherActionMapping, postActionIds: [], skipConditionOrExpressionGroups: [] },
    },
  } } };
  const request = async (method, url, body) => {
    if (method === "GET") return { automation: structuredClone(template) };
    if (url.endsWith("/query")) return { automations: structuredClone(state.items), pagingMetadata: { hasNext: false } };
    if (url.endsWith("/validate")) return { status: state.validation };
    state.writes++;
    const automation = { id: `id-${state.writes}`, revision: "1", ...structuredClone(body.automation) };
    state.items.push(automation);
    return { automation: structuredClone(automation) };
  };
  return { state, request, template };
}
const plan = f => setupPagePublishing({ request: f.request, sourceCommit, siteId: "site" });
const apply = (f, p, extra = {}) => setupPagePublishing({ request: f.request, sourceCommit, siteId: "site",
  mode: "apply", expectedFingerprint: p.expectedFingerprint, ...extra });

test("native automation setup validates a read-only plan, creates nine scoped actions and supports no-op reruns", async () => {
  const f = fixture();
  const p = await plan(f);
  assert.equal(p.status, "planned");
  assert.equal(f.state.writes, 0);
  const result = await apply(f, p);
  assert.equal(result.status, "applied");
  assert.equal(result.connections.length, 9);
  assert.equal(f.state.writes, 9);
  const again = await apply(f, await plan(f));
  assert.equal(again.status, "already-current");
  assert.equal(f.state.writes, 9);
  for (const item of f.state.items) assert.equal(item.configuration.rootActionIds.length, 1);
});

test("validation warnings, conflicting configurations and stale approvals prevent writes", async () => {
  const invalid = fixture();
  invalid.state.validation = "VALID_WITH_WARNINGS";
  await assert.rejects(plan(invalid), /validation did not pass/);
  assert.equal(invalid.state.writes, 0);
  const f = fixture();
  const p = await plan(f);
  await assert.rejects(apply(f, p, { sourceCommit: "b".repeat(40) }), /changed since the plan/);
  await assert.rejects(apply(f, p, { siteId: "different-site" }), /changed since the plan/);
  await apply(f, p);
  f.state.items[0].configuration.status = "INACTIVE";
  await assert.rejects(plan(f), /conflicting/);
  assert.equal(f.state.writes, 9);
});

test("partial failures retain safe results and require a fresh plan without duplicate creation", async () => {
  const f = fixture();
  const p = await plan(f);
  const real = f.request;
  f.request = async (method, url, body) => {
    if (method === "POST" && !/query|validate/.test(url) && f.state.writes === 2) throw new Error("PRIVATE_API_ERROR");
    return real(method, url, body);
  };
  let report;
  await assert.rejects(apply(f, p, { saveReport: async value => { report = structuredClone(value); } }), /private API details/);
  assert.equal(report.status, "partial-failure");
  assert.equal(report.connections.length, 2);
  assert(!JSON.stringify(report).includes("PRIVATE_API_ERROR"));
  f.request = real;
  await assert.rejects(apply(f, p), /changed since the plan/);
  const resumed = await apply(f, await plan(f));
  assert.equal(resumed.connections.length, 9);
  assert.equal(f.state.writes, 9);
});

test("a template change during apply does not overwrite or continue creating automations", async () => {
  const f = fixture();
  const p = await plan(f);
  await assert.rejects(apply(f, p, { saveReport: async report => {
    if (report.status === "planned") f.template.revision = "changed";
  } }), /changed during setup/);
  assert.equal(f.state.writes, 0);
});
