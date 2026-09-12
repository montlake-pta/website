import { htmlText, normalizeRichBody, publicHtml, publicText, publicUrl, wixMediaUrl } from "./wix-public-content.mjs";
import { emptyFundraisingFields, fundraisingFieldNames, normalizeFundraisingFields } from "./fundraising-fields.mjs";
import { normalizePageSlug, pageCollectionDefinitions, pageFieldsForType, validatePagePlacement } from "./page-collections.mjs";

// Only messages constructed locally may be printed by the authenticated CLI.
export class WixContentError extends Error {}

export function normalizeWixContent({ blogPosts, events, products, storeCollections, boardMembers, cmsPages = [],
  pageSource = "legacy", commonPages, fundraisingPages, generatedPages }, {
  syncedAt = new Date().toISOString(), warn = console.warn,
} = {}) {
  if (!["legacy", "typed"].includes(pageSource)) throw new WixContentError("Unknown CMS page source.");
  return {
    schemaVersion: pageSource === "typed" ? 3 : 2,
    source: "wix-headless",
    syncedAt,
    cms: {
      boardMembers: boardMembers.map(unwrap).filter((item) => item.active !== false).map((item) => ({
        schoolYear: publicText(item.schoolYear), role: publicText(item.role), names: publicText(item.names),
        email: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(item.email || "") ? item.email : "",
        displayOrder: Number.isFinite(Number(item.displayOrder)) ? Number(item.displayOrder) : 0,
        active: true,
      })).filter((item) => item.role && item.names)
        .sort((a, b) => a.displayOrder - b.displayOrder || compare(a.role, b.role) || compare(a.names, b.names)),
      pages: pageSource === "typed" ? normalizeTypedPages({ commonPages, fundraisingPages, generatedPages }, warn)
        : routed(cmsPages.map(unwrap).filter((item) => item.published !== false).map((item) => ({
        slug: normalizePageSlug(item.slug), title: publicText(item.title), heading: publicText(item.heading),
        kicker: publicText(item.kicker), description: publicText(item.description),
        accent: ["coral", "blue", "yellow"].includes(item.accent) ? item.accent : "",
        body: publicHtml(item.body), published: true,
        ...normalizeFundraisingFields(item, { html: publicHtml, text: publicText, image: wixMediaUrl }),
      })), "CMS page", warn),
    },
    // queryPosts returns published revisions; hasUnpublishedChanges is NOT a
    // reason to omit the current public revision. Never export paid bodies.
    blogPosts: routed(blogPosts.filter((post) => !post.pricingPlanIds?.length && post.preview !== true).map((post) => {
      const rich = normalizeRichBody(post.richContent, { warn });
      const text = rich.privacyFiltered ? rich.text : publicText(post.contentText) || rich.text;
      return {
        id: publicId(post._id), slug: normalizeSlug(post.slug), title: publicText(post.title),
        excerpt: publicText(post.excerpt) || excerpt(text), contentText: text,
        ...(rich.bodyHtml ? { bodyHtml: rich.bodyHtml } : {}),
        publishedAt: toIso(post.firstPublishedDate), updatedAt: toIso(post.lastPublishedDate),
        image: wixMediaUrl(post.media?.wixMedia?.image || post.heroImage), sourceUrl: publicUrl(post.url),
      };
    }), "Blog post", warn),
    events: routed(events.filter((event) => event.status !== "DRAFT").map((event) => {
      const rich = normalizeRichBody(event.description, { warn });
      return {
        id: publicId(event._id), slug: normalizeSlug(event.slug), title: publicText(event.title),
        summary: publicText(event.shortDescription) || rich.text,
        descriptionText: rich.text || publicText(event.shortDescription),
        ...(rich.bodyHtml ? { bodyHtml: rich.bodyHtml } : {}),
        startAt: toIso(event.dateAndTimeSettings?.startDate), endAt: toIso(event.dateAndTimeSettings?.endDate),
        location: publicText(event.location?.name), address: formatAddress(event.location?.address),
        image: wixMediaUrl(event.mainImage),
        status: ["UPCOMING", "STARTED", "ENDED", "CANCELED", "CANCELLED"].includes(event.status) ? event.status : null,
        sourceUrl: publicUrl(event.eventPageUrl),
      };
    }), "Event", warn),
    products: routed(products.filter((product) => product.visible !== false).map((product) => ({
      id: publicId(product._id), slug: normalizeSlug(product.slug), name: publicText(product.name),
      description: htmlText(publicHtml(product.description)),
      price: finitePrice(product.priceData?.discountedPrice ?? product.priceData?.price),
      currency: /^[A-Z]{3}$/.test(product.priceData?.currency || "") ? product.priceData.currency : "USD",
      availability: stockStatus(product.stock), image: wixMediaUrl(product.media?.mainMedia?.image?.url),
      visible: true, sourceUrl: pageUrl(product.productPageUrl),
      collectionIds: [...new Set((product.collectionIds || []).map(publicId).filter(Boolean))].sort(),
    })), "Product", warn),
    storeCollections: routed(storeCollections.filter((collection) => collection.visible !== false).map((collection) => ({
      id: publicId(collection._id), slug: normalizeSlug(collection.slug), name: publicText(collection.name),
      image: wixMediaUrl(collection.media?.mainMedia?.image?.url), sourceUrl: null,
    })), "Store collection", warn),
  };
}

function stockStatus(stock) {
  if (stock?.inventoryStatus === "OUT_OF_STOCK") return "OutOfStock";
  if (stock?.inventoryStatus === "IN_STOCK") return "InStock";
  if (stock?.inventoryStatus === "PARTIALLY_OUT_OF_STOCK") return "PartiallyOutOfStock";
  return stock?.inStock === false ? "OutOfStock" : stock?.inStock === true ? "InStock" : null;
}

