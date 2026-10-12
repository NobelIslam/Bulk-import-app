// Converts an existing Shopify article into an editable blog document. Runs in
// the browser (it needs DOMParser); the server normalizes the result again.
//
// Simple content becomes native elements (headings, text, images, quotes,
// dividers, videos). Anything with its own layout or styling — tables, styled
// divs, forms of embeds we don't know — becomes a Custom HTML element, so
// nothing from the original post is lost.

import { defaultBlock, defaultDesign, defaultPostSettings, slugifyHandle, videoEmbedUrl } from "./blocks.js";
import { richTextToPlain, sanitizeRichText } from "../forms/content.js";

const TEXT_TAGS = new Set(["P", "UL", "OL"]);
const INLINE_TAGS = new Set(["A", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "SPAN", "BR", "SMALL", "SUB", "SUP", "MARK", "CODE"]);
const WRAPPER_TAGS = new Set(["DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER", "CENTER"]);

function block(type, props = {}, style = {}) {
  const entry = defaultBlock(type);
  return { ...entry, props: { ...entry.props, ...props }, style: { ...entry.style, ...style } };
}

function alignOf(el) {
  const align = (el.style?.textAlign || el.getAttribute?.("align") || "").toLowerCase();
  return ["left", "center", "right", "justify"].includes(align) ? align : "";
}

function imageBlock(img, { link = "", caption = "" } = {}) {
  const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
  if (!src) return null;
  const url = src.startsWith("//") ? `https:${src}` : src;
  return block("image", { url, alt: img.getAttribute("alt") || "", link, caption });
}

// A wrapper whose only job is grouping is unwrapped; one with an inline style
// carries its own look and is kept whole as Custom HTML.
function isPlainWrapper(el) {
  if (!WRAPPER_TAGS.has(el.tagName)) return false;
  const style = (el.getAttribute("style") || "").trim();
  return !style && el.children.length > 0;
}

function hasOnlyMedia(el) {
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  return !text && el.querySelector("img, iframe");
}

export function htmlToBlocks(html) {
  const doc = new DOMParser().parseFromString(`<div id="tcl-import-root">${html || ""}</div>`, "text/html");
  const blocks = [];
  let textBuffer = "";

  const flushText = () => {
    const clean = sanitizeRichText(textBuffer, 20000);
    if (richTextToPlain(clean)) blocks.push(block("text", { html: clean }));
    textBuffer = "";
  };
  const pushBlock = (entry) => {
    if (!entry) return;
    flushText();
    blocks.push(entry);
  };
  const pushHtml = (el) => pushBlock(block("html", { code: el.outerHTML }));

  const visit = (node) => {
    if (node.nodeType === 3) {
      const text = node.textContent.replace(/\s+/g, " ");
      if (text.trim()) textBuffer += `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    const tag = el.tagName;

    if (/^H[1-6]$/.test(tag)) {
      const text = richTextToPlain(el.innerHTML);
      if (text) pushBlock(block("heading", { text, level: Number(tag[1]), fontSize: 0 }, { align: alignOf(el) }));
      return;
    }
    if (tag === "HR") return pushBlock(block("divider"));
    if (tag === "IMG") return pushBlock(imageBlock(el));
    if (tag === "FIGURE") {
      const img = el.querySelector("img");
      if (img && !el.querySelector("iframe, table")) {
        const link = img.closest("a")?.getAttribute("href") || "";
        const caption = el.querySelector("figcaption")?.textContent.trim() || "";
        return pushBlock(imageBlock(img, { link, caption }));
      }
      return pushHtml(el);
    }
    if (tag === "IFRAME") {
      const video = videoEmbedUrl(el.getAttribute("src"));
      return video ? pushBlock(block("video", { url: el.getAttribute("src") })) : pushHtml(el);
    }
    if (tag === "BLOCKQUOTE") {
      const cite = el.querySelector("cite, footer");
      const citeText = cite ? cite.textContent.trim().replace(/^[—–-]\s*/, "") : "";
      if (cite) cite.remove();
      return pushBlock(block("quote", { html: sanitizeRichText(el.innerHTML, 5000), cite: citeText }));
    }
    if (TEXT_TAGS.has(tag)) {
      if (hasOnlyMedia(el)) {
        // A paragraph that only holds media becomes image/video elements.
        el.querySelectorAll("img, iframe").forEach((media) => {
          if (media.tagName === "IMG") pushBlock(imageBlock(media, { link: media.closest("a")?.getAttribute("href") || "" }));
          else visit(media);
        });
        return;
      }
      if (el.querySelector("img, iframe")) {
        // Text with media inside: keep text and media as separate elements.
        const media = [...el.querySelectorAll("img, iframe")];
        media.forEach((m) => m.remove());
        textBuffer += el.outerHTML;
        media.forEach((m) => visit(m));
        return;
      }
      const align = alignOf(el);
      if (align && align !== "left") {
        pushBlock(block("text", { html: sanitizeRichText(el.outerHTML, 20000) }, { align }));
        return;
      }
      textBuffer += el.outerHTML;
      return;
    }
    if (INLINE_TAGS.has(tag)) {
      if (tag === "A" && hasOnlyMedia(el)) {
        const img = el.querySelector("img");
        if (img) return pushBlock(imageBlock(img, { link: el.getAttribute("href") || "" }));
      }
      if (tag === "BR") return;
      textBuffer += `<p>${el.outerHTML}</p>`;
      return;
    }
    if (isPlainWrapper(el)) {
      [...el.childNodes].forEach(visit);
      return;
    }
    if (WRAPPER_TAGS.has(tag) && !el.children.length) {
      // A styled or classed div that only holds text.
      const text = richTextToPlain(el.innerHTML);
      if (text && !el.getAttribute("style")) {
        textBuffer += `<p>${el.innerHTML}</p>`;
        return;
      }
    }
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "META" || tag === "LINK") return;
    pushHtml(el);
  };

  const root = doc.getElementById("tcl-import-root");
  [...root.childNodes].forEach(visit);
  flushText();
  return blocks;
}

// Builds a full editor document from an article returned by the server.
export function articleToDoc(article) {
  const post = {
    ...defaultPostSettings(),
    title: article.title || "Untitled post",
    blogId: article.blog?.id || "",
    author: article.author?.name || "",
    image: article.image?.url || "",
    imageAlt: article.image?.altText || "",
    summary: richTextToPlain(article.summary || ""),
    tags: (article.tags || []).join(", "),
    handle: slugifyHandle(article.handle || ""),
    seoTitle: article.seoTitle?.value || "",
    seoDescription: article.seoDescription?.value || "",
  };
  // Imported posts keep the theme's width and typography, like they had before.
  const design = { ...defaultDesign(), contentWidth: 0, fontSize: 0, lineHeight: 0, blockGap: 16 };
  return { version: 1, post, design, blocks: htmlToBlocks(article.body || "") };
}
