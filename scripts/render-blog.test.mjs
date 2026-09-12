import assert from "node:assert/strict";
import test from "node:test";
import { parseDocument } from "htmlparser2";
import { selectAll, selectOne } from "css-select";
import { textContent } from "domutils";
import { mergeWixContent } from "./render-wix-content.mjs";
import { renderBlogArticle } from "./render-blog.mjs";

function mergePost(post, schemaVersion = 3) {
  return mergeWixContent([
    { slug: "", title: "Home", description: "School news", content: "" },
    { slug: "blog", title: "News", description: "School news", content: "" },
  ], {
    schemaVersion, source: "test", cms: { pages: [], boardMembers: [] },
    blogPosts: [post], events: [], products: [], storeCollections: [],
  });
}

function render(overrides = {}) {
  const post = {
    slug: "school-update", title: "A school update", excerpt: "A brief listing summary.",
    contentText: "The complete article.", publishedAt: "2026-09-08T08:00:00.000Z",
    updatedAt: "2026-09-08T20:00:00.000Z", ...overrides,
  };
  const page = mergePost(post).find(page => page.layout === "blog");
  assert.equal(page.layout, "blog");
  assert.equal(page.description, post.excerpt);
  return parseDocument(renderBlogArticle(page, "../../"));
}

test("blog articles use one compact title, full body and news navigation without an excerpt or sidebar", () => {
  const document = render({ title: "School <news> & updates" });
  assert.equal(selectAll("h1", document).length, 1);
  assert.equal(textContent(selectOne("h1", document)), "School <news> & updates");
  assert.equal(textContent(selectOne(".article-body", document)), "The complete article.");
  assert.doesNotMatch(textContent(document), /A brief listing summary/);
  assert.equal(selectAll(".page-hero, .page-aside", document).length, 0);
  assert.equal(selectAll('a[href="../../blog/"]', document).length, 2);
  assert(selectOne('.blog-end a[href="mailto:askthepta@montlakepta.org"]', document));
});

test("publication metadata omits redundant same-day updates and invalid or missing dates", () => {
  const sameDay = render();
  assert.equal(selectAll(".blog-meta time", sameDay).length, 1);
  assert.equal(textContent(selectOne(".blog-meta", sameDay)), "September 8, 2026");
  const nextDay = render({ updatedAt: "2026-09-09T08:00:00.000Z" });
  assert.equal(selectAll(".blog-meta time", nextDay).length, 2);
  assert.match(textContent(selectOne(".blog-meta", nextDay)), /Updated September 9, 2026/);
  const missing = render({ publishedAt: null, updatedAt: "not a date" });
  assert.equal(selectAll(".blog-meta", missing).length, 0);
});

test("standalone covers are optional and never use the cropped detail-image treatment", () => {
  const withCover = render({ image: "https://static.wixstatic.com/media/school.jpg" });
  assert.equal(selectAll(".blog-cover img", withCover).length, 1);
  assert.equal(selectOne(".blog-cover img", withCover).attribs.alt, "");
  assert.equal(selectAll(".detail-image", withCover).length, 0);
  for (const image of [null, "", "javascript:alert(1)"]) {
    assert.equal(selectAll(".blog-cover", render({ image })).length, 0);
  }
});

for (const bodyImage of [
  "https://static.wixstatic.com/media/school.jpg",
  "https://static.wixstatic.com/media/school.jpg/v1/fill/w_640,h_480/school.jpg",
]) {
  test(`an authored figure replaces its duplicate cover: ${bodyImage}`, () => {
    const document = render({
      image: "https://static.wixstatic.com/media/school.jpg",
      bodyHtml: `<p>Introduction.</p><figure><a href="https://example.org/photo"><img src="${bodyImage}" alt="The school entrance"></a><figcaption>Our school in September.</figcaption></figure>`,
    });
    assert.equal(selectAll("img", document).length, 1);
    assert.equal(selectAll(".blog-cover", document).length, 0);
    assert.equal(selectOne("img", document).attribs.alt, "The school entrance");
    assert.equal(textContent(selectOne("figcaption", document)), "Our school in September.");
    assert(selectOne('figure a[href="https://example.org/photo"]', document));
  });
}

test("different cover and inline images are preserved, including distinct non-Wix query URLs", () => {
  const document = render({
    image: "https://example.org/image?id=cover",
    bodyHtml: '<figure><img src="https://example.org/image?id=chart" alt="Survey chart"></figure>',
  });
  assert.equal(selectAll("img", document).length, 2);
  assert(selectOne(".blog-cover", document));
});

test("a configured cover takes priority in both news listings and the homepage feed", () => {
  const cover = "https://static.wixstatic.com/media/cover.jpg";
  const merged = mergePost({
    slug: "school-news", title: "School news", image: cover,
    bodyHtml: '<figure><img src="https://static.wixstatic.com/media/inline.jpg" alt="In the classroom"></figure>',
  });
  const index = parseDocument(merged.find(page => page.slug === "blog").content);
  const home = parseDocument(merged.find(page => page.slug === "").homeFeed);
  assert.equal(selectOne(".content-card img", index).attribs.src, cover);
  assert.equal(selectOne(".home-post img", home).attribs.src, cover);
});

