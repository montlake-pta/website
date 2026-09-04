import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pages } from "../src/site.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const failures = [];

for (const page of pages) {
  const file = join(output, page.slug, "index.html");
  try {
    const html = await readFile(file, "utf8");
    if (!html.includes("<!doctype html>")) failures.push(`${file}: missing doctype`);
    if (!html.includes("<h1>")) failures.push(`${file}: missing h1`);
    if (!html.includes('href="#main-content"')) failures.push(`${file}: missing skip link`);
    if (html.includes('href="undefined')) failures.push(`${file}: undefined link`);

    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (["#", "http:", "https:", "mailto:", "tel:"].some((prefix) => href.startsWith(prefix))) continue;
      const path = href.split(/[?#]/)[0];
      const target = path.endsWith("/")
        ? join(dirname(file), path, "index.html")
        : join(dirname(file), path);
      try {
        await access(target);
      } catch {
        failures.push(`${file}: broken internal link ${href}`);
      }
    }
  } catch {
    failures.push(`${file}: missing generated page`);
  }
}

for (const asset of ["styles.css", "site.js", "assets/mark.png", "assets/school.jpg", "sitemap.xml", "404.html"]) {
  try {
    await access(join(output, asset));
  } catch {
    failures.push(`dist/${asset}: missing asset`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Checked ${pages.length} pages and required assets`);
