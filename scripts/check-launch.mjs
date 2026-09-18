import { execFile } from "node:child_process";
import { resolve as resolveDnsRecords } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { selectAll, selectOne } from "css-select";
import { textContent } from "domutils";
import { parseDocument } from "htmlparser2";
import { CHECKOUT_ORIGIN, deploymentProfiles, PREVIEW_SITE_URL, PUBLIC_SITE_URL } from "../src/deployment.mjs";
import { legacyDocuments } from "./cutover-links.mjs";
import { legacyEventAliases } from "./legacy-event-aliases.mjs";

const publicHost = new URL(PUBLIC_SITE_URL).hostname;
const apexHost = publicHost.replace(/^www\./, "");
const githubHost = new URL(PREVIEW_SITE_URL).hostname;
const checkoutHost = new URL(CHECKOUT_ORIGIN).hostname;
const githubIPv4 = ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"];
const githubIPv6 = ["2606:50c0:8000::153", "2606:50c0:8001::153", "2606:50c0:8002::153", "2606:50c0:8003::153"];
const googleMailHosts = new Set([
  "smtp.google.com", "aspmx.l.google.com", "gmail-smtp-in.l.google.com",
  "alt3.aspmx.l.googlemail.com", "alt4.aspmx.l.googlemail.com",
  ...[1, 2, 3, 4].flatMap(number => [`alt${number}.aspmx.l.google.com`, `alt${number}.gmail-smtp-in.l.google.com`]),
  ...[2, 3, 4, 5].map(number => `aspmx${number}.googlemail.com`),
]);
const contentRoutes = ["donate", "annual-fund", "spring-auction", "enrichment", "calendar", "pta-board", "blog"];
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const execute = promisify(execFile);
const normalizeHost = value => typeof value === "string" ? value.toLowerCase().replace(/\.$/, "") : "";
const sameSet = (actual, expected) => actual.length === expected.length
  && new Set(actual).size === expected.length && expected.every(value => actual.includes(value));

class CheckFailure extends Error {}
function requireCheck(condition, detail) {
  if (!condition) throw new CheckFailure(detail);
}

export async function readGitHubPagesConfig({ execFileImpl = execute } = {}) {
  const { stdout } = await execFileImpl("gh", [
    "api", "--hostname", "github.com", "repos/montlake-pta/website/pages",
    "--jq", "{cname,build_type,https_enforced,html_url}",
  ], { timeout: 15_000, maxBuffer: 32_768, encoding: "utf8" });
  const config = JSON.parse(stdout);
  return {
    cname: config.cname,
    build_type: config.build_type,
    https_enforced: config.https_enforced,
    html_url: config.html_url,
  };
}

function networkMessage(error) {
  const code = error?.cause?.code || error?.code;
  if (/^(?:CERT_|ERR_TLS_|UNABLE_TO_VERIFY_|DEPTH_ZERO_|SELF_SIGNED_)/.test(code || "")) {
    return "HTTPS certificate could not be verified. Ask the website/Wix maintainer to check certificate readiness; do not bypass the warning.";
  }
  return "Public GET could not complete (network, DNS, TLS, or timeout). Ask the website maintainer to retry and check the address and certificate; no raw error details are recorded.";
}

function htmlDocument(response) {
  requireCheck(response.type === "text/html", "Expected an HTML page. Ask the website maintainer to check the deployed route.");
  return parseDocument(response.body);
}

function urlFrom(value, base) {
  try { return new URL(value, base); }
  catch { throw new CheckFailure("A page contains an invalid URL. Ask the website maintainer to rebuild the selected profile."); }
}

