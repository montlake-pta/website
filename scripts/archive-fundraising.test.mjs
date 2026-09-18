import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import { textContent } from "domutils";
import { appendArchive, prepareFundraisingArchive, validateArchiveInput } from "./archive-fundraising.mjs";
import { digest, freezePage, readWithin } from "./archive-fundraising-assets.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64");
const sourceCommit = "a".repeat(40);
const baseUrl = "https://montlake-pta.github.io/website/";
const page = { slug: "donate", title: "Donate", heading: "Support Montlake", description: "Public giving information.",
  content: "<h2>Why give</h2><p>Public campaign text.</p>", layout: "fundraising", campaignStatus: "evergreen", schoolYear: "" };
const html = `<!doctype html><html lang="en"><head><title>Donate</title>
  <link rel="stylesheet" href="../styles.css"><link rel="canonical" href="${baseUrl}donate/">
  <script src="../site.js"></script></head><body>
  <h1>Support Montlake</h1><img src="../assets/photo.png" alt="School">
  <p><a class="button button-primary" href="https://www.paypal.com/donate/?hosted_button_id=PUBLIC">Donate</a></p>
  <a href="#details">Details</a><h2 id="details">Giving details</h2><p>Public campaign text.</p>
  <button onclick="alert(1)">Menu</button><form action="https://example.org/"><input name="email"></form>
  <iframe src="https://example.org/"></iframe><script>PRIVATE_CLIENT_CONFIG</script></body></html>`;

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "fundraising-archive-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const distDir = join(root, "site");
  await mkdir(join(distDir, "donate"), { recursive: true });
  await mkdir(join(distDir, "assets", "fonts"), { recursive: true });
  await writeFile(join(distDir, "assets", "photo.png"), png);
  await writeFile(join(distDir, "assets", "fonts", "body.woff2"), "test-font");
  await writeFile(join(distDir, "styles.css"), '@font-face{font-family:School;src:url("assets/fonts/body.woff2")}body{color:#111842}h1{font-size:48px}');
  await writeFile(join(distDir, "donate", "index.html"), html);
  let sequence = 0;
  const prepare = async (overrides = {}) => {
    const outputDir = join(root, `input-${++sequence}`);
    const input = await prepareFundraisingArchive({
      pages: [page], cmsPages: [], distDir, outputDir, baseUrl, sourceCommit,
      sourceRunId: String(sequence), sourceRunAttempt: 1, preparedAt: "2026-09-18T04:00:00Z", ...overrides,
    });
    return { inputDir: outputDir, input };
  };
  return { root, distDir, prepare, archiveDir: join(root, "archive") };
}

function deployment(input, overrides = {}) {
  return { runId: input.sourceRunId, runAttempt: input.sourceRunAttempt, sourceCommit: input.sourceCommit,
    deployedAt: "2026-09-18T04:01:00Z",
    runUrl: `https://github.com/montlake-pta/website/actions/runs/${input.sourceRunId}`, ...overrides };
}

async function mockCapture({ directory }) {
  await writeFile(join(directory, "desktop.png"), png);
  await writeFile(join(directory, "mobile.png"), png);
  await writeFile(join(directory, "page.pdf"), "%PDF-1.7\nfixture");
  return { browser: "test", viewports: { desktop: [1440, 1000], mobile: [390, 1000] } };
}

test("preparation freezes the actual built HTML, CSS and fonts outside dist with inert historical actions", async t => {
  const f = await fixture(t);
  const { input, inputDir } = await f.prepare();
  assert.equal(input.pages.length, 1);
  assert.equal(input.pages[0].sourceHtmlSha256, digest(html));
  assert.equal(input.pages[0].source, "static-fallback");
  assert.equal(input.sourceCommit, sourceCommit);
  await validateArchiveInput(inputDir, deployment(input));
  const saved = await readFile(join(inputDir, "pages/donate/index.html"), "utf8");
  const doc = parseDocument(saved);
  assert.equal(selectAll("script,form,iframe", doc).length, 0);
  assert.equal(selectAll('a[href]:not([href^="#"])', doc).length, 0);
  assert.equal(selectOne(".button", doc).attribs.href, undefined);
  assert.equal(textContent(selectOne(".button", doc)), "Donate");
  assert(Object.hasOwn(selectOne("button", doc).attribs, "disabled"));
  assert(!Object.hasOwn(selectOne("button", doc).attribs, "onclick"));
  assert.match(selectOne('meta[http-equiv="Content-Security-Policy"]', doc).attribs.content, /script-src 'none'/);
  assert.doesNotMatch(saved, /PRIVATE_CLIENT_CONFIG|paypal\.com|rel="canonical"/);
  const css = await readFile(join(inputDir, "pages/donate", selectOne('link[rel="stylesheet"]', doc).attribs.href), "utf8");
  assert.match(css, /url\([a-f0-9]{64}\.woff2\)/);
  assert.equal((await readFile(join(f.distDir, "donate/index.html"), "utf8")), html, "Never modify the deployed HTML.");
  assert.equal((await readdir(f.distDir)).includes("input.json"), false);
});

