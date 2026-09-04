import sanitizeHtml from "sanitize-html";

const allowedCmsHtml = {
  allowedTags: [
    "p", "br", "strong", "em", "b", "i", "u", "s", "a", "ul", "ol", "li",
    "h2", "h3", "h4", "blockquote", "figure", "figcaption", "img", "hr", "div", "iframe",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel", "class"],
    div: ["class"],
    iframe: ["src", "title", "loading"],
    img: ["src", "alt", "width", "height", "loading", "class"],
    p: ["class"],
  },
  allowedClasses: {
    a: ["button", "button-primary", "button-secondary", "text-link"],
    div: ["article-body", "button-row", "callout", "content-grid"],
    img: ["detail-image", "product-image"],
    p: ["card-meta", "lead", "product-price"],
  },
  allowedIframeHostnames: ["calendar.google.com"],
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    a: (_tagName, attributes) => ({
      tagName: "a",
      attribs: externalLinkAttributes(attributes),
    }),
    img: (_tagName, attributes) => ({
      tagName: "img",
      attribs: { ...attributes, loading: "lazy" },
    }),
  },
};

export function mergeWixContent(staticPages, content) {
  validateSnapshot(content);

  const pageMap = new Map(staticPages.map((page) => [page.slug, { ...page }]));
  const blogPosts = content.blogPosts.filter(hasValidSlug);
  const events = content.events.filter(hasValidSlug);
  const products = content.products.filter(hasValidSlug);
  const storeCollections = content.storeCollections.filter(hasValidSlug);
  applyCmsPages(pageMap, content.cms.pages);
  applyBoardMembers(pageMap, content.cms.boardMembers);
  applyHomeFeed(pageMap, blogPosts, events);
  applyBlogIndex(pageMap, blogPosts);
  applyEventsIndex(pageMap, events);
  addStoreIndex(pageMap, products);

  const dynamicPages = [
    ...blogPosts.map(renderBlogPostPage),
    ...events.map(renderEventPage),
    ...products.map(renderProductPage),
    ...storeCollections.map(renderCollectionPage),
  ];

  for (const page of dynamicPages) {
    if (!page.slug || pageMap.has(page.slug)) continue;
    pageMap.set(page.slug, page);
  }

  return [...pageMap.values()];
}