function unwrap(item) { return item?.data && typeof item.data === "object" ? item.data : item; }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function publicId(value) { return typeof value === "string" && /^[\w-]+$/.test(value) ? value : null; }
function finitePrice(value) { return value != null && Number.isFinite(Number(value)) ? Number(value) : null; }
function excerpt(value) { return value.length <= 220 ? value : `${value.slice(0, 220).trimEnd()}…`; }
function formatAddress(address) {
  return address ? [address.addressLine1 || address.streetAddress?.name, address.city, address.subdivision, address.postalCode]
    .map(publicText).filter(Boolean).join(", ") : "";
}
function pageUrl(value) {
  if (typeof value === "string") return publicUrl(value);
  try { return value?.base && value.path ? publicUrl(new URL(value.path, value.base).href) : null; }
  catch { return null; }
}
function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}
function normalizeSlug(value) {
  return typeof value === "string" ? value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replaceAll("&", " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "";
}
export function normalizeTypedPage(record, type) {
  const item = unwrap(record);
  const slug = normalizePageSlug(item.slug);
  if (slug) validatePagePlacement(type, slug);
  const page = {
    pageType: type, slug, title: publicText(item.title), heading: publicText(item.heading),
    description: publicText(item.description), published: item.published !== false,
  };
  if (type !== "fundraising") page.accent = ["coral", "blue", "yellow"].includes(item.accent) ? item.accent : "";
  if (type !== "generated") page.body = publicHtml(item.body);
  if (type === "fundraising") Object.assign(page, emptyFundraisingFields,
    normalizeFundraisingFields(item, { html: publicHtml, text: publicText, image: wixMediaUrl }));
  return page;
}

function normalizeTypedPages(groups, warn) {
  const pages = [];
  for (const { type, configKey } of pageCollectionDefinitions) {
    if (!Array.isArray(groups[configKey])) throw new WixContentError(`Missing typed CMS data for ${configKey}.`);
    pages.push(...groups[configKey].map(unwrap).filter(item => item.published !== false)
      .map(item => normalizeTypedPage(item, type)));
  }
  return routed(pages, "CMS page", warn);
}

export function assertPublicSnapshot(snapshot) {
  const keys = (value, allowed) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
  const fail = () => { throw new WixContentError("Snapshot is not in the normalized public export format."); };
  if (!keys(snapshot, ["schemaVersion", "source", "syncedAt", "cms", "blogPosts", "events", "products", "storeCollections"])
    || ![1, 2, 3].includes(snapshot.schemaVersion) || snapshot.source !== "wix-headless"
    || !keys(snapshot.cms, ["pages", "boardMembers"])) fail();
  const groups = [
    [snapshot.cms.pages, ["slug", "title", "heading", "kicker", "description", "accent", "body", "published",
      ...(snapshot.schemaVersion >= 2 ? fundraisingFieldNames : []),
      ...(snapshot.schemaVersion === 3 ? ["pageType"] : [])]],
    [snapshot.cms.boardMembers, ["schoolYear", "role", "names", "email", "displayOrder", "active"]],
    [snapshot.blogPosts, ["id", "slug", "title", "excerpt", "contentText", "bodyHtml", "publishedAt", "updatedAt", "image", "sourceUrl"]],
    [snapshot.events, ["id", "slug", "title", "summary", "descriptionText", "bodyHtml", "startAt", "endAt", "location", "address", "image", "status", "sourceUrl"]],
    [snapshot.products, ["id", "slug", "name", "description", "price", "currency", "availability", "image", "visible", "sourceUrl", "collectionIds"]],
    [snapshot.storeCollections, ["id", "slug", "name", "image", "sourceUrl"]],
  ];
  for (const [records, allowed] of groups) {
    if (!Array.isArray(records)) fail();
    for (const record of records) {
      if (!keys(record, allowed)) fail();
      for (const [key, value] of Object.entries(record)) {
        if (value !== null && typeof value === "object"
          && (key !== "collectionIds" || !Array.isArray(value))) fail();
        if (["body", "bodyHtml", "impactBody", "equityBody", "trustBody"].includes(key)) {
          if (typeof value !== "string" || publicHtml(value) !== value) fail();
        } else if (["image", "sourceUrl"].includes(key)) {
          if (value !== null && publicUrl(value, { image: key === "image" }) !== value) fail();
        } else if (typeof value === "string" && publicText(value) !== value) fail();
      }
    }
    for (const page of snapshot.cms.pages) {
      if (snapshot.schemaVersion === 3) {
        if (!pageCollectionDefinitions.some(definition => definition.type === page.pageType)
          || !keys(page, ["pageType", ...pageFieldsForType(page.pageType)])) fail();
        validatePagePlacement(page.pageType, page.slug);
      }
      const fields = normalizeFundraisingFields(page, { html: publicHtml, text: publicText, image: wixMediaUrl });
      for (const [key, value] of Object.entries(fields)) if (value !== page[key]) fail();
    }
  }
  if (snapshot.cms.pages.some((page) => page.published !== true)
    || snapshot.cms.boardMembers.some((member) => member.active !== true)
    || snapshot.products.some((product) => product.visible !== true || !Array.isArray(product.collectionIds)
      || product.collectionIds.some((id) => !publicId(id)))) fail();
}

function routed(records, label, warn) {
  const slugs = new Set();
  return records.filter((record) => {
    if (!record.slug) { warn(`Ignoring ${label} without a valid slug.`); return false; }
    if (slugs.has(record.slug)) throw new WixContentError(`Duplicate normalized ${label} slug; sync stopped.`);
    slugs.add(record.slug);
    return true;
  }).sort((a, b) => compare(a.slug, b.slug));
}
