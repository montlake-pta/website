export function mergeNewsletterContent(pages, snapshot, signupUrl) {
  validateSnapshot(snapshot);
  const pageMap = new Map(pages.map((page) => [page.slug, { ...page }]));
  const newsletterPage = pageMap.get("newsletter");
  if (!newsletterPage) return pages;

  const editions = snapshot.editions
    .filter(validEdition)
    .sort((left, right) => Number(left.archiveOrder || 0) - Number(right.archiveOrder || 0));
  newsletterPage.content = renderNewsletterContent(editions[0], editions, signupUrl, "../");
  newsletterPage.disableOutline = true;

  for (const edition of editions) {
    const slug = `newsletter/${edition.slug}`;
    if (pageMap.has(slug)) continue;
    pageMap.set(slug, {
      slug,
      title: edition.title,
      heading: edition.title,
      description: edition.publishedAt
        ? `Montlake Elementary weekly newsletter from ${formatDate(edition.publishedAt)}.`
        : "A Montlake Elementary weekly newsletter edition.",
      accent: "blue",
      content: renderNewsletterContent(edition, editions, signupUrl, "../../"),
      disableOutline: true,
    });
  }

  return [...pageMap.values()];
}

function renderNewsletterContent(current, editions, signupUrl, base) {
  const signup = `
    <div class="newsletter-signup">
      <div>
        <h2>Get the weekly update in your inbox</h2>
        <p>The PTA newsletter is sent each Tuesday with school, classroom, program, and community news.</p>
      </div>
      <a class="button button-primary" href="${escapeAttribute(signupUrl)}">Sign up for the newsletter</a>
    </div>`;

  if (!current) {
    return `
      ${signup}
      <div class="callout">
        <strong>The online archive is not connected yet.</strong>
        Past editions will appear here after the public newsletter archive is enabled.
      </div>`;
  }

  const archive = editions
    .filter((edition) => edition.id !== current.id)
    .map((edition) => `
      <li>
        <a href="${base}newsletter/${edition.slug}/">
          <span>${escapeHtml(edition.title)}</span>
          ${edition.publishedAt ? `<time datetime="${escapeAttribute(edition.publishedAt)}">${escapeHtml(formatDate(edition.publishedAt))}</time>` : ""}
        </a>
      </li>`)
    .join("");

  return `
    ${signup}
    <section class="newsletter-current" aria-labelledby="current-newsletter-title">
      <div class="newsletter-current-heading">
        <div>
          <p class="card-meta">${current.publishedAt ? escapeHtml(formatDate(current.publishedAt)) : "Latest edition"}</p>
          <h2 id="current-newsletter-title">${escapeHtml(current.title)}</h2>
        </div>
        <a class="text-link" href="${escapeAttribute(current.campaignUrl)}" target="_blank" rel="noopener noreferrer">Open in a new tab <span aria-hidden="true">↗</span></a>
      </div>
      <iframe
        class="newsletter-frame"
        src="${escapeAttribute(current.campaignUrl)}"
        title="${escapeAttribute(current.title)}"
        loading="eager"
        referrerpolicy="no-referrer"
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      >
        <a href="${escapeAttribute(current.campaignUrl)}">Open ${escapeHtml(current.title)}</a>
      </iframe>
    </section>
    <section class="newsletter-archive" aria-labelledby="newsletter-archive-title">
      <div>
        <h2 id="newsletter-archive-title">Past editions</h2>
        <p>Browse newsletters that Montlake PTA has made available in its public archive.</p>
      </div>
      ${archive ? `<ol>${archive}</ol>` : "<p>This is the first edition currently available in the archive.</p>"}
    </section>
    ${signup}`;
}

function validEdition(edition) {
  return Boolean(
    edition
    && typeof edition.id === "string"
    && typeof edition.slug === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(edition.slug)
    && typeof edition.title === "string"
    && safeCampaignUrl(edition.campaignUrl),
  );
}

function safeCampaignUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["conta.cc", "myemail.constantcontact.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(date);
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

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.editions)) {
    throw new Error("Unsupported newsletter snapshot schema.");
  }
}