test("fundraising selection includes nested and fallback routes, but no ordinary pages or unused private fields", async t => {
  const f = await fixture(t);
  await mkdir(join(f.distDir, "campaigns", "spring"), { recursive: true });
  await writeFile(join(f.distDir, "campaigns", "spring", "index.html"), html.replaceAll("../", "../../"));
  const authored = { ...page, body: page.content, published: true, privateNotes: "NEVER_EXPORT", _owner: "PRIVATE", schoolYear: "2026–2027" };
  const { input, inputDir } = await f.prepare({
    pages: [{ ...page, ...authored, content: page.content }, { ...page, slug: "campaigns/spring" }, { ...page, slug: "other", layout: undefined }],
    cmsPages: [authored],
  });
  assert.deepEqual(input.pages.map(page => page.slug), ["campaigns/spring", "donate"]);
  const data = await readFile(join(inputDir, "pages/donate/page.json"), "utf8");
  assert.doesNotMatch(data, /PRIVATE|NEVER_EXPORT|privateNotes|_owner/);
  assert.match(data, /2026–2027/);
  await validateArchiveInput(inputDir, deployment(input));
});

test("content, style and referenced asset changes create new fingerprints, while commit/run/time alone do not", async t => {
  const f = await fixture(t);
  const a = await f.prepare();
  const b = await f.prepare({ sourceCommit: "b".repeat(40), preparedAt: "2027-01-01T00:00:00Z" });
  assert.equal(a.input.pages[0].fingerprint, b.input.pages[0].fingerprint);
  await writeFile(join(f.distDir, "styles.css"), "h1{font-size:52px}");
  const css = await f.prepare();
  assert.notEqual(css.input.pages[0].fingerprint, a.input.pages[0].fingerprint);
  await writeFile(join(f.distDir, "assets/photo.png"), Buffer.concat([png, Buffer.from("changed")]));
  const asset = await f.prepare();
  assert.notEqual(asset.input.pages[0].fingerprint, css.input.pages[0].fingerprint);
  await writeFile(join(f.distDir, "donate/index.html"), html.replace("Public campaign text.", "Revised campaign text."));
  const copy = await f.prepare();
  assert.notEqual(copy.input.pages[0].fingerprint, asset.input.pages[0].fingerprint);
});

test("remote Wix media is stored once by bytes and replay never needs its original URL", async t => {
  const f = await fixture(t);
  const directory = join(f.root, "frozen");
  await mkdir(directory);
  let requests = 0;
  const value = html.replace('<img src="../assets/photo.png" alt="School">', '<img src="https://static.wixstatic.com/media/photo.png" alt="School"><img src="https://static.wixstatic.com/media/photo.png" alt="Again">');
  const frozen = await freezePage({ html: value, pageUrl: `${baseUrl}donate/`, baseUrl, distDir: f.distDir, outputDir: directory,
    fetchImpl: async url => {
      assert.equal(url.hostname, "static.wixstatic.com");
      requests++;
      return new Response(png, { headers: { "content-type": "image/png" } });
    } });
  assert.equal(requests, 1);
  assert.equal(frozen.files.filter(file => file.path.endsWith(".png")).length, 1);
  assert.doesNotMatch(await readFile(join(directory, "index.html"), "utf8"), /static.wixstatic.com/);
});

