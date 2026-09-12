import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createPublisher, publisherConfig } from "../wix/backend/github-publish-core.js";
import { probeCollection, probeStore } from "./check-wix-publishing.mjs";
import { pagePublishingAutomations, publisherActionMapping } from "../wix/page-publishing.mjs";
import { pageCollectionDefinitions } from "./page-collections.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const now = Date.parse("2026-09-11T00:00:00Z");
const tokenBody = () => ({
  token: "TEST_INSTALLATION_TOKEN",
  expires_at: new Date(now + 3600000).toISOString(),
  permissions: { actions: "write", metadata: "read" },
  repositories: [{ id: publisherConfig.repositoryId, full_name: publisherConfig.repository }],
});
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const receipt = { workflow_run_id: 123, html_url: "https://github.com/montlake-pta/website/actions/runs/123" };

test("native publishing inventory covers exactly the nine typed collection events", async () => {
  const inventory = JSON.parse(await readFile(new URL("../wix/page-publishing.config.json", import.meta.url), "utf8"));
  assert.equal(inventory.connections.length, 9);
  assert.equal(new Set(inventory.connections.map(connection => connection.automationId)).size, 9);
  const actual = inventory.connections.map(connection => {
    assert.match(connection.automationId, /^[a-f0-9-]{36}$/);
    assert.equal(connection.name, `GitHub publish - ${connection.collectionId} ${connection.event}`);
    return `${connection.collectionId}:${connection.event}`;
  });
  assert.deepEqual(actual.sort(), pageCollectionDefinitions.flatMap(({ id }) =>
    ["created", "updated", "deleted"].map(event => `${id}:${event}`)).sort());
});

test("native page automations cover each collection and lifecycle operation with one safe publishing action", () => {
  const action = {
    id: "24c5330f-804a-4ca5-a33c-aab30d27012c", type: "APP_DEFINED", namespace: "wix_automations-velo_action-2",
    appDefinedInfo: { appId: "139ef4fa-c108-8f9a-c7be-d5f492a2c939", actionKey: "wix_automations-velo_action",
      inputMapping: publisherActionMapping, skipConditionOrExpressionGroups: [], postActionIds: [] },
  };
  const definitions = pagePublishingAutomations(action);
  assert.equal(definitions.length, 9);
  for (const { id } of pageCollectionDefinitions) {
    for (const event of ["created", "updated", "deleted"]) {
      const automation = definitions.find(a => a.name === `GitHub publish - ${id} ${event}`);
      assert(automation);
      assert.deepEqual(automation.configuration.rootActionIds, [action.id]);
      const filter = automation.configuration.trigger.filters[0];
      assert.equal(filter.fieldKey, event === "deleted" ? "deletedEntity.dataCollectionId" : "dataCollectionId");
      assert.equal(filter.filterExpression, `{{contains(["${id}"];var("${filter.fieldKey}"))}}`);
      assert.deepEqual(automation.configuration.actions[action.id].appDefinedInfo.inputMapping, publisherActionMapping);
    }
  }
  assert.throws(() => pagePublishingAutomations({ ...action, appDefinedInfo: { ...action.appDefinedInfo, postActionIds: ["other"] } }), /only the existing/);
  assert.throws(() => pagePublishingAutomations({ ...action, appDefinedInfo: { ...action.appDefinedInfo, inputMapping: { ...publisherActionMapping, body: "PRIVATE_PAYLOAD" } } }), /only the existing/);
});

test("publisher signs a short-lived app JWT and dispatches only main without event payloads", async () => {
  const calls = [];
  const publish = createPublisher({
    getPrivateKey: async name => { assert.equal(name, publisherConfig.secretName); return privateKey; },
    now: () => now,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/access_tokens")) {
        assert.deepEqual(JSON.parse(options.body), { repository_ids: [publisherConfig.repositoryId], permissions: { actions: "write" } });
        const jwt = options.headers.Authorization.slice("Bearer ".length);
        const [header, claims, signature] = jwt.split(".");
        assert(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, signature, "base64url"));
        const payload = JSON.parse(Buffer.from(claims, "base64url"));
        assert.equal(payload.iss, publisherConfig.clientId);
        assert.equal(payload.iat, now / 1000 - 60);
        assert.equal(payload.exp, now / 1000 + 540);
        return response(201, tokenBody());
      }
      assert.equal(url, "https://api.github.com/repos/montlake-pta/website/actions/workflows/pages.yml/dispatches");
      assert.deepEqual(JSON.parse(options.body), { ref: "main" });
      assert.equal(options.headers.Authorization, "Bearer TEST_INSTALLATION_TOKEN");
      return response(200, receipt);
    },
  });
  assert.deepEqual(await publish({ privateMutation: "DO_NOT_SEND" }), { accepted: true, runId: 123, runUrl: receipt.html_url });
  assert.equal(calls.length, 2);
  assert.doesNotMatch(JSON.stringify(calls.map(call => call.options.body)), /DO_NOT_SEND|privateMutation/);
});