function applyHomeFeed(pageMap, posts, events) {
  const home = pageMap.get("");
  if (!home) return;

  const now = Date.now();
  const latestPosts = [...posts]
    .sort((left, right) => dateValue(right.publishedAt) - dateValue(left.publishedAt))
    .slice(0, 3);
  const upcomingEvents = [...events]
    .filter((event) => event.startAt && !isCanceled(event) && dateValue(event.endAt || event.startAt) >= now)
    .sort((left, right) => dateValue(left.startAt) - dateValue(right.startAt))
    .slice(0, 3);

  home.homeFeed = `
    <section class="freshness-section" aria-labelledby="freshness-title">
      <div class="freshness-shell">
        <div class="freshness-heading">
          <h2 id="freshness-title">Right now at Montlake</h2>
          <p>Upcoming community dates and the newest updates from the PTA.</p>
        </div>
        <div class="freshness-grid">
          <section class="freshness-column" aria-labelledby="coming-up-title">
            <div class="freshness-column-heading">
              <h3 id="coming-up-title">Coming up</h3>
              <a href="./event-list/">All events <span aria-hidden="true">→</span></a>
            </div>
            ${upcomingEvents.length
              ? `<div class="home-event-list">${upcomingEvents.map(homeEvent).join("")}</div>`
              : `<div class="freshness-empty"><p>No upcoming events are posted yet.</p><a href="./calendar/">Open the school calendar <span aria-hidden="true">→</span></a></div>`}
          </section>
          <section class="freshness-column" aria-labelledby="latest-updates-title">
            <div class="freshness-column-heading">
              <h3 id="latest-updates-title">Latest updates</h3>
              <a href="./blog/">All news <span aria-hidden="true">→</span></a>
            </div>
            ${latestPosts.length
              ? `<div class="home-post-list">${latestPosts.map(homePost).join("")}</div>`
              : `<div class="freshness-empty"><p>No updates are posted yet.</p><a href="${escapeAttribute("https://lp.constantcontactpages.com/sl/tG8wj2x/MontlakeSignUp")}">Get the weekly newsletter <span aria-hidden="true">→</span></a></div>`}
          </section>
        </div>
      </div>
    </section>`;
}

function applyCmsPages(pageMap, pages) {
  for (const cmsPage of pages) {
    if (cmsPage.published === false || !hasValidSlug(cmsPage)) continue;
    const existing = pageMap.get(cmsPage.slug);
    if (!existing && (!cmsPage.title || !cmsPage.description || !cmsPage.body)) {
      console.warn(`Ignoring incomplete CMS page ${cmsPage.slug}.`);
      continue;
    }
    pageMap.set(cmsPage.slug, {
      ...existing,
      slug: cmsPage.slug,
      title: cmsPage.title || existing?.title,
      heading: cmsPage.heading || cmsPage.title || existing?.heading,
      kicker: cmsPage.kicker || existing?.kicker,
      description: cmsPage.description || existing?.description,
      accent: ["coral", "blue", "yellow"].includes(cmsPage.accent) ? cmsPage.accent : existing?.accent,
      content: cmsPage.body ? sanitizeHtml(cmsPage.body, allowedCmsHtml) : existing?.content,
    });
  }
}

function applyBoardMembers(pageMap, members) {
  const activeMembers = members
    .filter((member) => member.active !== false && member.role && member.names)
    .sort((left, right) => Number(left.displayOrder || 0) - Number(right.displayOrder || 0));
  if (!activeMembers.length || !pageMap.has("pta-board")) return;

  const years = [...new Set(activeMembers.map((member) => member.schoolYear).filter(Boolean))];
  const page = pageMap.get("pta-board");
  page.description = `Connect with the ${years.join(" and ") || "current"} Montlake PTA officers and committee leads.`;
  page.content = `
    <p class="lead">The PTA board coordinates fundraising, programs, events, advocacy, family outreach, and more. Reach out directly—we welcome your ideas and involvement.</p>
    ${renderBoardCards(activeMembers)}
    <h2>Join the work</h2>
    <p>Professional experience is welcome but never required. Email <a href="mailto:president@montlakepta.org">president@montlakepta.org</a> to get involved.</p>`;
}

function applyBlogIndex(pageMap, posts) {
  if (!posts.length || !pageMap.has("blog")) return;
  const cards = [...posts]
    .sort((left, right) => dateValue(right.publishedAt) - dateValue(left.publishedAt))
    .map((post) => `
      <article class="content-card">
        ${image(post.image, post.title)}
        <div>
          <p class="card-meta">${formatDate(post.publishedAt)}</p>
          <h2><a href="../post/${post.slug}/">${escapeHtml(post.title)}</a></h2>
          <p>${escapeHtml(post.excerpt || excerpt(post.contentText))}</p>
          <a class="text-link" href="../post/${post.slug}/">Read update <span aria-hidden="true">→</span></a>
        </div>
      </article>`)
    .join("");

  pageMap.get("blog").content = `
    <p class="lead">School news, family resources, program announcements, meeting information, and community stories.</p>
    <div class="content-grid">${cards}</div>`;
}

function applyEventsIndex(pageMap, events) {
  if (!events.length || !pageMap.has("event-list")) return;
  const now = Date.now();
  const sorted = [...events].sort((left, right) => dateValue(left.startAt) - dateValue(right.startAt));
  const upcoming = sorted.filter((event) => !isCanceled(event) && dateValue(event.endAt || event.startAt) >= now);
  const previous = sorted.filter((event) => isCanceled(event) || dateValue(event.endAt || event.startAt) < now).reverse().slice(0, 12);

  pageMap.get("event-list").content = `
    <p class="lead">From family meetups and performances to fundraisers and community conversations, events are a chance to connect beyond the school-day rush.</p>
    <h2>Upcoming events</h2>
    ${upcoming.length ? `<div class="content-grid">${upcoming.map(eventCard).join("")}</div>` : '<div class="callout">No upcoming events are posted right now. Check the <a href="../calendar/">live calendar</a> for school dates.</div>'}
    ${previous.length ? `<h2>Recent events</h2><div class="content-grid">${previous.map(eventCard).join("")}</div>` : ""}
    <h2>Help make an event happen</h2>
    <p>Most PTA events are powered by family volunteers. Email <a href="mailto:events@montlakepta.org">events@montlakepta.org</a> to help.</p>`;
}

function addStoreIndex(pageMap, products) {
  if (!products.length || !pageMap.has("shop")) return;
  pageMap.get("shop").content = `
      <p class="lead">Product availability changes throughout the year. Purchases support Montlake Elementary programs and community priorities.</p>
      <div class="content-grid">${products.map(productCard).join("")}</div>`;
}

function renderBlogPostPage(post) {
  return {
    slug: `post/${post.slug}`,
    title: post.title,
    kicker: "PTA news",
    description: post.excerpt || excerpt(post.contentText),
    accent: "yellow",
    content: `
      <p class="card-meta">${formatDate(post.publishedAt)}${post.updatedAt && post.updatedAt !== post.publishedAt ? ` · Updated ${formatDate(post.updatedAt)}` : ""}</p>
      ${image(post.image, post.title, "detail-image")}
      <div class="article-body">${textToHtml(post.contentText || post.excerpt)}</div>
      <p><a class="text-link" href="../../blog/">← Back to all news</a></p>`,
  };
}

function renderEventPage(event) {
  const date = formatDateRange(event.startAt, event.endAt);
  return {
    slug: `event-details/${event.slug}`,
    title: event.title,
    kicker: "Community event",
    description: event.summary || `${date}${event.location ? ` at ${event.location}` : ""}`,
    accent: "coral",
    content: `
      ${image(event.image, event.title, "detail-image")}
      ${isCanceled(event) ? '<div class="callout"><strong>Canceled:</strong> This event is no longer scheduled.</div>' : ""}
      <dl class="event-facts">
        ${date ? `<div><dt>When</dt><dd>${escapeHtml(date)}</dd></div>` : ""}
        ${event.location ? `<div><dt>Where</dt><dd>${escapeHtml(event.location)}${event.address ? `<br>${escapeHtml(event.address)}` : ""}</dd></div>` : ""}
      </dl>
      <div class="article-body">${textToHtml(event.descriptionText || event.summary)}</div>
      ${event.sourceUrl ? `<p><a class="button button-primary" href="${escapeAttribute(event.sourceUrl)}">Registration and event details</a></p>` : ""}
      <p><a class="text-link" href="../../event-list/">← Back to all events</a></p>`,
  };
}

function renderProductPage(product) {
  return {
    slug: `product-page/${product.slug}`,
    title: product.name,
    kicker: "Montlake PTA shop",
    description: excerpt(product.description),
    accent: "yellow",
    content: `
      ${image(product.image, product.name, "detail-image product-image")}
      ${product.price != null ? `<p class="product-price">${formatCurrency(product.price, product.currency)}</p>` : ""}
      <div class="article-body">${textToHtml(product.description)}</div>
      ${product.sourceUrl ? `<p><a class="button button-primary" href="${escapeAttribute(product.sourceUrl)}">View availability</a></p>` : ""}
      <p><a class="text-link" href="../../shop/">← Back to the shop</a></p>`,
  };
}

function renderCollectionPage(collection) {
  return {
    slug: `category/${collection.slug}`,
    title: collection.name,
    kicker: "Product collection",
    description: `Browse ${collection.name} items supporting Montlake PTA.`,
    accent: "yellow",
    content: `
      ${image(collection.image, collection.name, "detail-image")}
      <p>Products in this seasonal collection appear in the <a href="../../shop/">PTA shop</a>.</p>`,
  };
}

function renderBoardCards(members) {
  return `<ul class="card-list">${members.map((member) => `
    <li>
      <strong>${escapeHtml(member.role)}</strong><br>
      ${escapeHtml(member.names)}<br>
      ${member.email ? `<a href="mailto:${escapeAttribute(member.email)}">${escapeHtml(member.email)}</a>` : ""}
    </li>`).join("")}</ul>`;
}

function homeEvent(event) {
  const date = dateParts(event.startAt);
  return `
    <article class="home-event">
      <time datetime="${escapeAttribute(event.startAt)}">
        <span>${escapeHtml(date.month)}</span>
        <strong>${escapeHtml(date.day)}</strong>
      </time>
      <div>
        <p>${escapeHtml(formatDateRange(event.startAt, event.endAt))}</p>
        <h4><a href="./event-details/${event.slug}/">${escapeHtml(event.title)}</a></h4>
        ${event.location ? `<span>${escapeHtml(event.location)}</span>` : ""}
      </div>
    </article>`;
}

function homePost(post) {
  const hasImage = Boolean(post.image);
  return `
    <article class="home-post${hasImage ? "" : " home-post-no-image"}">
      ${hasImage ? image(post.image, "", "home-post-image") : ""}
      <div>
        <p>${escapeHtml(formatDate(post.publishedAt))}</p>
        <h4><a href="./post/${post.slug}/">${escapeHtml(post.title)}</a></h4>
        <span>${escapeHtml(excerpt(post.excerpt || post.contentText, 130))}</span>
      </div>
    </article>`;
}

function eventCard(event) {
  return `
    <article class="content-card">
      ${image(event.image, event.title)}
      <div>
        <p class="card-meta">${isCanceled(event) ? "Canceled · " : ""}${escapeHtml(formatDateRange(event.startAt, event.endAt))}</p>
        <h3><a href="../event-details/${event.slug}/">${escapeHtml(event.title)}</a></h3>
        ${event.location ? `<p>${escapeHtml(event.location)}</p>` : ""}
        <a class="text-link" href="../event-details/${event.slug}/">Event details <span aria-hidden="true">→</span></a>
      </div>
    </article>`;
}

function productCard(product) {
  return `
    <article class="content-card">
      ${image(product.image, product.name)}
      <div>
        <p class="card-meta">${product.price != null ? formatCurrency(product.price, product.currency) : "Seasonal item"}</p>
        <h2><a href="../product-page/${product.slug}/">${escapeHtml(product.name)}</a></h2>
        <p>${escapeHtml(excerpt(product.description, 150))}</p>
        <a class="text-link" href="../product-page/${product.slug}/">View item <span aria-hidden="true">→</span></a>
      </div>
    </article>`;
}

function image(url, alt, className = "") {
  if (!url) return "";
  return `<img class="${className}" src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}" loading="lazy">`;
}

