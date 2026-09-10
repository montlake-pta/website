import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import { textContent } from "domutils";
import { emitLegacyEventAliases, legacyEventAliases, resolveLegacyEventAlias } from "./legacy-event-aliases.mjs";

// Independent literal inventory from docs/content-parity.md / R-ALIAS-1.
// Targets are reviewed identities, including canceled and dated records.
const expected = [
  ["join-the-montlake-pta-at-the-seattle-sounders!", "join-the-montlake-pta-at-the-seattle-sounders"],
  ["montlake-elementary-welcome-back-party!", "montlake-elementary-welcome-back-party"],
  ["5th-grade-promotion!", "5th-grade-promotion-2"],
  ["montlake-kindergarten-jumpstart!", "montlake-kindergarten-jumpstart"],
  ["art-walk-%26-concert-2026", "art-walk-concert-2026"],
  ["montlake-elementary-spring-auction!", "montlake-elementary-spring-auction"],
  ["parent's-night-out!", "parents-night-out"],
  ["2026-spring-auction-party-%E2%80%93-blooming-bright", "2026-spring-auction-party-blooming-bright"],
  ["current-student-families%3A-coffee-chat-with-principal-pearson-(postponed-to-feb-26)", "current-student-families-coffee-chat-with-principal-pearson-postponed-to-feb-26"],
  ["montlake-elementary-meet-and-greet-on-january-28-at-8%3A00am", "montlake-elementary-meet-and-greet-on-january-28-at-8-00am"],
  ["register-for-the-2026-2027-school-year-by-january-31!", "register-for-the-2026-2027-school-year-by-january-31"],
  ["register-for-the-2026-2027-school-year-by-1%2F31!", "register-for-the-2026-2027-school-year-by-1-31"],
  ["join-us-for-a-student-panel-on-meany-middle-school!", "join-us-for-a-student-panel-on-meany-middle-school"],
  ["montlake's-first%C2%A0creative-convergence%3A%C2%A0-a-literary-celebration!%C2%A0%C2%A0", "montlakes-first-creative-convergence-a-literary-celebration"],
  ["montlake-elementary-holiday-night-market-and-winter-concert", "montlake-elementary-holiday-night-market-and-winter-concert"],
  ["join-us-for-uw-women's-basketball-vs-michigan-on-january-1!", "join-us-for-uw-womens-basketball-vs-michigan-on-january-1"],
  ["montlake-elementary-meet-and-greet-on-january-13-at-8%3A00am", "montlake-elementary-meet-and-greet-on-january-13-at-8-00am"],
  ["evergreens-sale-pick-up", "evergreens-sale-pick-up"],
  ["fall-fundraiser-event-%40-flatstick-pub-", "fall-fundraiser-event-flatstick-pub"],
  ["montlake-elementary-meet-%26-greet", "montlake-elementary-meet-greet-2025-11-05-13-30"],
  ["annual-fund-celebration", "annual-fund-celebration"],
];
const canonicalRoutes = new Set([
  "",
  ...expected.map(([, target]) => `event-details/${target}`),
  "event-details/5th-grade-promotion",
  "event-details/montlake-elementary-meet-greet-2025-10-30-08-00",
  "event-details/mioposto-dine-out-february-3rd-2026",
  "event-details/ai-social-media-a-parents-only-forum-with-uw-professor-katie-davis",
]);

async function fixture(t) {
  const outputDir = await mkdtemp(join(tmpdir(), "montlake-aliases-"));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  for (const route of canonicalRoutes) {
    await mkdir(join(outputDir, route), { recursive: true });
    await writeFile(join(outputDir, route, "index.html"), "Canonical fixture: do not overwrite");
  }
  await writeFile(join(outputDir, "sitemap.xml"), "Canonical sitemap: do not change");
  return outputDir;
}

