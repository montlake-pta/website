import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  createCommandRunner, discoverDeployments, publishArchive, redact, validateArchiveDiff, validateInput,
} from "./publish-fundraising-archive.mjs";

const repo = "montlake-pta/website";
const token = "test-private-token";
const now = Date.parse("2026-09-18T06:00:00Z");
const sha = "a".repeat(40);
const fingerprint = "b".repeat(64);
const ok = stdout => ({ code: 0, stdout: stdout || "", stderr: "" });
const failure = (stderr, code = 1) => ({ code, stdout: "", stderr });

function artifact(id = 100, attempt = 1, overrides = {}) {
  return {
    id: id * 10 + attempt,
    name: `fundraising-archive-input-${id}-${attempt}`,
    created_at: "2026-09-18T04:00:00Z",
    expires_at: "2026-12-17T04:00:00Z",
    expired: false,
    workflow_run: {
      id, head_sha: sha, head_branch: "main", repository_id: 12, head_repository_id: 12,
    },
    ...overrides,
  };
}

function deployment(id = 100, attempt = 1, deployedAt = "2026-09-18T05:00:00.000Z") {
  return {
    runId: String(id), runAttempt: attempt, sourceCommit: sha, deployedAt,
    runUrl: `https://github.com/${repo}/actions/runs/${id}`,
  };
}

function catalog(artifacts, { runOverrides = {}, jobOverrides = {}, stepOverrides = {}, pages } = {}) {
  const calls = [];
  const api = async path => {
    calls.push(path);
    if (path.startsWith("actions/artifacts?")) {
      const page = Number(new URLSearchParams(path.split("?")[1]).get("page"));
      return { artifacts: pages ? pages(page) : artifacts };
    }
    const match = path.match(/^actions\/runs\/(\d+)\/attempts\/(\d+)(\/jobs\?per_page=100&page=(\d+))?$/);
    assert.ok(match, `Unexpected API request: ${path}`);
    const [, id, attempt, jobs] = match;
    const key = `${id}-${attempt}`;
    if (jobs) {
      return { jobs: [{
        name: "deploy", run_id: Number(id), run_attempt: Number(attempt), head_sha: sha,
        status: "completed", conclusion: "success",
        completed_at: "2026-09-18T05:30:00Z",
        steps: [{
          name: "Deploy", status: "completed", conclusion: "success",
          completed_at: "2026-09-18T05:00:00Z", ...stepOverrides[key],
        }],
        ...jobOverrides[key],
      }] };
    }
    return {
      id: Number(id), run_attempt: Number(attempt), head_sha: sha, head_branch: "main",
      head_repository: { full_name: repo }, repository: { full_name: repo },
      path: ".github/workflows/pages.yml", status: "completed", conclusion: "success",
      created_at: "2026-07-01T00:00:00Z", ...runOverrides[key],
    };
  };
  return { api, calls };
}

async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), "archive-orchestration-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function writeFiles(directory, files) {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), contents);
  }
}

async function readFiles(directory, prefix = "") {
  const result = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, await readFiles(join(directory, entry.name), path));
    else result[path] = await readFile(join(directory, entry.name), "utf8");
  }
  return result;
}

async function writeInput(directory, provenance = deployment(), mutate = input => input) {
  const input = mutate({
    schemaVersion: 1, sourceCommit: provenance.sourceCommit,
    sourceRunId: provenance.runId, sourceRunAttempt: provenance.runAttempt,
    preparedAt: "2026-09-18T04:00:00Z", baseUrl: "https://montlake-pta.github.io/website/",
    pages: [{
      slug: "donate", title: "Donate", schoolYear: "2026-27", campaignStatus: "active",
      fingerprint, directory: "pages/donate",
    }],
  });
  await writeFiles(directory, {
    "input.json": JSON.stringify(input),
    "pages/donate/index.html": "<!doctype html><title>Donate</title><p>Frozen donation page</p>",
    "pages/donate/page.json": JSON.stringify({ title: "Donate" }),
    "assets/site.css": "body { color: #111842; }",
  });
}

