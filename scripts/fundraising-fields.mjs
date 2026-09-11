export const fundraisingFieldDefinitions = [
  ["campaignStatus", "Campaign status (evergreen, upcoming, active, closed, archived)", "TEXT"],
  ["schoolYear", "Campaign school year", "TEXT"],
  ["goalAmount", "Campaign goal (USD)", "NUMBER"],
  ["deadline", "Campaign deadline (YYYY-MM-DD)", "TEXT"],
  ["primaryCtaLabel", "Primary action label", "TEXT"],
  ["primaryCtaUrl", "Primary action URL", "TEXT"],
  ["heroImage", "Fundraising hero image", "IMAGE"],
  ["heroAlt", "Hero image description", "TEXT"],
  ["heroCaption", "Hero image caption", "TEXT"],
  ["impactBody", "Funding impact content", "RICH_TEXT"],
  ["equityBody", "Participation and equity content", "RICH_TEXT"],
  ["trustBody", "Nonprofit and donor information", "RICH_TEXT"],
].map(([key, displayName, type]) => ({ key, displayName, type }));

export const fundraisingFieldNames = fundraisingFieldDefinitions.map(field => field.key);
export const emptyFundraisingFields = Object.fromEntries(fundraisingFieldNames.map(key => [key, key === "goalAmount" ? null : ""]));
export const fundraisingStatuses = ["evergreen", "upcoming", "active", "closed", "archived"];
const richFields = new Set(["impactBody", "equityBody", "trustBody"]);

function invalid(key) {
  throw new Error(`Invalid WebsitePages fundraising field: ${key}.`);
}

function string(value, key) {
  if (value == null) return "";
  if (typeof value !== "string") invalid(key);
  return value.trim();
}

export function fundraisingUrl(value, { image = false } = {}) {
  if (!value) return "";
  if (/[\u0000-\u001f\u007f\\]/.test(value)) invalid(image ? "heroImage" : "primaryCtaUrl");
  if (value.startsWith("/") && !value.startsWith("//")) {
    const rawPath = value.split(/[?#]/, 1)[0];
    let decoded;
    try { decoded = decodeURIComponent(rawPath); } catch { invalid("primaryCtaUrl"); }
    if (/[\\%?#\u0000-\u0020\u007f]/.test(decoded) || decoded.includes("//") || decoded.split("/").some(part => part === "." || part === "..")
      || (image && !decoded.startsWith("/assets/"))) invalid(image ? "heroImage" : "primaryCtaUrl");
    return value;
  }
  let url;
  try { url = new URL(value); } catch { invalid(image ? "heroImage" : "primaryCtaUrl"); }
  if (url.username || url.password || !(url.protocol === "https:" || (!image && url.protocol === "mailto:"))) {
    invalid(image ? "heroImage" : "primaryCtaUrl");
  }
  return url.href;
}

// Callers provide the existing public/sanitization helpers; no second HTML policy.
// Missing fields preserve legacy fallback behavior. Present blanks intentionally clear.
export function normalizeFundraisingFields(record, { html, text, image } = {}) {
  const result = {};
  for (const key of fundraisingFieldNames) {
    if (!Object.hasOwn(record, key)) continue;
    const value = record[key];
    if (key === "goalAmount") {
      if (value == null || value === "") result[key] = null;
      else {
        const amount = Number(value);
        if (!["number", "string"].includes(typeof value) || !Number.isFinite(amount) || amount <= 0) invalid(key);
        result[key] = amount;
      }
    } else {
      const raw = string(value, key);
      if (richFields.has(key)) {
        if (typeof html !== "function") throw new Error("Fundraising rich content requires the shared HTML sanitizer.");
        result[key] = html(raw);
      } else if (key === "heroImage") {
        const normalized = raw.startsWith("/assets/") || !raw ? raw : image?.(raw);
        if (raw && !normalized) invalid(key);
        result[key] = fundraisingUrl(normalized || "", { image: true });
      } else {
        result[key] = typeof text === "function" ? text(raw) : raw;
      }
    }
  }
  if (result.campaignStatus && !fundraisingStatuses.includes(result.campaignStatus)) invalid("campaignStatus");
  if (result.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(result.deadline)
    || Number.isNaN(Date.parse(`${result.deadline}T12:00:00Z`))
    || new Date(`${result.deadline}T12:00:00Z`).toISOString().slice(0, 10) !== result.deadline)) invalid("deadline");
  if (Object.hasOwn(result, "primaryCtaUrl")) result.primaryCtaUrl = fundraisingUrl(result.primaryCtaUrl);
  return result;
}

export function effectiveCampaignStatus(page, now = new Date()) {
  const status = page.campaignStatus || "upcoming";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return status === "active" && page.deadline && page.deadline < today ? "closed" : status;
}
