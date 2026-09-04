import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pages, site } from "../src/site.mjs";
import { mergeWixContent } from "./render-wix-content.mjs";
import { mergeNewsletterContent } from "./render-newsletters.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const wixContent = JSON.parse(await readFile(join(root, "src", "data", "wix-content.json"), "utf8"));
const calendarContent = JSON.parse(await readFile(join(root, "src", "data", "calendar-events.json"), "utf8"));
const newsletterContent = JSON.parse(await readFile(join(root, "src", "data", "newsletters.json"), "utf8"));
const renderedPages = mergeNewsletterContent(mergeWixContent(pages, wixContent, calendarContent.events), newsletterContent, site.newsletterUrl);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "src", "assets"), join(output, "assets"), { recursive: true });
await cp(join(root, "src", "styles.css"), join(output, "styles.css"));
await cp(join(root, "src", "site.js"), join(output, "site.js"));

for (const page of renderedPages) {
  const pageDirectory = page.slug ? join(output, page.slug) : output;
  const base = page.slug ? "../".repeat(page.slug.split("/").length) : "./";
  await mkdir(pageDirectory, { recursive: true });
  await writeFile(join(pageDirectory, "index.html"), renderPage(page, base));
}

await writeFile(join(output, "404.html"), renderNotFound());
await writeFile(join(output, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://montlake-pta.github.io/website/sitemap.xml\n");
await writeFile(join(output, "sitemap.xml"), renderSitemap());

console.log(`Built ${renderedPages.length} pages in dist/ using ${wixContent.source} content`);

function renderPage(page, base) {
  const canonicalPath = page.slug ? `${page.slug}/` : "";
  const nav = site.navigation
    .map(({ label, slug }) => {
      const active = slug === page.slug ? ' aria-current="page"' : "";
      return `<a href="${base}${slug ? `${slug}/` : ""}"${active}>${label}</a>`;
    })
    .join("\n              ");

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
    <link rel="canonical" href="${site.previewUrl}${canonicalPath}">
    <link rel="icon" href="${base}assets/mark.png">
    <link rel="stylesheet" href="${base}styles.css">
    <script src="${base}site.js" defer></script>
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
      ${page.home ? renderHome(page, base) : page.layout === "donate" ? renderDonatePage(page, base) : renderContentPage(page)}
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
            <p>Montlake PTA is an association of parents, caregivers, community members, and school staff working together for our students.</p>
            <ul class="mission-list">
              <li><span>Voice</span> Advocate for every child</li>
              <li><span>Resource</span> Connect families and schools</li>
              <li><span>Belonging</span> Build a welcoming community</li>
            </ul>
            <a class="text-link light" href="${base}advocacy/">How we advocate <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>

      <section class="impact-section">
        <div class="section-heading split-heading">
          <div>
            <h2>Stronger school.<br>Richer experiences.</h2>
          </div>
          <p>PTA funding supports staffing, student programs, community events, classroom supplies, scholarships, and equipment.</p>
        </div>
        <div class="impact-grid">
          <article><span>75–80%</span><h3>Staffing support</h3><p>The largest share of the annual PTA budget helps fund people and services not fully covered by the district.</p></article>
          <article><span>All year</span><h3>Student programs</h3><p>Art, music, enrichment, supplies, equipment, and experiences that make school memorable.</p></article>
          <article><span>Every family</span><h3>Community care</h3><p>Scholarships, welcoming events, outreach, and practical support so everyone can participate.</p></article>
        </div>
        <a class="button button-dark" href="${base}budget/">See how the budget works</a>
      </section>

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
  return `
      <section class="page-hero ${page.accent || ""}">
        <div>
          <h1>${escapeAttribute(page.heading || page.title)}</h1>
          <p>${escapeAttribute(page.description)}</p>
        </div>
      </section>
      <div class="content-layout">
        <article class="prose">
          ${prepared.outline}
          ${prepared.content}
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

function renderDonatePage(page, base) {
  const details = donationDetails(page.content);
  return `
    <section class="donate-hero">
      <div class="donate-hero-shell">
        <div class="donate-hero-copy">
          <h1>${escapeAttribute(page.heading || page.title)}</h1>
          <p>${escapeAttribute(page.description)}</p>
          <div class="button-row">
            <a class="button button-primary donate-primary" href="${site.donateUrl}">Donate securely online</a>
            <a class="button button-secondary" href="#employer-matching">Explore employer matching</a>
          </div>
          <p class="donate-assurance">Choose a one-time or recurring gift by card or bank account.</p>
        </div>
        <figure class="donate-hero-visual">
          <img src="${base}assets/donate-science-fair.jpg" alt="Student science projects displayed in the Montlake Elementary cafeteria" width="1800" height="1012">
          <figcaption>Community support helps students learn, create, perform, and belong.</figcaption>
        </figure>
      </div>
    </section>

    <section class="donate-impact" aria-labelledby="donate-impact-title">
      <div class="donate-section-heading">
        <h2 id="donate-impact-title">Your gift moves through the whole school day.</h2>
        <p>PTA funding fills practical gaps and makes more of the Montlake experience possible.</p>
      </div>
      <div class="donate-impact-list">
        <article>
          <strong>75–80%</strong>
          <div><h3>Staffing support</h3><p>The largest share of the PTA budget helps fund people and services not fully covered by the district.</p></div>
        </article>
        <article>
          <strong>All year</strong>
          <div><h3>Student experiences</h3><p>Art, music, academic support, enrichment, supplies, library books, equipment, and special projects.</p></div>
        </article>
        <article>
          <strong>Every family</strong>
          <div><h3>Access and belonging</h3><p>Scholarships, welcoming events, family support, and resources that help everyone participate.</p></div>
        </article>
      </div>
    </section>

    <section class="donate-methods" aria-labelledby="donate-methods-title">
      <div class="donate-methods-intro">
        <h2 id="donate-methods-title">Choose the way that works for you.</h2>
        <p>Every method supports the same school community. Employer matching can make a gift or volunteer time go even further.</p>
      </div>
      <div class="donate-methods-content prose">
        ${details}
      </div>
    </section>

    <section class="donate-equity">
      <div class="donate-equity-shell">
        <div>
          <h2>Giving is welcome. Belonging is not conditional.</h2>
          <p>Every Montlake family is a full member of this community, regardless of whether or how much they donate. PTA support also includes scholarships and equity support for schools with fewer fundraising resources.</p>
        </div>
        <a class="text-link light" href="mailto:fundraising@montlakepta.org">Questions about giving or matching? <span aria-hidden="true">→</span></a>
      </div>
    </section>

    <section class="donate-close">
      <div>
        <p>Montlake Community School Association is an IRS-approved 501(c)(3).</p>
        <strong>Federal Tax ID 91-1117733</strong>
      </div>
      <a class="button button-primary" href="${site.donateUrl}">Make a gift to Montlake</a>
    </section>`;
}

function donationDetails(content) {
  return content
    .replace(/^\s*<p class="lead">[\s\S]*?<\/p>\s*/i, "")
    .replace(/^\s*<p><a class="button button-primary"[\s\S]*?<\/a><\/p>\s*/i, "")
    .replace(/<div class="callout">Montlake Community School Association[\s\S]*?<\/div>/i, "")
    .replace(/<h([23])>([\s\S]*?)<\/h\1>/gi, (match, level, inner) => {
      const label = decodeHtml(inner.replace(/<[^>]+>/g, "")).trim().toLowerCase();
      if (level === "2" && label === "ways to give") return "";
      if (level === "3" && label === "employer matching") {
        return `<h3 id="employer-matching">${inner}</h3>`;
      }
      return match;
    });
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

function prepareContent(content, disableOutline = false) {
  if (disableOutline || content.includes('class="content-grid"')) return { content, outline: "" };

  const headings = [];
  const headingCounts = new Map();
  const preparedContent = content.replace(/<h2>([\s\S]*?)<\/h2>/g, (_match, heading) => {
    const label = decodeHtml(heading.replace(/<[^>]+>/g, "").trim());
    const baseId = slugify(label);
    const count = (headingCounts.get(baseId) || 0) + 1;
    headingCounts.set(baseId, count);
    const id = count === 1 ? baseId : `${baseId}-${count}`;
    headings.push({ id, label });
    return `<h2 id="${id}">${heading}</h2>`;
  });
  if (headings.length < 3) return { content: preparedContent, outline: "" };
  const links = headings.map(({ id, label }) => `<a href="#${id}">${escapeAttribute(label)}</a>`).join("");
  return {
    content: preparedContent,
    outline: `<nav class="page-outline" aria-label="On this page"><strong>On this page</strong><div>${links}</div></nav>`,
  };
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

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function renderNotFound() {
  const home = pages.find((page) => page.home);
  return renderPage({
    ...home,
    home: false,
    slug: "404",
    title: "Page not found",
    heading: "We couldn’t find that page.",
    description: "The page may have moved during our website redesign.",
    content: '<p><a class="button button-primary" href="./">Return home</a></p>',
  }, "./");
}

function renderSitemap() {
  const urls = renderedPages
    .map((page) => `  <url><loc>${site.previewUrl}${page.slug ? `${page.slug}/` : ""}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
