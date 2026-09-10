import assert from "node:assert/strict";
import test from "node:test";
import { discoverAccountId, setupHeadlessClient } from "./setup-wix-headless.mjs";

const siteId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const domains = ["montlake-pta.github.io", "montlakepta.org", "www.montlakepta.org"];
const app = { id: clientId, name: "Montlake PTA Website", allowedRedirectDomains: domains };
const ok = (body) => ({ ok: true, json: async () => body });

test("account lookup uses the documented site query and only accepts the selected site's owner", async () => {
  assert.equal(await discoverAccountId("TEST_ONLY", siteId, async (url, options) => {
    assert.equal(url, "https://www.wixapis.com/site-list/v2/sites/query");
    assert.equal(options.headers["wix-site-id"], undefined);
    assert.deepEqual(JSON.parse(options.body).query.filter, { id: siteId });
    return ok({ sites: [{ id: siteId, ownerAccountId: clientId }] });
  }), clientId);
  await assert.rejects(discoverAccountId("TEST_ONLY", siteId, async () => ok({ sites: [{ id: clientId, ownerAccountId: clientId }] })), /could not be verified/);
  await assert.rejects(discoverAccountId("TEST_ONLY", siteId, async () => ({ ok: false, status: 403 })), /WIX_ACCOUNT_ID/);
});

test("plan is read-only and does not create a client", async () => {
  const calls = [];
  const report = await setupHeadlessClient({ apiKey: "TEST_ONLY", siteId, fetchImpl: async (url, options) => {
    calls.push([url, options.method]); return ok({ oAuthApps: [], pagingMetadata: { total: 0 } });
  } });
  assert.equal(report.status, "create-required");
  assert.equal(calls.length, 1);
  assert.ok(calls[0][0].endsWith("/query"));
  assert.doesNotMatch(JSON.stringify(report), /TEST_ONLY/);
});

test("apply creates only the named visitor app and verifies public configuration", async () => {
  let creations = 0;
  const report = await setupHeadlessClient({ apiKey: "TEST_ONLY", siteId, mode: "apply", fetchImpl: async (url, options) => {
    if (url.endsWith("/query")) return ok({ oAuthApps: [] });
    if (options.method === "POST") {
      creations++;
      const { oAuthApp } = JSON.parse(options.body);
      assert.deepEqual(oAuthApp.allowedRedirectDomains, domains);
      assert.deepEqual(oAuthApp.allowedRedirectUris, []);
      assert.equal(oAuthApp.allowSecretGeneration, undefined);
      return ok({ oAuthApp: app });
    }
    return ok({ oAuthApp: { ...app, arbitrarySecret: "DO_NOT_EXPORT" } });
  } });
  assert.equal(creations, 1);
  assert.equal(report.clientId, clientId);
  assert.equal(report.status, "created");
  assert.doesNotMatch(JSON.stringify(report), /TEST_ONLY|DO_NOT_EXPORT|arbitrarySecret/);
});

test("an existing configured client is reused without mutations", async () => {
  const methods = [];
  const report = await setupHeadlessClient({ apiKey: "TEST_ONLY", siteId, mode: "apply", fetchImpl: async (url, options) => {
    methods.push(options.method);
    return ok(url.endsWith("/query") ? { oAuthApps: [app] } : { oAuthApp: app });
  } });
  assert.equal(report.status, "already-configured");
  assert.deepEqual(methods, ["POST", "GET"]);
});

test("duplicates, missing approvals and API failures stop without leaking credentials", async () => {
  await assert.rejects(setupHeadlessClient({ apiKey: "TEST_ONLY", siteId, fetchImpl: async () => ok({ oAuthApps: [app, app] }) }), /Multiple matching/);
  await assert.rejects(setupHeadlessClient({ apiKey: "TEST_ONLY", siteId, fetchImpl: async (url) => ok(url.endsWith("/query")
    ? { oAuthApps: [app] } : { oAuthApp: { ...app, allowedRedirectDomains: [] } }) }), /missing required redirect domains/);
  await assert.rejects(setupHeadlessClient({ apiKey: "TEST_ONLY", siteId, fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
  await assert.rejects(setupHeadlessClient({ apiKey: "TEST_ONLY", siteId, fetchImpl: async () => { throw new Error("PRIVATE_HEADER"); } }),
    (error) => !error.message.includes("PRIVATE_HEADER"));
});
