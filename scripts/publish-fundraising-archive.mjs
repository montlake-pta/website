import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repository = "montlake-pta/website";
const branch = "fundraising-archive";
const workflowPath = ".github/workflows/pages.yml";
const artifactPattern = /^fundraising-archive-input-([1-9]\d*)-([1-9]\d*)$/;
const shaPattern = /^[a-f0-9]{40}$/;
const retentionMs = 90 * 24 * 60 * 60 * 1000;
const maxArtifactPages = 100;
const exec = promisify(execFile);

export function redact(message, token = "") {
  let result = String(message);
  for (const secret of [token, token && Buffer.from(`x-access-token:${token}`).toString("base64")]) {
    if (secret) result = result.replaceAll(secret, "[REDACTED]");
  }
  return result.replace(/(authorization:\s*(?:basic|bearer)\s+)\S+/gi, "$1[REDACTED]")
    .replace(/https:\/\/[^/\s@]+@github\.com/gi, "https://[REDACTED]@github.com");
}

export function createCommandRunner({ execute = exec } = {}) {
  return async (command, args, { cwd, env = process.env } = {}) => {
    try {
      const result = await execute(command, args, {
        cwd, env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
        timeout: 15 * 60 * 1000, windowsHide: true,
      });
      return {
        code: 0, stdout: redact(result.stdout, env.GH_TOKEN), stderr: redact(result.stderr, env.GH_TOKEN),
      };
    } catch (error) {
      if (Number.isInteger(error.code) && !error.killed) {
        return {
          code: error.code,
          stdout: redact(error.stdout || "", env.GH_TOKEN),
          stderr: redact(error.stderr || error.message, env.GH_TOKEN),
        };
      }
      throw new Error(`${command} could not complete: ${redact(error.message, env.GH_TOKEN)}`);
    }
  };
}