test("unsafe/missing assets, redirects, scripts-as-images, imports and local escapes fail explicitly", async t => {
  const f = await fixture(t);
  let sequence = 0;
  for (const source of ["http://static.wixstatic.com/photo.png", "https://127.0.0.1/photo.png",
    "https://static.wixstatic.com.evil.example/photo.png", "../../../outside.png",
    "https://user:secret@static.wixstatic.com/photo.png"]) {
    const target = join(f.root, `unsafe-${++sequence}`);
    await mkdir(target);
    await assert.rejects(freezePage({ html: html.replace("../assets/photo.png", source), pageUrl: `${baseUrl}donate/`,
      baseUrl, distDir: f.distDir, outputDir: target, fetchImpl: () => assert.fail("Unsafe destination must not be requested.") }));
  }
  for (const response of [new Response("", { status: 302, headers: { location: "http://127.0.0.1" } }),
    new Response("<script>bad()</script>", { headers: { "content-type": "text/html" } })]) {
    const target = join(f.root, `response-${++sequence}`);
    await mkdir(target);
    await assert.rejects(freezePage({ html: html.replace("../assets/photo.png", "https://static.wixstatic.com/media/photo.png"),
      pageUrl: `${baseUrl}donate/`, baseUrl, distDir: f.distDir, outputDir: target, fetchImpl: async () => response }));
  }
  await writeFile(join(f.distDir, "styles.css"), '@import "https://example.org/style.css";');
  await assert.rejects(f.prepare(), /preparation failed/);
  await symlink(f.root, join(f.distDir, "escape"));
  await assert.rejects(readWithin(f.distDir, "escape/input.json"));
});

test("input provenance, hashes, unexpected files and symlinks are rejected before browser capture", async t => {
  const f = await fixture(t);
  const a = await f.prepare();
  for (const change of [{ sourceCommit: "b".repeat(40) }, { runId: "99" }, { runAttempt: 2 }, { runUrl: "https://example.org/" }]) {
    await assert.rejects(validateArchiveInput(a.inputDir, deployment(a.input, change)), /does not match/);
  }
  await writeFile(join(a.inputDir, "extra.js"), "bad");
  await assert.rejects(validateArchiveInput(a.inputDir, deployment(a.input)), /Unexpected files/);
  const b = await f.prepare();
  await writeFile(join(b.inputDir, "pages/donate/index.html"), "tampered");
  await assert.rejects(validateArchiveInput(b.inputDir, deployment(b.input)), /checksum/);
  const c = await f.prepare();
  await symlink(join(c.inputDir, "input.json"), join(c.inputDir, "link.json"));
  await assert.rejects(validateArchiveInput(c.inputDir, deployment(c.input)), /symbolic link/);
});

test("a rehashed artifact cannot turn the offline viewer into an executable or live transaction page", async t => {
  const f = await fixture(t);
  for (const addition of ['<script>alert(1)</script>', '<a href="https://www.paypal.com/">Give</a>',
    '<img src="https://static.wixstatic.com/new.png">', '<meta http-equiv="refresh" content="0;url=https://example.org">']) {
    const value = await f.prepare();
    const path = join(value.inputDir, "pages/donate/index.html");
    const bytes = Buffer.from((await readFile(path, "utf8")).replace("</body>", `${addition}</body>`));
    await writeFile(path, bytes);
    const entry = value.input.pages[0];
    Object.assign(entry.files.find(file => file.path === "index.html"), { bytes: bytes.length, sha256: digest(bytes) });
    entry.fingerprint = digest(JSON.stringify({ sourceHtmlSha256: entry.sourceHtmlSha256, files: entry.files }));
    await writeFile(join(value.inputDir, "input.json"), JSON.stringify(value.input));
    await assert.rejects(validateArchiveInput(value.inputDir, deployment(value.input)), /Active content|unfrozen resource|cannot redirect/);
  }
});