for (const schemaVersion of [1, 2, 3]) {
  test(`missing covers fall back consistently without changing a schema-${schemaVersion} snapshot`, () => {
    const source = "https://static.wixstatic.com/media/school.jpg";
    const post = {
      slug: "school-news", title: "School news", image: null,
      bodyHtml: `<figure><img src="${source}" alt="School entrance"><figcaption>Welcome to school.</figcaption></figure>`,
    };
    const original = structuredClone(post);
    const merged = mergePost(post, schemaVersion);
    const index = parseDocument(merged.find(page => page.slug === "blog").content);
    const home = parseDocument(merged.find(page => page.slug === "").homeFeed);
    const detail = parseDocument(renderBlogArticle(merged.find(page => page.layout === "blog"), "../../"));
    assert.equal(selectOne(".content-card img", index).attribs.src, source);
    assert.equal(selectOne(".home-post img", home).attribs.src, source);
    assert.equal(selectAll("img", detail).length, 1);
    assert.equal(selectAll(".blog-cover", detail).length, 0);
    assert.equal(selectOne(".article-body img", detail).attribs.alt, "School entrance");
    assert.equal(textContent(selectOne("figcaption", detail)), "Welcome to school.");
    assert.deepEqual(post, original);
  });
}

test("thumbnail fallback skips unsafe sources and pixel images before selecting the first usable image", () => {
  const source = "https://example.org/photo?school=1&size=large";
  const merged = mergePost({
    slug: "school-news", title: "School news", image: "javascript:alert(1)",
    bodyHtml: `<img src="javascript:alert(1)"><img src="mailto:someone@example.org">
      <img src="https://user:password@example.org/private.jpg">
      <img src="https://meet.google.com/abc-defg-hij">
      <img src="https://example.org/pixel.gif" width="1" height="1">
      <img src="https://example.org/hidden.jpg" width="0">
      <figure><a href="https://example.org/gallery"><img src="${source.replaceAll("&", "&amp;")}" alt="School photo"></a></figure>
      <img src="https://example.org/later.jpg">`,
  });
  const index = parseDocument(merged.find(page => page.slug === "blog").content);
  const home = parseDocument(merged.find(page => page.slug === "").homeFeed);
  assert.equal(selectOne(".content-card img", index).attribs.src, source);
  assert.equal(selectOne(".home-post img", home).attribs.src, source);
});

test("canonicalized fallback URLs do not duplicate linked article figures", () => {
  const detail = render({
    image: null,
    bodyHtml: '<figure><a href="https://example.org/gallery"><img src="HTTPS://EXAMPLE.ORG/photo?school=1&amp;size=large" alt="School photo"></a><figcaption>A school day.</figcaption></figure>',
  });
  assert.equal(selectAll("img", detail).length, 1);
  assert.equal(selectAll(".blog-cover", detail).length, 0);
  assert(selectOne(".article-body figure a", detail));
});

for (const bodyHtml of [undefined, "<p>A text-only update.</p>", '<img src="data:image/png,invalid"><img src="https://example.org/pixel.gif" width="1">']) {
  test(`posts without a usable image retain text-only cards: ${bodyHtml || "plain snapshot"}`, () => {
    const merged = mergePost({ slug: "school-news", title: "School news", contentText: "A text-only update.", bodyHtml });
    const index = parseDocument(merged.find(page => page.slug === "blog").content);
    const home = parseDocument(merged.find(page => page.slug === "").homeFeed);
    assert.equal(selectAll(".content-card img", index).length, 0);
    assert(selectOne(".home-post-no-image", home));
    assert.equal(selectAll(".home-post img", home).length, 0);
  });
}

test("long articles retain semantic lists, tables and working heading anchors", () => {
  const document = render({ bodyHtml: `
    <p>Start with these instructions.</p>
    <h2>Forms &amp; accounts</h2><ol><li><p>Set up your account.</p><ul><li>Keep your student ID.</li></ul></li></ol>
    <h2>School supplies</h2><h3>Payment options</h3><p>Preserve all fee caveats.</p>
    <h2>Stay connected</h2><table><tr><th>Contact</th><td>PTA</td></tr></table>` });
  assert.equal(selectAll(".page-outline a", document).length, 3);
  for (const link of selectAll(".page-outline a", document)) {
    assert(selectOne(link.attribs.href, document));
  }
  assert(selectOne("h3#payment-options", document));
  assert(selectOne(".article-body ol li ul li", document));
  assert(selectOne(".article-body table tr td", document));
});

test("blog-only composition retains sanitized rich content and useful plain-text fallback", () => {
  const document = render({
    bodyHtml: '<p>Read <a href="https://example.org/forms">the forms</a>.</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)">',
  });
  assert(selectOne('.article-body a[href="https://example.org/forms"]', document));
  assert.equal(selectAll("script, [onerror], [src^='javascript:']", document).length, 0);
  const fallback = render({ bodyHtml: "<p></p>", contentText: "First paragraph.\n\nFinal paragraph." });
  assert.equal(selectAll(".article-body p", fallback).length, 2);
  assert.match(textContent(fallback), /Final paragraph\./);
});