function baseline(keys = [], withSnapshot = false) {
  return {
    "README.md": "# Fundraising archive\n",
    "index.json": JSON.stringify({
      schemaVersion: 1, receipts: Object.fromEntries(keys.map(key => [key, {}])),
      pages: withSnapshot ? { donate: { latestFingerprint: fingerprint } } : {},
    }),
    ...(withSnapshot ? { "snapshots/old/index.html": "<p>Immutable older donation page</p>" } : {}),
  };
}

async function harness(t, {
  artifacts = [artifact()], remoteFiles = null, apiOptions = {},
  download, append, intercept, pushFailures = 0, concurrentReceipts = false,
  pushAcknowledgementFailure = false,
} = {}) {
  const workRoot = await temporary(t);
  const { api, calls: apiCalls } = catalog(artifacts, apiOptions);
  const commands = [];
  const appends = [];
  const repositories = new Map();
  const remote = { head: remoteFiles ? "c".repeat(40) : null, files: remoteFiles };
  let commits = 0;
  let pushes = 0;
  let pending;
  const run = async (command, originalArgs, options) => {
    const args = [...originalArgs];
    const workTree = args[0]?.startsWith("--work-tree=") ? args.shift().split("=")[1] : undefined;
    const call = { command, args, workTree, ...options };
    commands.push(call);
    const intercepted = await intercept?.(call, { remote, commands, appends });
    if (intercepted) return intercepted;
    if (command === "gh") {
      if (args[0] === "api") return ok(JSON.stringify(await api(args[1].replace(`repos/${repo}/`, ""))));
      assert.deepEqual(args.slice(0, 2), ["run", "download"]);
      assert.equal(args[args.indexOf("--repo") + 1], repo);
      const name = args[args.indexOf("--name") + 1];
      const [, id, attempt] = name.match(/^fundraising-archive-input-(\d+)-(\d+)$/);
      assert.equal(args[2], id);
      const inputDir = args[args.indexOf("--dir") + 1];
      await writeInput(inputDir, deployment(id, Number(attempt)));
      await download?.(inputDir);
      return ok();
    }
    assert.equal(command, "git", "Only gh and git may execute; never execute artifact code.");
    if (args[0] === "ls-remote") {
      return remote.head ? ok(`${remote.head}\trefs/heads/fundraising-archive\n`) : failure("", 2);
    }
    if (["init", "clone"].includes(args[0])) {
      const gitDir = args.at(-1);
      await mkdir(gitDir, { recursive: true });
      repositories.set(gitDir, args[0] === "clone" ? { ...remote.files } : {});
      return ok();
    }
    const original = repositories.get(options.cwd);
    if (args[0] === "ls-tree") {
      return ok(Object.keys(original).map(path => `100644 blob ${sha}\t${path}\0`).join(""));
    }
    if (args[0] === "checkout-index") {
      await writeFiles(workTree, original);
      return ok();
    }
    if (["remote", "read-tree", "config", "add"].includes(args[0])) return ok();
    if (args[0] === "diff") {
      const updated = await readFiles(workTree);
      return ok([...new Set([...Object.keys(original), ...Object.keys(updated)])].flatMap(path => {
        if (original[path] === updated[path]) return [];
        return [`${!Object.hasOwn(updated, path) ? "D" : Object.hasOwn(original, path) ? "M" : "A"}\0${path}\0`];
      }).join(""));
    }
    if (args[0] === "ls-files") {
      return ok(Object.keys(await readFiles(workTree)).map(path => `100644 ${sha} 0\t${path}\0`).join(""));
    }
    if (args[0] === "commit") {
      commits += 1;
      pending = { head: String(commits).padStart(40, "0"), files: await readFiles(workTree) };
      return ok();
    }
    if (args[0] === "rev-parse") return ok(pending.head);
    if (args[0] === "push") {
      pushes += 1;
      if (pushes <= pushFailures) {
        remote.head = String(pushes + 100).padStart(40, "0");
        remote.files = concurrentReceipts ? pending.files : baseline();
        return failure("! [rejected] HEAD -> fundraising-archive (fetch first)");
      }
      Object.assign(remote, pending);
      return pushAcknowledgementFailure ? failure("Connection lost after accepting the push.") : ok();
    }
    assert.fail(`Unexpected git request: ${args.join(" ")}`);
  };
  const appendArchive = async options => {
    appends.push(options);
    if (append) return append(options, appends.length);
    const existing = await readdir(options.archiveDir);
    if (!existing.length) assert.equal(existing.length, 0, "New archive is empty, without .git or main files.");
    const index = existing.length
      ? JSON.parse(await readFile(join(options.archiveDir, "index.json"), "utf8"))
      : { schemaVersion: 1, receipts: {}, pages: {} };
    const key = `${options.deployment.runId}-${options.deployment.runAttempt}`;
    const snapshotsAdded = index.pages.donate?.latestFingerprint === fingerprint ? 0 : 1;
    index.receipts[key] = {};
    index.pages.donate = { latestFingerprint: fingerprint };
    await writeFiles(options.archiveDir, {
      "README.md": `# Fundraising archive\nLatest receipt: ${key}\n`,
      "index.json": JSON.stringify(index),
      ...(snapshotsAdded ? { [`snapshots/${key}/index.html`]: "<p>Frozen donation page</p>" } : {}),
    });
    return { changed: true, snapshotsAdded, receiptKey: key };
  };
  return {
    run: overrides => publishArchive({ repo, token, workRoot, run, appendArchive, now, ...overrides }),
    workRoot, commands, appends, apiCalls, remote,
  };
}

