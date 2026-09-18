import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CHECKOUT_ORIGIN, deploymentProfiles, PREVIEW_SITE_URL, PUBLIC_SITE_URL } from "../src/deployment.mjs";
import { checkLaunch, formatLaunchReport, main, readGitHubPagesConfig } from "./check-launch.mjs";
import { legacyEventAliases } from "./legacy-event-aliases.mjs";

const publicHost = new URL(PUBLIC_SITE_URL).hostname;
const apexHost = publicHost.replace(/^www\./, "");
const checkoutHost = new URL(CHECKOUT_ORIGIN).hostname;
const githubHost = new URL(PREVIEW_SITE_URL).hostname;
const ipv4 = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
const ipv6 = ["2606:50c0:8000::153", "2606:50c0:8001::153", "2606:50c0:8002::153", "2606:50c0:8003::153"];
const fixedTime = "2026-09-18T23:38:58.000Z";
const privateDetail = "https://example.invalid/private?token=DO_NOT_PRINT";
const response = (body, type = "text/html", status = 200, extra = {}) => new Response(body, {
  status, headers: { "content-type": type, ...extra },
});
const redirect = destination => response("", "text/html", 301, { location: destination });
const missing = () => Object.assign(new Error(privateDetail), { code: "ENODATA" });

function page(url, profile, overrides = {}) {
  const base = deploymentProfiles[profile].SITE_URL;
  const transaction = /\/(?:cart\/|checkout\/complete\/|product-page\/)/.test(url);
  const config = {
    enabled: profile === "launch", readOnly: profile === "preview", baseUrl: base, ...overrides.config,
  };
  return `<!doctype html><html><head>
    <title>${overrides.title || "Montlake PTA"}</title>
    <link rel="canonical" href="${overrides.canonical || url}">
    <link rel="stylesheet" href="${overrides.styles || new URL("styles.css", base).href}">
    <script src="${new URL("site.js", base).href}"></script>
    ${transaction ? `<script id="wix-client-config" type="application/json">${JSON.stringify(config)}</script>
      <script type="module" src="${new URL("transactions.js", base).href}"></script>` : ""}
    </head><body><h1>${overrides.heading || "Montlake families"}</h1>
    ${transaction ? '<div data-wix-product-id="public-sample"></div>' : ""}
    ${overrides.extra || ""}</body></html>`;
}

function fixtures(profile = "launch") {
  const base = deploymentProfiles[profile].SITE_URL;
  const dnsCalls = [];
  const fetchCalls = [];
  const records = {
    [`${publicHost}:CNAME`]: [githubHost],
    [`${apexHost}:A`]: [...ipv4],
    [`${apexHost}:AAAA`]: [...ipv6],
    [`${checkoutHost}:CNAME`]: ["site-specific.wixdns.net"],
    [`${apexHost}:MX`]: [{ exchange: "aspmx.l.google.com", priority: 1 }, { exchange: "alt1.aspmx.l.google.com", priority: 5 }],
  };
  const pages = {
    cname: profile === "launch" ? publicHost : null,
    build_type: "workflow", https_enforced: true, html_url: base,
  };
  const changes = new Map();
  const options = {
    profile,
    now: () => new Date(fixedTime),
    readSnapshot: async () => ({ products: [{ slug: "public-sample" }] }),
    resolveDns: async (host, type) => {
      dnsCalls.push([host, type]);
      const result = records[`${host}:${type}`];
      if (result instanceof Error) throw result;
      return result;
    },
    readPagesConfig: async () => pages,
    fetchImpl: async (url, request) => {
      fetchCalls.push(url);
      assert.equal(request.method, "GET");
      assert.equal(request.redirect, "manual");
      assert.equal(request.credentials, "omit");
      assert.equal(request.headers, undefined);
      assert.ok(request.signal instanceof AbortSignal);
      assert.ok(!new URL(url).pathname.startsWith("/_api/"));
      if (changes.has(url)) {
        const change = changes.get(url);
        if (change instanceof Error) throw change;
        return typeof change === "function" ? change() : change;
      }
      if (url === `https://${apexHost}/` || url === `http://${apexHost}/` || url === `http://${publicHost}/`) return redirect(PUBLIC_SITE_URL);
      if (url === `${CHECKOUT_ORIGIN}/`) return response("<html><h1>Wix hosted pages</h1></html>");
      assert.equal(new URL(url).origin, new URL(base).origin);
      assert.ok(new URL(url).pathname.startsWith(new URL(base).pathname));
      if (url === new URL("styles.css", base).href) return response("body { color: black; }", "text/css");
      if (url === new URL("assets/mark.png", base).href) return response("PNG fixture bytes", "image/png");
      if (url.endsWith(".pdf")) return response("%PDF-1.7 fixture", "application/pdf");
      const alias = legacyEventAliases[0];
      const source = new URL(`${alias.source.slice(1)}/`, base).href;
      const target = new URL(alias.target.slice(1), base).href;
      if (url === source) return response(`<link rel="canonical" href="${target}">
        <meta http-equiv="refresh" content="0;url=${target}"><a href="${target}">Continue</a>`);
      return response(page(url, profile));
    },
  };
  return { options, pages, records, changes, dnsCalls, fetchCalls };
}

