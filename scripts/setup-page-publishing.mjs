import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { fingerprint } from "./update-wix-page.mjs";
import { pagePublishingAutomations, templateAutomationId } from "../wix/page-publishing.mjs";
import { pageCollectionDefinitions } from "./page-collections.mjs";

const baseUrl = "https://www.wixapis.com/automations-service/v2/automations";
class PublishingSetupError extends Error {}
const requireCondition = (condition, message) => { if (!condition) throw new PublishingSetupError(message); };
const safeError = error => error instanceof PublishingSetupError ? error.message : "Native page publishing setup failed; private API details are not logged.";

export async function setupPagePublishing({ request, siteId, sourceCommit, mode = "plan", expectedFingerprint, saveReport = async () => {} }) {
  const report = { mode, status: "failed", sourceCommit, canApply: false, expectedFingerprint: null,
    definitions: [], connections: [], writeAttempted: false, applyInputs: null };
  try {
    requireCondition(["plan", "apply"].includes(mode), "Use plan or apply.");
    requireCondition(/^[a-f0-9]{40}$/.test(sourceCommit || ""), "A committed source revision is required.");
    if (mode === "apply") requireCondition(/^[a-f0-9]{64}$/.test(expectedFingerprint || ""), "Apply requires a reviewed plan fingerprint.");
    const template = (await request("GET", `${baseUrl}/${templateAutomationId}`)).automation;
    requireCondition(template?.id === templateAutomationId && Object.keys(template.configuration?.actions || {}).length === 1,
      "The existing publishing template must contain exactly one action.");
    report.definitions = pagePublishingAutomations(Object.values(template.configuration.actions)[0]);
    const names = report.definitions.map(automation => automation.name);
    async function queryExisting() {
      const results = [];
      let cursor;
      do {
        const query = cursor ? { cursorPaging: { limit: 100, cursor } }
          : { filter: { name: { $in: names } }, cursorPaging: { limit: 100 } };
        const response = await request("POST", `${baseUrl}/query`, { query });
        requireCondition(Array.isArray(response.automations), "Malformed automation query response.");
        results.push(...response.automations);
        cursor = response.pagingMetadata?.hasNext ? response.pagingMetadata.cursors?.next : null;
        requireCondition(!response.pagingMetadata?.hasNext || cursor, "Incomplete automation pagination.");
      } while (cursor);
      return results.sort((a, b) => a.id.localeCompare(b.id));
    }
    let existing = await queryExisting();
    for (const definition of report.definitions) {
      const matches = existing.filter(automation => automation.name === definition.name);
      requireCondition(matches.length <= 1 && (!matches.length || fingerprint(matches[0].configuration) === fingerprint(definition.configuration)),
        "A named automation already exists with a conflicting or duplicate configuration; nothing is overwritten.");
      const validation = await request("POST", `${baseUrl}/validate`, { automation: definition });
      requireCondition(validation.status === "VALID", `Automation validation did not pass: ${definition.name}. Confirm the collection exists and the action is available.`);
    }
    const stateFingerprint = value => fingerprint({ siteId, sourceCommit, template, existing: value, definitions: report.definitions });
    report.expectedFingerprint = stateFingerprint(existing);
    report.canApply = true;
    report.applyInputs = { mode: "apply", candidate_commit: sourceCommit, expected_fingerprint: report.expectedFingerprint };
    report.status = "planned";
    await saveReport(report);
    if (mode === "plan") return report;
    requireCondition(expectedFingerprint === report.expectedFingerprint, "Publishing configuration changed since the plan. Review a fresh plan.");
    for (const definition of report.definitions) {
      const currentTemplate = (await request("GET", `${baseUrl}/${templateAutomationId}`)).automation;
      const current = await queryExisting();
      requireCondition(fingerprint(currentTemplate) === fingerprint(template) && fingerprint(current) === fingerprint(existing),
        "Automation state changed during setup. Review a fresh plan; no next write was sent.");
      let automation = existing.find(value => value.name === definition.name);
      if (!automation) {
        report.writeAttempted = true;
        report.status = "applying";
        await saveReport(report);
        const response = await request("POST", baseUrl, { automation: definition });
        automation = response.automation;
        requireCondition(automation?.id && fingerprint(automation.configuration) === fingerprint(definition.configuration),
          "Created automation was not returned with the reviewed configuration; inspect before retrying.");
        existing.push(automation);
        existing.sort((a, b) => a.id.localeCompare(b.id));
      }
      const collectionId = pageCollectionDefinitions.find(d => definition.name.startsWith(`GitHub publish - ${d.id} `)).id;
      report.connections.push({ automationId: automation.id, name: automation.name, collectionId,
        event: definition.configuration.trigger.triggerKey.split("-").at(-1), status: automation.configuration.status });
      await saveReport(report);
    }
    const final = await queryExisting();
    requireCondition(fingerprint(final) === fingerprint(existing), "Final automation read-back differs; inspect before activating typed authoring.");
    report.status = report.writeAttempted ? "applied" : "already-current";
    await saveReport(report);
    return report;
  } catch (error) {
    report.status = report.writeAttempted ? "partial-failure" : "failed";
    report.error = safeError(error);
    await saveReport(report);
    throw new PublishingSetupError(report.error);
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    mode: { type: "string", default: "plan" }, "expected-fingerprint": { type: "string" }, "output-dir": { type: "string" },
  } });
  const output = values["output-dir"] ? resolve(values["output-dir"]) : await mkdtemp(join(tmpdir(), "wix-page-publishing-"));
  if (values["output-dir"]) await mkdir(output);
  const saveReport = report => writeFile(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  requireCondition(process.env.WIX_API_KEY, "WIX_API_KEY is required. Use the manual Actions workflow.");
  const config = JSON.parse(await readFile("src/wix.config.json", "utf8"));
  const siteId = process.env.WIX_SITE_ID || config.siteId;
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  requireCondition(!execFileSync("git", ["status", "--porcelain", "--", "scripts", "wix", "src/wix.config.json", "package.json", "package-lock.json"],
    { encoding: "utf8" }).trim(), "Commit publishing configuration and shared scripts before planning or applying.");
  async function request(method, url, body) {
    let response;
    try {
      response = await fetch(url, { method, headers: {
        Authorization: process.env.WIX_API_KEY, "wix-site-id": siteId, "Content-Type": "application/json",
      }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    } catch {
      throw new PublishingSetupError("Wix automation request failed or has an unknown outcome; no raw network details are logged.");
    }
    requireCondition(response.ok, `Wix automation API returned HTTP ${response.status}; no private response is logged.`);
    return response.json();
  }
  const report = await setupPagePublishing({ request, siteId, sourceCommit, mode: values.mode,
    expectedFingerprint: values["expected-fingerprint"], saveReport });
  console.log(JSON.stringify({ status: report.status, applyInputs: report.applyInputs, connections: report.connections }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
}
