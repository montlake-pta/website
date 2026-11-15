import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// Detects edits made in the legacy Wix Editor site by comparing its
// Editor-authored text, links and buttons with a reviewed baseline. App
// widgets (Events, Blog, Stores) are excluded: their data already reaches the
// new site through Wix sync. Read-only: only public GET page loads.

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const LEGACY_ORIGIN = "https://www.montlakepta.org";
export const DEFAULT_BASELINE = join(root, "src", "data", "legacy-editor-baseline.json");
const editorSelectors = [
  '[data-testid="richTextElement"]',
  '[data-testid="linkElement"]',
  '[data-testid="stylablebutton-label"]',
].join(",");
const ISSUE_BODY_LIMIT = 60000;

export function parseSitemap(xml) {
  if (!/<urlset[\s>]/.test(String(xml)) || !/<\/urlset>\s*$/.test(String(xml))) {
    throw new Error("The legacy pages sitemap was incomplete or not a sitemap.");
  }
  const slugs = [];
  for (const [, loc] of String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = new URL(loc.trim().replaceAll("&amp;", "&"));
    if (url.origin !== LEGACY_ORIGIN) continue;
    slugs.push(decodeURIComponent(url.pathname).replace(/^\/|\/$/g, ""));
  }
  return [...new Set(slugs)].sort();
}

export function normalizeLines(text) {
  const lines = String(text)
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 1);
  return [...new Set(lines)];
}

export function normalizeLink(href) {
  if (!href || /^(javascript|data):/i.test(href)) return null;
  try {
    const url = new URL(href, LEGACY_ORIGIN);
    if (!/^(https?|mailto|tel):$/.test(url.protocol)) return null;
    if (url.origin === LEGACY_ORIGIN) return `${url.pathname.replace(/\/$/, "") || "/"}${url.search}${url.hash}`;
    return url.href;
  } catch {
    return null;
  }
}

// Each link is recorded with its visible label so a swapped destination is a change.
export function describeLink({ label, href }) {
  const destination = normalizeLink(href);
  if (!destination) return null;
  return `${String(label || "").replace(/\s+/g, " ").trim() || "(no text)"} → ${destination}`;
}

function difference(left = [], right = []) {
  const other = new Set(right);
  return left.filter((value) => !other.has(value));
}

export function diffPage(before = { text: [], links: [] }, after = { text: [], links: [] }) {
  return {
    addedText: difference(after.text, before.text),
    removedText: difference(before.text, after.text),
    addedLinks: difference(after.links, before.links),
    removedLinks: difference(before.links, after.links),
  };
}

const hasChanges = (change) => Object.values(change).some((values) => values.length);

export function diffSnapshots(baseline, current) {
  const before = baseline?.pages || {};
  const after = current.pages;
  const unreachable = new Set(current.unreachable || []);
  const report = { newPages: [], removedPages: [], changedPages: {}, unreachable: [...unreachable].sort() };
  for (const slug of Object.keys(after).sort()) {
    if (!before[slug]) report.newPages.push(slug);
    else {
      const change = diffPage(before[slug], after[slug]);
      if (hasChanges(change)) report.changedPages[slug] = change;
    }
  }
  for (const slug of Object.keys(before).sort()) {
    if (!after[slug] && !unreachable.has(slug)) report.removedPages.push(slug);
  }
  report.changed = Boolean(report.newPages.length || report.removedPages.length
    || Object.keys(report.changedPages).length);
  return report;
}

// Keeps only differences observed in two independent captures.
export function confirmDiff(first, second) {
  const keep = (key) => first[key].filter((value) => second[key].includes(value));
  return Object.fromEntries(Object.keys(first).map((key) => [key, keep(key)]));
}

function block(lines) {
  const text = lines.map((line) => line.replaceAll("```", "'''")).join("\n");
  return ["```text", text, "```"].join("\n");
}

