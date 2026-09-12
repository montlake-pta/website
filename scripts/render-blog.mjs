import { parseDocument } from "htmlparser2";
import { getElementsByTagName } from "domutils";
import { escapeAttribute as escape, prepareContent } from "./page-content.mjs";
import { formatDate } from "./render-wix-content.mjs";
import { publicUrl } from "./wix-public-content.mjs";

function imageIdentity(source) {
  const url = publicUrl(source, { image: true });
  const media = url?.match(/^https:\/\/static\.wixstatic\.com\/media\/([^/?#]+)/i);
  return media ? `wix:${media[1]}` : url;
}

export function renderBlogArticle(page, base) {
  const prepared = prepareContent(page.content, false, true);
  const published = formatDate(page.publishedAt);
  const updated = formatDate(page.updatedAt);
  const dates = [
    published ? `<time datetime="${escape(page.publishedAt)}">${escape(published)}</time>` : "",
    updated && updated !== published ? `<span>Updated <time datetime="${escape(page.updatedAt)}">${escape(updated)}</time></span>` : "",
  ].filter(Boolean);
  const cover = publicUrl(page.image, { image: true });
  const images = getElementsByTagName("img", parseDocument(prepared.content));
  const duplicateCover = cover && images.some(image => imageIdentity(image.attribs.src) === imageIdentity(cover));

  return `<article class="blog-post prose">
    <header class="blog-header">
      <nav aria-label="News"><a class="blog-back" href="${base}blog/">← All news</a></nav>
      <h1>${escape(page.title)}</h1>
      ${dates.length ? `<p class="blog-meta">${dates.join('<span aria-hidden="true"> · </span>')}</p>` : ""}
    </header>
    ${prepared.outline}
    ${cover && !duplicateCover ? `<figure class="blog-cover"><img src="${escape(cover)}" alt="" loading="lazy"></figure>` : ""}
    ${prepared.content}
    <footer class="blog-end">
      <a class="blog-back" href="${base}blog/">← Back to all news</a>
      <p>Questions about this update? <a href="mailto:askthepta@montlakepta.org">Email the PTA</a>.</p>
    </footer>
  </article>`;
}
