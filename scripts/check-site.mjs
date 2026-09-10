import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pages } from "../src/site.mjs";
import { mergeWixContent } from "./render-wix-content.mjs";
import { mergeNewsletterContent } from "./render-newsletters.mjs";
import { createNewsletterSnapshot } from "./sync-newsletters.mjs";
import { createCalendarSnapshot } from "./sync-calendar.mjs";
import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import { textContent } from "domutils";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const failures = [];
const wixContent = JSON.parse(await readFile(join(root, "src", "data", "wix-content.json"), "utf8"));
const calendarContent = JSON.parse(await readFile(join(root, "src", "data", "calendar-events.json"), "utf8"));
const newsletterContent = JSON.parse(await readFile(join(root, "src", "data", "newsletters.json"), "utf8"));
const renderedPages = mergeNewsletterContent(mergeWixContent(pages, wixContent, calendarContent.events), newsletterContent, "https://example.com/signup");

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

for (const asset of ["styles.css", "site.js", "legacy-event-aliases.js", "assets/mark.png", "assets/school.jpg", "assets/community.jpg", "assets/donate-science-fair.jpg", "sitemap.xml", "404.html"]) {
  try {
    await access(join(output, asset));
  } catch {
    failures.push(`dist/${asset}: missing asset`);
  }
  const notFoundHtml = await readFile(join(output, "404.html"), "utf8");
  if (!notFoundHtml.includes('src="/website/legacy-event-aliases.js"')
    || !notFoundHtml.includes('href="/website/styles.css"')) {
    failures.push("Deep legacy/unknown paths lack root-relative not-found recovery or styling");
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

const enrichmentFallback = pages.find((page) => page.slug === "enrichment");
const enrichmentFromCms = mergeWixContent(
  pages.map((page) => page.slug === "enrichment" ? { ...page, content: "<p>Fallback must not win.</p>" } : page),
  {
    schemaVersion: 1,
    blogPosts: [],
    events: [],
    products: [],
    storeCollections: [],
    cms: {
      boardMembers: [],
      pages: [{
        slug: "enrichment",
        title: enrichmentFallback.title,
        heading: enrichmentFallback.heading,
        description: enrichmentFallback.description,
        body: enrichmentFallback.content,
        published: true,
      }],
    },
  },
).find((page) => page.slug === "enrichment");
const enrichmentHtml = await readFile(join(output, "enrichment", "index.html"), "utf8");
const enrichmentDocument = parseDocument(enrichmentHtml);
const enrichmentArticle = selectOne("article.prose", enrichmentDocument);
const enrichmentSections = ["Register", "Before class", "Getting to class", "Pickup", "Absences and cancellations", "Policies", "Help"];
const enrichmentLinks = [
  "https://www.6crickets.com/",
  "mailto:enrichment@montlakepta.org",
  "mailto:enrichcoordinator@montlakepta.org",
  "mailto:enrichcoordinator@montlakepta.org?subject=Enrichment%20absence",
  "mailto:enrichcoordinator@montlakepta.org?subject=Pickup%20changes",
  "mailto:meguerreroto@seattleschools.org?subject=Enrichment%20scholarship",
  "tel:+12064866036",
  "https://www.montlakepta.org/_files/ugd/5a8077_0f6074eac84f4eafaf2410e6232ae73a.pdf",
  "https://www.montlakepta.org/_files/ugd/5a8077_c8fefc14fba54696a881e0533d995dfa.pdf",
];
for (const [label, html] of [
  ["fallback", enrichmentFallback.content],
  ["CMS round-trip", enrichmentFromCms.content],
  ["generated page", enrichmentHtml],
]) {
  const document = parseDocument(html);
  const content = selectOne("article.prose", document) || document;
  const text = textContent(content).replace(/\s+/g, " ").trim();
  const headings = selectAll("h2", content).map((node) => textContent(node).trim());
  if (JSON.stringify(headings) !== JSON.stringify(enrichmentSections)) {
    failures.push(`Enrichment ${label}: required family-task sections are missing or out of order`);
  }
  const links = new Set(selectAll("a[href]", content).map((node) => node.attribs.href));
  for (const href of enrichmentLinks) {
    if (!links.has(href)) failures.push(`Enrichment ${label}: missing operational link ${href}`);
  }
  for (const requirement of [
    /confirmation email/i, /grade level/i, /allergies/i, /homeroom/i,
    /management fees/i, /onsite coordinator/i, /financial aid/i, /school counselor/i,
    /extra snack/i, /Commons area/i, /sign for/i, /attendance/i, /instructor to the classroom/i,
    /southeast garden gate/i, /identification/i, /written permission/i, /leave campus immediately/i,
    /Launch aftercare/i, /Let Grow Play Club/i, /10 minutes/i, /5:30 PM/, /drop-in fee/i,
    /confirm the current cutoff and fees/i, /even if your student is absent from school/i,
    /may not skip/i, /backup pickup plan/i, /notify families promptly/i,
    /same behavior standards/i, /school office does not manage/i,
  ]) {
    if (!requirement.test(text)) failures.push(`Enrichment ${label}: missing guidance ${requirement}`);
  }
  if (/Spring 2026|March 30|June 12|March 11|March 18/i.test(text)) {
    failures.push(`Enrichment ${label}: expired spring session dates are presented as current`);
  }
}
if (!enrichmentFromCms.outlineAfterIntro) failures.push("Enrichment CMS merge lost the guide layout flag");
if (!enrichmentArticle) failures.push("Enrichment reading surface is missing");
else {
  const outline = selectOne(".page-outline", enrichmentArticle);
  if (!outline) failures.push("Enrichment guide is missing its on-page outline");
  for (const anchor of selectAll(".page-outline a", enrichmentArticle)) {
    const id = anchor.attribs.href.slice(1);
    if (!selectAll("[id]", enrichmentArticle).some((node) => node.attribs.id === id)) {
      failures.push(`Enrichment guide has a broken outline anchor: ${id}`);
    }
  }
  if (enrichmentHtml.indexOf("Day-of help") > enrichmentHtml.indexOf('class="page-outline"')) {
    failures.push("Enrichment day-of contacts must precede the page outline");
  }
}

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

const blogHtml = await readFile(join(output, "blog", "index.html"), "utf8");
if (blogHtml.includes('class="page-outline"')) failures.push("Blog card titles were incorrectly added to an on-page outline");
if (blogHtml.includes("&amp;amp;")) failures.push("Generated content contains double-escaped entities");

const homeHtml = await readFile(join(output, "index.html"), "utf8");
if (!homeHtml.includes('class="nav-give" href="./donate/"')) failures.push("Primary navigation Donate action does not link to the landing page");
if (!homeHtml.includes('class="freshness-section"')) failures.push("Homepage is missing the Wix-backed freshness section");
if (wixContent.blogPosts.length && !homeHtml.includes('href="./post/')) {
  failures.push("Homepage is not linking to the latest Wix blog posts");
}
if (!homeHtml.includes('href="./event-list/"')) failures.push("Homepage is missing the events archive link");

const donateHtml = await readFile(join(output, "donate", "index.html"), "utf8");
if (!donateHtml.includes('class="donate-hero"')) failures.push("Donation page is missing its landing-page hero");
if (!donateHtml.includes('id="employer-matching"')) failures.push("Donation page is missing the employer-matching destination");
if (!donateHtml.includes("Explore employer matching")) failures.push("Donation page is missing its employer-matching action");
if (donateHtml.includes("Double your impact")) failures.push("Donation page makes an unsupported matching-rate claim");
if (!donateHtml.includes("75–80%")) failures.push("Donation page is missing the staffing impact proof");
if (!donateHtml.includes("Federal Tax ID 91-1117733")) failures.push("Donation page is missing nonprofit trust information");
if (!donateHtml.includes("tax-deductible to the extent allowed by law")) failures.push("Donation page dropped its qualified deductibility statement");

const budgetHtml = await readFile(join(output, "budget", "index.html"), "utf8");
if (!budgetHtml.includes('href="../donate/"')) failures.push("Budget page does not cross-link to the Donate landing page");
if (!budgetHtml.includes("See ways to give")) failures.push("Budget page is missing its donation call to action");
if (!budgetHtml.includes('href="../post/montlake-pta-family-survey-results/"') || !budgetHtml.includes("February 2026")) {
  failures.push("Budget page dropped its dated family-survey results link");
}
if (!homeHtml.includes("MontlakeFriends") || !homeHtml.includes("ViewSchoolOrDistrict/101083")
  || !homeHtml.includes("Extended Resource Special Education")) {
  failures.push("Homepage dropped school context, alumni signup, or the school report-card resource");
}
for (const [slug, markers] of [
  ["advocacy", ["5 to 10 years", "School planning updates", "closures or consolidations"]],
  ["fall-fundraiser-2025", ["Past campaign:", "$125,000", "$1,500", "0.50 Art", "0.4 Academic", "0.2 Office", "Equity Fund", "Lowell"]],
  ["spring-auction", ["2025–2026 spending plan", "$197,202", "$29,000", "$22,625", "$12,075", "$10,900", "$8,785", "$1,900"]],
]) {
  const html = await readFile(join(output, slug, "index.html"), "utf8");
  for (const marker of markers) {
    if (!html.includes(marker)) failures.push(`${slug} dropped restored content: ${marker}`);
  }
}

const freshHome = mergeWixContent(pages, {
  schemaVersion: 1,
  source: "test",
  blogPosts: [{
    slug: "current-update",
    title: "Current update",
    excerpt: "Fresh school news",
    publishedAt: "2099-01-01T12:00:00Z",
  }],
  events: [
    {
      slug: "future-event",
      title: "Future event",
      startAt: "2099-02-01T18:00:00Z",
      endAt: null,
    },
    {
      slug: "multi-day-event",
      title: "Multi-day event",
      startAt: "2099-02-02T18:00:00Z",
      endAt: "2099-02-04T02:00:00Z",
    },
    {
      slug: "past-event",
      title: "Past event",
      startAt: "2000-02-01T18:00:00Z",
      endAt: null,
    },
  ],
  products: [],
  storeCollections: [],
  cms: { boardMembers: [], pages: [] },
}, [{
  id: "google-event",
  title: "Google calendar event",
  startAt: "2099-01-15T08:00:00.000Z",
  endAt: "2099-01-16T08:00:00.000Z",
  allDay: true,
  source: "google-calendar",
}]).find((page) => page.home)?.homeFeed || "";
if (!freshHome.includes("./post/current-update/")) failures.push("Fresh homepage feed omitted a current blog post");
if (!freshHome.includes("./event-details/future-event/")) failures.push("Fresh homepage feed omitted an upcoming event");
if (!freshHome.includes("Google calendar event") || !freshHome.includes('href="./calendar/"')) {
  failures.push("Fresh homepage feed omitted a Google Calendar event");
}
if (!freshHome.includes("Feb 2, 2099") || !freshHome.includes("Feb 3, 2099")) {
  failures.push("Fresh homepage feed did not show both dates for a multi-day event");
}
if (freshHome.includes("./event-details/past-event/")) failures.push("Fresh homepage feed included an expired event without an end date");
if (!freshHome.includes("home-post-no-image")) failures.push("Image-free homepage posts do not use the single-column layout");

const dedupedHome = mergeWixContent(pages, {
  schemaVersion: 1,
  source: "test",
  blogPosts: [],
  events: [{
    slug: "shared-event",
    title: "Café Night",
    startAt: "2099-03-01T18:00:00Z",
    endAt: "2099-03-01T19:00:00Z",
  }],
  products: [],
  storeCollections: [],
  cms: { boardMembers: [], pages: [] },
}, [{
  id: "shared-google-event",
  title: "Cafe Night",
  startAt: "2099-03-01T20:00:00Z",
  endAt: "2099-03-01T21:00:00Z",
  source: "google-calendar",
}]).find((page) => page.home)?.homeFeed || "";
if (!dedupedHome.includes("./event-details/shared-event/")) failures.push("Mixed event deduplication did not prefer the Wix detail route");
if ((dedupedHome.match(/Caf(?:e|é) Night/g) || []).length !== 1) failures.push("Mixed event deduplication rendered a duplicate accented title/date event");

const canceledDuplicateHome = mergeWixContent(pages, {
  schemaVersion: 1,
  source: "test",
  blogPosts: [],
  events: [{
    slug: "canceled-shared-event",
    title: "Canceled shared event",
    startAt: "2000-04-01T18:00:00Z",
    endAt: "2000-04-01T19:00:00Z",
    status: "CANCELED",
  }],
  products: [],
  storeCollections: [],
  cms: { boardMembers: [], pages: [] },
}, [{
  id: "canceled-google-event",
  title: "Canceled shared event",
  startAt: "2000-04-01T20:00:00Z",
  endAt: "2099-04-02T21:00:00Z",
  source: "google-calendar",
}]).find((page) => page.home)?.homeFeed || "";
if (canceledDuplicateHome.includes("Canceled shared event")) failures.push("A canceled Wix event did not suppress its Google Calendar duplicate");

const nonLatinHome = mergeWixContent(pages, {
  schemaVersion: 1,
  source: "test",
  blogPosts: [],
  events: [],
  products: [],
  storeCollections: [],
  cms: { boardMembers: [], pages: [] },
}, [
  { id: "japanese-event", title: "学校", startAt: "2099-05-01T18:00:00Z", source: "google-calendar" },
  { id: "arabic-event", title: "مهرجان", startAt: "2099-05-01T20:00:00Z", source: "google-calendar" },
]).find((page) => page.home)?.homeFeed || "";
if (!nonLatinHome.includes("学校") || !nonLatinHome.includes("مهرجان")) {
  failures.push("Unicode event titles collided during mixed-source deduplication");
}

const symbolHome = mergeWixContent(pages, {
  schemaVersion: 1,
  source: "test",
  blogPosts: [],
  events: [],
  products: [],
  storeCollections: [],
  cms: { boardMembers: [], pages: [] },
}, [
  { id: "celebration-event", title: "🎉", startAt: "2099-06-01T18:00:00Z", source: "google-calendar" },
  { id: "pumpkin-event", title: "🎃", startAt: "2099-06-01T20:00:00Z", source: "google-calendar" },
]).find((page) => page.home)?.homeFeed || "";
if (!symbolHome.includes("🎉") || !symbolHome.includes("🎃")) {
  failures.push("Symbol-only event titles collided during mixed-source deduplication");
}

const calendarFixture = await createCalendarSnapshot({
  calendarUrl: "https://calendar.google.com/calendar/ical/test/public/basic.ics",
  now: new Date("2099-01-01T00:00:00Z"),
  fetchImpl: async () => ({
    ok: true,
    text: async () => `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:single
DTSTART;VALUE=DATE:20990103
DTEND;VALUE=DATE:20990104
SUMMARY:Single school event
DESCRIPTION:Private meeting details must not be stored
LOCATION:PIN 123456 / Access-code 654321
END:VEVENT
BEGIN:VEVENT
UID:weekly
DTSTART:20990104T180000Z
DTEND:20990104T190000Z
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Weekly school event
LOCATION:Original room
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID:20990111T180000Z
DTSTART:20990111T180000Z
DTEND:20990111T190000Z
STATUS:CANCELLED
SUMMARY:Weekly school event
LOCATION:Canceled room
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID:20990118T180000Z
DTSTART:20990118T200000Z
DTEND:20990118T210000Z
STATUS:TENTATIVE
SUMMARY:Weekly school event
LOCATION:New room
END:VEVENT
END:VCALENDAR`,
  }),
});
if (calendarFixture.events.length !== 3) failures.push("Google Calendar sync did not expand recurring events");
if (JSON.stringify(calendarFixture).includes("Private meeting details")) failures.push("Google Calendar snapshot retained event descriptions");
if (calendarFixture.syncedAt !== "2099-01-01T00:00:00.000Z") failures.push("Google Calendar snapshot timestamp is not deterministic");
if (calendarFixture.events.find((event) => event.title === "Single school event")?.startAt !== "2099-01-03T08:00:00.000Z") {
  failures.push("Google Calendar all-day event was not normalized to the Los Angeles date boundary");
}
if (JSON.stringify(calendarFixture).includes("Canceled room")) failures.push("Google Calendar snapshot retained a canceled recurrence override");
if (!calendarFixture.events.some((event) => event.location === "New room")) failures.push("Google Calendar snapshot ignored an effective recurrence override location");
if (!calendarFixture.events.some((event) => event.location === "New room" && event.status === "TENTATIVE")) {
  failures.push("Google Calendar snapshot discarded an effective recurrence override status");
}
if (calendarFixture.events.find((event) => event.title === "Single school event")?.location) {
  failures.push("Google Calendar snapshot retained a credential-like location");
}

const newsletterFixture = mergeNewsletterContent(pages, {
  schemaVersion: 1,
  source: "test",
  syncedAt: "2099-01-02T00:00:00Z",
  archiveId: "a07example",
  editions: [
    {
      id: "newest",
      slug: "weekly-newsletter-january-2-2099-newest",
      title: "Weekly Newsletter January 2, 2099",
      publishedAt: "2099-01-02T12:00:00Z",
      campaignUrl: "https://conta.cc/example-new",
      archiveOrder: 0,
    },
    {
      id: "older",
      slug: "weekly-newsletter-december-20-2098-older",
      title: "Weekly Newsletter December 20, 2098",
      publishedAt: "2098-12-20T12:00:00Z",
      campaignUrl: "https://myemail.constantcontact.com/example-old",
      archiveOrder: 1,
    },
  ],
}, "https://example.com/signup");
const newsletterLanding = newsletterFixture.find((page) => page.slug === "newsletter");
if (!newsletterLanding?.content.includes("Weekly Newsletter January 2, 2099")) failures.push("Newsletter landing page does not default to the latest edition");
if (!newsletterLanding?.content.includes("Sign up for the newsletter")) failures.push("Newsletter landing page is missing its signup CTA");
if (!newsletterFixture.some((page) => page.slug === "newsletter/weekly-newsletter-december-20-2098-older")) {
  failures.push("Newsletter archive did not generate a stable edition route");
}
for (const [snapshot, expected] of [
  [{ schemaVersion: 1, source: "public-archive", archiveId: "a07test", editions: [] }, "No editions have been added"],
  [{ schemaVersion: 1, source: "unconfigured", editions: [] }, "Past editions are not available"],
]) {
  const content = mergeNewsletterContent(pages, snapshot, "https://example.com/signup")
    .find((page) => page.slug === "newsletter").content;
  if (!content.includes(expected) || content.includes("not connected") || !content.includes("Sign up for the newsletter")) {
    failures.push("Newsletter empty state confuses archive availability or drops signup");
  }
}

const syncedNewsletter = await createNewsletterSnapshot({
  archiveId: "a07test",
  syncedAt: "2099-01-02T00:00:00Z",
  fetchImpl: async (url, options = {}) => {
    if (url.includes("campaignlp.constantcontact.com")) {
      return {
        ok: true,
        json: async () => [{
          subject: "Weekly Newsletter January 2, 2099",
          campaignUrl: "https://conta.cc/example",
        }],
      };
    }
    if (options.method === "HEAD" && url === "https://conta.cc/example") {
      return {
        ok: true,
        url: "https://myemail.constantcontact.com/weekly-newsletter.html?soid=example",
      };
    }
    throw new Error(`Unexpected newsletter test request: ${url}`);
  },
});
if (syncedNewsletter.editions.length !== 1) failures.push("Public newsletter sync did not normalize a non-empty archive");
if (syncedNewsletter.editions[0]?.campaignUrl !== "https://myemail.constantcontact.com/weekly-newsletter.html?soid=example") {
  failures.push("Public newsletter sync did not resolve and validate the final campaign URL");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Checked ${renderedPages.length} pages and required assets`);