function timestamp(value, description) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid ${description} timestamp.`);
  }
  return Date.parse(value);
}

function safePath(path) {
  return typeof path === "string" && !/[\\:\x00-\x1f\x7f]/.test(path)
    && path.split("/").every(part => part && !part.startsWith("."));
}

function archivePath(path) {
  return safePath(path) && (path === "README.md" || path === "index.json" || path.startsWith("snapshots/"));
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function jsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`Could not read valid archive JSON: ${path}.`);
  }
}

async function validateTree(directory, kind, prefix = "") {
  for (const name of await readdir(directory)) {
    const path = prefix ? `${prefix}/${name}` : name;
    const info = await lstat(join(directory, name));
    const allowed = kind === "archive"
      ? archivePath(path) || path === "snapshots"
      : path === "input.json" || path === "pages" || path === "assets"
        || path.startsWith("pages/") || path.startsWith("assets/");
    if (!safePath(path) || !allowed || (!info.isFile() && !info.isDirectory()) || info.isSymbolicLink()) {
      throw new Error(`Unsafe ${kind} path: ${path}.`);
    }
    if (info.isDirectory()) {
      if (["README.md", "index.json", "input.json"].includes(path)) {
        throw new Error(`Expected a file at ${path}.`);
      }
      await validateTree(join(directory, name), kind, path);
    }
  }
}

export async function validateInput(inputDir, deployment) {
  await validateTree(inputDir, "input");
  const input = await jsonFile(join(inputDir, "input.json"));
  if (input.schemaVersion !== 1 || input.sourceRunId !== deployment.runId
    || input.sourceRunAttempt !== deployment.runAttempt || input.sourceCommit !== deployment.sourceCommit
    || !Array.isArray(input.pages) || typeof input.baseUrl !== "string") {
    throw new Error("Prepared archive input does not match the verified deployment.");
  }
  const url = new URL(input.baseUrl);
  if (url.protocol !== "https:" || url.username || url.password
    || timestamp(input.preparedAt, "preparation") > timestamp(deployment.deployedAt, "deployment")) {
    throw new Error("Invalid prepared archive URL or preparation time.");
  }
  const slugs = new Set();
  for (const page of input.pages) {
    if (!object(page) || typeof page.slug !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(page.slug)
      || slugs.has(page.slug) || page.directory !== `pages/${page.slug}`
      || !/^[a-f0-9]{64}$/.test(page.fingerprint) || typeof page.title !== "string") {
      throw new Error("Invalid or duplicate prepared fundraising page.");
    }
    slugs.add(page.slug);
    for (const name of ["index.html", "page.json"]) {
      if (!(await lstat(join(inputDir, page.directory, name))).isFile()) {
        throw new Error(`Missing prepared page file: ${page.directory}/${name}.`);
      }
    }
  }
}

async function receiptsAt(archiveDir) {
  const index = await jsonFile(join(archiveDir, "index.json"));
  if (index.schemaVersion !== 1 || !object(index.receipts) || !object(index.pages)
    || Object.keys(index.receipts).some(key => !/^[1-9]\d*-[1-9]\d*$/.test(key))) {
    throw new Error("The archive branch has an invalid ownership index.");
  }
  return index.receipts;
}

export async function discoverDeployments({ api, receipts = {}, now = Date.now() }) {
  const artifacts = new Map();
  let exhausted = false;
  for (let page = 1; page <= maxArtifactPages; page += 1) {
    const response = await api(`actions/artifacts?per_page=100&page=${page}`);
    if (!Array.isArray(response.artifacts)) throw new Error("Invalid GitHub artifacts response.");
    let oldest = Infinity;
    for (const artifact of response.artifacts) {
      oldest = Math.min(oldest, timestamp(artifact.created_at, "artifact creation"));
      if (!artifactPattern.test(artifact.name)) continue;
      if (!Number.isSafeInteger(artifact.id) || artifact.id < 1) throw new Error("Invalid artifact identity.");
      artifacts.set(artifact.id, artifact);
    }
    if (response.artifacts.length < 100 || oldest < now - retentionMs) {
      exhausted = true;
      break;
    }
  }
  if (!exhausted) throw new Error("Artifact recovery pagination limit reached; refusing to truncate history.");
  const names = new Set();
  const candidates = [];
  for (const artifact of artifacts.values()) {
    const [, runId, attempt] = artifact.name.match(artifactPattern);
    const runAttempt = Number(attempt);
    const key = `${runId}-${attempt}`;
    if (names.has(artifact.name)) throw new Error(`Ambiguous duplicate archive artifact: ${artifact.name}.`);
    names.add(artifact.name);
    if (Object.hasOwn(receipts, key)) continue;
    const provenance = artifact.workflow_run;
    if (!Number.isSafeInteger(runAttempt) || !provenance || String(provenance.id) !== runId
      || provenance.head_branch !== "main" || !shaPattern.test(provenance.head_sha)
      || !provenance.repository_id || provenance.head_repository_id !== provenance.repository_id) continue;

    // The attempt endpoint preserves proof even when a later rerun of this run fails.
    const run = await api(`actions/runs/${runId}/attempts/${runAttempt}`);
    if (String(run.id) !== runId || run.run_attempt !== runAttempt || run.path !== workflowPath
      || run.head_branch !== "main" || run.head_repository?.full_name !== repository
      || run.repository?.full_name !== repository || run.head_sha !== provenance.head_sha
      || run.status !== "completed") continue;
    const jobs = [];
    let jobsComplete = false;
    for (let page = 1; page <= 10; page += 1) {
      const response = await api(`actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100&page=${page}`);
      if (!Array.isArray(response.jobs)) throw new Error("Invalid GitHub deployment jobs response.");
      jobs.push(...response.jobs);
      if (response.jobs.length < 100) {
        jobsComplete = true;
        break;
      }
    }
    if (!jobsComplete) throw new Error(`Deployment jobs pagination limit reached for ${key}.`);
    const deployJobs = jobs.filter(job => job.name === "deploy" && String(job.run_id) === runId
      && job.head_sha === run.head_sha && job.status === "completed"
      && (job.run_attempt === undefined || job.run_attempt === runAttempt));
    const deploySteps = deployJobs.flatMap(job => (job.steps || []).filter(step => step.name === "Deploy"));
    if (deployJobs.length !== 1 || deploySteps.length !== 1) {
      if (run.conclusion === "success" || deployJobs.some(job => job.conclusion === "success")
        || deploySteps.some(step => step.status === "completed" && step.conclusion === "success")) {
        throw new Error(`Pages attempt ${key} has no unique successful Deploy step.`);
      }
      continue;
    }
    // Post-deployment cleanup can fail or be cancelled after Pages has already published.
    if (deploySteps[0].status !== "completed" || deploySteps[0].conclusion !== "success") continue;
    const completed = timestamp(deploySteps[0].completed_at, "Deploy step completion");
    if (timestamp(artifact.created_at, "artifact creation") > completed) {
      throw new Error(`Archive artifact ${key} was not prepared before deployment.`);
    }
    if (artifact.expired || timestamp(artifact.expires_at, "artifact expiry") <= now) {
      throw new Error(`Unrecoverable archive gap: deployed input ${key} has expired; no replacement capture is safe.`);
    }
    candidates.push({
      artifact,
      deployment: {
        runId, runAttempt, sourceCommit: run.head_sha, deployedAt: new Date(completed).toISOString(),
        runUrl: `https://github.com/${repository}/actions/runs/${runId}`,
      },
    });
  }
  return candidates.sort((a, b) => Date.parse(a.deployment.deployedAt) - Date.parse(b.deployment.deployedAt)
    || (BigInt(a.deployment.runId) < BigInt(b.deployment.runId) ? -1
      : BigInt(a.deployment.runId) > BigInt(b.deployment.runId) ? 1 : 0)
    || a.deployment.runAttempt - b.deployment.runAttempt);
}