const named = (report, name) => {
  const result = report.checks.find(item => item.name === name);
  assert.ok(result, `Missing check: ${name}`);
  return result;
};

test("launch reports only sampled read-only readiness, safe GETs, and deterministic schema", async () => {
  const fixture = fixtures();
  const report = await checkLaunch(fixture.options);
  assert.equal(report.ready, true, formatLaunchReport(report));
  assert.deepEqual(Object.keys(report), ["schemaVersion", "profile", "checkedAt", "ready", "checks", "limitations"]);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.checkedAt, fixedTime);
  assert.equal(report.profile, "launch");
  assert.equal(fixture.dnsCalls.length, 5);
  assert.equal(fixture.fetchCalls.length, 19);
  assert.equal(fixture.fetchCalls.filter(url => url === PUBLIC_SITE_URL).length, 1, "redirect destinations share a cached GET");
  assert.ok(report.checks.every(check => check.status === "pass" && Object.keys(check).join(",") === "name,status,detail"));
  assert.match(formatLaunchReport(report), /not payment or launch approval/);
  assert.match(report.limitations.join(" "), /No RSVP, cart change, ticket reservation/);
  assert.match(report.limitations.join(" "), /controlled browser check/);
  assert.match(named(report, "Wix checkout HTTPS").detail, /does not prove Wix account identity/);
});