test("only exact completed main, same-repository Pages attempts with a successful Deploy are eligible", async () => {
  const artifacts = [
    artifact(100), artifact(101, 1, { name: "github-pages" }),
    artifact(102, 1, { workflow_run: { ...artifact().workflow_run, id: 102, head_branch: "feature" } }),
    artifact(103, 1, { workflow_run: { ...artifact().workflow_run, id: 103, head_repository_id: 99 } }),
    artifact(104), artifact(105), artifact(106), artifact(107), artifact(108), artifact(109),
  ];
  const { api, calls } = catalog(artifacts, { runOverrides: {
    "104-1": { head_repository: { full_name: "someone/fork" } },
    "105-1": { path: ".github/workflows/other.yml" },
    "106-1": { conclusion: "failure" },
    "107-1": { status: "in_progress" },
    "108-1": { head_sha: "d".repeat(40) },
    "109-1": { head_branch: "feature" },
  }, jobOverrides: {
    "106-1": { conclusion: "failure" },
  }, stepOverrides: {
    "106-1": { conclusion: "failure" },
  } });
  const found = await discoverDeployments({ api, now });
  assert.deepEqual(found.map(item => item.deployment), [deployment()]);
  assert.ok(!calls.some(path => /runs\/10[123]\//.test(path)));
  assert.ok(calls.includes("actions/runs/100/attempts/1/jobs?per_page=100&page=1"));
});

test("recovery orders old reruns by the exact Deploy step, not run creation or job completion", async () => {
  const { api, calls } = catalog([artifact(100, 2), artifact(200)], { stepOverrides: {
    "100-2": { completed_at: "2026-09-18T05:20:00Z" },
    "200-1": { completed_at: "2026-09-18T05:10:00Z" },
  } });
  const found = await discoverDeployments({ api, now });
  assert.deepEqual(found.map(item => item.deployment), [
    deployment(200, 1, "2026-09-18T05:10:00.000Z"),
    deployment(100, 2, "2026-09-18T05:20:00.000Z"),
  ]);
  assert.ok(calls.every(path => !/actions\/runs\/\d+$/.test(path)), "Never read latest-attempt conclusion.");
});

test("a successful-looking attempt with missing or ambiguous Deploy proof fails visibly", async () => {
  for (const steps of [
    [],
    Array(2).fill({ name: "Deploy", status: "completed", conclusion: "success" }),
  ]) {
    const { api } = catalog([artifact()], { jobOverrides: { "100-1": { steps } } });
    await assert.rejects(discoverDeployments({ api, now }), /no unique successful Deploy step/);
  }
});

test("failed Deploy steps and cancellation before deployment skip without downloads or writes", async t => {
  for (const [conclusion, steps] of [
    ["failure", [{ name: "Deploy", status: "completed", conclusion: "failure" }]],
    ["cancelled", [{ name: "Deploy", status: "completed", conclusion: "cancelled" }]],
    ["cancelled", [{ name: "Deploy", status: "completed", conclusion: "skipped" }]],
    ["cancelled", []],
    ["failure", []],
    ["success", [{ name: "Deploy", status: "completed", conclusion: "failure" }]],
  ]) {
    const fixture = await harness(t, { apiOptions: {
      runOverrides: { "100-1": { conclusion } },
      jobOverrides: { "100-1": { conclusion, steps } },
    } });
    assert.deepEqual(await fixture.run(), { changed: false, deploymentsArchived: 0, snapshotsAdded: 0 });
    assert.equal(fixture.appends.length, 0);
    assert.ok(!fixture.commands.some(call => ["download", "commit", "push"].some(arg => call.args.includes(arg))));
  }
});

test("successful Deploy steps are archived despite later job or overall attempt failure or cancellation", async t => {
  for (const [runConclusion, jobConclusion] of [
    ["failure", "failure"], ["cancelled", "cancelled"], ["failure", "success"],
  ]) {
    const fixture = await harness(t, { apiOptions: {
      runOverrides: { "100-1": { conclusion: runConclusion } },
      jobOverrides: { "100-1": { conclusion: jobConclusion } },
    } });
    assert.deepEqual(await fixture.run(), { changed: true, deploymentsArchived: 1, snapshotsAdded: 1 });
    assert.deepEqual(fixture.appends[0].deployment, deployment());
    assert.ok(Object.hasOwn(JSON.parse(fixture.remote.files["index.json"]).receipts, "100-1"));
  }
});

test("publication proof requires a unique deploy job even if only one of several jobs published", async () => {
  for (const conclusion of ["success", "failure"]) {
    const { api } = catalog([artifact()], { runOverrides: { "100-1": { conclusion } } });
    await assert.rejects(discoverDeployments({
      now,
      api: async path => {
        const response = await api(path);
        if (response.jobs) response.jobs.push({ ...response.jobs[0], conclusion: "failure", steps: [] });
        return response;
      },
    }), /no unique successful Deploy step/);
  }
});

test("receipted deployments, including expired inputs, need no downloads or current run lookup", async () => {
  const { api, calls } = catalog([artifact(100, 1, { expired: true })]);
  assert.deepEqual(await discoverDeployments({ api, receipts: { "100-1": {} }, now }), []);
  assert.equal(calls.length, 1);
});

test("expired unprocessed successful deployments fail visibly; failed deployments do not create gaps", async () => {
  await assert.rejects(
    discoverDeployments({ ...catalog([artifact(100, 1, { expired: true })]), now }),
    /Unrecoverable archive gap.*100-1/,
  );
  const { api } = catalog([artifact(100, 1, { expired: true })], {
    runOverrides: { "100-1": { conclusion: "failure" } },
    jobOverrides: { "100-1": { conclusion: "failure" } },
    stepOverrides: { "100-1": { conclusion: "failure" } },
  });
  assert.deepEqual(await discoverDeployments({ api, now }), []);
});

test("duplicate artifact names fail rather than download an ambiguous source", async () => {
  await assert.rejects(discoverDeployments({
    ...catalog([artifact(), artifact(100, 1, { id: 999 })]), now,
  }), /Ambiguous duplicate archive artifact/);
});

test("artifact pagination recovers older inputs and stops at the retention boundary", async () => {
  const filler = Array.from({ length: 100 }, (_, id) => artifact(id + 1000, 1, { name: "github-pages" }));
  const { api, calls } = catalog([], { pages: page => page === 1 ? filler : [
    artifact(100, 1, { created_at: "2026-06-01T00:00:00Z" }),
    ...filler.slice(1),
  ] });
  assert.equal((await discoverDeployments({ api, now })).length, 1);
  assert.equal(calls.filter(path => path.startsWith("actions/artifacts?")).length, 2);
  const bounded = catalog([], { pages: () => filler });
  await assert.rejects(discoverDeployments({ ...bounded, now }), /pagination limit reached/);
  assert.equal(bounded.calls.length, 100);
});

test("predeploy artifact and exact attempt identities cannot be swapped", async () => {
  await assert.rejects(discoverDeployments({
    ...catalog([artifact(100, 1, { created_at: "2026-09-18T05:01:00Z" })]), now,
  }), /not prepared before deployment/);
  assert.deepEqual(await discoverDeployments({
    ...catalog([artifact()], { runOverrides: { "100-1": { run_attempt: 2 } } }), now,
  }), []);
});

test("prepared input rejects provenance changes and unsafe or incomplete page directories", async t => {
  for (const mutate of [
    input => ({ ...input, sourceCommit: "d".repeat(40) }),
    input => ({ ...input, sourceRunAttempt: 2 }),
    input => ({ ...input, sourceRunId: "999" }),
    input => ({ ...input, preparedAt: "2026-09-18T05:01:00Z" }),
    input => ({ ...input, pages: [{ ...input.pages[0], directory: "../../main" }] }),
    input => ({ ...input, pages: [{ ...input.pages[0], slug: "../donate" }] }),
    input => ({ ...input, pages: [...input.pages, ...input.pages] }),
  ]) {
    const directory = await temporary(t);
    await writeInput(directory, deployment(), mutate);
    await assert.rejects(validateInput(directory, deployment()));
  }
  const valid = await temporary(t);
  await writeInput(valid);
  await validateInput(valid, deployment());
  await rm(join(valid, "pages/donate/page.json"));
  await assert.rejects(validateInput(valid, deployment()), /ENOENT/);
});

test("downloaded payloads reject symlinks, hidden paths, backslashes, and unexpected root files", async t => {
  for (const path of [".git/config", ".github/workflows/run.yml", "pages/donate/..\\outside", "run.mjs"]) {
    const directory = await temporary(t);
    await writeInput(directory);
    await writeFiles(directory, { [path]: "not allowed" });
    await assert.rejects(validateInput(directory, deployment()), /Unsafe input path/);
  }
  const directory = await temporary(t);
  await writeInput(directory);
  await symlink(join(directory, "input.json"), join(directory, "pages/donate/link"));
  await assert.rejects(validateInput(directory, deployment()), /Unsafe input path/);
});

test("new archive uses an empty orphan repository and only verified frozen artifact input", async t => {
  const fixture = await harness(t);
  assert.deepEqual(await fixture.run(), { changed: true, deploymentsArchived: 1, snapshotsAdded: 1 });
  assert.deepEqual(fixture.appends[0].deployment, deployment());
  assert.ok(fixture.commands.some(call => call.args.includes("--initial-branch=fundraising-archive")));
  assert.ok(!fixture.commands.some(call => call.args[0] === "clone"));
  const push = fixture.commands.find(call => call.args[0] === "push");
  assert.deepEqual(push.args, ["push", "--porcelain", "origin", "HEAD:refs/heads/fundraising-archive"]);
  assert.ok(Object.keys(fixture.remote.files).every(path =>
    path === "README.md" || path === "index.json" || path.startsWith("snapshots/")));
  assert.deepEqual(await readdir(fixture.workRoot), [], "All temporary inputs and work trees are removed.");
  for (const call of fixture.commands) {
    assert.ok(!call.args.join(" ").includes(token));
    assert.ok(!call.args.join(" ").includes(Buffer.from(`x-access-token:${token}`).toString("base64")));
    assert.equal(call.env.GIT_CONFIG_KEY_0, "http.https://github.com/.extraheader");
    assert.ok(call.env.GIT_CONFIG_VALUE_0.startsWith("Authorization: Basic "));
  }
});

test("existing receipts skip duplicate deployments while unchanged new deployments still commit receipts", async t => {
  const fixture = await harness(t, {
    artifacts: [artifact(100), artifact(101)], remoteFiles: baseline(["100-1"], true),
  });
  assert.deepEqual(await fixture.run(), { changed: true, deploymentsArchived: 1, snapshotsAdded: 0 });
  assert.equal(fixture.appends.length, 1);
  assert.equal(fixture.appends[0].deployment.runId, "101");
  assert.deepEqual(Object.keys(JSON.parse(fixture.remote.files["index.json"]).receipts), ["100-1", "101-1"]);
  assert.deepEqual(Object.keys(fixture.remote.files).filter(path => path.startsWith("snapshots/")), ["snapshots/old/index.html"]);
  const clone = fixture.commands.find(call => call.args[0] === "clone");
  assert.ok(clone.args.includes("--single-branch") && clone.args.includes("--no-checkout"));
  assert.equal(clone.args[clone.args.indexOf("--branch") + 1], "fundraising-archive");
});

test("already receipted artifacts and pre-rollout history perform no append, commit, or push", async t => {
  for (const artifacts of [[artifact(100)], []]) {
    const fixture = await harness(t, { artifacts, remoteFiles: baseline(["100-1"], true) });
    assert.deepEqual(await fixture.run(), { changed: false, deploymentsArchived: 0, snapshotsAdded: 0 });
    assert.equal(fixture.appends.length, 0);
    assert.ok(!fixture.commands.some(call => ["commit", "push"].includes(call.args[0])));
  }
});

test("a failed later capture cannot commit even an earlier successful append from that batch", async t => {
  const fixture = await harness(t, {
    artifacts: [artifact(100), artifact(101)],
    append: async ({ archiveDir }, count) => {
      await writeFiles(archiveDir, baseline(["100-1"], true));
      if (count === 2) throw new Error(`Capture failed: ${token}`);
      return { changed: true, snapshotsAdded: 1, receiptKey: "100-1" };
    },
  });
  await assert.rejects(fixture.run(), error =>
    error.message.includes("Capture failed") && !error.message.includes(token));
  assert.equal(fixture.appends.length, 2);
  assert.ok(!fixture.commands.some(call => ["add", "commit", "push"].includes(call.args[0])));
  assert.equal(fixture.remote.head, null);
  assert.deepEqual(await readdir(fixture.workRoot), []);
});

test("unsafe downloaded content is rejected before calling the parent append function", async t => {
  const fixture = await harness(t, {
    download: directory => writeFiles(directory, { ".github/workflows/injected.yml": "run: false" }),
  });
  await assert.rejects(fixture.run(), /Unsafe input path/);
  assert.equal(fixture.appends.length, 0);
  assert.ok(!fixture.commands.some(call => ["commit", "push"].includes(call.args[0])));
});

test("non-fast-forward races re-read the archive and regenerate instead of force pushing", async t => {
  const fixture = await harness(t, { pushFailures: 1 });
  assert.equal((await fixture.run()).changed, true);
  assert.equal(fixture.appends.length, 2);
  assert.notEqual(fixture.appends[0].archiveDir, fixture.appends[1].archiveDir);
  assert.ok(fixture.commands.some(call => call.args[0] === "clone"));
  assert.equal(fixture.commands.filter(call => call.args[0] === "push").length, 2);
  assert.ok(!fixture.commands.some(call => call.args.some(arg =>
    arg.includes("--force") || arg === "--amend" || arg.startsWith("+HEAD"))));
});

test("a concurrent writer's receipt is recognized on retry without another append", async t => {
  const fixture = await harness(t, { pushFailures: 1, concurrentReceipts: true });
  assert.equal((await fixture.run()).changed, false);
  assert.equal(fixture.appends.length, 1);
  assert.ok(Object.hasOwn(JSON.parse(fixture.remote.files["index.json"]).receipts, "100-1"));
});

test("remote read-back confirms a successful mutation despite a failed push acknowledgement", async t => {
  for (const remoteFiles of [null, baseline()]) {
    const fixture = await harness(t, { remoteFiles, pushAcknowledgementFailure: true });
    assert.deepEqual(await fixture.run(), { changed: true, deploymentsArchived: 1, snapshotsAdded: 1 });
    assert.equal(fixture.appends.length, 1);
    assert.equal(fixture.commands.filter(call => call.args[0] === "push").length, 1);
    assert.equal(fixture.commands.filter(call => call.args[0] === "commit").length, 1);
    assert.equal(fixture.commands.filter(call => call.args[0] === "clone").length, remoteFiles ? 1 : 0);
    assert.ok(Object.hasOwn(JSON.parse(fixture.remote.files["index.json"]).receipts, "100-1"));
  }
});

test("write retries are bounded and failures remain visible", async t => {
  const fixture = await harness(t, { pushFailures: 3 });
  await assert.rejects(fixture.run(), /Archive push was not confirmed/);
  assert.equal(fixture.commands.filter(call => call.args[0] === "push").length, 3);
  assert.deepEqual(await readdir(fixture.workRoot), []);
});

test("an authentication failure never masquerades as a missing branch", async t => {
  const fixture = await harness(t, {
    intercept: call => call.args[0] === "ls-remote" ? failure(`denied ${token}`, 128) : undefined,
  });
  await assert.rejects(fixture.run(), error =>
    /Cannot establish archive branch existence/.test(error.message) && !error.message.includes(token));
  assert.ok(!fixture.commands.some(call => ["clone", "init", "push"].includes(call.args[0])));
});

test("a rejected push without a changed ref fails without blind retries and redacts credentials", async t => {
  const fixture = await harness(t, {
    remoteFiles: baseline(),
    intercept: call => call.args[0] === "push"
      ? failure(`Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`)
      : undefined,
  });
  await assert.rejects(fixture.run(), error =>
    /Archive push was not confirmed/.test(error.message) && error.message.includes("[REDACTED]")
    && !error.message.includes(token));
  assert.equal(fixture.commands.filter(call => call.args[0] === "push").length, 1);
});

test("archive branches with application files, symlinks, or no ownership index are not adopted", async t => {
  for (const remoteFiles of [
    { ...baseline(), "src/site.mjs": "application" },
    { ...baseline(), ".github/workflows/job.yml": "workflow" },
    { "README.md": "# Other branch" },
    { ...baseline(), "index.json": '{"schemaVersion":2,"receipts":{},"pages":{}}' },
  ]) {
    const fixture = await harness(t, { remoteFiles });
    await assert.rejects(fixture.run(), /unsafe Git tree|without README|invalid ownership index/);
    assert.equal(fixture.appends.length, 0);
  }
  const fixture = await harness(t, {
    remoteFiles: baseline(),
    intercept: call => call.args[0] === "ls-tree" ? ok(`120000 blob ${sha}\tindex.json\0`) : undefined,
  });
  await assert.rejects(fixture.run(), /unsafe Git tree/);
});

test("only added snapshots and added or modified archive indexes can be committed", () => {
  assert.deepEqual(validateArchiveDiff("M\0README.md\0M\0index.json\0A\0snapshots/new/image.png\0"),
    ["README.md", "index.json", "snapshots/new/image.png"]);
  for (const diff of [
    "M\0snapshots/old/index.html\0M\0index.json\0",
    "D\0snapshots/old/index.html\0M\0index.json\0",
    "A\0.github/workflows/job.yml\0M\0index.json\0",
    "A\0dist/index.html\0M\0index.json\0",
    "A\0snapshots/../index.html\0M\0index.json\0",
    "A\0README.md\0",
  ]) assert.throws(() => validateArchiveDiff(diff), /unsafe archive diff|no staged receipt index/);
});

test("append success without the exact persisted receipt is rejected before staging", async t => {
  const fixture = await harness(t, {
    append: async ({ archiveDir }) => {
      await writeFiles(archiveDir, baseline());
      return { changed: true, snapshotsAdded: 1, receiptKey: "100-1" };
    },
  });
  await assert.rejects(fixture.run(), /expected deployment receipt/);
  assert.ok(!fixture.commands.some(call => ["add", "commit", "push"].includes(call.args[0])));
});

test("incomplete archive output and executable files are rejected before a commit", async t => {
  const missingReadme = await harness(t, {
    append: async ({ archiveDir }) => {
      await writeFiles(archiveDir, { "index.json": baseline(["100-1"])["index.json"] });
      return { changed: true, snapshotsAdded: 0, receiptKey: "100-1" };
    },
  });
  await assert.rejects(missingReadme.run(), /README\.md/);
  assert.ok(!missingReadme.commands.some(call => call.args[0] === "commit"));
  const executable = await harness(t, {
    intercept: call => call.args[0] === "ls-files"
      ? ok(`100755 ${sha} 0\tsnapshots/100-1/index.html\0`) : undefined,
  });
  await assert.rejects(executable.run(), /executable, symbolic-link, or conflicted archive files/);
  assert.ok(!executable.commands.some(call => call.args[0] === "commit"));
});

test("command errors redact raw tokens, Basic credentials, and credential-bearing URLs", async () => {
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  const message = `${token} ${basic} Authorization: Bearer another-secret https://user:secret@github.com/repo`;
  const cleaned = redact(message, token);
  for (const secret of [token, basic, "another-secret", "user:secret"]) assert.ok(!cleaned.includes(secret));
  const runner = createCommandRunner({
    execute: async () => { throw Object.assign(new Error(message), { code: 128, stdout: message, stderr: message }); },
  });
  const result = await runner("git", ["ls-remote"], { env: { GH_TOKEN: token } });
  assert.equal(result.code, 128);
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(result).includes(basic));
  const successful = createCommandRunner({ execute: async () => ({ stdout: message, stderr: message }) });
  assert.ok(!JSON.stringify(await successful("gh", ["api"], { env: { GH_TOKEN: token } })).includes(token));
  const timedOut = createCommandRunner({
    execute: async () => { throw Object.assign(new Error(message), { code: 1, killed: true }); },
  });
  await assert.rejects(timedOut("gh", ["api"], { env: { GH_TOKEN: token } }),
    error => error.message.includes("could not complete") && !error.message.includes(token));
});

test("workflow uses trusted main, serialized automatic recovery, and a writer-only token", async () => {
  const workflow = await readFile(new URL("../.github/workflows/archive-fundraising.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflows:\s+- Deploy GitHub Pages/);
  assert.match(workflow, /types:\s+- completed/);
  assert.match(workflow, /branches:\s+- main/);
  assert.match(workflow, /cron: "43 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\n  contents: read\n  actions: read/);
  assert.match(workflow, /permissions:\n      contents: write\n      actions: read/);
  assert.match(workflow, /group: fundraising-archive\n  cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /github\.event\.workflow_run\.conclusion/);
  assert.match(workflow, /head_repository\.full_name == github\.repository/);
  assert.match(workflow, /ref: main\n          persist-credentials: false/);
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /npx --no-install playwright install --with-deps chromium/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.doesNotMatch(workflow, /WIX|secrets\.|pages: write|id-token:|cache:|inputs:|continue-on-error/);
});