function encodedVariants(source) {
  const decoded = decodeURIComponent(source);
  const strictEncode = (value) => encodeURIComponent(value).replace(/[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const encoded = `/events-1/${strictEncode(decoded.slice("/events-1/".length))}`;
  return new Set([
    source, decoded, encoded,
    encoded.replace(/%[0-9A-F]{2}/g, (part) => part.toLowerCase()),
    // Browsers encode Unicode in pathname but often leave punctuation literal.
    new URL(`https://example.test${decoded}`).pathname,
  ]);
}

function executeScript(script, pathname) {
  const redirects = [];
  runInNewContext(script, {
    window: { location: { pathname, search: "?next=https://evil.example", hash: "#not-copied",
      replace: (target) => redirects.push(target) } },
  }, { timeout: 1000 });
  return redirects;
}

test("exactly the 21 reviewed working legacy aliases, with explicit record identity", () => {
  assert.equal(legacyEventAliases.length, 21);
  assert.deepEqual(legacyEventAliases.map(({ source, target }) => [source, target]),
    expected.map(([source, target]) => [`/events-1/${source}`, `/event-details/${target}/`]));
  assert.equal(canonicalRoutes.size, 26); // 25 events and the homepage.
  assert.match(legacyEventAliases.find(({ source }) => source.endsWith("meet-%26-greet")).reviewNote,
    /2025-11-05T13:30:00-08:00/);
});

for (const basePath of ["/", "/website/", "/preview/website/"]) {
  test(`static stubs and 404 asset preserve literal/encoded aliases under ${basePath}`, async (t) => {
    const outputDir = await fixture(t);
    const result = await emitLegacyEventAliases({ outputDir, canonicalRoutes, basePath });
    assert.equal(result.aliasCount, 21);
    assert.equal(result.files.length, 22); // 21 HTML stubs + 1 importless recovery asset.
    assert.equal(result.recoveryScriptPath, `${basePath}legacy-event-aliases.js`);
    const recovery = await readFile(join(outputDir, "legacy-event-aliases.js"), "utf8");
    for (const { source, target } of legacyEventAliases) {
      const decoded = decodeURIComponent(source);
      const html = await readFile(join(outputDir, decoded.slice(1), "index.html"), "utf8");
      const doc = parseDocument(html);
      const destination = `${basePath}${target.slice(1)}`;
      assert.equal(selectOne("link[rel=canonical]", doc).attribs.href, destination);
      assert.equal(selectOne("meta[http-equiv=refresh]", doc).attribs.content, `0;url=${destination}`);
      assert.equal(selectOne("meta[name=robots]", doc).attribs.content, "noindex,follow");
      assert.equal(selectAll("h1", doc).length, 1);
      assert.equal(selectOne("main a", doc).attribs.href, destination); // No-JS fallback.
      const redirectScript = textContent(selectOne("script", doc));
      for (const variant of encodedVariants(source)) {
        for (const suffix of ["", "/"]) {
          const pathname = `${basePath}${variant.slice(1)}${suffix}`;
          assert.equal(resolveLegacyEventAlias(pathname, { basePath }), destination, pathname);
          assert.deepEqual(executeScript(recovery, pathname), [destination], pathname);
          assert.deepEqual(executeScript(redirectScript, pathname), [destination], pathname);
          // Root-relative links cannot lose /website/ on an encoded slash or a
          // request without a trailing slash, even before a host slash redirect.
          const current = `https://example.test${pathname}`;
          for (const element of selectAll("[href],[src]", doc)) {
            const href = element.attribs.href || element.attribs.src;
            const expected = element.name === "link" && element.attribs.rel === "stylesheet"
              ? `${basePath}styles.css` : destination;
            assert.equal(new URL(href, current).pathname, expected);
          }
        }
      }
      assert.equal(await readFile(join(outputDir, target.slice(1), "index.html"), "utf8"),
        "Canonical fixture: do not overwrite");
    }
    assert.equal(await readFile(join(outputDir, "sitemap.xml"), "utf8"), "Canonical sitemap: do not change");
    assert.ok(result.files.includes("events-1/register-for-the-2026-2027-school-year-by-1/31!/index.html"));
    assert.ok(!result.files.some((file) => file.includes("%")));
  });
}

test("unknown, ambiguous, unsafe, and already-broken paths keep their 404 behavior", async (t) => {
  const outputDir = await fixture(t);
  await emitLegacyEventAliases({ outputDir, canonicalRoutes, basePath: "/website/" });
  const script = await readFile(join(outputDir, "legacy-event-aliases.js"), "utf8");
  const paths = [
    "/events-1/annual-fund-celebration", // Wrong deployment base.
    "/website-extra/events-1/annual-fund-celebration",
    "/website/events-1/not-a-known-event",
    "/website/events-1/mioposto-dine-out---february-3rd%2C-2026",
    "/website/events-1/ai-%26-social-media---a-parents-only-forum-with-uw-professor%2C-katie-davis",
    "/website/events-1/art-walk-concert-2026", // No punctuation-stripping guesses.
    "/website/events-1/art-walk-%2526-concert-2026", // Never decode twice.
    "/website/events-1/montlake-elementary-meet-and-greet",
    "/website/events-1/montlake-elementary-meet-%26-greet-2025-10-30",
    "/website/events-1/parent-s-night-out!",
    "/website/events-1/ANNUAL-FUND-CELEBRATION",
    "/website/events-1/annual-fund-celebration//",
    "/website/events-1/annual-fund-celebration/extra",
    "/website/events-1/annual-fund-celebration?next=https://evil.example",
    "/website/events-1/annual-fund-celebration#extra",
    "/website/events-1/annual-fund-celebration%00",
    "/website/events-1/%E0%A4%A",
    "/website/events-1/%",
    "/website/events-1/../events-1/annual-fund-celebration",
    "/website/events-1/%2E%2E/events-1/annual-fund-celebration",
    "/website/events-1/..%5Cevents-1%5Cannual-fund-celebration",
    "//evil.example/website/events-1/annual-fund-celebration",
    "https://evil.example/website/events-1/annual-fund-celebration",
    "/website/events-1/__proto__",
    "/website/events-1/constructor",
    // NBSP and trailing NBSP are meaningful characters, not ordinary spaces.
    "/website/events-1/montlake's-first%20creative-convergence%3A%20-a-literary-celebration!%20%20",
    "/website/events-1/montlake's-first%C2%A0creative-convergence%3A%C2%A0-a-literary-celebration!",
  ];
  for (const path of paths) {
    assert.equal(resolveLegacyEventAlias(path, { basePath: "/website/" }), null, path);
    assert.deepEqual(executeScript(script, path), [], path);
  }
  for (const source of [
    "/events-1/mioposto-dine-out---february-3rd%2C-2026",
    "/events-1/ai-%26-social-media---a-parents-only-forum-with-uw-professor%2C-katie-davis",
  ]) {
    for (const variant of encodedVariants(source)) {
      for (const suffix of ["", "/"]) {
        const path = `/website${variant}${suffix}`;
        assert.equal(resolveLegacyEventAlias(path, { basePath: "/website/" }), null, path);
        assert.deepEqual(executeScript(script, path), [], path);
      }
    }
  }
});

test("build rejects missing targets and source/canonical collisions before writing", async (t) => {
  const outputDir = await fixture(t);
  const missingTarget = new Set(canonicalRoutes);
  missingTarget.delete("event-details/montlake-elementary-meet-greet-2025-11-05-13-30");
  await assert.rejects(emitLegacyEventAliases({ outputDir, canonicalRoutes: missingTarget }), /Missing canonical target/);
  await assert.rejects(emitLegacyEventAliases({
    outputDir, canonicalRoutes: new Set([...canonicalRoutes, "/events-1/art-walk-%26-concert-2026/"]),
  }), /collides with canonical route/);
  missingTarget.add("event-details/MONTLAKE-ELEMENTARY-MEET-GREET-2025-11-05-13-30");
  await assert.rejects(emitLegacyEventAliases({ outputDir, canonicalRoutes: missingTarget }), /Missing canonical target/);
  assert.ok(!(await readdir(outputDir)).includes("events-1"));
});

test("declared canonical targets must also have a generated output page", async (t) => {
  const outputDir = await fixture(t);
  await rm(join(outputDir, "event-details/annual-fund-celebration/index.html"));
  await assert.rejects(emitLegacyEventAliases({ outputDir, canonicalRoutes }), /Missing canonical output page/);
  assert.ok(!(await readdir(outputDir)).includes("events-1"));
});

test("invalid configuration never writes aliases or permits an open redirect", async (t) => {
  const outputDir = await fixture(t);
  const good = legacyEventAliases[0];
  for (const source of [
    "https://evil.example/events-1/event", "//evil.example/events-1/event",
    "/events-1/../escape", "/events-1/%2e%2e/escape", "/events-1/%252e%252e/escape",
    "/events-1/..%5cescape", "/events-1/a//b", "/events-1/a?next=x",
    "/events-1/a%3Fx", "/events-1/%00", "/events-1/%", "/events-1/a/",
  ]) {
    await assert.rejects(emitLegacyEventAliases({
      outputDir, canonicalRoutes, aliases: [{ ...good, source }],
    }), /source/i, source);
  }
  for (const target of [
    "https://evil.example/", "//evil.example/", "/event-details/../escape/",
    "/event-details/a/?next=x", "/event-details/a%2fb/", "/event-details/<script>/",
  ]) {
    await assert.rejects(emitLegacyEventAliases({
      outputDir, canonicalRoutes, aliases: [{ ...good, target }],
    }), /canonical target/, target);
  }
  for (const basePath of ["https://evil.example/", "//evil.example/", "/website", "/../", "/%2f/", "/a/?x=/"]) {
    await assert.rejects(emitLegacyEventAliases({ outputDir, canonicalRoutes, basePath }), /basePath/);
  }
  for (const source of [good.source, good.source.replace("!", "%21"), good.source.toUpperCase().replace("/EVENTS-1/", "/events-1/")]) {
    await assert.rejects(emitLegacyEventAliases({
      outputDir, canonicalRoutes, aliases: [good, { ...good, source }],
    }), /Duplicate alias source/);
  }
  await assert.rejects(emitLegacyEventAliases({
    outputDir, canonicalRoutes,
    aliases: [{ ...good, source: "/events-1/a" }, { ...good, source: "/events-1/a/index.html/b" }],
  }), /Alias output collision/);
  assert.ok(!(await readdir(outputDir)).includes("events-1"));
});

test("preflight prevents overwriting an existing generated page, even late in the batch", async (t) => {
  const outputDir = await fixture(t);
  const destination = join(outputDir, "events-1/annual-fund-celebration/index.html");
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, "Existing generated page");
  await assert.rejects(emitLegacyEventAliases({ outputDir, canonicalRoutes }), /overwrite existing output/);
  assert.equal(await readFile(destination, "utf8"), "Existing generated page");
  assert.deepEqual(await readdir(join(outputDir, "events-1")), ["annual-fund-celebration"]);
});

test("preflight protects the recovery asset and rejects output symlinks", async (t) => {
  const outputDir = await fixture(t);
  await writeFile(join(outputDir, "legacy-event-aliases.js"), "Existing asset");
  await assert.rejects(emitLegacyEventAliases({ outputDir, canonicalRoutes }), /overwrite existing output/);
  assert.ok(!(await readdir(outputDir)).includes("events-1"));
  await rm(join(outputDir, "legacy-event-aliases.js"));
  const outside = await mkdtemp(join(tmpdir(), "montlake-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(outside, join(outputDir, "events-1"), "dir");
  await assert.rejects(emitLegacyEventAliases({ outputDir, canonicalRoutes }), /output symlink/);
  assert.deepEqual(await readdir(outside), []);
});