test("preview checks /website/ and read-only product config, without new-domain DNS or cart checks", async () => {
  const fixture = fixtures("preview");
  fixture.options.resolveDns = () => { throw new Error("Preview must not query launch DNS"); };
  fixture.changes.set(new URL("product-page/public-sample/", PREVIEW_SITE_URL).href,
    response(page(new URL("product-page/public-sample/", PREVIEW_SITE_URL).href, "preview", {
      extra: '<a data-legacy-transaction="true">Legacy handoff</a>',
    })));
  const report = await checkLaunch(fixture.options);
  assert.equal(report.ready, true, formatLaunchReport(report));
  assert.equal(fixture.fetchCalls.length, 14);
  assert.ok(fixture.fetchCalls.every(url => url.startsWith(PREVIEW_SITE_URL)));
  assert.ok(!fixture.fetchCalls.some(url => /\/cart\/|\/checkout\//.test(url)));
  assert.match(report.limitations.join(" "), /Preview does not check final-domain DNS/);
});

test("current Wix DNS and unset Pages domain fail launch without changing configuration", async () => {
  const fixture = fixtures();
  fixture.records[`${publicHost}:CNAME`] = ["pointing.wixdns.net"];
  fixture.records[`${apexHost}:A`] = ["185.230.63.107"];
  fixture.records[`${checkoutHost}:CNAME`] = missing();
  fixture.pages.cname = null;
  const report = await checkLaunch(fixture.options);
  assert.equal(report.ready, false);
  for (const name of [`DNS ${publicHost} CNAME`, `DNS ${apexHost} A`, `DNS ${checkoutHost} CNAME`, "GitHub Pages configuration"]) {
    assert.equal(named(report, name).status, "fail");
  }
  assert.match(named(report, "GitHub Pages configuration").detail, /approved launch window/);
});

test("DNS rejects mixed, incomplete, old IPv6, and unsafe checkout destinations", async t => {
  const cases = [
    [apexHost, "A", [...ipv4, "185.230.63.107"]],
    [apexHost, "A", ipv4.slice(0, 3)],
    [apexHost, "A", [ipv4[0], ipv4[0], ipv4[2], ipv4[3]]],
    [apexHost, "AAAA", [...ipv6, "2001:db8::1"]],
    [apexHost, "AAAA", ["2001:db8::1"]],
    [publicHost, "CNAME", [githubHost, "pointing.wixdns.net"]],
    ...[githubHost, apexHost, publicHost, checkoutHost, "another.github.io"].map(host => [checkoutHost, "CNAME", [host]]),
  ];
  for (const [host, type, records] of cases) {
    await t.test(`${host} ${type}: ${records.join(",")}`, async () => {
      const fixture = fixtures();
      fixture.records[`${host}:${type}`] = records;
      const report = await checkLaunch(fixture.options);
      assert.equal(report.ready, false);
      assert.equal(named(report, `DNS ${host} ${type}`).status, "fail");
    });
  }
});

test("DNS supports trailing dots, equivalent IPv6, absent optional IPv6, and known Google MX alternatives", async () => {
  const fixture = fixtures();
  fixture.records[`${publicHost}:CNAME`] = [`${githubHost.toUpperCase()}.`];
  fixture.records[`${apexHost}:AAAA`] = ipv6.map(value => value.replace("::153", ":0000:0000:0000:0000:0153"));
  fixture.records[`${apexHost}:MX`] = [
    { exchange: "ASPMX2.GOOGLEMAIL.COM.", priority: 10 },
    { exchange: "alt1.gmail-smtp-in.l.google.com", priority: 20 },
  ];
  assert.equal((await checkLaunch(fixture.options)).ready, true);
  fixture.records[`${apexHost}:AAAA`] = missing();
  assert.equal((await checkLaunch(fixture.options)).ready, true);
});

test("authoritative prelaunch Google MX baseline passes without claiming mail delivery", async () => {
  const fixture = fixtures();
  fixture.records[`${apexHost}:MX`] = [
    { exchange: "aspmx.l.google.com", priority: 1 },
    { exchange: "alt1.aspmx.l.google.com", priority: 5 },
    { exchange: "alt2.aspmx.l.google.com", priority: 5 },
    { exchange: "alt3.aspmx.l.googlemail.com", priority: 10 },
    { exchange: "alt4.aspmx.l.googlemail.com", priority: 10 },
  ];
  const report = await checkLaunch(fixture.options);
  const result = named(report, `DNS ${apexHost} MX`);
  assert.equal(report.ready, true, formatLaunchReport(report));
  assert.equal(result.status, "pass");
  assert.match(result.detail, /alt3\.aspmx\.l\.googlemail\.com/);
  assert.match(result.detail, /alt4\.aspmx\.l\.googlemail\.com/);
  assert.match(result.detail, /does not test sending or receiving mail/);

  fixture.records[`${apexHost}:MX`].push({ exchange: "unreviewed.aspmx.l.googlemail.com", priority: 10 });
  const drift = await checkLaunch(fixture.options);
  assert.equal(drift.ready, false);
  assert.equal(named(drift, `DNS ${apexHost} MX`).status, "fail");
});

test("missing required CNAME and DNS exceptions are explicit and redact raw details", async () => {
  const fixture = fixtures();
  fixture.records[`${checkoutHost}:CNAME`] = missing();
  fixture.records[`${publicHost}:CNAME`] = Object.assign(new Error(privateDetail), { code: "ESERVFAIL" });
  const report = await checkLaunch(fixture.options);
  assert.equal(named(report, `DNS ${checkoutHost} CNAME`).status, "fail");
  assert.equal(named(report, `DNS ${publicHost} CNAME`).status, "unverified");
  assert.equal(report.ready, false);
  assert.ok(!JSON.stringify(report).includes("DO_NOT_PRINT"));
});

test("MX drift requests owner review, not mail changes", async () => {
  const fixture = fixtures();
  fixture.records[`${apexHost}:MX`] = [{ exchange: "other-mail.example", priority: 1 }];
  const report = await checkLaunch(fixture.options);
  assert.equal(named(report, `DNS ${apexHost} MX`).status, "fail");
  assert.match(named(report, `DNS ${apexHost} MX`).detail, /drift needs owner review/);
});

test("Pages detects custom-domain, publishing source, HTTPS and URL mismatches", async t => {
  for (const [key, value] of [["cname", null], ["build_type", "legacy"], ["https_enforced", false], ["html_url", PREVIEW_SITE_URL]]) {
    await t.test(key, async () => {
      const fixture = fixtures();
      fixture.pages[key] = value;
      assert.equal(named(await checkLaunch(fixture.options), "GitHub Pages configuration").status, "fail");
    });
  }
  const preview = fixtures("preview");
  preview.pages.cname = publicHost;
  assert.equal(named(await checkLaunch(preview.options), "GitHub Pages configuration").status, "fail");
});

test("missing gh, authorization/403, and absent result are not verified, never a silent pass", async t => {
  for (const failure of [Object.assign(new Error(privateDetail), { code: "ENOENT" }), new Error(`HTTP 403 ${privateDetail}`), undefined]) {
    await t.test(String(failure?.code || "auth/empty"), async () => {
      const fixture = fixtures();
      fixture.options.readPagesConfig = async () => { if (failure) throw failure; };
      const report = await checkLaunch(fixture.options);
      assert.equal(report.ready, false);
      assert.equal(named(report, "GitHub Pages configuration").status, "unverified");
      assert.ok(!JSON.stringify(report).includes("DO_NOT_PRINT"));
      assert.match(formatLaunchReport(report), /NOT VERIFIED GitHub Pages/);
    });
  }
});

test("gh adapter performs only a fixed read and returns only selected safe properties", async () => {
  const config = await readGitHubPagesConfig({ execFileImpl: async (command, args, options) => {
    assert.equal(command, "gh");
    assert.deepEqual(args.slice(0, 4), ["api", "--hostname", "github.com", "repos/montlake-pta/website/pages"]);
    assert.ok(!args.includes("-X") && !args.includes("--method"));
    assert.ok(options.timeout > 0);
    return { stdout: JSON.stringify({ cname: publicHost, build_type: "workflow", https_enforced: true, html_url: PUBLIC_SITE_URL, unrelated: privateDetail }) };
  } });
  assert.deepEqual(Object.keys(config), ["cname", "build_type", "https_enforced", "html_url"]);
  assert.ok(!JSON.stringify(config).includes(privateDetail));
});

test("redirects reject loops, downgrades, wrong hosts, credentials and API paths without following them", async t => {
  for (const [label, target] of [
    ["loop", PUBLIC_SITE_URL],
    ["downgrade", `http://${publicHost}/`],
    ["wrong host", privateDetail],
    ["credentials", `https://someone:DO_NOT_PRINT@${publicHost}/`],
    ["API path", new URL("/_api/redirect-session?token=DO_NOT_PRINT", PUBLIC_SITE_URL).href],
  ]) {
    await t.test(label, async () => {
      const fixture = fixtures();
      fixture.changes.set(PUBLIC_SITE_URL, () => redirect(target));
      const report = await checkLaunch(fixture.options);
      assert.equal(named(report, "Public homepage").status, "fail");
      assert.ok(!JSON.stringify(report).includes("DO_NOT_PRINT"));
      assert.ok(!fixture.fetchCalls.includes(privateDetail));
      assert.ok(!fixture.fetchCalls.some(url => url.includes("DO_NOT_PRINT")));
    });
  }
});

test("redirects require transitions from apex and HTTP variants and enforce eight-hop maximum", async () => {
  const fixture = fixtures();
  fixture.changes.set(`https://${apexHost}/`, response(page(`https://${apexHost}/`, "launch")));
  for (let index = 0; index <= 8; index += 1) {
    fixture.changes.set(index ? new URL(`hop-${index}/`, PUBLIC_SITE_URL).href : PUBLIC_SITE_URL,
      () => redirect(new URL(`hop-${index + 1}/`, PUBLIC_SITE_URL).href));
  }
  const report = await checkLaunch(fixture.options);
  assert.equal(named(report, `Redirect https://${apexHost}/`).status, "fail");
  assert.match(named(report, "Public homepage").detail, /eight redirects/);
  assert.ok(!fixture.fetchCalls.includes(new URL("hop-9/", PUBLIC_SITE_URL).href));
});

test("checkout must stay on its dedicated origin and never follows public/GitHub destinations", async t => {
  for (const target of [PUBLIC_SITE_URL, `https://${apexHost}/`, PREVIEW_SITE_URL, privateDetail]) {
    await t.test(target.split("?")[0], async () => {
      const fixture = fixtures();
      fixture.changes.set(`${CHECKOUT_ORIGIN}/`, () => redirect(target));
      const report = await checkLaunch(fixture.options);
      assert.equal(named(report, "Wix checkout HTTPS").status, "fail");
      assert.ok(!JSON.stringify(report).includes("DO_NOT_PRINT"));
    });
  }
});

test("certificate and generic request failures are actionable without raw errors or query strings", async t => {
  for (const error of [
    Object.assign(new Error(privateDetail), { cause: { code: "CERT_HAS_EXPIRED" } }),
    Object.assign(new Error(privateDetail), { cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } }),
    new Error(privateDetail),
  ]) {
    await t.test(error.cause?.code || "network", async () => {
      const fixture = fixtures();
      fixture.changes.set(`${CHECKOUT_ORIGIN}/`, error);
      const report = await checkLaunch(fixture.options);
      const result = named(report, "Wix checkout HTTPS");
      assert.equal(result.status, "fail");
      assert.match(result.detail, error.cause ? /certificate could not be verified/ : /Public GET could not complete/);
      assert.ok(!JSON.stringify(report).includes("DO_NOT_PRINT"));
    });
  }
});

test("direct pages reject wrong canonicals, preview asset prefixes, wrong identity and soft 404s", async t => {
  const url = new URL("enrichment/", PUBLIC_SITE_URL).href;
  for (const [label, overrides] of [
    ["canonical", { canonical: new URL("website/enrichment/", PUBLIC_SITE_URL).href }],
    ["stylesheet", { styles: new URL("website/styles.css", PUBLIC_SITE_URL).href }],
    ["image prefix", { extra: '<img src="/website/assets/mark.png">' }],
    ["srcset prefix", { extra: '<img srcset="/assets/mark.png 1x, /website/assets/mark.png 2x">' }],
    ["wrong identity", { title: "A different school" }],
    ["not-found title", { title: "Page not found | Montlake PTA" }],
    ["not-found h1", { heading: "404" }],
    ["duplicate h1", { extra: "<h1>Another main heading</h1>" }],
    ["legacy marker", { extra: '<a data-legacy-transaction="true">Register</a>' }],
  ]) {
    await t.test(label, async () => {
      const fixture = fixtures();
      fixture.changes.set(url, response(page(url, "launch", overrides)));
      assert.equal(named(await checkLaunch(fixture.options), "Page /enrichment/").status, "fail");
    });
  }
});

test("launch and preview visitor flags/base URL must match exactly, not truthy values", async t => {
  for (const [profile, config] of [
    ["launch", { enabled: false }],
    ["launch", { readOnly: true }],
    ["launch", { enabled: "true" }],
    ["launch", { baseUrl: PREVIEW_SITE_URL }],
    ["preview", { enabled: true }],
    ["preview", { readOnly: false }],
    ["preview", { baseUrl: PUBLIC_SITE_URL }],
  ]) {
    await t.test(`${profile} ${JSON.stringify(config)}`, async () => {
      const fixture = fixtures(profile);
      const url = new URL(profile === "launch" ? "cart/" : "product-page/public-sample/", deploymentProfiles[profile].SITE_URL).href;
      fixture.changes.set(url, response(page(url, profile, { config })));
      const report = await checkLaunch(fixture.options);
      assert.equal(named(report, profile === "launch" ? "Page /cart/" : "Preview read-only visitor configuration").status, "fail");
    });
  }
});

test("missing/malformed config and missing script cannot pass as working visitor controls", async t => {
  const url = new URL("cart/", PUBLIC_SITE_URL).href;
  for (const transform of [
    html => html.replace(/<script id="wix-client-config"[\s\S]*?<\/script>/, ""),
    html => html.replace('"enabled":true', '"enabled":invalid'),
    html => html.replace('type="module"', 'type="text/plain"'),
    html => html.replace('data-wix-product-id="public-sample"', ""),
  ]) {
    await t.test("invalid visitor markup", async () => {
      const fixture = fixtures();
      fixture.changes.set(url, response(transform(page(url, "launch"))));
      assert.equal(named(await checkLaunch(fixture.options), "Page /cart/").status, "fail");
    });
  }
});

test("representative assets, old PDF paths, aliases and alias targets must actually load", async t => {
  for (const kind of ["styles", "image", "alias", "alias-target"]) {
    await t.test(kind, async () => {
      const fixture = fixtures();
      const alias = legacyEventAliases[0];
      const path = {
        styles: "styles.css", image: "assets/mark.png",
        alias: `${alias.source.slice(1)}/`, "alias-target": alias.target.slice(1),
      }[kind];
      fixture.changes.set(new URL(path, PUBLIC_SITE_URL).href, response("<html>Error</html>"));
      const report = await checkLaunch(fixture.options);
      assert.equal(report.ready, false);
      const name = kind.startsWith("alias") ? "Legacy event bookmark" : `Asset /${path}`;
      assert.equal(named(report, name).status, "fail");
    });
  }
  const fixture = fixtures();
  const fetch = fixture.options.fetchImpl;
  fixture.options.fetchImpl = (url, options) => url.endsWith(".pdf") ? response("<html>Not found</html>", "application/pdf") : fetch(url, options);
  const report = await checkLaunch(fixture.options);
  assert.equal(report.checks.find(check => check.name.endsWith(".pdf")).status, "fail");
});

test("preview does not accept a final-domain redirect or assets escaping /website/", async () => {
  const fixture = fixtures("preview");
  fixture.changes.set(PREVIEW_SITE_URL, () => redirect(PUBLIC_SITE_URL));
  assert.equal(named(await checkLaunch(fixture.options), "Public homepage").status, "fail");
  fixture.changes.set(PREVIEW_SITE_URL, response(page(PREVIEW_SITE_URL, "preview", { extra: '<img src="/assets/mark.png">' })));
  assert.equal(named(await checkLaunch(fixture.options), "Public homepage").status, "fail");
});

test("unsupported profiles fail before any external call", async () => {
  for (const profile of ["https://other.example/", "constructor", "__proto__", "production"]) {
    await assert.rejects(checkLaunch({ profile }), /Choose --profile launch or --profile preview/);
  }
});

test("CLI defaults to launch, saves JSON with an existing/new parent, and returns failure for unverified checks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "montlake-launch-test-"));
  try {
    const fixture = fixtures();
    fixture.options.readPagesConfig = async () => { throw new Error(privateDetail); };
    const report = await checkLaunch(fixture.options);
    const output = join(directory, "reports", "launch.json");
    const messages = [];
    const code = await main(["--output", output], {
      runCheck: async options => { assert.equal(options.profile, "launch"); return report; },
      log: message => messages.push(message),
    });
    assert.equal(code, 1);
    assert.deepEqual(JSON.parse(await readFile(output, "utf8")), report);
    assert.match(messages[0], /NOT READY/);
    await assert.rejects(main(["--output", output], { runCheck: async () => report, log: () => {} }), /existing files are not overwritten/);
    await assert.rejects(main(["--url", privateDetail]), /Usage:/);
    const preview = await checkLaunch(fixtures("preview").options);
    assert.equal(await main(["--profile", "preview"], {
      runCheck: async options => { assert.equal(options.profile, "preview"); return preview; }, log: () => {},
    }), 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
