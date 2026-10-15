// Keeps one bad Wix item from blocking every other content update. A failing
// item falls back to its last deployed version, or is withheld when it has
// none, and the deployment is still reported as a failure.

export class ContentItemError extends Error {
  constructor(collection, key, cause) {
    super(cause?.message || String(cause), { cause });
    this.collection = collection;
    this.key = key;
  }
}

const routePrefixes = [
  ["post/", "blogPosts", "post"],
  ["event-details/", "events", "event"],
  ["product-page/", "products", "product"],
  ["category/", "storeCollections", "store collection"],
];
const labels = { "cms.pages": "page", ...Object.fromEntries(routePrefixes.map(([, collection, label]) => [collection, label])) };

// More failures than this point to a code or platform problem, which must
// stop the deployment instead of withholding a large part of the site.
export const maxIsolatedItems = 3;

function records(snapshot, collection) {
  return collection === "cms.pages" ? snapshot.cms.pages : snapshot[collection];
}

// Only routes owned by exactly one Wix item are attributable. Indexes, the
// homepage and generated pages combine many items and are never guessed.
export function itemForRoute(snapshot, route) {
  for (const [prefix, collection] of routePrefixes) {
    if (!route.startsWith(prefix)) continue;
    const key = route.slice(prefix.length);
    return records(snapshot, collection).some((item) => item.slug === key) ? { collection, key } : null;
  }
  const page = snapshot.cms.pages.find((item) => item.slug === route);
  return page && page.pageType !== "generated" ? { collection: "cms.pages", key: route } : null;
}

function sameItem(left, right) {
  return left.id && right.id ? left.id === right.id : left.slug === right.slug;
}

/**
 * render(snapshot) renders the complete site in memory and returns
 * [{ route, error }] for pages that failed. It may throw ContentItemError for
 * a record that cannot be merged; any other exception stops the build.
 */
export function isolateContentFailures({ content, fallback = null, render, maxItems = maxIsolatedItems }) {
  const effective = structuredClone(content);
  const isolated = new Map();
  for (;;) {
    let failures;
    try {
      failures = render(effective);
    } catch (error) {
      if (!(error instanceof ContentItemError)) throw error;
      failures = [{ item: { collection: error.collection, key: error.key }, error }];
    }
    if (!failures.length) return { content: effective, isolated: [...isolated.values()] };

    const attributed = failures.map((failure) => ({ ...failure, item: failure.item ?? itemForRoute(effective, failure.route) }));
    const unattributed = attributed.find((failure) => !failure.item);
    if (unattributed) throw unattributed.error;

    const handled = new Set();
    for (const { item, error } of attributed) {
      const id = `${item.collection}:${item.key}`;
      if (handled.has(id)) continue;
      handled.add(id);
      const list = records(effective, item.collection);
      const index = list.findIndex((record) => record.slug === item.key);
      if (index < 0) throw error;
      const current = list[index];
      const prior = isolated.get(id);
      const previous = !prior && fallback
        ? records(fallback, item.collection)?.find((record) => sameItem(record, current)) : undefined;
      const entry = {
        type: labels[item.collection],
        slug: item.key,
        title: current.title || current.name || item.key,
        error: prior?.error ?? error.message,
      };
      if (previous && JSON.stringify(previous) !== JSON.stringify(current)) {
        list[index] = structuredClone(previous);
        isolated.set(id, { ...entry, action: "kept-previous" });
      } else {
        list.splice(index, 1);
        isolated.set(id, { ...entry, action: "withheld" });
      }
      if (isolated.size > maxItems) {
        throw new Error(`More than ${maxItems} content items failed, which points to a systemic problem; nothing was deployed. First failure: ${[...isolated.values()][0].error}`);
      }
    }
  }
}

export function describeIsolatedItem(item) {
  const outcome = item.action === "kept-previous"
    ? "kept its previously deployed version" : "was not published (no earlier version exists)";
  return `The ${item.type} "${item.title}" ${outcome}: ${item.error}`;
}

const syncSources = [["wixSync", "Wix content"], ["calendarSync", "the school calendar"]];

// Everything that deployed in an older state than its source. Any entry makes
// the Pages run fail after deployment so the usual failure email is sent.
export function partialDeploymentProblems({ wixSync = "", calendarSync = "", report = null } = {}) {
  const outcomes = { wixSync, calendarSync };
  return [
    ...syncSources.filter(([key]) => outcomes[key] === "failure")
      .map(([, label]) => `Could not read ${label}; the last deployed version was published again.`),
    ...(report?.isolated || []).map(describeIsolatedItem),
  ];
}
