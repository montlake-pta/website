import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { site } from "../src/site.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appName = "Montlake PTA Website";
const apiRoot = "https://www.wixapis.com/oauth-app/v1/oauth-apps";
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export class HeadlessSetupError extends Error {}

export async function discoverAccountId(apiKey, siteId, fetchImpl = fetch) {
  if (!apiKey || !uuid.test(siteId || "")) throw new HeadlessSetupError("A Wix API key and valid site ID are required.");
  let response;
  try {
    response = await fetchImpl("https://www.wixapis.com/site-list/v2/sites/query", {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { filter: { id: siteId }, cursorPaging: { limit: 2 } } }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new HeadlessSetupError("Wix account-context lookup failed; no raw network details are logged.");
  }
  if (!response.ok) {
    throw new HeadlessSetupError(`Wix account-context lookup failed (HTTP ${response.status}). Configure WIX_ACCOUNT_ID or provide the public Headless client ID.`);
  }
  let result;
  try { result = await response.json(); }
  catch { throw new HeadlessSetupError("Wix account-context lookup returned invalid JSON."); }
  if (result.sites?.length !== 1 || result.sites[0].id !== siteId || !uuid.test(result.sites[0].ownerAccountId || "")) {
    throw new HeadlessSetupError("The selected site's owning account could not be verified.");
  }
  return result.sites[0].ownerAccountId;
}

export async function setupHeadlessClient({
  apiKey, siteId, accountId, baseUrl = site.previewUrl, mode = "plan", fetchImpl = fetch,
}) {
  if (!apiKey || !uuid.test(siteId || "")) throw new HeadlessSetupError("A Wix API key and valid site ID are required.");
  if (!["plan", "apply"].includes(mode)) throw new HeadlessSetupError("Mode must be plan or apply.");
  const frontend = new URL(baseUrl);
  if (frontend.protocol !== "https:" || frontend.username || frontend.password || frontend.search || frontend.hash || !frontend.pathname.endsWith("/")) {
    throw new HeadlessSetupError("The frontend URL must be an HTTPS directory URL without credentials, query or fragment.");
  }
  const domains = [...new Set([frontend.hostname, "montlake-pta.github.io", "www.montlakepta.org", "montlakepta.org"])].sort();
  const matches = [];
  let offset = 0;
  while (true) {
    const result = await request("POST", "/query", { query: { paging: { limit: 100, offset } } });
    if (!Array.isArray(result.oAuthApps)) throw new HeadlessSetupError("OAuth app query returned an invalid response.");
    matches.push(...result.oAuthApps.filter((app) => app.name === appName));
    if (matches.length > 1) throw new HeadlessSetupError("Multiple matching Headless clients exist; select one in Wix before continuing.");
    offset += result.oAuthApps.length;
    if (result.pagingMetadata?.total != null && offset >= result.pagingMetadata.total) break;
    if (result.oAuthApps.length < 100) break;
  }
  let app = matches[0];
  if (!app && mode === "plan") {
    return { status: "create-required", name: appName, siteId, baseUrl: frontend.href, allowedRedirectDomains: domains };
  }
  let created = false;
  if (!app) {
    const result = await request("POST", "", { oAuthApp: {
      name: appName,
      description: "Visitor interactions for the Montlake PTA external website.",
      applicationType: "WEB_APP",
      technology: "JAVASCRIPT",
      allowedRedirectDomains: domains,
      allowedRedirectUris: [],
    } });
    app = result.oAuthApp;
    created = true;
  }
  if (!uuid.test(app?.id || "")) throw new HeadlessSetupError("Wix did not return a valid Headless client ID.");
  const expectedId = app.id;
  const verified = await request("GET", `/${expectedId}`);
  app = verified.oAuthApp;
  if (!app || app.name !== appName || app.id !== expectedId) {
    throw new HeadlessSetupError("Headless client read-back did not match the requested client.");
  }
  const approved = new Set((app.allowedRedirectDomains || []).map((domain) => {
    try { return new URL(domain.includes("://") ? domain : `https://${domain}`).hostname; }
    catch { throw new HeadlessSetupError("Existing client has an invalid redirect domain."); }
  }));
  const missing = domains.filter((domain) => !approved.has(domain));
  if (missing.length) {
    throw new HeadlessSetupError("Headless client is missing required redirect domains. Add the current frontend and Montlake domains in Wix Headless Settings; existing settings were not overwritten.");
  }
  let wixPagesOrigin = null;
  if (app.redirectUrlWixPages) {
    try {
      const hosted = new URL(app.redirectUrlWixPages);
      if (hosted.protocol !== "https:" || hosted.username || hosted.password) throw new Error("Invalid origin");
      wixPagesOrigin = hosted.origin;
    }
    catch { throw new HeadlessSetupError("Wix returned an invalid hosted-pages origin."); }
  }
  return {
    status: created ? "created" : "already-configured",
    clientId: app.id, siteId, baseUrl: frontend.href,
    allowedRedirectDomains: domains, wixPagesOrigin,
  };

  async function request(method, path, body) {
    let response;
    try {
      response = await fetchImpl(`${apiRoot}${path}`, {
        method,
        headers: {
          Authorization: apiKey, "wix-site-id": siteId, "Content-Type": "application/json",
          ...(accountId ? { "wix-account-id": accountId } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new HeadlessSetupError("Wix Headless setup request failed; no network or credential details are logged.");
    }
    if (!response.ok) {
      throw new HeadlessSetupError(`Wix Headless setup failed (HTTP ${response.status}). Read/Manage OAuth Apps permissions and the correct site/account context are required.`);
    }
    try { return await response.json(); }
    catch { throw new HeadlessSetupError("Wix Headless setup returned invalid JSON."); }
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    mode: { type: "string", default: "plan" },
    "output-dir": { type: "string" },
  } });
  if (!values["output-dir"]) throw new HeadlessSetupError("Choose a new --output-dir for the public report.");
  const output = resolve(values["output-dir"]);
  await mkdir(output);
  const config = JSON.parse(await readFile(join(root, "src/wix.config.json"), "utf8"));
  const siteId = process.env.WIX_SITE_ID || config.siteId;
  const accountId = process.env.WIX_ACCOUNT_ID || await discoverAccountId(process.env.WIX_API_KEY, siteId);
  const report = await setupHeadlessClient({
    apiKey: process.env.WIX_API_KEY, siteId, accountId, mode: values.mode,
  });
  await writeFile(join(output, "headless-setup.json"), JSON.stringify(report, null, 2) + "\n");
  if (report.clientId) {
    await writeFile(join(output, "wix-client.config.json"), JSON.stringify({
      clientId: report.clientId, siteId: report.siteId, baseUrl: report.baseUrl,
    }, null, 2) + "\n");
  }
  console.log(`Headless client setup: ${report.status}. Public configuration written; no client secret generated or exported.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof HeadlessSetupError ? error.message : "Headless setup failed; raw error details are not logged.");
    process.exitCode = 1;
  });
}
