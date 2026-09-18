import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import { chromium } from "playwright";
import { captureArchivePage } from "./archive-fundraising.mjs";
import { readWithin } from "./archive-fundraising-assets.mjs";
import { deploymentProfiles, PUBLIC_SITE_URL, PREVIEW_SITE_URL, CHECKOUT_ORIGIN } from "../src/deployment.mjs";
import { resolveLegacyEventAlias } from "./legacy-event-aliases.mjs";

const exec = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const check = (condition, message) => { if (!condition) throw new Error(message); };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const fingerprint = value => createHash("sha256").update(value).digest("hex");

export function rehearsalEnvironment(env = process.env) {
  const child = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "SYSTEMROOT", "PLAYWRIGHT_BROWSERS_PATH"]
    .filter(key => env[key]).map(key => [key, env[key]]));
  return { ...child, ...deploymentProfiles.launch, DEPLOYMENT_PROFILE: "launch" };
}

async function htmlFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await htmlFiles(directory, path));
    else if (entry.isFile() && entry.name.endsWith(".html")) result.push(path);
  }
  return result;
}

export async function inspectFinalOutput(distDir) {
  const files = await htmlFiles(distDir);
  check(files.length > 0, "Final-domain build produced no HTML.");
  let canonicalPages = 0;
  let compatibilityPages = 0;
  let visitorPages = 0;
  for (const file of files) {
    const html = (await readWithin(distDir, file)).toString();
    const document = parseDocument(html);
    const pageUrl = new URL(file.replace(/index\.html$/, ""), PUBLIC_SITE_URL);
    const alias = resolveLegacyEventAlias(pageUrl.pathname);
    const canonical = selectOne('link[rel="canonical"]', document);
    if (canonical) {
      if (alias) compatibilityPages++;
      else canonicalPages++;
      check(alias ? new URL(canonical.attribs.href, pageUrl).href === new URL(alias, PUBLIC_SITE_URL).href
        : canonical.attribs.href === pageUrl.href,
        `Final-domain canonical mismatch: ${file}`);
    }
    check(!selectOne("[data-legacy-transaction]", document), `Legacy registration handoff remains: ${file}`);
    const configNode = selectOne("#wix-client-config", document);
    if (configNode) {
      const config = JSON.parse(configNode.children.map(node => node.data || "").join(""));
      check(config.enabled === true && config.readOnly === false && config.baseUrl === PUBLIC_SITE_URL,
        `Incorrect launch visitor configuration: ${file}`);
      visitorPages++;
    }
    for (const node of selectAll("a[href],img[src],script[src],link[href],iframe[src]", document)) {
      const raw = node.attribs.src || node.attribs.href;
      if (!raw || raw.startsWith("#")) continue;
      const url = new URL(raw, pageUrl);
      check(!url.href.startsWith(`${PREVIEW_SITE_URL}assets/`), `Preview-hosted repository asset remains: ${file}`);
      if (url.origin !== new URL(PUBLIC_SITE_URL).origin) continue;
      check(!url.pathname.startsWith("/website/"), `Preview path prefix remains: ${file}`);
      const path = decodeURIComponent(url.pathname).slice(1);
      await access(join(distDir, path.endsWith("/") || !path ? `${path}index.html` : path));
    }
  }
  const sitemap = (await readWithin(distDir, "sitemap.xml")).toString();
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  check(locations.length > 0 && locations.every(url => url.startsWith(PUBLIC_SITE_URL) && !new URL(url).pathname.startsWith("/website/")),
    "Sitemap contains an incorrect deployment base.");
  check(visitorPages > 0, "Launch build did not wire the visitor SDK.");
  for (const path of ["cart/index.html", "checkout/complete/index.html", "transactions.js"]) await access(join(distDir, path));
  return { htmlFiles: files.length, canonicalPages, compatibilityPages, visitorPages, sitemapEntries: locations.length };
}