function validateGitTree(output) {
  const files = output.split("\0").filter(Boolean);
  const paths = new Set();
  for (const file of files) {
    const match = file.match(/^100644 blob [a-f0-9]{40}\t(.+)$/);
    if (!match || !archivePath(match[1])) throw new Error("The existing archive contains an unsafe Git tree.");
    paths.add(match[1]);
  }
  if (!paths.has("README.md") || !paths.has("index.json")) {
    throw new Error("Refusing to take over an archive branch without README.md and index.json.");
  }
}

export function validateArchiveDiff(output) {
  const entries = output.split("\0");
  if (entries.pop() !== "" || entries.length % 2) throw new Error("Invalid staged archive diff.");
  const changes = [];
  for (let i = 0; i < entries.length; i += 2) {
    const [status, path] = entries.slice(i, i + 2);
    if (!archivePath(path) || !["A", "M"].includes(status)
      || (path.startsWith("snapshots/") && status !== "A")) {
      throw new Error("Refusing an unsafe archive diff or modification of an immutable snapshot.");
    }
    changes.push(path);
  }
  if (!changes.includes("index.json")) throw new Error("Archive append produced no staged receipt index.");
  return changes;
}

export async function publishArchive({
  repo = process.env.GH_REPO,
  token = process.env.GH_TOKEN,
  workRoot = process.env.RUNNER_TEMP || tmpdir(),
  run = createCommandRunner(),
  appendArchive,
  now = Date.now(),
} = {}) {
  if (repo !== repository) throw new Error(`Archive publishing is restricted to ${repository}.`);
  if (!token) throw new Error("GH_TOKEN is required for archive publishing.");
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.startsWith("GIT_") && key !== "GH_DEBUG"));
  Object.assign(env, {
    GH_TOKEN: token, GH_REPO: repo, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1",
    GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_COUNT: "3",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
    GIT_CONFIG_KEY_1: "core.hooksPath", GIT_CONFIG_VALUE_1: "/dev/null",
    GIT_CONFIG_KEY_2: "core.autocrlf", GIT_CONFIG_VALUE_2: "false",
  });
  const command = async (name, args, cwd, allowFailure = false) => {
    const result = await run(name, args, { cwd, env });
    if (result.code !== 0 && !allowFailure) {
      throw new Error(`${name} failed (${result.code}): ${redact(result.stderr || result.stdout, token).slice(0, 4000)}`);
    }
    return result;
  };
  const api = async path => {
    const result = await command("gh", ["api", `repos/${repo}/${path}`]);
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error("GitHub returned invalid JSON during archive recovery.");
    }
  };
  const remote = `https://github.com/${repo}.git`;
  const ref = `refs/heads/${branch}`;
  const remoteHead = async () => {
    const result = await command("git", ["ls-remote", "--exit-code", "--heads", remote, ref], undefined, true);
    if (result.code === 2 && !result.stdout.trim()) return null;
    const match = result.stdout.trim().match(/^([a-f0-9]{40})\trefs\/heads\/fundraising-archive$/);
    if (result.code !== 0 || !match) {
      throw new Error(`Cannot establish archive branch existence: ${redact(result.stderr, token).slice(0, 4000)}`);
    }
    return match[1];
  };
  const workspace = await mkdtemp(join(resolve(workRoot), "fundraising-archive-"));
  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const directory = join(workspace, `attempt-${attempt}`);
      const gitDir = join(directory, "repository");
      const archiveDir = join(directory, "archive");
      await mkdir(archiveDir, { recursive: true });
      const head = await remoteHead();
      const git = async (args, allowFailure = false) =>
        command("git", [`--work-tree=${archiveDir}`, ...args], gitDir, allowFailure);
      if (head) {
        await command("git", [
          "clone", "--quiet", "--no-checkout", "--single-branch", "--branch", branch, "--no-tags", remote, gitDir,
        ]);
        validateGitTree((await git(["ls-tree", "-r", "-z", "--full-tree", "HEAD"])).stdout);
        await git(["read-tree", "HEAD"]);
        await git(["checkout-index", "--all"]);
      } else {
        await command("git", ["init", "--quiet", `--initial-branch=${branch}`, gitDir]);
        await git(["remote", "add", "origin", remote]);
      }
      const receipts = head ? await receiptsAt(archiveDir) : {};
      const candidates = await discoverDeployments({ api, receipts, now });
      if (!candidates.length) return { changed: false, deploymentsArchived: 0, snapshotsAdded: 0 };
      const append = appendArchive || (await import("./archive-fundraising.mjs")).appendArchive;
      let snapshotsAdded = 0;
      for (const { artifact, deployment } of candidates) {
        const key = `${deployment.runId}-${deployment.runAttempt}`;
        const inputDir = await mkdtemp(join(directory, "input-"));
        // gh confines ZIP extraction to --dir. Validate links and payload paths before consuming any files.
        await command("gh", [
          "run", "download", deployment.runId, "--repo", repo, "--name", artifact.name, "--dir", inputDir,
        ]);
        await validateInput(inputDir, deployment);
        // The entire batch stays in an isolated work tree until every append has succeeded.
        const result = await append({ inputDir, archiveDir, deployment });
        if (!result || result.changed !== true || result.receiptKey !== key
          || !Number.isSafeInteger(result.snapshotsAdded) || result.snapshotsAdded < 0
          || !Object.hasOwn(await receiptsAt(archiveDir), key)) {
          throw new Error(`Archive append did not record the expected deployment receipt ${key}.`);
        }
        snapshotsAdded += result.snapshotsAdded;
        await rm(inputDir, { recursive: true });
      }
      await validateTree(archiveDir, "archive");
      for (const name of ["README.md", "index.json"]) {
        if (!(await lstat(join(archiveDir, name))).isFile()) {
          throw new Error(`Archive append did not produce ${name}.`);
        }
      }
      await git(["config", "user.name", "github-actions[bot]"]);
      await git(["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
      await git(["add", "--all", "--", "."]);
      validateArchiveDiff((await git(["diff", "--cached", "--name-status", "-z", "--no-renames"])).stdout);
      const staged = (await git(["ls-files", "--stage", "-z"])).stdout.split("\0").filter(Boolean);
      if (staged.some(file => !/^100644 [a-f0-9]{40} 0\t/.test(file))) {
        throw new Error("Refusing executable, symbolic-link, or conflicted archive files.");
      }
      const last = candidates.at(-1).deployment;
      await git(["commit", "--quiet", "-m",
        `Archive fundraising deployments through ${last.runId}-${last.runAttempt}\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`]);
      const commit = (await git(["rev-parse", "HEAD"])).stdout.trim();
      if (!shaPattern.test(commit)) throw new Error("Invalid archive commit identity.");
      const pushed = await git(["push", "--porcelain", "origin", `HEAD:${ref}`], true);
      const published = await remoteHead();
      if (published === commit) {
        return { changed: true, deploymentsArchived: candidates.length, snapshotsAdded };
      }
      if (attempt === 3 || !published || published === head) {
        throw new Error(`Archive push was not confirmed; recovery will retry: ${redact(pushed.stderr, token).slice(0, 4000)}`);
      }
      // A concurrent writer advanced the ref. Start from it and recompute receipts and fingerprints; never force.
    }
    throw new Error("Archive publishing retry limit reached.");
  } catch (error) {
    throw new Error(redact(error.message, token));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publishArchive().then(result => {
    console.log(`Fundraising archive: ${result.deploymentsArchived} deployment receipts, ${result.snapshotsAdded} new snapshots.`);
  }).catch(error => {
    console.error(redact(error.message, process.env.GH_TOKEN));
    process.exitCode = 1;
  });
}
