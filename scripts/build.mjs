import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pages, preserveCollectionRoutes, preserveRetiredProductRoutes, site, transactionPages } from "../src/site.mjs";
import { mergeWixContent } from "./render-wix-content.mjs";
import { mergeNewsletterContent } from "./render-newsletters.mjs";
import { emitLegacyEventAliases } from "./legacy-event-aliases.mjs";
import { visitorConfiguration } from "./visitor-config.mjs";
import { build as bundleJavaScript } from "esbuild";
import { emitLegacyDocuments, rewriteCutoverLinks } from "./cutover-links.mjs";
import { renderFundraisingOverview, renderFundraisingPage } from "./render-fundraising.mjs";
import { escapeAttribute, prepareContent } from "./page-content.mjs";
import { renderBlogArticle } from "./render-blog.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const deploymentBase = new URL(site.previewUrl).pathname;
const visitor = visitorConfiguration();
const visitorUpdates = visitor.enabled || visitor.readOnly;
const wixContent = JSON.parse(await readFile(join(root, "src", "data", "wix-content.json"), "utf8"));
const calendarContent = JSON.parse(await readFile(join(root, "src", "data", "calendar-events.json"), "utf8"));
const newsletterContent = JSON.parse(await readFile(join(root, "src", "data", "newsletters.json"), "utf8"));
const renderedPages = preserveRetiredProductRoutes(preserveCollectionRoutes(mergeNewsletterContent(mergeWixContent(pages, wixContent, calendarContent.events, {
  transactionsEnabled: visitor.enabled, readOnly: visitor.readOnly,
}), newsletterContent, site.newsletterUrl)));
if (visitor.enabled) {
  for (const page of transactionPages) {
    if (renderedPages.some((existing) => existing.slug === page.slug)) throw new Error(`Reserved transaction route collision: ${page.slug}`);
    renderedPages.push(page);
  }
}
const routeInventory = new Set(renderedPages.map((page) => page.slug));

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "src", "assets"), join(output, "assets"), { recursive: true });
await emitLegacyDocuments(output);
await cp(join(root, "src", "styles.css"), join(output, "styles.css"));
await cp(join(root, "src", "site.js"), join(output, "site.js"));
if (visitorUpdates) {
  await bundleJavaScript({
    entryPoints: [join(root, "src", "wix-transactions.mjs")],
    outfile: join(output, "transactions.js"),
    bundle: true, platform: "browser", format: "esm", target: "es2022",
    minify: true, legalComments: "eof", charset: "utf8",
  });
}

for (const page of renderedPages) {
  const pageDirectory = page.slug ? join(output, page.slug) : output;
  const base = page.slug ? "../".repeat(page.slug.split("/").length) : "./";
  await mkdir(pageDirectory, { recursive: true });
  await writeFile(join(pageDirectory, "index.html"), rewriteCutoverLinks(renderPage(page, base), {
    slug: page.slug, routes: routeInventory, baseUrl: site.previewUrl,
    allowLegacyTransactions: !visitor.enabled,
  }));
}

await emitLegacyEventAliases({
  outputDir: output,
  canonicalRoutes: new Set(renderedPages.map((page) => page.slug)),
  basePath: deploymentBase,
});

