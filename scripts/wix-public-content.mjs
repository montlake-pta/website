import sanitizeHtml from "sanitize-html";
import { sanitizeCmsHtml } from "./render-wix-content.mjs";

const blockTags = new Set(["p", "br", "li", "h2", "h3", "h4", "blockquote", "figcaption", "div"]);
const conferenceHosts = /(^|\.)(zoom\.(us|com)|teams\.(microsoft|live)\.com|meet\.google\.com|meet\.google|webex\.com)$/i;

// Public file links may have query parameters (including SharePoint access
// controls). Never log destinations or copy private SDK media sources.
export function publicUrl(value, { image = false } = {}) {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || isConferenceUrl(url)) return null;
    const schemes = image ? ["http:", "https:"] : ["http:", "https:", "mailto:", "tel:"];
    return schemes.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function wixMediaUrl(value) {
  if (typeof value === "object" && value) {
    if (value.src?.private === true || value.private === true) return null;
    const source = value.src;
    if (source) {
      if (source.url) return publicUrl(source.url, { image: true });
      const id = source.id || source.custom;
      return typeof id === "string" && /^[\w.~%-]+$/.test(id)
        ? `https://static.wixstatic.com/media/${id}` : null;
    }
    return wixMediaUrl(value.url);
  }
  if (typeof value !== "string") return null;
  const match = value.match(/^wix:image:\/\/v1\/([\w.~%-]+)(?:\/|$)/);
  return match ? `https://static.wixstatic.com/media/${match[1]}` : publicUrl(value, { image: true });
}