export async function inspectFinalBrowser({ distDir, outputDir }) {
  const browser = await chromium.launch({ env: rehearsalEnvironment() });
  const localOrigin = new URL(PUBLIC_SITE_URL).origin;
  const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2", ".pdf": "application/pdf" };
  const results = [];
  let blockedVisitorRequests = 0;
  const failures = [];
  try {
    const context = await browser.newContext({ serviceWorkers: "block", reducedMotion: "reduce" });
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== "GET") {
        blockedVisitorRequests++;
        return route.abort();
      }
      if (url.origin === localOrigin) {
        try {
          const path = decodeURIComponent(url.pathname).slice(1);
          const file = !path || path.endsWith("/") ? `${path}index.html` : path;
          let body;
          let type = mime[extname(file)] || "application/octet-stream";
          try { body = await readWithin(distDir, file); }
          catch (error) {
            if (error.code !== "EISDIR") throw error;
            // Fulfilled HTTP redirects can escape interception and reach the real
            // domain. Serve the stub itself; its independent navigation is routed.
            body = await readWithin(distDir, `${file}/index.html`);
            type = "text/html";
          }
          return route.fulfill({ status: 200, contentType: type, body });
        } catch (error) {
          failures.push(`Missing local browser resource: ${url.pathname}`);
          return route.fulfill({ status: 404, body: "Missing rehearsal resource" });
        }
      }
      if (url.protocol === "https:" && ["static.wixstatic.com", "images.wixstatic.com"].includes(url.hostname)
        && ["image", "font"].includes(request.resourceType())) {
        const response = await route.fetch({ maxRedirects: 0 });
        if (!response.ok()) {
          failures.push("A public media resource could not be loaded.");
          return route.abort();
        }
        return route.fulfill({ response });
      }
      // No OAuth sessions, Wix reads/writes, checkout sessions or provider frames.
      blockedVisitorRequests++;
      return route.abort();
    });
    const page = await context.newPage();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ["", "enrichment/", "donate/", "annual-fund/", "spring-auction/", "cart/", "checkout/complete/?orderId=untrusted-rehearsal"]) {
        await page.goto(new URL(route, PUBLIC_SITE_URL).href, { waitUntil: "networkidle" });
        await page.evaluate(async () => {
          await document.fonts.ready;
          for (const image of document.images) { image.loading = "eager"; await image.decode(); }
        });
        const metrics = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth, headings: document.querySelectorAll("h1").length,
          brokenOutline: [...document.querySelectorAll(".page-outline a")].some(anchor => !document.getElementById(anchor.hash.slice(1))),
          canonical: document.querySelector('link[rel="canonical"]')?.href,
          visitorConfig: document.getElementById("wix-client-config") ? JSON.parse(document.getElementById("wix-client-config").textContent) : null,
          neutral: document.body.textContent.includes("does not confirm a payment"),
        }));
        check(metrics.width <= width && metrics.headings === 1 && !metrics.brokenOutline && !failures.length,
          "Final-domain browser rehearsal found overflow, missing headings/anchors or assets.");
        if (route.startsWith("checkout/complete/")) check(metrics.neutral, "Untrusted return parameters must not imply payment confirmation.");
        results.push({ route: route.split("?")[0] || "/", viewport: width, width: metrics.width, canonical: metrics.canonical,
          ...(metrics.visitorConfig ? { sdkBaseUrl: metrics.visitorConfig.baseUrl } : {}) });
        if (["donate/", "enrichment/"].includes(route)) {
          await page.screenshot({ path: join(outputDir, `${route.slice(0, -1)}-${width}.png`), fullPage: true });
        }
      }
    }
    const aliases = JSON.parse(await readFile(new URL("../src/data/legacy-event-aliases.json", import.meta.url), "utf8"));
    const alias = aliases[0];
    await page.goto(new URL(alias.source, PUBLIC_SITE_URL).href);
    try { await page.waitForURL(new URL(alias.target, PUBLIC_SITE_URL).href, { waitUntil: "domcontentloaded" }); }
    catch {
      throw new Error(`Reviewed alias did not reach its target. Observed ${new URL(page.url()).pathname}; expected ${alias.target}. ${failures.join(" ")}`);
    }
    check(!failures.length, "Reviewed alias navigation requested a missing local resource.");
    results.push({ legacyAlias: alias.source, destination: new URL(page.url()).pathname });
    return { results, blockedVisitorRequests, liveMutationsPerformed: 0,
      limitation: "Frontend requests are served from the isolated build, not public DNS. Live Wix APIs are blocked; transaction UI/unit fixtures provide separate coverage." };
  } finally {
    await browser.close();
  }
}

