import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import { textContent } from "domutils";
import { legacyEventAliases } from "./legacy-event-aliases.mjs";
import { emitLegacyDocuments, legacyDocuments, rewriteCutoverLinks } from "./cutover-links.mjs";
import { sanitizeCmsHtml } from "./render-wix-content.mjs";
import { cutoverLinkProblems } from "./check-cutover.mjs";

const baseUrl = "https://montlake-pta.github.io/website/";
const post = "post/key-events-for-5th-grade-islandwood-parent-night-out-walk-a-thon-bake-sale-details";
const routes = new Set([
  "", "evergreens", "fifth-grade-promotion", "donate", "enrichment", "news",
  "category/2026-art-walk", "event-details/parents-night-out", post,
  "event-details/5th-grade-promotion", "product-page/islandwood-donation",
  "product-page/islandwood-bake-sale", "post/nested/deep",
  ...legacyEventAliases.map(({ target }) => target.slice(1, -1)),
]);
const options = { routes, baseUrl, slug: "post/nested/deep" };
const wrap = (body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}</head><body><main>${body}</main></body></html>`;
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const link = (url, label = "Continue") => `<a href="${escape(url)}">${label}</a>`;
const rewrite = (body, config = options) => parseDocument(rewriteCutoverLinks(wrap(body), config));
const href = (body, config = options) => selectOne("a", rewrite(body, config)).attribs.href;

test("email and phone link labels survive split formatting without being treated as website URLs", () => {
  const doc = rewrite('<a href="mailto:events@montlakepta.org"><strong>events@</strong>montlakepta.org</a>'
    + '<a href="tel:+12062523300">Call <em>montlakepta.org</em></a>');
  const anchors = selectAll("a", doc);
  assert.equal(textContent(anchors[0]), "events@montlakepta.org");
  assert.equal(anchors[0].attribs.href, "mailto:events@montlakepta.org");
  assert.equal(textContent(anchors[1]), "Call montlakepta.org");
});

test("all ordinary legacy route types use the supplied inventory, never guessed destinations", () => {
  for (const route of ["", "evergreens", "category/2026-art-walk", post, "event-details/parents-night-out",
    "fifth-grade-promotion", "product-page/islandwood-donation", "product-page/islandwood-bake-sale"]) {
    for (const host of ["https://www.montlakepta.org", "http://montlakepta.org", "//www.montlakepta.org", "//montlakepta.org"]) {
      assert.equal(href(link(`${host}/${route}?a=1&b=%2F%25#Caf%C3%A9`)),
        `../../../${route}${route ? "/" : ""}?a=1&b=%2F%25#Caf%C3%A9`);
    }
  }
});

test("root and nested routes resolve correctly for root and multi-level deployment bases", () => {
  for (const baseUrl of ["https://preview.example/", "https://preview.example/website/", "https://preview.example/preview/website/"]) {
    for (const slug of ["", "news", "post/nested/deep"]) {
      const config = { routes, baseUrl, slug };
      const current = new URL(slug ? `${slug}/` : "", baseUrl);
      for (const target of ["", "evergreens", "category/2026-art-walk"]) {
        const path = `/${target}`;
        if (target === slug) {
          assert.throws(() => href(link(`https://www.montlakepta.org${path}`), config), /Legacy same-page handoff/);
        } else {
          const url = href(link(`https://www.montlakepta.org${path}?x=%2b+#a`), config);
          assert.equal(new URL(url, current).href, `${baseUrl}${target}${target ? "/" : ""}?x=%2b+#a`);
        }
        assert.equal(new URL(href(link(path), config), current).pathname,
          `${new URL(baseUrl).pathname}${target}${target && new URL(baseUrl).pathname !== "/" ? "/" : ""}`);
      }
    }
  }
});

