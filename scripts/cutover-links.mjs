import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseDocument } from "htmlparser2";
import { getOuterHTML } from "domutils";
import { resolveLegacyEventAlias } from "./legacy-event-aliases.mjs";

const retiringHosts = new Set(["montlakepta.org", "www.montlakepta.org"]);
const untouchedText = new Set(["script", "style", "noscript", "svg", "textarea", "template"]);
const urlAttributes = new Set(["href", "src", "action", "formaction", "poster"]);
const literalUrls = /(?<![\w@./-])(?:(?:https?:\/\/|\/\/)[^\s<>"]+|(?:www\.)?montlakepta\.org(?=[:/?#\s]|$)[^\s<>"]*)/giu;

// Reviewed compatibility metadata, not a second copy of Wix-authored content.
// These are untouched HTTP 200 application/pdf downloads, verified 2026-09-10.
export const legacyDocuments = Object.freeze([
  Object.freeze({
    source: "/_files/ugd/5a8077_0f6074eac84f4eafaf2410e6232ae73a.pdf",
    asset: "/assets/documents/enrichment-positive-behavior-support-plan.pdf",
    sha256: "2b2112c4c2cb77076feb86fb053769d2837c793b0a98fb71a9e7721637078241",
    bytes: 182834,
  }),
  Object.freeze({
    source: "/_files/ugd/5a8077_c8fefc14fba54696a881e0533d995dfa.pdf",
    asset: "/assets/documents/enrichment-pickup-map.pdf",
    sha256: "a71891b4e809ca1295867b8832d306f3d73d0e75a71decd88ee494b87ba987b7",
    bytes: 926286,
  }),
]);
const documents = new Map(legacyDocuments.map(({ source, asset }) => [source, asset]));

/**
 * Apply to the COMPLETE rendered document, AFTER the normal rich-content
 * sanitizer and AFTER replacing legacy checkout/RSVP CTAs. This is a link
 * migration pass, NOT a sanitizer. It never inserts parsed HTML or changes
 * the sanitizer allowlist. Script/JSON payloads are deliberately untouched.
 *
 * routes: Set of every final rendered page.slug ("" is home), NOT alias URLs.
 * slug: current page.slug; use "" for root-level files such as 404.html.
 * baseUrl: deployment URL including trailing slash, e.g.
 *          https://montlake-pta.github.io/website/ or the eventual own origin.
 * allowLegacyTransactions: explicit transitional opt-in, default false. Only
 *          <a data-legacy-transaction="true" href="..."> handoffs may retain
 *          known old-host destinations. Their marker and labels remain intact;
 *          unknown/unsafe targets and all other links still use normal checks.
 *          This is NOT cutover readiness: the strict readiness checker must
 *          continue rejecting the retained markers until transactions migrate.
 *
 * Known legacy links become depth-relative links with exact query/hash bytes.
 * Already-correct relative links and same-origin canonical metadata stay put.
 * Visible body URL text becomes an absolute deployment URL for copy/paste.
 * Missing routes and old-host same-page handoffs are build errors, not "#".
 */
