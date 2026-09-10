import { lstat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import reviewedAliases from "../src/data/legacy-event-aliases.json" with { type: "json" };

// Compatibility metadata, not event content. Changes require a reviewed source
// record match; do not derive targets with the normal Wix slug normalizer.
// The two already-broken legacy aliases in docs/content-parity.md are omitted.
export const legacyEventAliases = Object.freeze(reviewedAliases.map((alias) => Object.freeze(alias)));
const recoveryFilename = "legacy-event-aliases.js";

/**
 * Call AFTER writing canonical pages, passing renderedPages' slugs as a Set:
 * await emitLegacyEventAliases({
 *   outputDir: output,
 *   canonicalRoutes: new Set(renderedPages.map((page) => page.slug)),
 *   basePath: new URL(site.previewUrl).pathname,
 * });
 *
 * Include <script src="/website/legacy-event-aliases.js" defer></script> ONLY
 * in 404.html (use the same basePath, not a depth-relative URL). Some hosts
 * reject encoded slashes before looking for a decoded directory; the 404-only
 * asset recovers exactly these reviewed paths without changing unknown 404s.
 * No changes to site.js are needed. Do not add these artifacts to the sitemap.
 *
 * Stubs use static meta refresh + location.replace, NOT HTTP 301 redirects.
 * Root-relative links remain correct with/without a trailing slash and when
 * %2F in an old slug becomes an additional directory level.
 */
export async function emitLegacyEventAliases({
  outputDir,
  canonicalRoutes,
  basePath = "/",
  aliases = legacyEventAliases,
}) {
  if (typeof outputDir !== "string" || !outputDir || /^[a-z][a-z0-9+.-]*:/i.test(outputDir)) {
    throw new Error("outputDir must be a filesystem directory");
  }
  validateBasePath(basePath);
  const targets = compileAliases(aliases);
  if (!(canonicalRoutes instanceof Set)) throw new Error("canonicalRoutes must be a Set of site routes");
  const canonical = new Set([...canonicalRoutes].map(canonicalKey));
  const occupied = new Set([...canonical].map(filesystemKey));
  for (const [source, target] of targets) {
    if (!canonical.has(canonicalKey(target))) throw new Error(`Missing canonical target: ${target}`);
    if (occupied.has(filesystemKey(canonicalKey(source)))) {
      throw new Error(`Alias collides with canonical route: ${source}`);
    }
  }

  const files = [...targets].map(([source, target]) => ({
    path: `${source.slice(1)}/index.html`,
    content: renderRedirect(`${basePath}${target.slice(1)}`),
  }));
  files.push({ path: recoveryFilename, content: renderRecoveryScript(basePath, targets) });
  const plannedPaths = new Set(files.map((file) => filesystemKey(file.path)));
  for (const path of plannedPaths) {
    const parts = path.split("/");
    for (let depth = 1; depth < parts.length; depth += 1) {
      if (plannedPaths.has(parts.slice(0, depth).join("/"))) {
        throw new Error(`Alias output collision: ${path}`);
      }
    }
  }
  const root = resolve(outputDir);
  await mkdir(root, { recursive: true });

  // Preflight the ENTIRE batch before writing: a late collision must not leave
  // a partially published alias set. Also reject symlinks inside outputDir.
  for (const file of files) await assertVacant(root, file.path);
  for (const target of new Set(targets.values())) {
    let stat;
    try {
      stat = await lstat(join(root, target.slice(1), "index.html"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!stat?.isFile()) throw new Error(`Missing canonical output page: ${target}`);
  }
  for (const file of files) {
    const destination = join(root, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.content, { flag: "wx" });
  }
  return {
    aliasCount: targets.size,
    files: files.map((file) => file.path),
    recoveryScriptPath: `${basePath}${recoveryFilename}`,
  };
}

/** Testable equivalent of the 404 asset. Input is location.pathname, not a URL.
 * Query strings and hashes are deliberately not copied to the destination.
 */
export function resolveLegacyEventAlias(pathname, { basePath = "/", aliases = legacyEventAliases } = {}) {
  validateBasePath(basePath);
  return resolvePath(pathname, basePath, compileAliases(aliases));
}

function validateBasePath(basePath) {
  if (typeof basePath !== "string" || !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) {
    throw new Error("basePath must be a root-relative directory path, for example /website/");
  }
}

function compileAliases(aliases) {
  if (!Array.isArray(aliases)) throw new Error("aliases must be an array");
  const targets = new Map();
  const filesystemKeys = new Set();
  for (const alias of aliases) {
    const source = alias?.source;
    const target = alias?.target;
    if (typeof source !== "string" || !source.startsWith("/events-1/") || source.endsWith("/")) {
      throw new Error(`Invalid legacy source: ${source}`);
    }
    let decoded;
    try {
      decoded = decodeURIComponent(source);
    } catch {
      throw new Error(`Invalid source encoding: ${source}`);
    }
    if (/[%?#\\\u0000-\u0020\u007f]/u.test(decoded) ||
        decoded.split("/").slice(1).some((part) => !part || part === "." || part === "..")) {
      throw new Error(`Unsafe legacy source: ${source}`);
    }
    if (typeof target !== "string" || !/^\/event-details\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(target)) {
      throw new Error(`Invalid canonical target: ${target}`);
    }
    // Collision checking only: lookup NEVER folds case, whitespace, Unicode,
    // or punctuation. This also catches collisions on case-insensitive disks.
    const key = filesystemKey(decoded);
    if (filesystemKeys.has(key)) throw new Error(`Duplicate alias source: ${source}`);
    filesystemKeys.add(key);
    targets.set(decoded, target);
  }
  return targets;
}

function canonicalKey(route) {
  if (typeof route !== "string" || /[?#\\\u0000-\u0020\u007f]/u.test(route)) {
    throw new Error(`Invalid canonical route: ${route}`);
  }
  let path;
  try {
    path = decodeURIComponent(route.replace(/^\//, "").replace(/\/$/, ""));
  } catch {
    throw new Error(`Invalid canonical route encoding: ${route}`);
  }
  if (path && (path.split("/").some((part) => !part || part === "." || part === "..") ||
      /[%?#\\\u0000-\u0020\u007f]/u.test(path) || /^[a-z]+:/i.test(path))) {
    throw new Error(`Unsafe canonical route: ${route}`);
  }
  return path;
}

function filesystemKey(path) {
  return path.normalize("NFC").toLowerCase();
}

// Self-contained: the generated importless asset uses this exact function.
// Decode once, remove at most one terminal slash, then perform an exact lookup.
function resolvePath(pathname, basePath, targets) {
  if (typeof pathname !== "string") return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith(basePath)) return null;
  const source = `/${decoded.slice(basePath.length)}`.replace(/\/$/, "");
  const target = targets.get(source);
  return target ? `${basePath}${target.slice(1)}` : null;
}

function renderRecoveryScript(basePath, targets) {
  return `// Generated legacy-event allowlist. Load only on the not-found page.
(() => {
  const targets = new Map(${JSON.stringify([...targets])});
  const target = (${resolvePath.toString()})(window.location.pathname, ${JSON.stringify(basePath)}, targets);
  if (target) window.location.replace(target);
})();
`;
}

function renderRedirect(target) {
  // target consists solely of validated basePath + ASCII canonical slug.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,follow">
    <link rel="canonical" href="${target}">
    <meta http-equiv="refresh" content="0;url=${target}">
    <script>window.location.replace(${JSON.stringify(target)});</script>
    <title>Event details | Montlake PTA</title>
  </head>
  <body>
    <main>
      <h1>Event details</h1>
      <p>This event has a new address. <a href="${target}">Continue to the event</a>.</p>
    </main>
  </body>
</html>
`;
}

async function assertVacant(root, relativePath) {
  const parts = relativePath.split("/");
  let current = root;
  for (let index = -1; index < parts.length; index += 1) {
    if (index >= 0) current = join(current, parts[index]);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Refusing output symlink: ${current}`);
    if (index === parts.length - 1 || !stat.isDirectory()) {
      throw new Error(`Refusing to overwrite existing output: ${current}`);
    }
  }
}