test("root-relative legacy content gets the Pages base without changing already-correct links/assets", () => {
  assert.equal(href(link("/evergreens?x=1#fees")), "../../../evergreens/?x=1#fees");
  assert.equal(href(link("/website/evergreens/?x=1#fees")), "/website/evergreens/?x=1#fees");
  assert.equal(href(link("../../../evergreens/?x=1#fees")), "../../../evergreens/?x=1#fees");
  const body = `<img src="../../../assets/mark.png"><script src="../../../site.js" defer></script>
    <img src="/website/assets/mark.png"><a href="#fees">Fees</a><a href="?view=all">View</a>
    <img src="../../../assets/class%20photo.jpg"><a href="../../../assets/caf%C3%A9%20map.pdf">Map</a>
    <a href="../../../">Home</a><img src="../authored-image.webp">`;
  const original = wrap(body, '<link rel="stylesheet" href="../../../styles.css">');
  assert.equal(rewriteCutoverLinks(original, options), original);
  assert.equal(href(link("/assets/documents/enrichment-pickup-map.pdf")), "../../../assets/documents/enrichment-pickup-map.pdf");
});

test("all reviewed /events-1 aliases retain exact identity at arbitrary page depth", () => {
  for (const { source, target } of legacyEventAliases) {
    const decoded = decodeURIComponent(source);
    const strictEncoded = `/events-1/${encodeURIComponent(decoded.slice("/events-1/".length)).replace(/[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
    for (const variant of new Set([source, decoded, strictEncoded, strictEncoded.replace(/%[0-9A-F]{2}/g, (v) => v.toLowerCase())])) {
      for (const prefix of ["https://www.montlakepta.org", "//montlakepta.org", "", "/website"]) {
        assert.equal(href(link(`${prefix}${variant}`)), `../../..${target}`, `${prefix}${variant}`);
        for (const trailing of ["", "/"]) {
          assert.equal(href(link(`${prefix}${variant}${trailing}?next=%2Ffoo&x=%26#keep`)),
            `../../..${target}?next=%2Ffoo&x=%26#keep`, `${prefix}${variant}${trailing}`);
        }
      }
    }
  }
  assert.equal(href(link("../../../events-1/register-for-the-2026-2027-school-year-by-1%2F31!")),
    "../../../event-details/register-for-the-2026-2027-school-year-by-1-31/");
});

