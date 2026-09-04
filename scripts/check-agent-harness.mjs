import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const requiredFiles = [
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".github/instructions/site-source.instructions.md",
  ".github/instructions/wix-sync.instructions.md",
  ".github/instructions/github-actions.instructions.md",
  ".github/instructions/agent-harness.instructions.md",
  ".github/agents/montlake-site-maintainer.agent.md",
  ".github/agents/wix-content-maintainer.agent.md",
  ".github/agents/release-readiness.agent.md",
  ".github/workflows/copilot-setup-steps.yml",
  ".github/workflows/agent-harness.yml",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/agent-task.yml",
];
const failures = [];

for (const relativePath of requiredFiles) {
  try {
    await access(join(root, relativePath));
  } catch {
    failures.push(`${relativePath}: missing`);
  }
}

for (const file of await listMarkdownFiles(join(root, ".github", "instructions"), ".instructions.md")) {
  const content = await readFile(file, "utf8");
  checkFrontmatter(file, content, ["applyTo"]);
}

for (const file of await listMarkdownFiles(join(root, ".github", "agents"), ".agent.md")) {
  const content = await readFile(file, "utf8");
  checkFrontmatter(file, content, ["description"]);
  if (/^tools:\s*null\s*$/m.test(content)) failures.push(`${relative(file)}: tools must be omitted or an array, never null`);
  if (file.includes(`${join(".github", "agents", "impeccable-")}`) && !/^user-invocable:\s*false\s*$/m.test(content)) {
    failures.push(`${relative(file)}: Impeccable internal subagents must set user-invocable: false`);
  }
}

const setupWorkflow = await readFile(join(root, ".github", "workflows", "copilot-setup-steps.yml"), "utf8");
const jobsBlock = setupWorkflow.split(/\njobs:\s*\n/, 2)[1] || "";
const jobMatches = jobsBlock.match(/^\s{2}[a-zA-Z0-9_-]+:\s*$/gm) || [];
if (jobMatches.length !== 1 || jobMatches[0].trim() !== "copilot-setup-steps:") {
  failures.push(".github/workflows/copilot-setup-steps.yml: must contain exactly one job named copilot-setup-steps");
}
if (!setupWorkflow.includes("npm ci")) {
  failures.push(".github/workflows/copilot-setup-steps.yml: dependencies are not installed with npm ci");
}
if (!setupWorkflow.includes("node-version: 24")) {
  failures.push(".github/workflows/copilot-setup-steps.yml: Node.js 24 is not configured");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Checked Copilot instructions, custom agents, templates, and cloud setup");

function checkFrontmatter(file, content, keys) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    failures.push(`${relative(file)}: missing YAML frontmatter`);
    return;
  }
  for (const key of keys) {
    if (!new RegExp(`^${key}:\\s*.+$`, "m").test(match[1])) {
      failures.push(`${relative(file)}: missing ${key} frontmatter`);
    }
  }
}

async function listMarkdownFiles(directory, suffix) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    failures.push(`${relative(directory)}: directory is missing`);
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => join(directory, entry.name));
}

function relative(file) {
  return file.slice(root.length + 1);
}