function textToHtml(value) {
  if (!value) return "<p>More information will be posted soon.</p>";
  return String(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(date);
}

function dateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return { month: "", day: "" };
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { month: parts.month || "", day: parts.day || "" };
}

function formatDateRange(start, end) {
  if (!start) return "";
  const startDate = new Date(start);
  if (Number.isNaN(startDate.valueOf())) return "";
  const date = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(startDate);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  if (!end || Number.isNaN(new Date(end).valueOf())) return `${date} · ${time.format(startDate)}`;
  const endDate = new Date(end);
  if (localDateKey(startDate) !== localDateKey(endDate)) {
    const endLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Los_Angeles",
    }).format(endDate);
    return `${date}, ${time.format(startDate)}–${endLabel}, ${time.format(endDate)}`;
  }
  return `${date} · ${time.format(startDate)}–${time.format(endDate)}`;
}

function localDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Los_Angeles",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatCurrency(value, currency = "USD") {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(number)
    : String(value);
}

function excerpt(value, maxLength = 240) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function dateValue(value) {
  const number = value ? new Date(value).valueOf() : 0;
  return Number.isNaN(number) ? 0 : number;
}

function externalLinkAttributes(attributes) {
  const output = { ...attributes };
  if (output.target === "_blank") output.rel = "noopener noreferrer";
  return output;
}

function hasValidSlug(item) {
  return typeof item.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug);
}

function isCanceled(event) {
  return ["CANCELED", "CANCELLED", "https://schema.org/EventCancelled"].includes(event.status);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function validateSnapshot(content) {
  if (!content || content.schemaVersion !== 1) throw new Error("Unsupported Wix content snapshot schema.");
  for (const key of ["blogPosts", "events", "products", "storeCollections"]) {
    if (!Array.isArray(content[key])) throw new Error(`Wix content snapshot is missing ${key}.`);
  }
  if (!content.cms || !Array.isArray(content.cms.boardMembers) || !Array.isArray(content.cms.pages)) {
    throw new Error("Wix content snapshot has invalid CMS data.");
  }
}