// Keep offsets stable so a secret split across bold/link nodes is removed from
// every fragment. Credential lines are intentionally omitted, not stored raw.
function redact(value) {
  return value
    .replace(/(?:https?:\/\/|www\.|tel:)[^\s<>"']+/gi, (url) =>
      isConferenceUrl(url.replace(/^www\./i, "https://www."))
        ? " ".repeat(url.length) : url)
    .replace(/\b(?:zoommtg|msteams):[^\s<>"']+/gi, (url) => " ".repeat(url.length))
    .replace(/\b(?:meeting[\s-]*(?:id|code|number)|conference[\s-]*id|(?:zoom|teams|meet)[\s-]*(?:id|code)|pass[\s-]*(?:code|word)|access[\s-]*code|dial[\s-]*in(?:[\s-]*(?:number|details))?)\s*[:#=–-]?\s*[^\n]*/gi,
      (secret) => " ".repeat(secret.length));
}

function isConferenceUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/\.$/, "");
    return conferenceHosts.test(host)
      || (host === "aka.ms" && /^\/JoinTeamsMeeting(?:\/|$)/i.test(url.pathname))
      || (url.protocol === "tel:" && /[,;#]/.test(url.href));
  } catch { return false; }
}

export function publicText(value) {
  return typeof value === "string" ? redact(value).replace(/[ \t]+\n/g, "\n").trim() : "";
}

export function publicHtml(value) {
  const safe = sanitizeCmsHtml(typeof value === "string" ? value : "");
  const chunks = [];
  const tokens = [];
  let length = 0;
  const append = (text) => { chunks.push(text); length += text.length; };
  // This pass only removes data from already allowlisted HTML. It never adds
  // tags/attributes or changes the renderer's shared sanitization policy.
  const options = {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    transformTags: {
      "*": (tagName, attributes) => {
        const attribs = { ...attributes };
        for (const key of ["href", "src"]) {
          if (attribs[key] && !publicUrl(attribs[key], { image: key === "src" })) {
            // CMS-authored relative links and approved calendar embeds survive.
            if (!/^(?:\.{0,2}\/(?!\/)|#[\w-])/.test(attribs[key])) delete attribs[key];
          }
        }
        if (attribs.alt) attribs.alt = publicText(attribs.alt);
        if (attribs.title) attribs.title = publicText(attribs.title);
        return { tagName, attribs };
      },
    },
    onOpenTag: (tag) => { if (blockTags.has(tag)) append("\n"); },
    onCloseTag: (tag) => { if (blockTags.has(tag)) append("\n"); },
    textFilter: (text) => {
      tokens.push({ start: length, length: text.length });
      append(text);
      return text;
    },
  };
  const filtered = sanitizeHtml(safe, options);
  const redacted = redact(chunks.join(""));
  let index = 0;
  return sanitizeCmsHtml(sanitizeHtml(filtered, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    textFilter: () => {
      const token = tokens[index++];
      return redacted.slice(token.start, token.start + token.length);
    },
  }));
}

export function htmlText(value) {
  const chunks = [];
  sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    onOpenTag: (tag) => { if (blockTags.has(tag)) chunks.push("\n"); },
    onCloseTag: (tag) => { if (blockTags.has(tag)) chunks.push("\n"); },
    textFilter: (text) => { chunks.push(text); return ""; },
  });
  return publicText(chunks.join("")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&"))
    .replace(/\n{3,}/g, "\n\n");
}

const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function normalizeRichBody(content, { warn = console.warn } = {}) {
  const warnings = new Set();
  function unsupported(type) {
    // Only enum-like types are reported. No node IDs, text, HTML, or URLs.
    const label = /^[A-Z_]{1,40}$/.test(type || "") ? type : "UNKNOWN";
    if (!warnings.has(label)) warn(`Unsupported Wix rich node: ${label}; no supported public representation.`);
    warnings.add(label);
  }
  function link(value, label) {
    const href = publicUrl(value?.url);
    if (value?.anchor) unsupported("ANCHOR");
    return href ? `<a href="${escape(href)}"${value.target === "BLANK" ? ' target="_blank"' : ""}>${label}</a>` : label;
  }
  function external(type, url, label, privateSource = false) {
    const href = !privateSource && publicUrl(url);
    if (!href) { unsupported(type); return ""; }
    return `<p><a href="${escape(href)}">${escape(publicText(label) || "Open external content")}</a></p>`;
  }
  function figure(data, children = "") {
    const src = wixMediaUrl(data?.image);
    if (!src) { unsupported("IMAGE"); return ""; }
    const img = `<img src="${escape(src)}" alt="${escape(publicText(data.altText))}" loading="lazy">`;
    const caption = children || (data.caption ? escape(publicText(data.caption)) : "");
    return `<figure>${link(data.link, img)}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
  }
  function nodes(values) { return Array.isArray(values) ? values.map(node).join("") : ""; }
  function node(value) {
    if (!value || typeof value !== "object") return "";
    if (value.private === true) { unsupported(value.type); return ""; }
    const children = () => nodes(value.nodes);
    switch (value.type) {
      case "TEXT": {
        let text = escape(value.textData?.text || "").replaceAll("\n", "<br>");
        for (const mark of value.textData?.decorations || []) {
          const tags = { BOLD: "strong", ITALIC: "em", UNDERLINE: "u", STRIKETHROUGH: "s" };
          const tag = Object.hasOwn(tags, mark.type) ? tags[mark.type] : null;
          if (tag) text = `<${tag}>${text}</${tag}>`;
          else if (mark.type === "LINK") text = link(mark.linkData?.link, text);
          else if (mark.type === "ANCHOR") unsupported("ANCHOR");
        }
        return text;
      }
      case "PARAGRAPH": return `<p>${children()}</p>`;
      case "HEADING": {
        const level = Math.max(2, Math.min(4, Math.trunc(Number(value.headingData?.level)) || 2));
        return `<h${level}>${children()}</h${level}>`;
      }
      case "BULLETED_LIST": return `<ul>${children()}</ul>`;
      case "ORDERED_LIST": return `<ol>${children()}</ol>`;
      case "LIST_ITEM": return `<li>${children()}</li>`;
      case "BLOCKQUOTE": return `<blockquote>${children()}</blockquote>`;
      case "DIVIDER": return "<hr>";
      case "CAPTION": return children();
      case "IMAGE": return figure(value.imageData, children());
      case "GALLERY": return (value.galleryData?.items || []).map((item) => item.image
        ? figure({ image: item.image.media, link: item.image.link, altText: item.altText, caption: item.title })
        : external("GALLERY_VIDEO", item.video?.media?.src?.url, item.title || "Watch video", item.video?.media?.src?.private)).join("");
      case "BUTTON": return external("BUTTON", value.buttonData?.link?.url, value.buttonData?.text);
      case "LINK_PREVIEW": return external("LINK_PREVIEW", value.linkPreviewData?.link?.url, value.linkPreviewData?.title);
      case "FILE": return external("FILE", value.fileData?.src?.url, value.fileData?.name || "Open file", value.fileData?.src?.private);
      case "VIDEO": return external("VIDEO", value.videoData?.video?.src?.url, value.videoData?.title || "Watch video", value.videoData?.video?.src?.private);
      case "AUDIO": return external("AUDIO", value.audioData?.audio?.src?.url, value.audioData?.name || "Listen to audio", value.audioData?.audio?.src?.private);
      case "EMBED": return external("EMBED", value.embedData?.src || value.embedData?.oembed?.url, value.embedData?.oembed?.title);
      case "APP_EMBED": return external("APP_EMBED", value.appEmbedData?.url, value.appEmbedData?.name);
      case "HTML": return external("HTML", value.htmlData?.url, "Open external content");
      default: unsupported(value.type); return children();
    }
  }
  const bodyHtml = publicHtml(nodes(content?.nodes));
  return { bodyHtml, text: htmlText(bodyHtml) };
}