test("append creates board-friendly immutable snapshots, skips unchanged binaries and preserves A-B-A history", async t => {
  const f = await fixture(t);
  let captures = 0;
  const capture = async options => { captures++; return mockCapture(options); };
  const a = await f.prepare();
  assert.equal((await appendArchive({ ...a, archiveDir: f.archiveDir, deployment: deployment(a.input), capture })).snapshotsAdded, 1);
  assert.equal((await appendArchive({ ...a, archiveDir: f.archiveDir, deployment: deployment(a.input), capture })).changed, false);
  const indexA = JSON.parse(await readFile(join(f.archiveDir, "index.json")));
  const oldPath = indexA.pages.donate.snapshots[0].directory;
  const oldMetadata = await readFile(join(f.archiveDir, oldPath, "metadata.json"), "utf8");
  const unchanged = await f.prepare();
  const result = await appendArchive({ ...unchanged, archiveDir: f.archiveDir, deployment: deployment(unchanged.input), capture });
  assert.equal(result.snapshotsAdded, 0);
  assert.equal(result.changed, true);
  assert.equal(captures, 1);
  await writeFile(join(f.distDir, "donate/index.html"), html.replace("Public campaign text.", "B"));
  const b = await f.prepare();
  await appendArchive({ ...b, archiveDir: f.archiveDir, deployment: deployment(b.input), capture });
  await writeFile(join(f.distDir, "donate/index.html"), html);
  const again = await f.prepare();
  await appendArchive({ ...again, archiveDir: f.archiveDir, deployment: deployment(again.input), capture });
  const index = JSON.parse(await readFile(join(f.archiveDir, "index.json")));
  assert.equal(index.pages.donate.snapshots.length, 3);
  assert.equal(captures, 3);
  assert.equal(await readFile(join(f.archiveDir, oldPath, "metadata.json"), "utf8"), oldMetadata);
  const readme = await readFile(join(f.archiveDir, "README.md"), "utf8");
  assert.match(readme, /never merge|Never merge/);
  assert.match(readme, /Desktop|Mobile|PDF|HTML/);
  assert.equal(index.pages.donate.snapshots[0].schoolYear, "");
  assert.match(oldPath, /year-not-specified/);
});

test("removal and reappearance retain old captures and never overwrite an earlier campaign", async t => {
  const f = await fixture(t);
  const a = await f.prepare();
  await appendArchive({ ...a, archiveDir: f.archiveDir, deployment: deployment(a.input), capture: mockCapture });
  const removed = await f.prepare({ pages: [] });
  await appendArchive({ ...removed, archiveDir: f.archiveDir, deployment: deployment(removed.input), capture: mockCapture });
  const missing = JSON.parse(await readFile(join(f.archiveDir, "index.json")));
  assert(missing.pages.donate.removedAt);
  assert.equal(missing.pages.donate.snapshots.length, 1);
  const returned = await f.prepare();
  await appendArchive({ ...returned, archiveDir: f.archiveDir, deployment: deployment(returned.input), capture: mockCapture });
  const restored = JSON.parse(await readFile(join(f.archiveDir, "index.json")));
  assert.equal(restored.pages.donate.removedAt, undefined);
  assert.equal(restored.pages.donate.snapshots.length, 2);
});

test("failed capture cannot publish partial new snapshots or advance the receipt", async t => {
  const f = await fixture(t);
  const a = await f.prepare();
  await assert.rejects(appendArchive({ ...a, archiveDir: f.archiveDir, deployment: deployment(a.input),
    capture: async () => { throw new Error("Browser unavailable"); } }), /Browser unavailable/);
  assert.deepEqual(await readdir(f.archiveDir), []);
  await appendArchive({ ...a, archiveDir: f.archiveDir, deployment: deployment(a.input), capture: mockCapture });
  assert.equal(JSON.parse(await readFile(join(f.archiveDir, "index.json"))).pages.donate.snapshots.length, 1);
  const unrelated = join(f.root, "unrelated");
  await mkdir(unrelated);
  await writeFile(join(unrelated, "application.js"), "keep");
  await assert.rejects(appendArchive({ ...a, archiveDir: unrelated, deployment: deployment(a.input), capture: mockCapture }), /unrelated archive/);
});

test("older missing deployments cannot silently regress the latest capture state", async t => {
  const f = await fixture(t);
  const first = await f.prepare();
  await appendArchive({ ...first, archiveDir: f.archiveDir, deployment: deployment(first.input), capture: mockCapture });
  const older = await f.prepare();
  await assert.rejects(appendArchive({ ...older, archiveDir: f.archiveDir,
    deployment: deployment(older.input, { deployedAt: "2026-09-18T03:00:00Z" }), capture: mockCapture }), /in order/);
});
