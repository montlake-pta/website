import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import { getOuterHTML, removeElement, prependChild } from "domutils";
import * as cssTree from "css-tree";

export const digest = value => createHash("sha256").update(value).digest("hex");
export const maxAssetBytes = 25 * 1024 * 1024;
const remoteHosts = new Set(["static.wixstatic.com", "images.wixstatic.com"]);
const extensions = new Set([".css", ".woff2", ".woff", ".ttf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".svg", ".pdf"]);

export async function readWithin(root, relative) {
  if (!relative || relative.includes("\\") || relative.split("/").some(part => !part || part === "." || part === "..")
    || relative.startsWith("/") || /[\u0000-\u001f]/.test(relative)) throw new Error("Unsafe archive file path.");
  const base = await realpath(root);
  const file = await realpath(resolve(root, relative));
  if (!file.startsWith(`${base}${sep}`)) throw new Error("Archive file escapes its input directory.");
  return readFile(file);
}

export async function freezePage({ html, pageUrl, baseUrl, distDir, outputDir, fetchImpl = fetch }) {
  const base = new URL(baseUrl);
  const files = new Map();
  const cache = new Map();
  const mimeTypes = new Map([
    ["text/css", ".css"], ["font/woff2", ".woff2"], ["font/woff", ".woff"], ["font/ttf", ".ttf"],
    ["application/font-woff", ".woff"], ["application/pdf", ".pdf"], ["image/png", ".png"],
    ["image/jpeg", ".jpg"], ["image/webp", ".webp"], ["image/gif", ".gif"], ["image/x-icon", ".ico"],
  ]);
  await mkdir(join(outputDir, "assets"));

  async function resource(value, parent, chain = []) {
    const url = new URL(value, parent);
    url.hash = "";
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Archive resources require credential-free HTTPS URLs.");
    if (chain.includes(url.href)) throw new Error("Circular stylesheet dependency in fundraising archive.");
    if (cache.has(url.href)) return cache.get(url.href);
    const pending = (async () => {
      let bytes;
      let extension = extname(url.pathname).toLowerCase();
      if (url.origin === base.origin && url.pathname.startsWith(base.pathname)) {
        const relative = decodeURIComponent(url.pathname.slice(base.pathname.length));
        bytes = await readWithin(distDir, relative);
      } else {
        if (!remoteHosts.has(url.hostname)) throw new Error("Fundraising archive asset host is not approved; copy the asset locally or review its public host.");
        let response;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(30000) }); }
          catch {
            if (attempt === 2) throw new Error("Fundraising archive asset could not be downloaded; no remote error details are logged.");
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            continue;
          }
          if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
          await response.body?.cancel();
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
        if (!response.ok) throw new Error(`Fundraising archive asset download failed (HTTP ${response.status}); no live-page substitute was used.`);
        const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
        if (!mimeTypes.has(type)) throw new Error("Unsupported remote archive asset content type.");
        extension = mimeTypes.get(type);
        if (Number(response.headers.get("content-length")) > maxAssetBytes) throw new Error("Archive asset is too large.");
        const chunks = [];
        let total = 0;
        for await (const chunk of response.body) {
          total += chunk.length;
          if (total > maxAssetBytes) throw new Error("Archive asset is too large.");
          chunks.push(chunk);
        }
        bytes = Buffer.concat(chunks);
      }
      if (!extensions.has(extension) || bytes.length > maxAssetBytes || !bytes.length) throw new Error("Invalid archive asset type or size.");
      if (extension === ".svg") {
        // Only passive repository SVG assets are accepted.
        const svg = bytes.toString();
        if (/<(?:script|foreignObject)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i.test(svg)) {
          throw new Error("Archive SVG contains active or external content.");
        }
      }
      if (extension === ".css") bytes = Buffer.from(await stylesheet(bytes.toString(), url.href, [...chain, url.href]));
      const name = `${digest(bytes)}${extension}`;
      if (!files.has(name)) {
        await writeFile(join(outputDir, "assets", name), bytes, { flag: "wx" });
        files.set(name, { path: `assets/${name}`, sha256: digest(bytes), bytes: bytes.length });
      }
      return name;
    })();
    cache.set(url.href, pending);
    return pending;
  }

  async function stylesheet(css, parent, chain) {
    const ast = cssTree.parse(css);
    const urls = [];
    cssTree.walk(ast, node => {
      if (node.type === "Atrule" && /^(?:import|charset)$/i.test(node.name)) throw new Error("Archive stylesheets must be self-contained except for explicit url() assets; CSS imports are not supported.");
      if (node.type === "Url") urls.push(node);
    });
    for (const node of urls) {
      if (node.value.startsWith("#")) continue;
      node.value = await resource(node.value, parent, chain);
    }
    return cssTree.generate(ast);
  }

  const document = parseDocument(html);
  if (!selectOne("html", document) || !selectOne("head", document) || !selectOne("body", document)) {
    throw new Error("Fundraising capture is not a complete generated document.");
  }
  for (const node of selectAll("script,iframe,object,embed,base,form", document)) removeElement(node);
  for (const node of selectAll("meta", document)) {
    if (/refresh|content-security-policy/i.test(node.attribs["http-equiv"] || "")) removeElement(node);
  }
  for (const node of selectAll("*", document)) {
    for (const attribute of Object.keys(node.attribs || {})) {
      if (/^on/i.test(attribute) || ["action", "formaction", "ping", "srcdoc", "nonce", "integrity", "autofocus"].includes(attribute)) delete node.attribs[attribute];
    }
    if (node.attribs.style) throw new Error("Inline styles in a fundraising archive need explicit asset handling.");
  }
  for (const node of selectAll("style", document)) {
    const css = node.children.map(child => child.data || "").join("");
    const value = await stylesheet(css, pageUrl, []);
    // Inline CSS URLs resolve from index.html, not from the assets directory.
    const ast = cssTree.parse(value);
    cssTree.walk(ast, child => { if (child.type === "Url" && !child.value.startsWith("#")) child.value = `assets/${child.value}`; });
    node.children = parseDocument(`<style>${cssTree.generate(ast)}</style>`).children[0].children;
  }
  for (const node of selectAll("link[href]", document)) {
    if (!/^(?:stylesheet|icon)$/i.test(node.attribs.rel || "")) { removeElement(node); continue; }
    node.attribs.href = `assets/${await resource(node.attribs.href, pageUrl)}`;
  }
  for (const node of selectAll("img", document)) {
    if (!node.attribs.src) throw new Error("Archive image is missing its source.");
    node.attribs.src = `assets/${await resource(node.attribs.src, pageUrl)}`;
    node.attribs.loading = "eager";
    if (node.attribs.srcset) {
      const entries = node.attribs.srcset.split(",").map(value => value.trim().split(/\s+/));
      if (entries.some(entry => entry.length > 2 || entry[1] && !/^\d+(?:\.\d+)?[wx]$/.test(entry[1]))) throw new Error("Unsupported archive image srcset.");
      node.attribs.srcset = (await Promise.all(entries.map(async ([source, descriptor]) =>
        `assets/${await resource(source, pageUrl)}${descriptor ? ` ${descriptor}` : ""}`))).join(", ");
    }
  }
  for (const node of selectAll("source,video,audio", document)) {
    throw new Error(`Fundraising archive cannot silently omit ${node.name} media.`);
  }
  for (const node of selectAll("a[href]", document)) {
    const href = node.attribs.href;
    if (href.startsWith("#")) continue;
    const url = new URL(href, pageUrl);
    if (url.pathname.toLowerCase().endsWith(".pdf") &&
      (url.origin === base.origin || remoteHosts.has(url.hostname))) {
      node.attribs.href = `assets/${await resource(href, pageUrl)}`;
    } else {
      delete node.attribs.href;
      delete node.attribs.target;
    }
  }
  for (const node of selectAll("button,input,select,textarea", document)) node.attribs.disabled = "";
  const policy = "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
  const metadata = parseDocument(`<meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="${policy}">`);
  for (const node of [...metadata.children].reverse()) prependChild(selectOne("head", document), node);
  const frozen = getOuterHTML(document);
  const bytes = Buffer.from(frozen);
  await writeFile(join(outputDir, "index.html"), bytes, { flag: "wx" });
  return {
    sourceHtmlSha256: digest(html),
    files: [{ path: "index.html", sha256: digest(bytes), bytes: bytes.length },
      ...[...files.values()].sort((a, b) => a.path.localeCompare(b.path))],
  };
}
