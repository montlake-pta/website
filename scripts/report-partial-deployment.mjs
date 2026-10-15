import { appendFile, readFile } from "node:fs/promises";
import { partialDeploymentProblems } from "./content-isolation.mjs";

const reportPath = process.env.CONTENT_ISOLATION_REPORT;
let report = null;
try {
  if (reportPath) report = JSON.parse(await readFile(reportPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const problems = partialDeploymentProblems({
  wixSync: process.env.WIX_SYNC_OUTCOME,
  calendarSync: process.env.CALENDAR_SYNC_OUTCOME,
  report,
});
if (!problems.length) {
  console.log("Every content source and item was published.");
  process.exit(0);
}
const escape = (value) => value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
for (const problem of problems) console.log(`::error title=Partial deployment::${escape(problem)}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, [
    "## Partial deployment",
    "",
    "The site was deployed, but these updates were not published:",
    "",
    ...problems.map((problem) => `- ${problem}`),
    "",
    "Fix the content or code, then the next build publishes it automatically.",
    "",
  ].join("\n"));
}
process.exit(1);
