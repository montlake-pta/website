import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rehearsalEnvironment, inspectFinalOutput } from "./rehearse-cutover.mjs";
import { PUBLIC_SITE_URL } from "../src/deployment.mjs";
import { legacyEventAliases } from "./legacy-event-aliases.mjs";

test("rehearsal uses only the launch preset and excludes live credentials and production overrides", () => {
  const env = rehearsalEnvironment({ PATH: "/bin", HOME: "/home/test", SITE_URL: "https://wrong.example/",
    DEPLOYMENT_PROFILE: "preview", WIX_API_KEY: "PRIVATE", GH_TOKEN: "PRIVATE", GITHUB_TOKEN: "PRIVATE", WIX_HEADLESS_CLIENT_ID: "different" });
  assert.equal(env.SITE_URL, PUBLIC_SITE_URL);
  assert.equal(env.WIX_HEADLESS_ENABLED, "true");
  assert.equal(env.WIX_HEADLESS_READ_ONLY, "false");
  assert.equal(env.DEPLOYMENT_PROFILE, "launch");
  assert(!JSON.stringify(env).includes("PRIVATE"));
  assert.equal(env.WIX_HEADLESS_CLIENT_ID, undefined);
});

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "final-path-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const html = `<html><head><link rel="canonical" href="${PUBLIC_SITE_URL}"><link rel="stylesheet" href="/styles.css"></head><body><h1>Montlake</h1>
    <script id="wix-client-config" type="application/json">${JSON.stringify({ enabled: true, readOnly: false, baseUrl: PUBLIC_SITE_URL })}</script>
    <script src="/transactions.js"></script></body></html>`;
  for (const path of ["cart", "checkout/complete"]) {
    await mkdir(join(directory, path), { recursive: true });
    await writeFile(join(directory, path, "index.html"), html.replace(`href="${PUBLIC_SITE_URL}"`, `href="${PUBLIC_SITE_URL}${path}/"`));
  }
  await writeFile(join(directory, "index.html"), html);
  await writeFile(join(directory, "styles.css"), "body{}");
  await writeFile(join(directory, "transactions.js"), "void 0;");
  await writeFile(join(directory, "sitemap.xml"), `<urlset><url><loc>${PUBLIC_SITE_URL}</loc></url></urlset>`);
  return { directory, html };
}

test("final output verification checks canonical roots, local assets and full SDK settings", async t => {
  const { directory } = await fixture(t);
  const result = await inspectFinalOutput(directory);
  assert.equal(result.canonicalPages, 3);
  assert.equal(result.visitorPages, 3);
});

test("reviewed compatibility stubs may canonically name their new route with a root-relative URL", async t => {
  const { directory } = await fixture(t);
  const alias = legacyEventAliases[0];
  await mkdir(join(directory, decodeURIComponent(alias.source)), { recursive: true });
  await writeFile(join(directory, decodeURIComponent(alias.source), "index.html"),
    `<html><head><link rel="canonical" href="${alias.target}"></head><body>Redirect</body></html>`);
  await mkdir(join(directory, alias.target), { recursive: true });
  await writeFile(join(directory, alias.target, "index.html"), "<html><head></head><body>Event</body></html>");
  await inspectFinalOutput(directory);
});

test("preview prefixes, preview-hosted images, handoffs, missing assets and wrong SDK mode cannot pass rehearsal", async t => {
  const { directory, html } = await fixture(t);
  for (const altered of [
    html.replace(`href="${PUBLIC_SITE_URL}"`, `href="${PUBLIC_SITE_URL}website/"`),
    html.replace("/styles.css", "/website/styles.css"),
    html.replace("</body>", '<img src="https://montlake-pta.github.io/website/assets/photo.png"></body>'),
    html.replace("<h1>", '<a data-legacy-transaction="true">Registration</a><h1>'),
    html.replace('"readOnly":false', '"readOnly":true'),
    html.replace("/styles.css", "/missing.css"),
  ]) {
    await writeFile(join(directory, "index.html"), altered);
    await assert.rejects(inspectFinalOutput(directory));
  }
});