test("aliases must have a supplied canonical target and never use punctuation-stripping guesses", () => {
  const missing = new Set(routes);
  missing.delete("event-details/parents-night-out");
  assert.throws(() => href(link("https://www.montlakepta.org/events-1/parent's-night-out!"), { ...options, routes: missing }),
    /Missing reviewed alias target: \/event-details\/parents-night-out\//);
  for (const path of [
    "/events-1/art-walk-concert-2026", "/events-1/parent-s-night-out!",
    "/events-1/montlake's-first%20creative-convergence%3A%20-a-literary-celebration!%20%20",
    "/events-1/montlake's-first%C2%A0creative-convergence%3A%C2%A0-a-literary-celebration!",
    "/events-1/mioposto-dine-out---february-3rd%2C-2026",
    "/events-1/ai-%26-social-media---a-parents-only-forum-with-uw-professor%2C-katie-davis",
  ]) assert.throws(() => href(link(`https://www.montlakepta.org${path}`)), /Unknown cutover target|Unsafe internal path/);
});

test("both PDFs rewrite without altering source identifiers, query bytes, or fragments", () => {
  for (const { source, asset } of legacyDocuments) {
    for (const prefix of ["https://www.montlakepta.org", "//montlakepta.org", "", "/website"]) {
      assert.equal(href(link(`${prefix}${source}?download=1&opaque=%2f%2F+#page=2`)),
        `../../..${asset}?download=1&opaque=%2f%2F+#page=2`);
    }
    assert.equal(href(link(`../../..${source}#page=3`)), `../../..${asset}#page=3`);
  }
  assert.throws(() => href(link("https://www.montlakepta.org/_files/ugd/not-reviewed.pdf")), /Unknown cutover target/);
  assert.throws(() => href(link("https://www.montlakepta.org/assets/not-reviewed.pdf")), /Unknown cutover target/);
});

test("media URL attributes rewrite known documents and preserve Wix srcset data", () => {
  const { source, asset } = legacyDocuments[0];
  const cdn = "https://static.wixstatic.com/media/file.png/v1/fill/w_100,h_100/file.png";
  const doc = rewrite(`<iframe src="https://www.montlakepta.org${source}#page=2"></iframe>
    <img srcset="${cdn} 1x, ${cdn} 2x"><img srcset="https://www.montlakepta.org${source} 1x">`);
  assert.equal(selectOne("iframe", doc).attribs.src, `../../..${asset}#page=2`);
  assert.deepEqual(selectAll("img", doc).map((n) => n.attribs.srcset), [`${cdn} 1x, ${cdn} 2x`, `../../..${asset} 1x`]);
});

test("third-party providers, Wix backend/CDN, schemes and suffix lookalikes remain unchanged", () => {
  const urls = [
    "mailto:board@montlakepta.org", "tel:+12065551212",
    "https://static.wixstatic.com/media/abc~mv2.png/v1/fill/w_100,h_100/abc.png",
    "https://video.wixstatic.com/video/abc.mp4",
    "https://f17e8f26-4d30-4997-bca1-82f1599221bb.filesusr.com/ugd/file.pdf",
    "https://forms.office.com/r/example", "https://checkout.wix.com/example",
    "https://montlakepta.org.evil.example/evergreens", "//www.montlakepta.org.example/evergreens",
    "https://notmontlakepta.org/evergreens", "https://montlakepta.org@external.example/evergreens",
    "https://provider.example/?return=https://www.montlakepta.org/unknown",
  ];
  for (const url of urls) {
    const original = wrap(link(url, escape(url)));
    assert.equal(rewriteCutoverLinks(original, options), original, url);
  }
});

test("old-domain same-page checkout, RSVP and aliased handoffs fail, not become self-links", () => {
  for (const slug of ["event-details/parents-night-out", "product-page/islandwood-donation"]) {
    for (const host of ["https://www.montlakepta.org", "//montlakepta.org"]) {
      const url = `${host}/${slug}?checkout=1#register`;
      for (const body of [link(url), `<area href="${url}">`, `<form action="${url}"></form>`,
        `<button formaction="${url}">RSVP</button>`]) {
        assert.throws(() => rewrite(body, { ...options, slug }), /Legacy same-page handoff must be replaced/);
      }
    }
  }
  assert.throws(() => href(link("https://www.montlakepta.org/events-1/parent's-night-out!"),
    { ...options, slug: "event-details/parents-night-out" }), /Legacy same-page handoff/);
  assert.equal(href(link("/event-details/parents-night-out/#details"),
    { ...options, slug: "event-details/parents-night-out" }), "../../event-details/parents-night-out/#details");
  assert.throws(() => rewrite('<a data-legacy-transaction="true">RSVP</a>'), /Legacy transaction handoff/);
});

test("transaction opt-in preserves only explicit managed anchor handoffs and remains unready", () => {
  for (const slug of ["event-details/parents-night-out", "product-page/islandwood-donation"]) {
    for (const host of ["https://www.montlakepta.org", "//montlakepta.org"]) {
      const url = `${host}/${slug}?checkout=1&quantity=2#register`;
      const marked = `<a data-legacy-transaction="true" href="${escape(url)}" rel="noopener"><span>${escape(url)}</span></a>`;
      const config = { ...options, slug, allowLegacyTransactions: true };
      const output = rewriteCutoverLinks(wrap(marked), config);
      assert.equal(output, wrap(marked));
      for (const strictConfig of [{ ...options, slug }, { ...config, allowLegacyTransactions: false }]) {
        assert.throws(() => rewriteCutoverLinks(output, strictConfig), /Legacy transaction handoff/);
      }
      assert.deepEqual(cutoverLinkProblems(output, new URL(`${slug}/`, baseUrl).href, baseUrl),
        ["A visitor transaction still uses the legacy frontend"]);
      // Other content continues migrating even beside a retained live CTA.
      const mixed = rewrite(`${marked}${link("https://www.montlakepta.org/evergreens")}`, config);
      assert.deepEqual(selectAll("a", mixed).map((a) => a.attribs.href), [url, "../../evergreens/"]);
      assert.throws(() => href(link(url), config), /Legacy same-page handoff/);
    }
  }
});

test("transaction opt-in does not exempt unknown targets, unsafe URLs, descendants or non-anchor markers", () => {
  const config = { ...options, allowLegacyTransactions: true };
  for (const path of ["/not-migrated", "/events-1/not-reviewed"]) {
    const url = `https://www.montlakepta.org${path}?token=secret`;
    assert.throws(() => rewrite(`<a data-legacy-transaction="true" href="${url}">RSVP</a>`, config),
      /Unknown cutover target/);
    assert.throws(() => href(link(url), config), /Unknown cutover target/);
  }
  assert.throws(() => rewrite(
    '<a data-legacy-transaction="true" href="https://www.montlakepta.org/%2e%2e/evergreens">RSVP</a>', config),
  /Unsafe internal path/);
  for (const body of [
    '<form data-legacy-transaction="true" action="https://www.montlakepta.org/evergreens"></form>',
    '<area data-legacy-transaction="true" href="https://www.montlakepta.org/evergreens">',
    '<button data-legacy-transaction="true" formaction="https://www.montlakepta.org/evergreens">RSVP</button>',
    '<a data-legacy-transaction="true">RSVP</a>',
  ]) assert.throws(() => rewrite(body, config), /Legacy transaction handoff/);
  assert.throws(() => rewrite(
    '<a data-legacy-transaction="true" href="https://www.montlakepta.org/evergreens"><img src="https://www.montlakepta.org/not-migrated"></a>',
    config), /Unknown cutover target/);
  for (const marker of ["false", "TRUE", "1", ""]) {
    assert.throws(() => rewrite(
      `<a data-legacy-transaction="${marker}" href="https://www.montlakepta.org/event-details/parents-night-out">RSVP</a>`,
      { ...config, slug: "event-details/parents-night-out" }), /Legacy same-page handoff/);
  }
  for (const value of ["true", 1, null, {}]) {
    assert.throws(() => rewrite("", { ...options, allowLegacyTransactions: value }), /must be a boolean/);
  }
});

test("the eventual own origin is not a retiring frontend dependency", () => {
  const config = { ...options, baseUrl: "https://www.montlakepta.org/", slug: "event-details/parents-night-out" };
  const url = "https://www.montlakepta.org/event-details/parents-night-out/";
  const html = wrap(link(url, "This page"), `<link rel="canonical" href="${url}">
    <meta property="og:image" content="https://www.montlakepta.org/assets/school.jpg">`);
  assert.equal(rewriteCutoverLinks(html, config), html);
  assert.throws(() => href(link("https://montlakepta.org/event-details/parents-night-out/"), config), /Legacy same-page handoff/);
  assert.equal(href(link("https://montlakepta.org/evergreens"), config), "../../evergreens/");
  assert.throws(() => rewrite('<a data-legacy-transaction="true">RSVP</a>', config), /Legacy transaction handoff/);
  assert.throws(() => href(link("https://www.montlakepta.org/unknown"), config), /Unknown cutover target/);
});

test("new-origin absolute canonical and asset URLs preserve their origin and deployment base", () => {
  const html = wrap(link(`${baseUrl}post/nested/deep/`), `<link rel="canonical" href="${baseUrl}post/nested/deep/">
    <link rel="icon" href="${baseUrl}assets/mark.png">`);
  assert.equal(rewriteCutoverLinks(html, options), html);
});

test("unknown retiring targets fail with path-only diagnostics, even outside anchors", () => {
  for (const body of [
    link("https://secret:credential@www.montlakepta.org/not-migrated?token=TOPSECRET#private"),
    link("/not-migrated?token=TOPSECRET#private"),
    '<iframe src="https://www.montlakepta.org/not-migrated?token=TOPSECRET"></iframe>',
    '<img src="https://www.montlakepta.org/not-migrated?token=TOPSECRET">',
    '<script src="https://www.montlakepta.org/not-migrated?token=TOPSECRET"></script>',
    '<form action="https://www.montlakepta.org/not-migrated?token=TOPSECRET"></form>',
    '<video poster="https://www.montlakepta.org/not-migrated?token=TOPSECRET"></video>',
    '<img srcset="https://www.montlakepta.org/not-migrated?token=TOPSECRET 2x">',
    "Visit https://www.montlakepta.org/not-migrated?token=TOPSECRET#private",
  ]) {
    assert.throws(() => rewrite(body), (error) => {
      assert.match(error.message, /: \/not-migrated$/);
      assert.doesNotMatch(error.message, /TOPSECRET|token|private|credential|secret|https?:|montlakepta\.org/);
      return true;
    });
  }
});

test("unsafe paths cannot exploit URL normalization, repeated decoding, or traversal", () => {
  for (const path of [
    "/evergreens/../donate", "/%2e%2e/donate", "/%2E/donate",
    "/%252e%252e/donate", "/evergreens%00", "/evergreens%5cdonate",
    "/evergreens%3Fsecret", "/evergreens%23secret", "/evergreens//",
    "/%E0%A4%A", "/%", "/%2F%2Fevil.example", "/post%2Fnested%2Fdeep",
    "/events-1/art-walk-%2526-concert-2026", "/events-1/..%5cevergreens",
  ]) assert.throws(() => href(link(`https://www.montlakepta.org${path}`)), /Unsafe|Invalid|Unreviewed/);
  for (const path of ["../../../../evergreens", "../../../%2e%2e/evergreens"]) {
    assert.throws(() => href(link(path)), /Unsafe|escapes deployment base/);
  }
  for (const url of [
    "https://user:secret@www.montlakepta.org/evergreens",
    "https://www.montlakepta.org:1234/evergreens",
    "https://www.montlakepta.org\\evergreens",
    "https://www.montlakep\tta.org/evergreens",
  ]) assert.throws(() => href(link(url)), /Unsafe/);
});

test("visible URL copy uses an absolute new destination, including bare domains and prose punctuation", () => {
  const html = rewriteCutoverLinks(wrap(
    `${link("https://www.montlakepta.org/evergreens?x=1&y=2#buy", "https://www.montlakepta.org/evergreens?x=1&amp;y=2#buy")}
    <p>Visit montlakepta.org/fifth-grade-promotion. Or (//www.montlakepta.org/category/2026-art-walk).</p>
    <p>www.montlakepta.org/events-1/parent's-night-out!</p>`), options);
  const doc = parseDocument(html);
  assert.equal(selectOne("a", doc).attribs.href, "../../../evergreens/?x=1&y=2#buy");
  assert.equal(textContent(selectOne("a", doc)), `${baseUrl}evergreens/?x=1&y=2#buy`);
  assert.match(textContent(selectOne("main", doc)), /Visit https:\/\/montlake-pta\.github\.io\/website\/fifth-grade-promotion\/\./);
  assert.match(textContent(selectOne("main", doc)), /\(https:\/\/montlake-pta\.github\.io\/website\/category\/2026-art-walk\/\)\./);
});

test("markup, doctype, UTF-8, comments, script JSON and relative assets survive the migration pass", () => {
  const payload = '{"source":"https://www.montlakepta.org/unknown","text":"<b> & → \\"quote\\""}';
  const original = wrap(`<h1>Café — families’ guide →</h1><!-- Keep this comment -->
    <figure><img src="../../../assets/school.jpg" alt="“School”"><figcaption>A &amp; B</figcaption></figure>
    <table><tbody><tr><th>Day</th><td>Monday</td></tr></tbody></table>
    ${link("https://www.montlakepta.org/evergreens")}`,
  `<script id="configuration" type="application/json">${payload}</script>
    <script>const retiring = "https://www.montlakepta.org/not-a-navigation";</script>
    <style>.x::after { content: "https://www.montlakepta.org/not-a-navigation"; }</style>`);
  const html = rewriteCutoverLinks(original, options);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.match(html, /Café — families’ guide →/);
  assert.match(html, /<!-- Keep this comment -->/);
  assert.match(html, /<meta charset="utf-8">/);
  const doc = parseDocument(html);
  assert.equal(textContent(selectOne("#configuration", doc)), payload);
  assert.equal(selectOne("img", doc).attribs.src, "../../../assets/school.jpg");
  assert.equal(selectAll("table tbody tr th", doc).length, 1);
  assert.equal(selectAll("script", doc).length, 2);
});

test("rewriting cannot turn escaped text or URL query data into executable markup", () => {
  const attack = 'https://www.montlakepta.org/evergreens?x="><img src=x onerror=alert(1)>&y=%22#%3Cscript%3E';
  const sanitized = sanitizeCmsHtml(`<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>${link(attack)}
    <img src="https://static.wixstatic.com/media/a.png" onerror="alert(1)"><script>alert(1)</script>`);
  const doc = rewrite(sanitized);
  assert.equal(selectAll("script,[onerror]", doc).length, 0);
  assert.equal(selectAll("img", doc).length, 1);
  assert.equal(selectOne("a", doc).attribs.href,
    '../../../evergreens/?x="><img src=x onerror=alert(1)>&y=%22#%3Cscript%3E');
  assert.match(textContent(selectOne("p", doc)), /<script>alert\(1\)<\/script>/);
});

test("invalid inventories and deployment URLs fail without logging configuration secrets", () => {
  assert.throws(() => rewrite("", { ...options, routes: [] }), /routes must be a Set/);
  for (const route of ["//", "//external.example", "https://external.example", "../escape", "a/%2f/b", "<script>", "a//b"]) {
    assert.throws(() => rewrite("", { ...options, routes: new Set([route]) }), /Invalid cutover route/);
  }
  for (const baseUrl of [
    "https://user:SECRET@preview.example/", "https://preview.example/?token=SECRET",
    "https://preview.example/website", "javascript:SECRET", "//preview.example/",
    "https://preview.example/website/../", "https://preview.example/website/%2e%2e/",
  ]) assert.throws(() => rewrite("", { ...options, baseUrl }), (error) => {
    assert.equal(error.message, "Invalid cutover baseUrl"); return true;
  });
});

async function fixture(t) {
  const output = await mkdtemp(join(tmpdir(), "montlake-documents-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  return output;
}

test("normal generation emits only the two old PDF paths, byte-for-byte and without network access", async (t) => {
  const output = await fixture(t);
  const result = await emitLegacyDocuments(output);
  assert.deepEqual(result, { documentCount: 2, files: legacyDocuments.map(({ source }) => source.slice(1)) });
  assert.deepEqual(await readdir(output), ["_files"]);
  for (const record of legacyDocuments) {
    const source = await readFile(new URL(`../src${record.asset}`, import.meta.url));
    const copy = await readFile(join(output, record.source.slice(1)));
    assert.deepEqual(copy, source);
    assert.equal(copy.subarray(0, 4).toString(), "%PDF");
    assert.equal(copy.length, record.bytes);
    assert.equal(createHash("sha256").update(copy).digest("hex"), record.sha256);
  }
});

test("PDF batch preflight refuses an existing late destination before copying the first file", async (t) => {
  const output = await fixture(t);
  const existing = join(output, legacyDocuments[1].source.slice(1));
  await mkdir(dirname(existing), { recursive: true });
  await writeFile(existing, "Do not replace");
  await assert.rejects(emitLegacyDocuments(output), /overwrite document output/);
  assert.equal(await readFile(existing, "utf8"), "Do not replace");
  assert.deepEqual(await readdir(dirname(existing)), [legacyDocuments[1].source.split("/").at(-1)]);
});

test("PDF generation refuses output-root, child-directory and leaf symlinks", async (t) => {
  const outside = await fixture(t);
  for (const path of ["root", "_files", "_files/ugd", legacyDocuments[0].source.slice(1)]) {
    const output = await fixture(t);
    const destination = path === "root" ? join(output, "linked") : join(output, path);
    await mkdir(dirname(destination), { recursive: true });
    await symlink(outside, destination);
    await assert.rejects(emitLegacyDocuments(path === "root" ? destination : output), /output symlink/);
    assert.deepEqual(await readdir(outside), []);
  }
  await assert.rejects(emitLegacyDocuments("https://external.example/"), /filesystem directory/);
});