await writeFile(join(output, "404.html"), rewriteCutoverLinks(renderNotFound(), {
  slug: "", routes: routeInventory, baseUrl: site.previewUrl,
}));
await writeFile(join(output, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${site.previewUrl}sitemap.xml\n`);
await writeFile(join(output, "sitemap.xml"), renderSitemap());

console.log(`Built ${renderedPages.length} pages in dist/ using ${wixContent.source} content`);

function renderPage(page, base) {
  const canonicalPath = page.slug ? `${page.slug}/` : "";
  const nav = [...site.navigation, ...(visitor.enabled ? [{ label: "Cart", slug: "cart" }] : [])]
    .map(({ label, slug }) => {
      const active = slug === page.slug ? ' aria-current="page"' : "";
      return `<a href="${base}${slug ? `${slug}/` : ""}"${active}>${label}</a>`;
    })
    .join("\n              ");
  const needsTransactions = visitorUpdates && /data-wix-(?:product-id|event-id|cart|confirmation)\b/.test(page.content || "");
  const publicConfig = JSON.stringify(visitor).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeAttribute(page.description)}">
    <meta name="theme-color" content="#111b52">
    <meta property="og:title" content="${escapeAttribute(page.title)} | ${site.name}">
    <meta property="og:description" content="${escapeAttribute(page.description)}">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${site.previewUrl}assets/school.jpg">
    ${page.notFound ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${site.previewUrl}${canonicalPath}">`}
    <link rel="icon" href="${base}assets/mark.png">
    <link rel="stylesheet" href="${base}styles.css">
    <script src="${base}site.js" defer></script>
    ${needsTransactions ? `<script id="wix-client-config" type="application/json">${publicConfig}</script><script type="module" src="${base}transactions.js"></script>` : ""}
    <title>${escapeAttribute(page.title)} | ${escapeAttribute(site.name)}</title>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <header class="site-header">
      <div class="announcement">
        <p>School hours: 7:55 AM–2:25 PM · Wednesday dismissal: 1:10 PM</p>
        <a href="${base}newsletter/">Tuesday newsletter <span aria-hidden="true">→</span></a>
      </div>
      <div class="nav-shell">
        <a class="brand" href="${base}" aria-label="${site.name} home">
          <img src="${base}assets/mark.png" alt="" width="52" height="52">
          <span><strong>Montlake</strong><small>Parent Teacher Association</small></span>
        </a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-navigation">
          <span class="menu-icon" aria-hidden="true"></span>
          <span>Menu</span>
        </button>
        <nav id="site-navigation" class="site-navigation" aria-label="Main navigation">
          ${nav}
          <a class="nav-give" href="${base}donate/">Donate</a>
        </nav>
      </div>
    </header>
    ${renderDailyTools(base)}
    <main id="main-content">
      ${page.home ? renderHome(page, base) : page.layout === "fundraising" ? renderFundraisingPage(page, base, renderedPages) : page.layout === "blog" ? renderBlogArticle(page, base) : renderContentPage(page)}
    </main>
    ${renderFooter(base)}
  </body>
</html>
`;
}

function renderHome(page, base) {
  return `
      <section class="hero">
        <div class="hero-copy">
          <h1>Rooted in Montlake.<br><em>Growing every child.</em></h1>
          <p class="hero-lede">We bring families, educators, and neighbors together to help every Montlake student learn, belong, and thrive.</p>
          <div class="button-row">
            <a class="button button-primary" href="${base}welcome-new-families/">Start here, new families</a>
            <a class="button button-secondary" href="${site.membershipUrl}">Join the PTA</a>
          </div>
        </div>
        <div class="hero-visual">
          <div class="hero-image">
            <img src="${base}assets/community.jpg" alt="Montlake Elementary teachers and staff gathered together" width="1800" height="1350">
          </div>
          <p class="hero-caption">The people who make Montlake a place to learn and belong.</p>
        </div>
      </section>

      ${page.homeFeed || renderEmptyHomeFeed(base)}

      <section class="quick-actions" aria-labelledby="quick-actions-title">
        <div class="section-heading">
          <h2 id="quick-actions-title">What do you need today?</h2>
          <p>Direct routes to the information families use most.</p>
        </div>
        <div class="action-list">
          <a class="action-item" href="${base}calendar/">
            <div><h3>School calendar</h3><p>Dates, meetings, and community events in one place.</p></div>
            <span aria-hidden="true">→</span>
          </a>
          <a class="action-item" href="${base}enrichment/">
            <div><h3>After-school enrichment</h3><p>Classes, pickup details, scholarships, and contacts.</p></div>
            <span aria-hidden="true">→</span>
          </a>
          <a class="action-item" href="${base}welcome-new-families/">
            <div><h3>New family guide</h3><p>Bell times, childcare, Kindergarten, and key accounts.</p></div>
            <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <section class="mission-section">
        <div class="mission-shell">
          <div class="mission-intro">
            <h2>More than a fundraiser. A community that <em>shows up.</em></h2>
          </div>
          <div class="mission-copy">
            <p>${escapeAttribute(site.schoolIntroduction)}</p>
            <p>Montlake PTA is an association of parents, caregivers, community members, and school staff working together for our students.</p>
            <ul class="mission-list">
              <li><span>Voice</span> Advocate for every child</li>
              <li><span>Resource</span> Connect families and schools</li>
              <li><span>Belonging</span> Build a welcoming community</li>
            </ul>
            <a class="text-link light" href="${base}advocacy/">How we advocate <span aria-hidden="true">→</span></a>
            <div class="school-resource-links">
              <a class="text-link light" href="${escapeAttribute(site.schoolReportUrl)}">Montlake school report card <span aria-hidden="true">→</span></a>
              <a class="text-link light" href="${escapeAttribute(site.friendsUrl)}">Join the friends and alumni list <span aria-hidden="true">→</span></a>
            </div>
          </div>
        </div>
      </section>

      ${renderFundraisingOverview(renderedPages, base, { home: true })}

      <section class="join-band">
        <div>
          <h2>Show up in the way that works for your family.</h2>
        </div>
        <div>
          <p>Join, volunteer, donate, or simply stay informed. Every action strengthens our school.</p>
          <div class="button-row">
            <a class="button button-primary" href="${base}join/">Become a member</a>
            <a class="button button-secondary" href="mailto:volunteer@montlakepta.org">Volunteer</a>
          </div>
        </div>
      </section>`;
}

function renderEmptyHomeFeed(base) {
  return `
    <section class="freshness-section" aria-labelledby="freshness-title">
      <div class="freshness-shell">
        <div class="freshness-heading">
          <h2 id="freshness-title">Right now at Montlake</h2>
          <p>Upcoming community dates and the newest updates from the PTA.</p>
        </div>
        <div class="freshness-empty">
          <p>New events and updates will appear here as they are published.</p>
          <a href="${base}calendar/">Open the school calendar <span aria-hidden="true">→</span></a>
        </div>
      </div>
    </section>`;
}

function renderContentPage(page) {
  const prepared = prepareContent(page.content, page.disableOutline);
  // Task-oriented guides put registration and day-of contacts ahead of the outline.
  const firstSection = page.outlineAfterIntro ? prepared.content.search(/<h2\b/i) : -1;
  const introduction = firstSection >= 0 ? prepared.content.slice(0, firstSection) : "";
  const content = firstSection >= 0 ? prepared.content.slice(firstSection) : prepared.content;
  return `
      <section class="page-hero ${page.accent || ""}${page.outlineAfterIntro ? " page-hero-guide" : ""}">
        <div>
          <h1>${escapeAttribute(page.heading || page.title)}</h1>
          <p>${escapeAttribute(page.description)}</p>
        </div>
      </section>
      <div class="content-layout${page.outlineAfterIntro ? " content-layout-guide" : ""}">
        <article class="prose">
          ${introduction}
          ${prepared.outline}
          ${content}
        </article>
        <aside class="page-aside">
          <div class="aside-card">
            <h2>We’re neighbors. Ask us.</h2>
            <p>Not sure where to start? The PTA can point you in the right direction.</p>
            <a class="text-link" href="mailto:askthepta@montlakepta.org">askthepta@montlakepta.org <span aria-hidden="true">→</span></a>
          </div>
        </aside>
      </div>`;
}

function renderFooter(base) {
  return `
    <footer class="site-footer">
      <div class="footer-main">
        <div class="footer-brand">
          <a class="brand brand-light" href="${base}">
            <img src="${base}assets/mark.png" alt="" width="52" height="52">
            <span><strong>Montlake</strong><small>Parent Teacher Association</small></span>
          </a>
          <p>Working together so every child can learn, belong, and thrive.</p>
        </div>
        <div>
          <h2>Explore</h2>
          <a href="${base}event-list/">Events</a>
          <a href="${base}advocacy/">Advocacy</a>
          <a href="${base}budget/">PTA budget</a>
          <a href="${base}shop/">Seasonal shop</a>
        </div>
        <div>
          <h2>Connect</h2>
          <a href="${base}newsletter/">Weekly newsletter</a>
          <a href="mailto:askthepta@montlakepta.org">Email the PTA</a>
          <a href="https://www.facebook.com/montlakepta">Facebook</a>
          <a href="https://www.instagram.com/montlakepta">Instagram</a>
        </div>
        <div>
          <h2>Visit</h2>
          <address>Montlake Elementary PTA<br>2025 E Calhoun Street<br>Seattle, WA 98112</address>
          <a href="tel:+12062523300">(206) 252-3300</a>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© ${new Date().getFullYear()} Montlake PTA · 501(c)(3) · Tax ID 91-1117733</p>
        <p>Built for our school community.</p>
      </div>
    </footer>`;
}

function renderDailyTools(base) {
  return `
    <nav class="daily-tools" aria-label="Frequently used school links">
      <div>
        <a href="${base}calendar/">${icon("calendar")}<span><strong>Calendar</strong><small>Dates & events</small></span></a>
        <a href="${base}newsletter/">${icon("newsletter")}<span><strong>Weekly update</strong><small>PTA newsletter</small></span></a>
        <a href="${base}enrichment/">${icon("backpack")}<span><strong>After school</strong><small>Care & enrichment</small></span></a>
        <a href="mailto:montlake.attendance@seattleschools.org">${icon("check")}<span><strong>Report absence</strong><small>Email attendance</small></span></a>
      </div>
    </nav>`;
}

function icon(name) {
  const paths = {
    calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M7 3.5v4M17 3.5v4M3.5 10h17"/><path d="M8 14h2M14 14h2M8 17h2M14 17h2"/>',
    newsletter: '<path d="M4 5.5h16v13H4z"/><path d="m4 7 8 6 8-6"/><path d="m4 18 6-6M20 18l-6-6"/>',
    backpack: '<path d="M7 8V6.5A5 5 0 0 1 12 2a5 5 0 0 1 5 4.5V8"/><rect x="5" y="7" width="14" height="15" rx="3"/><path d="M8 14h8M8 18h8M5 12H3v6h2M19 12h2v6h-2"/>',
    check: '<path d="M5 4h14v17H5z"/><path d="M9 4V2.5h6V4M8.5 12l2.2 2.2 4.8-5"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function renderNotFound() {
  const home = pages.find((page) => page.home);
  return renderPage({
    ...home,
    home: false,
    slug: "404",
    notFound: true,
    title: "Page not found",
    heading: "We couldn’t find that page.",
    description: "The page may have moved during our website redesign.",
    content: `<p><a class="button button-primary" href="${escapeAttribute(deploymentBase)}">Return home</a></p>`,
  }, deploymentBase).replace("</head>", `<script src="${escapeAttribute(deploymentBase)}legacy-event-aliases.js" defer></script>\n  </head>`);
}

function renderSitemap() {
  const urls = renderedPages
    .map((page) => `  <url><loc>${site.previewUrl}${page.slug ? `${page.slug}/` : ""}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
