import { effectiveCampaignStatus, fundraisingUrl, normalizeFundraisingFields } from "./fundraising-fields.mjs";
import { escapeAttribute as escape, prepareContent } from "./page-content.mjs";
import { sanitizeCmsHtml } from "./render-wix-content.mjs";

const statusLabels = {
  evergreen: "Year-round giving",
  upcoming: "Campaign details coming soon",
  active: "Campaign open",
  closed: "Campaign closed",
  archived: "Past campaign",
};

function localUrl(url, base) {
  return url.startsWith("/") ? `${base}${url.slice(1)}` : url;
}

function statusLine(page, now) {
  return [statusLabels[effectiveCampaignStatus(page, now)], page.schoolYear].filter(Boolean).map(escape).join(" · ");
}

function primaryAction(page, base, now) {
  if (["evergreen", "active"].includes(effectiveCampaignStatus(page, now)) && page.primaryCtaLabel && page.primaryCtaUrl) {
    return `<a class="button button-primary donate-primary" href="${escape(localUrl(fundraisingUrl(page.primaryCtaUrl), base))}">${escape(page.primaryCtaLabel)}</a>`;
  }
  return page.slug === "donate" ? "" : `<a class="button button-secondary" href="${base}donate/">See year-round ways to give</a>`;
}

export function renderFundraisingOverview(pages, base, { home = false, now = new Date() } = {}) {
  const slugs = home ? ["donate", "annual-fund", "spring-auction"] : ["annual-fund", "spring-auction"];
  const campaigns = slugs.map(slug => pages.find(page => page.slug === slug)).filter(Boolean);
  if (!campaigns.length) return "";
  const donate = pages.find(page => page.slug === "donate");
  const heading = home ? donate?.heading || donate?.title || "Support Montlake" : "Fundraising through the school year";
  return `<section class="fundraising-overview" aria-labelledby="fundraising-overview-title">
    <h2 id="fundraising-overview-title">${escape(heading)}</h2>
    <div class="fundraising-list">${campaigns.map(page => `<a class="action-item fundraising-item" href="${base}${page.slug}/">
      <div><h3>${escape(page.title)}</h3><p class="campaign-status">${statusLine(page, now)}</p><p>${escape(page.description)}</p></div>
      <span aria-hidden="true">→</span>
    </a>`).join("")}</div>
  </section>`;
}

export function renderFundraisingPage(input, base, pages = [], { now = new Date() } = {}) {
  const page = { ...input, ...normalizeFundraisingFields(input, { html: sanitizeCmsHtml, image: value => value }) };
  if (page.heroImage && !page.heroAlt) throw new Error(`Fundraising hero image needs descriptive alt text: ${page.slug}.`);
  const action = primaryAction(page, base, now);
  const facts = [
    page.goalAmount ? `<div><dt>Campaign goal</dt><dd>${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(page.goalAmount)}</dd></div>` : "",
    page.deadline ? `<div><dt>Giving deadline</dt><dd><time datetime="${page.deadline}">${new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", month: "long", day: "numeric", year: "numeric",
    }).format(new Date(`${page.deadline}T12:00:00Z`))}</time></dd></div>` : "",
  ].join("");
  const sections = [
    page.impactBody ? `<section class="donate-impact prose fundraising-impact">${page.impactBody}</section>` : "",
    `<article class="fundraising-body prose">${sanitizeCmsHtml(page.content)}</article>`,
    page.equityBody ? `<div class="donate-equity"><section class="donate-equity-shell prose fundraising-equity">${page.equityBody}</section></div>` : "",
    page.trustBody ? `<section class="donate-close"><div class="prose">${page.trustBody}</div>${action}</section>` : "",
  ].join("");
  const prepared = prepareContent(sections, false, true);
  return `<section class="donate-hero">
    <div class="donate-hero-shell${page.heroImage ? "" : " fundraising-text-hero"}">
      <div class="donate-hero-copy">
        <h1>${escape(page.heading || page.title)}</h1>
        <p>${escape(page.description)}</p>
        <p class="campaign-status">${statusLine(page, now)}</p>
        ${facts ? `<dl class="campaign-facts">${facts}</dl>` : ""}
        ${action ? `<div class="button-row">${action}</div>` : ""}
      </div>
      ${page.heroImage ? `<figure class="donate-hero-visual">
        <img src="${escape(localUrl(page.heroImage, base))}" alt="${escape(page.heroAlt)}" width="1800" height="1012">
        ${page.heroCaption ? `<figcaption>${escape(page.heroCaption)}</figcaption>` : ""}
      </figure>` : ""}
    </div>
  </section>
  ${page.slug === "donate" ? renderFundraisingOverview(pages, base, { now }) : ""}
  ${prepared.outline ? `<div class="fundraising-outline">${prepared.outline}</div>` : ""}
  ${prepared.content}`;
}