export async function rehearseCutover({ outputDir, sourceDir = root, env = process.env } = {}) {
  check(outputDir, "Choose a new --output-dir for the rehearsal report.");
  const output = resolve(outputDir);
  check(output !== sourceDir && !sourceDir.startsWith(`${output}${sep}`)
    && output !== join(sourceDir, "dist") && !output.startsWith(`${join(sourceDir, "dist")}${sep}`),
  "Rehearsal reports must stay outside generated production output and must not replace the repository.");
  await mkdir(output);
  const work = await mkdtemp(join(tmpdir(), "montlake-cutover-rehearsal-"));
  const project = join(work, "project");
  await mkdir(project);
  const childEnv = rehearsalEnvironment(env);
  const report = { schemaVersion: 1, profile: "launch", baseUrl: PUBLIC_SITE_URL, checkoutOrigin: CHECKOUT_ORIGIN,
    startedAt: new Date().toISOString(), status: "running", deploymentPerformed: false,
    liveTransactionsPerformed: false, checks: [], limitations: [
      "This is not DNS, TLS or actual hosted-checkout verification.",
      "No site, DNS, repository variable, Wix record or production flag is changed.",
      "Live checkout redirects, return/cancel navigation and domain ownership still require launch-window confirmation.",
    ] };
  let sourceConfig;
  const run = async (label, args, extraEnv = {}) => {
    try {
      const result = await exec(process.execPath, args, { cwd: project, env: { ...childEnv, ...extraEnv },
        maxBuffer: 12 * 1024 * 1024, timeout: 300000 });
      report.checks.push({ name: label, status: "pass" });
      return result.stdout;
    } catch (error) {
      report.checks.push({ name: label, status: "fail" });
      throw new Error(`${label} failed: ${String(error.stdout || error.stderr || "").slice(-5000)}`);
    }
  };
  try {
    sourceConfig = await readFile(join(sourceDir, "src/wix-client.config.json"));
    for (const name of ["src", "scripts", "wix", ".github", "package.json", "package-lock.json"]) {
      await cp(join(sourceDir, name), join(project, name), { recursive: true });
    }
    await symlink(join(sourceDir, "node_modules"), join(project, "node_modules"), "dir");
    const sourceCommit = (await exec("git", ["rev-parse", "HEAD"], { cwd: sourceDir })).stdout.trim();
    check(/^[a-f0-9]{40}$/.test(sourceCommit), "A committed source revision is required for rehearsal provenance.");
    report.workingTreeChanged = Boolean((await exec("git", ["status", "--porcelain", "--", "src", "scripts", ".github", "package.json", "package-lock.json"],
      { cwd: sourceDir })).stdout.trim());
    const publicSnapshot = await readFile(join(project, "src/data/wix-content.json"));
    report.publicSnapshotSha256 = fingerprint(publicSnapshot);
    report.publicSnapshotSyncedAt = JSON.parse(publicSnapshot).syncedAt;
    const archiveInput = join(work, "fundraising-input");
    await run("Final-domain build and frozen fundraising inputs", ["scripts/build.mjs"], {
      FUNDRAISING_ARCHIVE_INPUT_DIR: archiveInput, GITHUB_SHA: sourceCommit,
      GITHUB_RUN_ID: env.GITHUB_RUN_ID || "1", GITHUB_RUN_ATTEMPT: env.GITHUB_RUN_ATTEMPT || "1",
    });
    await run("Generated page checks", ["scripts/check-site.mjs"]);
    await run("Full unit suite with launch configuration", ["--test", ...((await readdir(join(project, "scripts"))).filter(name => name.endsWith(".test.mjs")).map(name => `scripts/${name}`))]);
    await run("Offline strict cutover gate", ["scripts/check-cutover.mjs", "--offline"]);
    const distDir = join(project, "dist");
    report.output = await inspectFinalOutput(distDir);
    report.checks.push({ name: "All final paths, canonicals, local resources and callbacks", status: "pass" });
    await mkdir(join(output, "browser"));
    report.browser = await inspectFinalBrowser({ distDir, outputDir: join(output, "browser") });
    report.checks.push({ name: "Desktop/mobile final-origin browser rehearsal", status: "pass" });
    const manifest = JSON.parse(await readFile(join(archiveInput, "input.json")));
    report.fundraisingCaptures = [];
    for (const page of manifest.pages) {
      const destination = join(output, "fundraising", page.slug);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(archiveInput, page.directory), destination, { recursive: true });
      await captureArchivePage({ directory: destination });
      report.fundraisingCaptures.push({ slug: page.slug, fingerprint: page.fingerprint });
    }
    report.checks.push({ name: "Final-domain fundraising archive screenshots/PDFs", status: "pass" });
    report.sourceCommit = sourceCommit;
    report.sourceConfigUnchanged = fingerprint(sourceConfig) === fingerprint(await readFile(join(sourceDir, "src/wix-client.config.json")));
    check(report.sourceConfigUnchanged, "Source visitor configuration changed during rehearsal.");
    report.status = "passed";
    await writeFile(join(output, "report.json"), json(report));
    return report;
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    await writeFile(join(output, "report.json"), json(report));
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { "output-dir": { type: "string" } } });
  rehearseCutover({ outputDir: values["output-dir"] }).then(report => {
    console.log(`Final-domain rehearsal passed: ${report.output.canonicalPages} canonical pages, ${report.fundraisingCaptures.length} fundraising captures. Nothing deployed or mutated.`);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