export function rewriteCutoverLinks(html, { slug = "", routes, baseUrl, allowLegacyTransactions = false } = {}) {
  if (typeof html !== "string") throw new Error("Cutover HTML must be a string");
  if (!(routes instanceof Set)) throw new Error("Cutover routes must be a Set");
  if (typeof allowLegacyTransactions !== "boolean") throw new Error("allowLegacyTransactions must be a boolean");
  const canonical = new Set([...routes].map(routeKey));
  const current = routeKey(slug);
  const base = deploymentUrl(baseUrl);
  const pageUrl = new URL(current ? `${current}/` : "", base);
  const prefix = current ? "../".repeat(current.split("/").length) : "./";
  const doc = parseDocument(html, { decodeEntities: true });
  let changed = false;

  function destination(raw, { navigation = false, literal = false, preserveLegacyTransaction = false } = {}) {
    // URL syntax trims ASCII boundary whitespace, not Unicode whitespace:
    // trailing NBSPs are part of one reviewed legacy event's exact identity.
    const value = raw.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, "");
    if (!value || /^[?#]/.test(value) || /^(?!https?:)[a-z][a-z0-9+.-]*:/i.test(value)) return null;
    let parsed;
    try { parsed = new URL(value, pageUrl); }
    catch {
      if (/montlakepta\.org/i.test(value) || value.startsWith("/")) fail("Invalid internal URL", value);
      return null;
    }
    const absolute = /^(?:https?:)?\/\//i.test(value);
    const retired = retiringHosts.has(parsed.hostname);
    const ownOrigin = parsed.origin === base.origin;
    if (absolute && !retired && !ownOrigin) return null;
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password || (retired && parsed.port)) fail("Unsafe internal authority", value);
    if (/[\u0000-\u001f\u007f]/u.test(value) || value.split(/[?#]/, 1)[0].includes("\\")) {
      fail("Unsafe internal URL", value);
    }

    // Inspect BEFORE URL's dot-segment normalization. Only literal ../ in
    // already-relative site links is allowed, and cannot escape deploymentBase.
    const rawPath = pathOnly(value);
    const relative = !absolute && !value.startsWith("/");
    const existingAsset = (!absolute || ownOrigin) && parsed.pathname.startsWith(`${base.pathname}assets/`);
    const decodedRaw = decodePath(rawPath, value, existingAsset);
    const encodedDot = rawPath.split("/").some((part) => {
      const decodedPart = decodeURIComponent(part);
      return (decodedPart === "." || decodedPart === "..") && part !== decodedPart;
    });
    if ((!relative && hasDotSegment(decodedRaw)) || encodedDot) {
      fail("Unsafe internal path", value);
    }
    if (relative && !parsed.pathname.startsWith(base.pathname)) fail("Internal path escapes deployment base", value);

    const prefixed = base.pathname !== "/" && parsed.pathname.startsWith(base.pathname);
    // Legacy absolute URLs refer to the old domain root, not the preview base.
    const pathname = prefixed && (!retired || ownOrigin || !absolute)
      ? `/${parsed.pathname.slice(base.pathname.length)}` : parsed.pathname;
    const decoded = decodePath(pathname, value, existingAsset);
    if (hasDotSegment(decoded) || decoded.includes("//")) fail("Unsafe internal path", value);
    const alias = resolveLegacyEventAlias(pathname);
    if (!alias && /%2f/i.test(rawPath)) fail("Unreviewed encoded slash", value);
    // Preserve authored asset URL bytes, including percent-encoded spaces and
    // Unicode filenames. Asset existence remains the build validator's job.
    if (existingAsset) return literal ? parsed.href : null;
    const document = documents.get(decoded);
    const route = (alias || decoded).replace(/^\//, "").replace(/\/$/, "");
    // Only already-local assets use the build's asset namespace. An arbitrary
    // /assets/... address on the old frontend is not evidence of a local file.
    const asset = isSiteAsset(decoded) && (!absolute || ownOrigin);
    if (!document && !alias && !asset && !canonical.has(route)) {
      // Ordinary relative assets belong to check-site. Unknown navigation and
      // legacy namespaces cannot quietly become a retiring dependency.
      if (relative && !navigation && !/^\/(?:events-1|_files)\//.test(decoded)) return null;
      fail("Unknown cutover target", value);
    }
    if (alias && !canonical.has(route)) fail("Missing reviewed alias target", alias);
    // Only the explicitly marked anchor's own href gets this exception. Keep
    // route/authority/path validation above it; never exempt a whole subtree.
    if (preserveLegacyTransaction && absolute && retired && !document && !asset) return null;
    if (navigation && retired && !ownOrigin && !document && !asset && route === current) {
      fail("Legacy same-page handoff must be replaced", value);
    }
    const targetPath = document || (asset ? decoded : `/${route}${route ? "/" : ""}`);
    const suffix = value.slice(value.search(/[?#]/) < 0 ? value.length : value.search(/[?#]/));
    const absoluteTarget = `${base.href}${targetPath.slice(1)}${suffix}`;
    if (literal) return absoluteTarget;
    if (!alias && !document && ((absolute && ownOrigin && (prefixed || base.pathname === "/")) ||
        (!absolute && (relative || prefixed || base.pathname === "/")))) return null;
    return `${prefix}${targetPath.slice(1)}${suffix}`;
  }

  function visit(node, body = false, skipText = false) {
    body ||= node.name === "body";
    skipText ||= untouchedText.has(node.name);
    if (node.attribs) {
      skipText ||= node.name === "a" && /^(?:mailto|tel):/i.test(node.attribs.href || "");
      const marked = node.attribs["data-legacy-transaction"] === "true";
      const preserveLegacyTransaction = marked && allowLegacyTransactions && node.name === "a" && Boolean(node.attribs.href);
      if (marked && !preserveLegacyTransaction) {
        fail("Legacy transaction handoff must be replaced", node.attribs.href || node.attribs.action || "/");
      }
      // Do not relabel a retained handoff with the new site's address. Child
      // URL attributes are still processed individually by the normal visitor.
      skipText ||= preserveLegacyTransaction;
      for (const [attribute, value] of Object.entries(node.attribs)) {
        if (urlAttributes.has(attribute)) {
          const navigation = (attribute === "href" && ["a", "area"].includes(node.name)) ||
            ["action", "formaction"].includes(attribute);
          const next = destination(value, {
            navigation,
            preserveLegacyTransaction: preserveLegacyTransaction && attribute === "href",
          });
          if (next !== null && next !== value) {
            node.attribs[attribute] = next;
            changed = true;
          }
        } else if (attribute === "srcset") {
          // Wix CDN/data URLs are not parsed or reserialized. Replace only
          // retiring-host candidates, keeping all descriptors and separators.
          const next = value.replace(/(?:https?:)?\/\/(?:www\.)?montlakepta\.org(?=[:/])[^\s,]+/gi,
            (url) => destination(url) ?? url);
          if (next !== value) { node.attribs[attribute] = next; changed = true; }
        }
      }
    }
    if (node.type === "text" && body && !skipText) {
      const next = node.data.replace(literalUrls, (url) => {
        // Prose punctuation is not part of the copyable address. Parentheses
        // inside reviewed aliases remain meaningful.
        let tail = "";
        while (/[.,;']$/.test(url) || (url.endsWith(")") && count(url, ")") > count(url, "("))) {
          tail = url.slice(-1) + tail;
          url = url.slice(0, -1);
        }
        const full = /^(?:https?:)?\/\//i.test(url) ? url : `https://${url}`;
        return (destination(full, { literal: true }) ?? url) + tail;
      });
      if (next !== node.data) { node.data = next; changed = true; }
    }
    for (const child of node.children || []) visit(child, body, skipText);
  }
  visit(doc);
  // UTF-8 retains literal typography required by the site's parity checks.
  // Text/attribute escaping still prevents authored URL text becoming markup.
  return changed ? getOuterHTML(doc, { encodeEntities: "utf8" }) : html;
}

function count(value, character) {
  return value.split(character).length - 1;
}

function routeKey(value) {
  if (typeof value !== "string") throw new Error("Invalid cutover route inventory");
  const key = value.replace(/^\//, "").replace(/\/$/, "");
  if (value.startsWith("//") ||
      (key && (!/^[a-zA-Z0-9_~.-]+(?:\/[a-zA-Z0-9_~.-]+)*$/.test(key) || hasDotSegment(key)))) {
    fail("Invalid cutover route", value);
  }
  return key;
}

function deploymentUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Invalid cutover baseUrl"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(url.pathname) ||
      pathOnly(String(value)) !== url.pathname || /[\u0000-\u0020\u007f\\]/u.test(String(value))) {
    throw new Error("Invalid cutover baseUrl");
  }
  return url;
}

function pathOnly(value) {
  return value.replace(/^(?:https?:)?\/\/[^/?#]*/i, "").split(/[?#]/, 1)[0] || "/";
}

function decodePath(path, original, allowSpaces = false) {
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { fail("Invalid internal path encoding", original); }
  if (/[%?#\\\u0000-\u001f\u007f]/u.test(decoded) || (!allowSpaces && decoded.includes(" "))) {
    fail("Unsafe internal path encoding", original);
  }
  return decoded;
}

function hasDotSegment(path) {
  return path.split("/").some((segment) => segment === "." || segment === "..");
}

function isSiteAsset(path) {
  return /^\/assets\/[a-zA-Z0-9_./~-]+$/.test(path) ||
    /^\/(?:styles\.css|site\.js|transactions\.js|legacy-event-aliases\.js|robots\.txt|sitemap\.xml|404\.html)$/.test(path);
}

function fail(message, value) {
  // Never include credentials, a query, a fragment, or arbitrary control
  // characters in build diagnostics.
  const input = String(value);
  const safeInput = /^[a-z][a-z0-9+.-]*:/i.test(input) && !/^https?:\/\//i.test(input) ? "/[invalid]" : input;
  const path = pathOnly(safeInput).replace(/[^\x21-\x7e]|[<>"`\\]/gu,
    (character) => encodeURIComponent(character.toWellFormed())).slice(0, 200);
  throw new Error(`${message}: ${path.startsWith("/") ? path : `/${path}`}`);
}

/**
 * Call once during normal build generation, after src/assets is copied:
 * await emitLegacyDocuments(outputDir).
 * Only the two reviewed old _files/ugd paths are written, never a redirect or
 * re-encoded PDF. Canonical assets are copied by the existing build asset step.
 * No network access; hashes make accidental binary replacement a hard error.
 */
export async function emitLegacyDocuments(outputDir) {
  if (typeof outputDir !== "string" || !outputDir || /^[a-z][a-z0-9+.-]*:/i.test(outputDir)) {
    throw new Error("Document outputDir must be a filesystem directory");
  }
  const root = resolve(outputDir);
  const files = await Promise.all(legacyDocuments.map(async (document) => {
    const source = new URL(`../src${document.asset}`, import.meta.url);
    const stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Invalid document asset: ${document.asset}`);
    const bytes = await readFile(source);
    if (bytes.subarray(0, 4).toString() !== "%PDF" || bytes.length !== document.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== document.sha256) {
      throw new Error(`Document integrity check failed: ${document.asset}`);
    }
    return { path: document.source.slice(1), bytes };
  }));
  await mkdir(root, { recursive: true });
  // Validate the whole batch before writing anything. Check the output root
  // itself as well as every child: symlinks must never escape the build tree.
  for (const file of files) await assertVacant(root, file.path);
  for (const file of files) {
    const destination = join(root, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes, { flag: "wx" });
  }
  return { documentCount: files.length, files: files.map(({ path }) => path) };
}

async function assertVacant(root, path) {
  const parts = path.split("/");
  let current = root;
  for (let index = -1; index < parts.length; index += 1) {
    if (index >= 0) current = join(current, parts[index]);
    let stat;
    try { stat = await lstat(current); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    if (stat.isSymbolicLink()) throw new Error(`Refusing document output symlink: /${path}`);
    if (index === parts.length - 1 || !stat.isDirectory()) {
      throw new Error(`Refusing to overwrite document output: /${path}`);
    }
  }
}