export function renderReport(report, { runUrl } = {}) {
  const parts = [
    "Editors changed pages on the legacy Wix Editor site (" + LEGACY_ORIGIN + ") since the reviewed baseline.",
    "Editor page text does not reach the new site automatically. Port anything current into the typed CMS",
    "collection (or the repository fallback), then refresh `src/data/legacy-editor-baseline.json`.",
    "Text below is untrusted legacy-site content; verify it before publishing.",
    "",
  ];
  if (report.newPages.length) {
    parts.push("## New legacy pages", "", ...report.newPages.map((slug) => `- ${LEGACY_ORIGIN}/${slug}`), "");
  }
  if (report.removedPages.length) {
    parts.push("## Pages no longer listed", "", ...report.removedPages.map((slug) => `- /${slug}`), "");
  }
  for (const [slug, change] of Object.entries(report.changedPages)) {
    parts.push(`## ${LEGACY_ORIGIN}/${slug}`, "");
    for (const [key, label] of [["addedText", "Added or changed text"], ["removedText", "Removed or replaced text"],
      ["addedLinks", "Added links"], ["removedLinks", "Removed links"]]) {
      if (change[key].length) parts.push(`**${label}**`, "", block(change[key]), "");
    }
  }
  const unchecked = [...(report.unreachable || []), ...(report.unstable || [])];
  if (unchecked.length) {
    parts.push("## Not confirmed", "", `Could not load or consistently capture: ${unchecked.map((slug) => `/${slug}`).join(", ")}`, "");
  }
  if (runUrl) parts.push(`Detected by ${runUrl}`);
  let body = parts.join("\n");
  if (body.length > ISSUE_BODY_LIMIT) {
    body = body.slice(0, ISSUE_BODY_LIMIT);
    if ((body.match(/```/g) || []).length % 2) body += "\n```";
    body += "\n\n…truncated. Download the full report from the workflow run.";
  }
  return body;
}

// Builds the confirmed report and a baseline candidate. Only differences seen in
// both captures are reported, and a page enters the candidate only when both
// captures agree. Unconfirmed, unreachable or unstable pages keep their
// reviewed baseline entry and leave the check incomplete.
export function reconcile({ baseline, first, recaptures, sitemapAgain }) {
  const before = baseline?.pages || {};
  const initial = diffSnapshots(baseline, first);
  const pages = { ...before };
  const report = { newPages: [], removedPages: [], changedPages: {}, unreachable: [...initial.unreachable], unstable: [] };
  const agreed = (slug) => recaptures[slug] && !hasChanges(diffPage(first.pages[slug], recaptures[slug]));
  for (const slug of initial.newPages) {
    if (!sitemapAgain.has(slug) || !recaptures[slug]) report.unreachable.push(slug);
    else if (!agreed(slug)) report.unstable.push(slug);
    else {
      report.newPages.push(slug);
      pages[slug] = recaptures[slug];
    }
  }
  for (const slug of initial.removedPages) {
    if (sitemapAgain.has(slug)) report.unreachable.push(slug);
    else {
      report.removedPages.push(slug);
      delete pages[slug];
    }
  }
  for (const [slug, change] of Object.entries(initial.changedPages)) {
    if (!recaptures[slug]) {
      report.unreachable.push(slug);
      continue;
    }
    const confirmed = confirmDiff(change, diffPage(before[slug], recaptures[slug]));
    if (hasChanges(confirmed)) report.changedPages[slug] = confirmed;
    if (agreed(slug)) pages[slug] = recaptures[slug];
    else report.unstable.push(slug);
  }
  report.unreachable = [...new Set(report.unreachable)].sort();
  report.unstable.sort();
  report.changed = Boolean(report.newPages.length || report.removedPages.length
    || Object.keys(report.changedPages).length);
  report.complete = !report.unreachable.length && !report.unstable.length;
  const snapshot = {
    schemaVersion: 1,
    source: LEGACY_ORIGIN,
    pages: Object.fromEntries(Object.entries(pages).sort(([a], [b]) => a.localeCompare(b))),
  };
  return { report, snapshot };
}

async function fetchSitemap(fetchImpl = fetch) {
  const response = await fetchImpl(`${LEGACY_ORIGIN}/pages-sitemap.xml`);
  if (!response.ok) throw new Error(`The legacy pages sitemap returned HTTP ${response.status}.`);
  const slugs = parseSitemap(await response.text());
  if (!slugs.length) throw new Error("The legacy pages sitemap listed no pages.");
  return slugs;
}

async function capturePage(browser, slug) {
  const page = await browser.newPage();
  await page.route("**/*", (route) => (["image", "media", "font"].includes(route.request().resourceType())
    ? route.abort() : route.continue()));
  try {
    const response = await page.goto(`${LEGACY_ORIGIN}/${slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
    await page.waitForSelector("#PAGES_CONTAINER", { timeout: 30000 });
    await page.waitForTimeout(2500);
    const read = () => page.evaluate((selectors) => {
      const container = document.querySelector("#PAGES_CONTAINER");
      return {
        text: [...container.querySelectorAll(selectors)].map((node) => node.innerText || "").join("\n"),
        links: [...container.querySelectorAll("a[href]")]
          .filter((anchor) => anchor.closest(selectors) || anchor.querySelector(selectors))
          .map((anchor) => ({
            label: anchor.innerText || anchor.getAttribute("aria-label") || "",
            href: anchor.getAttribute("href"),
          })),
      };
    }, editorSelectors);
    const captures = [await read()];
    // Wix tab panels render only the selected tab; each must open and render.
    const tabCount = await page.locator('[data-hook="tab-item"]').count();
    for (let index = 0; index < tabCount; index += 1) {
      await page.locator('[data-hook="tab-item"]').nth(index).click({ timeout: 10000 });
      await page.waitForFunction((position) => {
        const tab = document.querySelectorAll('[data-hook="tab-item"]')[position];
        const panel = tab && document.getElementById(tab.getAttribute("aria-controls") || "");
        return tab?.getAttribute("aria-selected") === "true" && panel && panel.innerText.trim().length > 0;
      }, index, { timeout: 10000 });
      await page.waitForTimeout(300);
      captures.push(await read());
    }
    return {
      text: normalizeLines(captures.map((capture) => capture.text).join("\n")),
      links: [...new Set(captures.flatMap((capture) => capture.links).map(describeLink).filter(Boolean))].sort(),
    };
  } finally {
    await page.close();
  }
}

async function captureAll(browser, slugs) {
  const pages = {};
  const unreachable = [];
  for (const slug of slugs) {
    try {
      pages[slug] = await capturePage(browser, slug);
    } catch {
      unreachable.push(slug);
    }
  }
  return { pages, unreachable };
}

async function main() {
  const { values } = parseArgs({
    options: {
      baseline: { type: "string", default: DEFAULT_BASELINE },
      output: { type: "string" },
      update: { type: "boolean", default: false },
    },
  });
  const baseline = await readFile(values.baseline, "utf8").then(JSON.parse).catch((error) => {
    if (error.code === "ENOENT" && values.update) return { pages: {} };
    throw error;
  });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const first = await captureAll(browser, await fetchSitemap());
    const initial = diffSnapshots(baseline, first);
    const sitemapAgain = new Set(await fetchSitemap());
    const toConfirm = [...initial.newPages, ...Object.keys(initial.changedPages)];
    const recaptures = {};
    for (const slug of toConfirm) recaptures[slug] = await capturePage(browser, slug).catch(() => null);
    const { report, snapshot } = reconcile({ baseline, first, recaptures, sitemapAgain });
    snapshot.capturedAt = new Date().toISOString();
    if (values.update) {
      if (!report.complete) {
        throw new Error(`Not updating the baseline: could not confirm ${[...report.unreachable, ...report.unstable].join(", ")}.`);
      }
      await writeFile(values.baseline, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(`Updated ${values.baseline} with ${Object.keys(snapshot.pages).length} legacy pages.`);
    }
    if (values.output) {
      await mkdir(values.output, { recursive: true });
      const runUrl = process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined;
      await writeFile(join(values.output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
      await writeFile(join(values.output, "report.md"), `${renderReport(report, { runUrl })}\n`);
      await writeFile(join(values.output, "baseline-candidate.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
    }
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `changed=${report.changed}\ncomplete=${report.complete}\n`);
    }
    console.log(report.changed
      ? `Legacy edits detected: ${report.newPages.length} new, ${report.removedPages.length} removed, ${Object.keys(report.changedPages).length} changed pages.`
      : "No legacy Editor edits since the reviewed baseline.");
    if (!report.complete) console.log(`Could not confirm: ${[...report.unreachable, ...report.unstable].join(", ")}`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
