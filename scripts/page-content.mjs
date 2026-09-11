export function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function prepareContent(content, disableOutline = false, anchorSubheadings = false) {
  if (disableOutline || content.includes('class="content-grid"')) return { content, outline: "" };
  const headings = [];
  const headingCounts = new Map();
  const pattern = anchorSubheadings ? /<h([23])>([\s\S]*?)<\/h\1>/g : /<h(2)>([\s\S]*?)<\/h\1>/g;
  const preparedContent = content.replace(pattern, (_match, level, heading) => {
    const label = decodeHtml(heading.replace(/<[^>]+>/g, "").trim());
    const baseId = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const count = (headingCounts.get(baseId) || 0) + 1;
    headingCounts.set(baseId, count);
    const id = count === 1 ? baseId : `${baseId}-${count}`;
    if (level === "2") headings.push({ id, label });
    return `<h${level} id="${id}">${heading}</h${level}>`;
  });
  if (headings.length < 3) return { content: preparedContent, outline: "" };
  const links = headings.map(({ id, label }) => `<a href="#${id}">${escapeAttribute(label)}</a>`).join("");
  return {
    content: preparedContent,
    outline: `<nav class="page-outline" aria-label="On this page"><strong>On this page</strong><div>${links}</div></nav>`,
  };
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}