test("token minting is shared for concurrent events but every change requests a build", async () => {
  let tokens = 0, builds = 0;
  const publish = createPublisher({
    getPrivateKey: async () => privateKey, now: () => now,
    fetchImpl: async url => {
      if (url.endsWith("/access_tokens")) { tokens++; return response(201, tokenBody()); }
      builds++; return response(204);
    },
  });
  await Promise.all([publish(), publish(), publish()]);
  assert.equal(tokens, 1);
  assert.equal(builds, 3);
});

test("token scopes and repositories are checked before dispatch", async () => {
  for (const alter of [
    value => { value.permissions.contents = "write"; },
    value => { value.repositories.push({ id: 1, full_name: "other/repository" }); },
    value => { value.repositories[0].id = 1; },
    value => { value.expires_at = new Date(now - 1).toISOString(); },
  ]) {
    let calls = 0;
    const publish = createPublisher({
      getPrivateKey: async () => privateKey, now: () => now,
      fetchImpl: async () => { calls++; const value = tokenBody(); alter(value); return response(201, value); },
    });
    await assert.rejects(publish, /unexpected installation-token scope or expiry/);
    assert.equal(calls, 1);
  }
});

test("bounded retries handle transient statuses without exposing raw failures", async () => {
  const waits = [];
  let calls = 0;
  const publish = createPublisher({
    getPrivateKey: async () => privateKey, now: () => now, sleep: async ms => waits.push(ms),
    fetchImpl: async url => {
      if (url.endsWith("/access_tokens")) return response(201, tokenBody());
      calls++;
      return calls < 3 ? { ...response(503), headers: { get: () => "600" } } : response(200, receipt);
    },
  });
  assert.equal((await publish()).accepted, true);
  assert.deepEqual(waits, [8000, 8000]);
  const forbidden = createPublisher({
    getPrivateKey: async () => privateKey, now: () => now,
    fetchImpl: async () => response(403, { token: "PRIVATE_REMOTE_ERROR" }),
  });
  await assert.rejects(forbidden, error => /HTTP 403/.test(error.message) && !/PRIVATE_REMOTE_ERROR/.test(error.message));
});

test("missing secrets and network failures remain explicit without credential leakage", async () => {
  const missing = createPublisher({ getPrivateKey: async () => { throw new Error("PRIVATE_SECRET"); }, fetchImpl: async () => assert.fail("No request expected") });
  await assert.rejects(missing, error => /Secrets Manager/.test(error.message) && !/PRIVATE_SECRET/.test(error.message));
  const network = createPublisher({ getPrivateKey: async () => privateKey, now: () => now, fetchImpl: async () => { throw new Error("PRIVATE_AUTH_HEADER"); } });
  await assert.rejects(network, error => /could not be confirmed/.test(error.message) && !/PRIVATE_AUTH_HEADER/.test(error.message));
});

async function loadVeloHandlers(file, publishWebsite, logger) {
  const source = await readFile(new URL(`../wix/backend/${file}`, import.meta.url), "utf8");
  const imported = 'import { invoke as publishWebsite } from "backend/___spi___/automations-velo-action-provider/github-publish/github-publish";';
  assert(source.startsWith(imported));
  const names = [...source.matchAll(/^export async function (\w+)/gm)].map(match => match[1]);
  const executable = source.slice(imported.length).replace(/^export /gm, "");
  return runInNewContext(`${executable}\n({${names.join(",")}})`, { publishWebsite, console: logger });
}