function checkPage(response, expectedUrl, profile, { transaction = false } = {}) {
  requireCheck(response.url === expectedUrl, "This page ended at the wrong address. Review redirects and deploy the selected profile.");
  const document = htmlDocument(response);
  const title = textContent(selectOne("title", document) || {}).trim();
  const headings = selectAll("h1", document);
  const heading = textContent(headings[0] || {}).trim();
  requireCheck(/Montlake/i.test(title) && headings.length === 1 && heading,
    "Expected a Montlake page with one main heading. Check for the old site, wrong deployment, or an error page.");
  requireCheck(!/\b404\b|not found|page (?:is )?(?:missing|unavailable)/i.test(`${title} ${heading}`)
    && !selectOne('script[src*="legacy-event-aliases.js"]', document),
  "A not-found page was returned as HTTP 200. Ask the website maintainer to restore this route.");
  const canonical = selectAll('link[rel="canonical"]', document);
  requireCheck(canonical.length === 1 && canonical[0].attribs.href === expectedUrl,
    "Canonical address does not match this profile and page. Rebuild with the selected deployment profile; launch URLs must not contain /website/.");
  requireCheck(!selectOne("base", document), "An unexpected HTML base address changes page links. Ask the website maintainer to inspect this release.");
  const base = new URL(deploymentProfiles[profile].SITE_URL);
  const assets = selectAll("script[src], link[href], img[src], source[src], video[poster], meta[property='og:image']", document)
    .map(node => node.attribs.src || node.attribs.href || node.attribs.poster || node.attribs.content)
    .filter(Boolean);
  for (const node of selectAll("[srcset]", document)) {
    if (!node.attribs.srcset.startsWith("data:")) {
      assets.push(...node.attribs.srcset.split(",").map(value => value.trim().split(/\s+/)[0]).filter(Boolean));
    }
  }
  for (const reference of assets) {
    const asset = urlFrom(reference, expectedUrl);
    if (![githubHost, publicHost, apexHost].includes(asset.hostname)) continue;
    requireCheck(asset.origin === base.origin && asset.pathname.startsWith(base.pathname)
      && !(profile === "launch" && asset.pathname.startsWith(new URL(PREVIEW_SITE_URL).pathname)),
    "A local asset or metadata link uses the wrong host or /website/ prefix. Rebuild portable assets for the selected profile.");
  }
  requireCheck(selectAll('link[rel="stylesheet"]', document).some(node => urlFrom(node.attribs.href, expectedUrl).href === new URL("styles.css", base).href)
    && selectAll("script[src]", document).some(node => urlFrom(node.attribs.src, expectedUrl).href === new URL("site.js", base).href),
  "The expected stylesheet or site script is missing or points to the wrong deployment. Ask the website maintainer to check asset paths.");
  requireCheck(profile !== "launch" || !selectOne("[data-legacy-transaction]", document),
    "A legacy registration/shopping handoff remains. Keep launch gated and have the website maintainer finish the visitor-flow migration.");
  const slots = selectAll("[data-wix-product-id], [data-wix-event-id], [data-wix-cart], [data-wix-confirmation]", document);
  const configs = selectAll("#wix-client-config", document);
  if (transaction || slots.length || configs.length) {
    requireCheck(slots.length > 0 && configs.length === 1 && configs[0].attribs.type === "application/json",
      "Visitor controls or their public configuration are missing. Deploy the selected profile; do not enable transactions by hand.");
    let config;
    try { config = JSON.parse(textContent(configs[0])); }
    catch { throw new CheckFailure("Visitor configuration is not valid JSON. Ask the website maintainer to rebuild the release."); }
    requireCheck(config?.enabled === (profile === "launch") && config?.readOnly === (profile === "preview")
      && config?.baseUrl === base.href,
    `Visitor configuration must use enabled=${profile === "launch"}, readOnly=${profile === "preview"}, and the ${profile} base URL. Rebuild using the matching profile.`);
    requireCheck(selectAll('script[type="module"][src]', document)
      .some(node => urlFrom(node.attribs.src, expectedUrl).href === new URL("transactions.js", base).href),
    "The visitor script is missing or has the wrong path. Ask the website maintainer to check the release.");
  }
  return document;
}

/**
 * Public GETs and DNS only. Inject all three external boundaries in tests:
 * resolveDns(host, type), fetchImpl(url, options), and readPagesConfig().
 * No environment variable can change the audited website destinations.
 */
