import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pages, site } from "../src/site.mjs";
import { mergeWixContent } from "./render-wix-content.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, "dist");
const wixContent = JSON.parse(await readFile(join(root, "src", "data", "wix-content.json"), "utf8"));
const renderedPages = mergeWixContent(pages, wixContent);

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
    <meta name="theme-color" content="#174c43">
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
        <p>Every child. One voice.</p>
        <a href="${site.newsletterUrl}">Get weekly school updates <span aria-hidden="true">→</span></a>
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
          <a class="nav-give" href="${site.donateUrl}">Donate</a>
        </nav>
      </div>
    </header>
    <main id="main-content">
      ${page.home ? renderHome(base) : renderContentPage(page)}
    </main>
    ${renderFooter(base)}
  </body>
</html>
`;
}

function renderHome(base) {
  return `
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Montlake Elementary · Seattle</p>
          <h1>Rooted in community.<br><em>Growing every child.</em></h1>
          <p class="hero-lede">We bring families, educators, and neighbors together to help every Montlake student learn, belong, and thrive.</p>
          <div class="button-row">
            <a class="button button-primary" href="${base}welcome-new-families/">Start here, new families</a>
            <a class="button button-secondary" href="${site.membershipUrl}">Join the PTA</a>
          </div>
        </div>
        <div class="hero-visual">
          <div class="hero-image">
            <img src="${base}assets/school.jpg" alt="A Montlake student beside artwork at the elementary school construction site" width="2016" height="1512">
          </div>
          <div class="hero-note">
            <span class="scribble" aria-hidden="true">✦</span>
            <p><strong>Small school,<br>big community.</strong></p>
          </div>
        </div>
      </section>

      <section class="quick-actions" aria-labelledby="quick-actions-title">
        <div class="section-heading">
          <p class="eyebrow">Find it fast</p>
          <h2 id="quick-actions-title">What do you need today?</h2>
        </div>
        <div class="action-grid">
          <a class="action-card coral" href="${base}calendar/">
            <span class="card-number">01</span>
            <h3>School calendar</h3>
            <p>Dates, meetings, and community events in one place.</p>
            <span class="card-link">See what’s happening →</span>
          </a>
          <a class="action-card yellow" href="${base}enrichment/">
            <span class="card-number">02</span>
            <h3>After-school enrichment</h3>
            <p>Classes, pickup details, scholarships, and contacts.</p>
            <span class="card-link">Explore programs →</span>
          </a>
          <a class="action-card blue" href="${base}welcome-new-families/">
            <span class="card-number">03</span>
            <h3>New family guide</h3>
            <p>Bell times, childcare, Kindergarten, and key accounts.</p>
            <span class="card-link">Get oriented →</span>
          </a>
        </div>
      </section>

      <section class="mission-section">
        <div class="mission-intro">
          <p class="eyebrow light">Why we’re here</p>
          <h2>More than a fundraiser.<br>We’re a <em>community builder.</em></h2>
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
      </section>

      <section class="impact-section">
        <div class="section-heading split-heading">
          <div>
            <p class="eyebrow">Your support at work</p>
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
          <p class="eyebrow">There’s a place for you</p>
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

function renderContentPage(page) {
  return `
      <section class="page-hero ${page.accent || ""}">
        <div>
          <p class="eyebrow">${escapeAttribute(page.kicker || "Montlake PTA")}</p>
          <h1>${escapeAttribute(page.heading || page.title)}</h1>
          <p>${escapeAttribute(page.description)}</p>
        </div>
      </section>
      <div class="content-layout">
        <article class="prose">
          ${page.content}
        </article>
        <aside class="page-aside">
          <div class="aside-card">
            <p class="eyebrow">Need help?</p>
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
          <h2>Connect</h2>
          <a href="${site.newsletterUrl}">Weekly newsletter</a>
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