test("all business mutation handlers await the same publisher without forwarding entity data", async () => {
  let calls = 0;
  const handlers = await loadVeloHandlers("events.js", async (...args) => {
    assert.equal(args.length, 0); calls++; return { accepted: true };
  }, console);
  assert.equal(Object.keys(handlers).length, 16);
  for (const handler of Object.values(handlers)) assert.equal((await handler({ privateData: "NEVER_SEND" })).accepted, true);
  assert.equal(calls, 16);
  const failed = await loadVeloHandlers("events.js", async () => { throw new Error("dispatch failed"); }, console);
  await assert.rejects(failed.wixBlog_onPostUpdated, /dispatch failed/);
});

test("legacy page and board CMS hooks preserve successful writes without forwarding payloads", async () => {
  let calls = 0;
  const messages = [];
  const item = { _id: "record", privateData: "PRIVATE_CONTENT" };
  const handlers = await loadVeloHandlers("data.js", async (...args) => {
    assert.equal(args.length, 0); calls++;
  }, { error: message => messages.push(message) });
  assert.deepEqual(Object.keys(handlers).sort(), ["WebsitePages", "BoardMembers"]
    .flatMap(collection => ["Insert", "Update", "Remove"].map(operation => `${collection}_after${operation}`)).sort());
  for (const handler of Object.values(handlers)) assert.equal(await handler(item, { token: "PRIVATE_TOKEN" }), item);
  assert.equal(calls, 6);
  const failed = await loadVeloHandlers("data.js", async () => { throw new Error("PRIVATE_CREDENTIAL"); }, { error: message => messages.push(message) });
  assert.equal(await failed.WebsitePages_afterUpdate(item), item);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /notification failed/);
  assert.doesNotMatch(messages[0], /PRIVATE_/);
});

test("manual notification probes remain non-public and clean up after an update failure", async () => {
  const calls = [];
  const messages = [];
  const api = {
    insert: async (collection, item) => { calls.push(["insert", collection, item]); return item; },
    update: async (collection, item) => { calls.push(["update", collection, item]); throw new Error("update failed"); },
    remove: async (collection, id) => calls.push(["remove", collection, id]),
  };
  await assert.rejects(probeCollection(api, "WebsitePages", { published: false, slug: "probe", title: "Probe" }, {
    id: "synthetic-probe", report: value => messages.push(value),
  }), /update failed/);
  assert.equal(calls[0][2].published, false);
  assert.equal(calls[1][2].published, false);
  assert.deepEqual(calls[2], ["remove", "WebsitePages", "synthetic-probe"]);
  assert.equal(messages.length, 2);
  await assert.rejects(probeCollection(api, "WebsitePages", { published: true, title: "Public" }), /explicitly non-public/);
});

test("Velo action unwraps the v2 secret response and satisfies the empty output schema", async () => {
  const source = await readFile(new URL("../wix/backend/github-publish.js", import.meta.url), "utf8");
  const messages = [];
  const executable = source.replace(/^import .*;\n/gm, "").replace(/^export /gm, "");
  const { invoke } = runInNewContext(`${executable}\n({invoke})`, {
    secrets: { getSecretValue: async () => ({ value: "PRIVATE_SIGNING_KEY" }) },
    elevate: fn => fn,
    fetch: () => assert.fail("Wrapper should delegate HTTP calls to the core"),
    createPublisher: options => async () => {
      assert.equal(await options.getPrivateKey("secret-name"), "PRIVATE_SIGNING_KEY");
      return { accepted: true, runId: 123, runUrl: receipt.html_url };
    },
    console: { info: (...args) => messages.push(args) },
  });

  assert.equal(JSON.stringify(await invoke({ payload: { privateData: "NEVER_LOG" } })), "{}");
  assert.deepEqual(messages, [["GitHub website publish requested", 123]]);
});

test("Store probe stays hidden and removes its own product even if membership update fails", async () => {
  const calls = [];
  const api = {
    createProduct: async product => {
      assert.equal(product.visible, false);
      return { product: { ...product, _id: "hidden-probe" } };
    },
    updateProduct: async (id, patch) => { assert.equal(patch.visible, false); calls.push(["update", id]); },
    addProductsToCollection: async (id, members) => { calls.push(["membership", id, members]); throw new Error("Membership failed"); },
    deleteProduct: async id => calls.push(["delete", id]),
  };
  await assert.rejects(probeStore(api, "reviewed-collection", { name: "probe", report: () => {} }), /Membership failed/);
  assert.deepEqual(calls, [["update", "hidden-probe"], ["membership", "reviewed-collection", ["hidden-probe"]], ["delete", "hidden-probe"]]);
});