export async function checkLaunch({
  profile = "launch",
  resolveDns = resolveDnsRecords,
  fetchImpl = globalThis.fetch,
  readPagesConfig = readGitHubPagesConfig,
  readSnapshot = async () => JSON.parse(await readFile(new URL("../src/data/wix-content.json", import.meta.url), "utf8")),
  now = () => new Date(),
} = {}) {
  if (!Object.hasOwn(deploymentProfiles, profile)) throw new Error("Choose --profile launch or --profile preview.");
  const checks = [];
  const limitations = [
    "Ready means read-only network/configuration readiness only; it is not payment approval or authorization to launch or change domains.",
    "No RSVP, cart change, ticket reservation, checkout session, or payment was submitted. No settings, DNS, or CMS records were changed.",
    "Actual Wix checkout-session routing, cancellation, and return behavior require an approved controlled browser check; a checkout homepage cannot prove account identity or payment completion.",
    "This is a bounded sample, not a site crawl. DNS reflects this resolver's current view; email delivery, all documents/assets, and browser execution are not verified.",
  ];
  const add = (name, status, detail) => checks.push({ name, status, detail });
  async function check(name, operation) {
    try { add(name, "pass", await operation()); }
    catch (error) {
      add(name, error instanceof CheckFailure ? "fail" : "unverified",
        error instanceof CheckFailure ? error.message : "Could not complete this check. Ask the website maintainer to investigate and rerun; this is not a pass.");
    }
  }
  const base = new URL(deploymentProfiles[profile].SITE_URL);
  const pageUrl = route => new URL(route ? `${route.replace(/^\/|\/$/g, "")}/` : "", base).href;

  if (profile === "launch") {
    const queries = [[publicHost, "CNAME"], [apexHost, "A"], [apexHost, "AAAA"], [checkoutHost, "CNAME"], [apexHost, "MX"]];
    const answers = await Promise.all(queries.map(async ([host, type]) => {
      try { return { records: await resolveDns(host, type) }; }
      catch (error) { return { missing: ["ENODATA", "ENOTFOUND"].includes(error?.code) }; }
    }));
    for (let index = 0; index < queries.length; index += 1) {
      const [host, type] = queries[index];
      const answer = answers[index];
      const name = `DNS ${host} ${type}`;
      if (!("records" in answer)) {
        add(name, answer.missing && type === "AAAA" ? "pass" : answer.missing ? "fail" : "unverified",
          answer.missing && type === "AAAA" ? "No optional IPv6 records; no stale IPv6 destination observed."
            : answer.missing ? `No ${type} record found. Have the domain maintainer review the domain-migration handoff; do not reset the DNS zone.`
              : "DNS lookup could not be verified. Ask the domain maintainer to retry from another network; no DNS changes were made.");
        continue;
      }
      await check(name, () => {
        requireCheck(Array.isArray(answer.records), "DNS returned an unexpected answer. Ask the domain maintainer to verify this record.");
        if (type === "A") {
          requireCheck(sameSet(answer.records, githubIPv4),
            `The root must have exactly GitHub's four A addresses (${githubIPv4.join(", ")}), with no old Wix or mixed destinations. Have the domain maintainer compare the saved zone.`);
          return "All four GitHub IPv4 addresses match; no mixed Wix destination.";
        }
        if (type === "AAAA") {
          const addresses = answer.records.map(address => {
            try { return new URL(`https://[${address}]/`).hostname.slice(1, -1); }
            catch { return ""; }
          });
          requireCheck(!addresses.length || sameSet(addresses, githubIPv6),
            "IPv6 records include an old, incomplete, or unapproved destination. Have the domain maintainer compare all four approved GitHub IPv6 records before changing anything.");
          return addresses.length ? "All four approved GitHub IPv6 addresses match." : "No optional IPv6 records.";
        }
        if (type === "MX") {
          const hosts = answer.records.map(record => normalizeHost(record.exchange));
          requireCheck(hosts.length > 0 && hosts.every(hostname => googleMailHosts.has(hostname)),
            "Mail-record drift needs owner review: the expected Google MX baseline is missing or changed. Compare the saved mail records; do not replace the zone or share mail contents.");
          return `Google mail hosts observed: ${[...new Set(hosts)].join(", ")}. This does not test sending or receiving mail.`;
        }
        const hosts = answer.records.map(normalizeHost);
        if (host === publicHost) {
          requireCheck(sameSet(hosts, [githubHost]),
            `The www CNAME must point only to ${githubHost}; Wix or another target is not launch-ready. Have the domain maintainer follow the saved launch plan.`);
          return `www points to ${githubHost}.`;
        }
        requireCheck(hosts.length === 1 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hosts[0])
          && ![githubHost, publicHost, apexHost, checkoutHost].includes(hosts[0])
          && !hosts[0].endsWith(".github.io"),
        "Checkout needs its own Wix-supplied CNAME, not GitHub, www, the root, or itself. Ask the Wix/domain maintainer for this site's exact connection instructions.");
        return `Observed checkout CNAME: ${hosts[0]}. Informational only: compare it with this site's Wix instructions; the hostname alone cannot establish account identity.`;
      });
    }
  } else {
    limitations.push("Preview does not check final-domain DNS, apex/HTTP redirects, checkout TLS, or full transaction activation.");
  }

  let pages;
  try { pages = await readPagesConfig(); }
  catch {
    add("GitHub Pages configuration", "unverified",
      "Not verified. Ask an authorized repository maintainer to use their existing gh sign-in and rerun, or inspect Settings > Pages. Missing gh, authentication, or read permission is not a pass; no new token is required.");
  }
  if (pages !== undefined) {
    await check("GitHub Pages configuration", () => {
      requireCheck(pages && typeof pages === "object", "GitHub Pages returned no usable configuration. Ask the repository maintainer to inspect Settings > Pages.");
      requireCheck(profile === "launch" ? normalizeHost(pages.cname) === publicHost : pages.cname === null || pages.cname === "",
        profile === "launch" ? `GitHub Pages custom domain is not ${publicHost}. Coordinate Settings > Pages during the approved launch window; do not change it just to pass this check.`
          : "Preview expects no Pages custom domain. Ask the maintainer to review the selected profile and coordinated rollback settings.");
      requireCheck(pages.build_type === "workflow", "Pages publishing source must be GitHub Actions, not a branch (especially not fundraising-archive). Ask the repository maintainer to review Settings > Pages.");
      requireCheck(pages.html_url === base.href, "GitHub Pages reports a different public URL. Review the profile and custom-domain configuration with the repository maintainer.");
      requireCheck(pages.https_enforced === true, "Pages HTTPS enforcement is not confirmed. Have the repository maintainer check certificate readiness and Enforce HTTPS; do not bypass TLS.");
      return `Custom domain, GitHub Actions source, public URL, and HTTPS enforcement match ${profile}.`;
    });
  } else if (!checks.some(item => item.name === "GitHub Pages configuration")) {
    add("GitHub Pages configuration", "unverified", "No Pages configuration was returned. Ask the repository maintainer to inspect Settings > Pages and rerun.");
  }

  const cache = new Map();
  let requests = 0;
  async function get(startUrl, allowedHosts = [base.hostname]) {
    let current = new URL(startUrl);
    const seen = new Set();
    for (let redirects = 0; redirects <= 8; redirects += 1) {
      requireCheck(!seen.has(current.href), "A redirect loop prevents this page loading. Ask the website/Wix maintainer to check domain assignments.");
      seen.add(current.href);
      requireCheck(allowedHosts.includes(current.hostname) && !current.username && !current.password && !current.port
        && ["http:", "https:"].includes(current.protocol) && !/^\/(?:_api|api)(?:\/|$)/i.test(current.pathname),
      "Redirect left the approved host or attempted an API/unsafe address. Ask the website/Wix maintainer to inspect routing; no unapproved destination was requested.");
      if (!cache.has(current.href)) {
        requireCheck(requests++ < 64, "The bounded request limit was reached. Ask the website maintainer to inspect excessive redirects.");
        const url = current.href;
        cache.set(url, (async () => {
          let response;
          try {
            response = await fetchImpl(url, {
              method: "GET", redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(15_000),
            });
            const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
            const body = redirectStatuses.has(response.status) ? "" : await response.text();
            return { status: response.status, location: response.headers.get("location"), type, body };
          } catch (error) { throw new CheckFailure(networkMessage(error)); }
        })());
      }
      const response = await cache.get(current.href);
      if (redirectStatuses.has(response.status)) {
        requireCheck(redirects < 8, "More than eight redirects were required. Ask the website/Wix maintainer to simplify the domain routing.");
        requireCheck(response.location, "A redirect has no destination. Ask the website maintainer to check hosting configuration.");
        const next = urlFrom(response.location, current);
        requireCheck(!(current.protocol === "https:" && next.protocol !== "https:"),
          "An HTTPS page redirects to an insecure address. Ask the website/Wix maintainer to fix routing; do not bypass HTTPS.");
        next.hash = "";
        current = next;
        continue;
      }
      requireCheck(response.status === 200, `Public GET returned HTTP ${Number.isInteger(response.status) ? response.status : "unknown"}. Ask the website/Wix maintainer to check deployment, domain routing, and certificate readiness.`);
      return { ...response, url: current.href, redirects };
    }
  }

  await check("Public homepage", async () => {
    checkPage(await get(base.href), base.href, profile);
    return `HTTP 200, Montlake identity, one main heading, canonical URL, and asset paths match ${profile}.`;
  });
  if (profile === "launch") {
    for (const variant of [`https://${apexHost}/`, `http://${apexHost}/`, `http://${publicHost}/`]) {
      await check(`Redirect ${variant}`, async () => {
        const response = await get(variant, [apexHost, publicHost]);
        requireCheck(response.redirects > 0 && response.url === PUBLIC_SITE_URL,
          "This address must redirect to the canonical HTTPS www homepage. Ask the domain/GitHub maintainer to review routing.");
        return "HTTP redirect chain ends at the canonical HTTPS www homepage.";
      });
    }
    await check("Wix checkout HTTPS", async () => {
      const response = await get(`${CHECKOUT_ORIGIN}/`, [checkoutHost]);
      requireCheck(new URL(response.url).origin === CHECKOUT_ORIGIN, "Checkout did not stay on its dedicated Wix origin. Ask the Wix maintainer to review primary/pages-domain settings.");
      htmlDocument(response);
      return "Checkout homepage responds over verified HTTPS without leaving its host. This does not prove Wix account identity, a checkout session, or its return flow.";
    });
  }
  for (const route of [...contentRoutes, ...(profile === "launch" ? ["cart", "checkout/complete"] : [])]) {
    await check(`Page /${route}/`, async () => {
      checkPage(await get(pageUrl(route)), pageUrl(route), profile, { transaction: ["cart", "checkout/complete"].includes(route) });
      return "HTTP 200 with matching page identity, canonical and asset paths; any visitor configuration matches the profile.";
    });
  }
  if (profile === "preview") {
    await check("Preview read-only visitor configuration", async () => {
      const snapshot = await readSnapshot();
      const product = snapshot.products?.find(item => typeof item.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug));
      requireCheck(product, "No representative public product is available in the snapshot. Ask the website maintainer to select a current read-only product check.");
      const url = pageUrl(`product-page/${product.slug}`);
      checkPage(await get(url), url, profile, { transaction: true });
      return "A public product uses enabled=false, readOnly=true and the /website/ base URL. Marked legacy handoffs are allowed only in preview.";
    });
  }
  for (const [path, type] of [["styles.css", "text/css"], ["assets/mark.png", "image/png"], [legacyDocuments[0].source.slice(1), "application/pdf"]]) {
    await check(`Asset /${path}`, async () => {
      const url = new URL(path, base).href;
      const response = await get(url);
      requireCheck(response.url === url && response.type === type && response.body.trim()
        && !/^\s*(?:<!doctype\s+html|<html\b)/i.test(response.body),
      `Expected HTTP 200 ${type}, not a redirected or HTML fallback. Ask the website maintainer to restore the portable asset or old document path.`);
      return `HTTP 200 ${type}; not an HTML fallback.`;
    });
  }
  await check("Legacy event bookmark", async () => {
    const alias = legacyEventAliases[0];
    const source = pageUrl(alias.source);
    const target = pageUrl(alias.target);
    const response = await get(source);
    if (response.url !== target) {
      requireCheck(response.url === source, "The old event bookmark redirects to the wrong page. Ask the website maintainer to restore the reviewed alias.");
      const document = htmlDocument(response);
      const canonicals = selectAll('link[rel="canonical"]', document);
      const refresh = selectOne('meta[http-equiv="refresh" i]', document)?.attribs.content?.match(/^\s*0\s*;\s*url=(.+)$/i);
      requireCheck(canonicals.length === 1 && urlFrom(canonicals[0].attribs.href, source).href === target
        && refresh && urlFrom(refresh[1], source).href === target
        && selectAll("a[href]", document).some(node => urlFrom(node.attribs.href, source).href === target),
      "The old event bookmark is missing its reviewed canonical, refresh, or fallback link. Ask the website maintainer to restore this compatibility page.");
    }
    checkPage(await get(target), target, profile);
    return "One reviewed old event URL reaches its correct live page (static refresh/link or HTTP redirect); browser execution was not exercised.";
  });
  return { schemaVersion: 1, profile, checkedAt: now().toISOString(), ready: checks.every(item => item.status === "pass"), checks, limitations };
}

export function formatLaunchReport(report) {
  return [
    `${report.ready ? "PASS" : "NOT READY"}: ${report.profile} read-only network/configuration checks (not payment or launch approval).`,
    ...report.checks.map(item => `${item.status === "unverified" ? "NOT VERIFIED" : item.status.toUpperCase()} ${item.name}: ${item.detail}`),
    ...report.limitations.map(detail => `LIMIT: ${detail}`),
  ].join("\n");
}

export async function main(args = process.argv.slice(2), { runCheck = checkLaunch, log = console.log } = {}) {
  let values;
  try {
    ({ values } = parseArgs({ args, options: {
      profile: { type: "string", default: "launch" },
      output: { type: "string" },
    }, allowPositionals: false }));
  } catch { throw new Error("Usage: node scripts/check-launch.mjs --profile launch|preview [--output FILE]"); }
  const report = await runCheck({ profile: values.profile });
  log(formatLaunchReport(report));
  if (values.output !== undefined) {
    try {
      if (!values.output.trim()) throw new Error("Empty output path");
      const output = resolve(values.output);
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    } catch { throw new Error("Could not save the report. Choose a new writable output filename; existing files are not overwritten."); }
  }
  return report.ready ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
