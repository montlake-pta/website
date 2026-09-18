import { createServer } from "node:http";
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import * as cssTree from "css-tree";
import { digest, freezePage, readWithin } from "./archive-fundraising-assets.mjs";
import { normalizeTypedPage } from "./normalize-wix-content.mjs";
import { normalizePageSlug } from "./page-collections.mjs";

const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const run = /^[1-9]\d*$/;
const archiveSchema = 1;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const stable = value => JSON.stringify(value);
const validDate = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));
const markdown = value => String(value).replace(/[\\`*_[\]<>|]/g, "\\$&").replace(/\s+/g, " ").trim();

function provenance(value) {
  assert(sha.test(value.sourceCommit || "") && run.test(String(value.sourceRunId || ""))
    && Number.isSafeInteger(value.sourceRunAttempt) && value.sourceRunAttempt >= 1
    && validDate(value.preparedAt), "Archive input needs an exact source commit, run, attempt and capture-preparation time.");
}

export async function prepareFundraisingArchive({ pages, cmsPages, baseUrl, distDir, outputDir,
  sourceCommit, sourceRunId, sourceRunAttempt, preparedAt = new Date().toISOString(), fetchImpl }) {
  const identity = { sourceCommit, sourceRunId: String(sourceRunId), sourceRunAttempt, preparedAt };
  provenance(identity);
  const url = new URL(baseUrl);
  assert(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname.endsWith("/"),
    "Archive input requires the actual HTTPS deployment base URL.");
  assert(!resolve(outputDir).startsWith(`${resolve(distDir)}/`) && resolve(outputDir) !== resolve(distDir),
    "Archive inputs must stay outside the deployed site.");
  await mkdir(outputDir);
  const entries = [];
  const fundraising = pages.filter(page => page.layout === "fundraising").sort((a, b) => a.slug.localeCompare(b.slug));
  assert(new Set(fundraising.map(page => page.slug)).size === fundraising.length, "Duplicate fundraising archive route.");
  try {
    for (const page of fundraising) {
      assert(page.slug && normalizePageSlug(page.slug) === page.slug, "Invalid fundraising archive slug.");
      const directory = `pages/${page.slug}`;
      const target = join(outputDir, directory);
      await mkdir(target, { recursive: true });
      const pageUrl = new URL(`${page.slug}/`, url).href;
      const content = normalizeTypedPage({ ...page, body: page.content, published: true }, "fundraising");
      const authored = cmsPages.find(record => record.slug === page.slug && record.published !== false);
      const data = { rendered: content, authored: authored ? normalizeTypedPage(authored, "fundraising") : null,
        source: authored ? "cms" : "static-fallback" };
      const html = (await readWithin(distDir, `${page.slug}/index.html`)).toString();
      const frozen = await freezePage({ html, pageUrl, baseUrl, distDir, outputDir: target, fetchImpl });
      const dataBytes = Buffer.from(json(data));
      await writeFile(join(target, "page.json"), dataBytes, { flag: "wx" });
      const files = [...frozen.files, { path: "page.json", sha256: digest(dataBytes), bytes: dataBytes.length }]
        .sort((a, b) => a.path.localeCompare(b.path));
      entries.push({
        slug: page.slug, title: content.title, schoolYear: content.schoolYear,
        campaignStatus: content.campaignStatus, source: data.source, pageUrl, directory,
        sourceHtmlSha256: frozen.sourceHtmlSha256,
        fingerprint: digest(stable({ sourceHtmlSha256: frozen.sourceHtmlSha256, files })),
        files,
      });
    }
    const input = { schemaVersion: archiveSchema, ...identity, baseUrl, pages: entries };
    await writeFile(join(outputDir, "input.json"), json(input), { flag: "wx" });
    return input;
  } catch (error) {
    throw new Error("Fundraising archive preparation failed; deployment must not proceed without its frozen inputs.", { cause: error });
  }
}

async function inputFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert(!entry.isSymbolicLink(), "Archive input contains a symbolic link.");
    if (entry.isDirectory()) files.push(...await inputFiles(directory, path));
    else { assert(entry.isFile(), "Archive input contains a non-regular file."); files.push(path); }
  }
  return files.sort();
}

export async function validateArchiveInput(inputDir, deployment) {
  const input = JSON.parse(await readWithin(inputDir, "input.json"));
  provenance(input);
  assert(input.schemaVersion === archiveSchema && Array.isArray(input.pages) && input.pages.length <= 100,
    "Unsupported or oversized fundraising archive input.");
  assert(input.sourceCommit === deployment.sourceCommit && input.sourceRunId === String(deployment.runId)
    && input.sourceRunAttempt === deployment.runAttempt && validDate(deployment.deployedAt)
    && /^https:\/\/github\.com\/montlake-pta\/website\/actions\/runs\/[1-9]\d*$/.test(deployment.runUrl)
    && deployment.runUrl.endsWith(`/${deployment.runId}`), "Archive input does not match the successful deployment.");
  const base = new URL(input.baseUrl);
  assert(base.protocol === "https:" && !base.username && !base.password && !base.search && !base.hash
    && base.pathname.endsWith("/"), "Invalid archive deployment URL.");
  const expected = ["input.json"];
  const slugs = new Set();
  for (const page of input.pages) {
    assert(page.slug && normalizePageSlug(page.slug) === page.slug && !slugs.has(page.slug)
      && page.directory === `pages/${page.slug}` && hash.test(page.fingerprint)
      && hash.test(page.sourceHtmlSha256) && Array.isArray(page.files) && page.files.length <= 200,
    "Invalid fundraising archive page manifest.");
    slugs.add(page.slug);
    assert(page.pageUrl === new URL(`${page.slug}/`, base).href && typeof page.title === "string"
      && typeof page.schoolYear === "string" && typeof page.campaignStatus === "string", "Invalid archive page metadata.");
    assert(page.files.some(file => file.path === "index.html") && page.files.some(file => file.path === "page.json"),
      "Archive input is missing page content.");
    const listed = new Set();
    for (const file of page.files) {
      assert(["index.html", "page.json"].includes(file.path) || /^assets\/[a-f0-9]{64}\.(?:css|woff2?|ttf|png|jpe?g|webp|gif|ico|svg|pdf)$/.test(file.path),
        "Archive input contains an unexpected asset path.");
      assert(!listed.has(file.path) && hash.test(file.sha256) && Number.isSafeInteger(file.bytes)
        && file.bytes > 0 && file.bytes <= 25 * 1024 * 1024, "Invalid archive file declaration.");
      listed.add(file.path);
      const path = `${page.directory}/${file.path}`;
      const bytes = await readWithin(inputDir, path);
      assert(bytes.length === file.bytes && digest(bytes) === file.sha256, "Archive input asset checksum mismatch.");
      expected.push(path);
    }
    assert(page.fingerprint === digest(stable({ sourceHtmlSha256: page.sourceHtmlSha256, files: page.files })),
      "Fundraising archive fingerprint mismatch.");
    const document = parseDocument((await readWithin(inputDir, `${page.directory}/index.html`)).toString());
    assert(!selectOne("script,iframe,object,embed,form,base,video,audio,source", document), "Active content in archived HTML.");
    const policy = selectOne('meta[http-equiv="Content-Security-Policy"]', document)?.attribs.content;
    assert(policy?.includes("script-src 'none'") && policy.includes("connect-src 'none'")
      && policy.includes("form-action 'none'"), "Archive input is missing its passive-content policy.");
    for (const node of selectAll("*", document)) {
      assert(!Object.keys(node.attribs).some(key => /^on/i.test(key) || ["action", "formaction", "ping", "srcdoc", "style"].includes(key)),
        "Active attributes in archived HTML.");
      if (node.name === "meta") assert(!/refresh/i.test(node.attribs["http-equiv"] || ""), "Archive cannot redirect visitors.");
      for (const key of ["src", "href"]) {
        const value = node.attribs[key];
        if (!value || key === "href" && value.startsWith("#")) continue;
        assert(listed.has(value), "Archive HTML refers to an unfrozen resource or live action.");
      }
      if (node.attribs.srcset) {
        assert(node.attribs.srcset.split(",").every(value => listed.has(value.trim().split(/\s+/)[0])),
          "Archive image has an unfrozen source candidate.");
      }
    }
    for (const file of page.files.filter(file => file.path.endsWith(".css"))) {
      const css = cssTree.parse((await readWithin(inputDir, `${page.directory}/${file.path}`)).toString());
      cssTree.walk(css, node => {
        if (node.type === "Atrule" && /^import$/i.test(node.name)) throw new Error("Archive CSS cannot import remote styles.");
        if (node.type === "Url" && !node.value.startsWith("#")) assert(listed.has(`assets/${node.value}`),
          "Archive CSS refers to an unfrozen asset.");
      });
    }
    const data = JSON.parse(await readWithin(inputDir, `${page.directory}/page.json`));
    assert(data.rendered?.slug === page.slug && data.rendered.published === true
      && data.rendered.pageType === "fundraising", "Archive input contains non-public or mismatched page data.");
    assert(stable(normalizeTypedPage(data.rendered, "fundraising")) === stable(data.rendered),
      "Archive data is not the allowlisted public fundraising shape.");
    if (data.authored) assert(stable(normalizeTypedPage(data.authored, "fundraising")) === stable(data.authored)
      && data.authored.published === true && data.authored.slug === page.slug, "Invalid authored archive data.");
  }
  assert(stable(await inputFiles(inputDir)) === stable(expected.sort()), "Unexpected files in the archive artifact.");
  return input;
}

export async function captureArchivePage({ directory, outputDir = directory }) {
  const mime = { ".html": "text/html", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff",
    ".ttf": "font/ttf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".pdf": "application/pdf" };
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname).slice(1) || "index.html";
      const bytes = await readWithin(directory, path);
      response.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream" });
      response.end(bytes);
    } catch {
      response.writeHead(404); response.end("Missing archive asset");
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      env: Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "SYSTEMROOT"]
        .filter(key => process.env[key]).map(key => [key, process.env[key]])),
    });
    const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce", serviceWorkers: "block" });
    const failures = [];
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin !== origin) {
        failures.push("Snapshot attempted a remote request.");
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("response", response => { if (!response.ok()) failures.push("Snapshot asset request failed."); });
    for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (const image of document.images) { image.loading = "eager"; await image.decode(); }
      });
      const shape = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
        missing: [...document.images].some(image => !image.naturalWidth),
        interactive: !!document.querySelector("script,form,iframe,object,embed"),
      }));
      assert(!failures.length && !shape.missing && !shape.interactive && shape.width <= width && shape.height <= 50000,
        "Fundraising capture has missing assets, active content, overflow or excessive height.");
      await page.screenshot({ path: join(outputDir, `${name}.png`), fullPage: true, animations: "disabled" });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ media: "screen" });
    await page.pdf({ path: join(outputDir, "page.pdf"), format: "A4", printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
    return { browser: browser.version(), viewports: { desktop: [1440, 1000], mobile: [390, 1000] }, pdf: "A4 / screen media" };
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

function indexMarkdown(index) {
  const lines = [
    "# Fundraising page archive", "",
    "Automatic reference copies of successfully deployed Montlake PTA fundraising pages.",
    "**This branch is public but is not published to the website. Never merge it into `main`.**", "",
    "Snapshots are historical and cannot accept donations, registrations or payments. Links to live pages are intentionally inactive in the saved HTML.",
    "Browse screenshots and PDFs below. To view HTML offline, download this branch as a ZIP, extract it, and open a snapshot's `index.html`.",
    "The PDF is paginated for sharing; desktop and mobile PNGs preserve the screen appearance.", "",
    "Captures are append-only. Unchanged deployments reuse existing captures. The school year is the authored value, not an inferred campaign year.",
    "Only versions actually deployed after archival was enabled are covered; this is not a record of unsaved or intermediate Wix edits.", "",
  ];
  for (const [slug, page] of Object.entries(index.pages).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${markdown(page.title)} (${slug})`, "",
      ...(page.removedAt ? [`No longer present in the deployment as of ${page.removedAt}. Earlier snapshots are retained.`, ""] : []),
      "| Campaign year | Deployed (UTC) | Capture | Files |", "| --- | --- | --- | --- |");
    for (const snapshot of [...page.snapshots].sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))) lines.push(
      `| ${markdown(snapshot.schoolYear || "Not specified")} | ${snapshot.deployedAt} | ${markdown(snapshot.campaignStatus || "Unspecified")} | [Desktop](${snapshot.directory}/desktop.png) · [Mobile](${snapshot.directory}/mobile.png) · [PDF](${snapshot.directory}/page.pdf) · [HTML](${snapshot.directory}/index.html) · [Metadata](${snapshot.directory}/metadata.json) |`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function appendArchive({ inputDir, archiveDir, deployment, capture = captureArchivePage }) {
  const input = await validateArchiveInput(inputDir, deployment);
  await mkdir(archiveDir, { recursive: true });
  let index;
  try { index = JSON.parse(await readFile(join(archiveDir, "index.json"), "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const names = (await readdir(archiveDir)).filter(name => name !== ".git");
    assert(!names.length, "Refusing to initialize over an unrelated archive branch.");
    index = { schemaVersion: archiveSchema, receipts: {}, pages: {} };
  }
  assert(index.schemaVersion === archiveSchema && index.receipts && index.pages, "Invalid archive index.");
  const receiptKey = `${deployment.runId}-${deployment.runAttempt}`;
  if (index.receipts[receiptKey]) return { changed: false, snapshotsAdded: 0, receiptKey };
  const latestDeployment = Object.values(index.receipts).map(receipt => receipt.deployedAt).sort().at(-1);
  assert(!latestDeployment || Date.parse(deployment.deployedAt) >= Date.parse(latestDeployment),
    "Process missing deployments in order; refusing to regress the archive's current state.");
  const capturedAt = new Date().toISOString();
  const stage = join(archiveDir, `.capture-${receiptKey}`);
  await mkdir(stage);
  let snapshotsAdded = 0;
  try {
    const staged = [];
    for (const page of input.pages) {
      const previous = index.pages[page.slug];
      if (previous?.latestFingerprint === page.fingerprint && !previous.removedAt) continue;
      const year = normalizePageSlug((page.schoolYear || "").replaceAll("/", "-")) || "year-not-specified";
      const directory = `snapshots/${page.slug}/${year}/${deployment.deployedAt.replace(/[:.]/g, "-")}-${receiptKey}`;
      const target = join(stage, directory);
      try { await lstat(join(archiveDir, directory)); throw new Error("Refusing to replace an immutable fundraising snapshot."); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      await mkdir(dirname(target), { recursive: true });
      await cp(join(inputDir, page.directory), target, { recursive: true, errorOnExist: true, force: false });
      const captureInfo = await capture({ directory: target });
      const outputs = [];
      for (const name of ["desktop.png", "mobile.png", "page.pdf"]) {
        const bytes = await readWithin(target, name);
        assert(bytes.length > 0 && bytes.length < 50 * 1024 * 1024, "Empty or oversized fundraising capture.");
        outputs.push({ path: name, sha256: digest(bytes), bytes: bytes.length });
      }
      const metadata = {
        schemaVersion: archiveSchema, slug: page.slug, title: page.title, schoolYear: page.schoolYear,
        campaignStatus: page.campaignStatus, source: page.source, sourceUrl: page.pageUrl,
        fingerprint: page.fingerprint, sourceHtmlSha256: page.sourceHtmlSha256,
        sourceCommit: deployment.sourceCommit, sourceRunId: String(deployment.runId), sourceRunAttempt: deployment.runAttempt,
        runUrl: deployment.runUrl, preparedAt: input.preparedAt, deployedAt: deployment.deployedAt, capturedAt,
        capture: captureInfo, files: [...page.files, ...outputs],
      };
      await writeFile(join(target, "metadata.json"), json(metadata), { flag: "wx" });
      staged.push({ directory, target });
      const record = { directory, fingerprint: page.fingerprint, schoolYear: page.schoolYear,
        campaignStatus: page.campaignStatus, deployedAt: deployment.deployedAt, runId: String(deployment.runId) };
      index.pages[page.slug] = { title: page.title, latestFingerprint: page.fingerprint,
        snapshots: [...(previous?.snapshots || []), record] };
      snapshotsAdded++;
    }
    const present = new Set(input.pages.map(page => page.slug));
    for (const [slug, page] of Object.entries(index.pages)) {
      if (!present.has(slug) && !page.removedAt) page.removedAt = deployment.deployedAt;
    }
    for (const { directory, target } of staged) {
      await mkdir(dirname(join(archiveDir, directory)), { recursive: true });
      await rename(target, join(archiveDir, directory));
    }
    index.receipts[receiptKey] = { ...deployment, preparedAt: input.preparedAt, snapshotsAdded };
    await writeFile(join(stage, "index.json"), json(index));
    await writeFile(join(stage, "README.md"), indexMarkdown(index));
    await rename(join(stage, "README.md"), join(archiveDir, "README.md"));
    await rename(join(stage, "index.json"), join(archiveDir, "index.json"));
    return { changed: true, snapshotsAdded, receiptKey };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.error("Use the build's FUNDRAISING_ARCHIVE_INPUT_DIR setting or the automatic archive publisher.");
  process.exitCode = 1;
}
