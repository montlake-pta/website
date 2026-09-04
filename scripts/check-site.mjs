import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pages } from "../src/site.mjs";
import { mergeWixContent } from "./render-wix-content.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const failures = [];
const wixContent = JSON.parse(await readFile(join(root, "src", "data", "wix-content.json"), "utf8"));
const renderedPages = mergeWixContent(pages, wixContent);

for (const page of renderedPages) {
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

const cmsRoundTrip = mergeWixContent(pages, {
  schemaVersion: 1,
  source: "test",
  blogPosts: [],
  events: [],
  products: [],
  storeCollections: [],
  cms: {
    boardMembers: [],
    pages: [{
      slug: "calendar",
      title: "Calendar",
      description: "Calendar test",
      body: '<p class="lead">Calendar</p><iframe title="Calendar" src="https://calendar.google.com/calendar/embed?src=test"></iframe><script>alert(1)</script>',
      published: true,
    }],
  },
});
const sanitizedCalendar = cmsRoundTrip.find((page) => page.slug === "calendar")?.content || "";
if (!sanitizedCalendar.includes('class="lead"')) failures.push("CMS sanitizer removed supported presentation classes");
if (!sanitizedCalendar.includes("<iframe")) failures.push("CMS sanitizer removed the Google Calendar embed");
if (sanitizedCalendar.includes("<script")) failures.push("CMS sanitizer retained executable script content");

const emptyStore = mergeWixContent(pages, {
  schemaVersion: 1,
  source: "test",
  blogPosts: [{ slug: null, title: "Invalid post" }],
  events: [],
  products: [],
  storeCollections: [],
  cms: { boardMembers: [], pages: [] },
});
if (!emptyStore.some((page) => page.slug === "shop")) failures.push("Shop route is missing when the store is empty");
if (emptyStore.some((page) => page.slug === "post/null")) failures.push("A slugless post created a post/null route");
if (emptyStore.find((page) => page.slug === "blog")?.content.includes("../post//")) {
  failures.push("A slugless post created a broken blog index link");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Checked ${renderedPages.length} pages and required assets`);
