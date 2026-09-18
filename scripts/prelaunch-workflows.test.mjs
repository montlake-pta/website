import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("launch rehearsal cannot deploy, push archives or expose admin credentials to the browser runner", async () => {
  const workflow = await readFile(new URL("../.github/workflows/rehearse-cutover.yml", import.meta.url), "utf8");
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /github.event_name == 'workflow_dispatch' && inputs.refresh_public_content/);
  assert.match(workflow, /cutover-rehearsal-\$\{\{ github.run_id \}\}/);
  assert.doesNotMatch(workflow, /deploy-pages|upload-pages-artifact|contents: write|pages: write|id-token: write|fundraising-archive-input-\$/);
  const step = workflow.split("- name: Run isolated launch rehearsal")[1].split("- name: Save public rehearsal evidence")[0];
  assert.doesNotMatch(step, /WIX_API_KEY|secrets\.|GH_TOKEN/);
});

test("public readiness workflow only has read permissions and never alters hosting settings", async () => {
  const workflow = await readFile(new URL("../.github/workflows/check-launch.yml", import.meta.url), "utf8");
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pages: read/);
  assert.match(workflow, /options: \[preview, launch\]/);
  assert.doesNotMatch(workflow, /: write|WIX_API_KEY|secrets\.|deploy-pages|workflow run|variable set/);
});
