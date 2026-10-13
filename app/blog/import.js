// Converts a Shopify article's HTML into an editable blog document. Runs in
// the browser (it needs DOMParser); the server normalizes the result again.
//
// Plain content becomes native elements (headings, text, images, quotes,
// dividers, videos). HTML published by this builder is read back into its own
// structures: sections, columns and each element's colors, spacing and
// widths. Anything else with its own layout (tables, unknown styled boxes)
// becomes a Custom HTML element, so nothing from the original post is lost.

import { createId, defaultBlock, defaultBlockStyle, defaultDesign, defaultPostSettings, slugifyHandle, videoEmbedUrl } from "./blocks.js";
import { richTextToPlain, sanitizeRichText } from "../forms/content.js";
import { parseColor, toHex } from "../forms/color.js";

const TEXT_TAGS = new Set(["P", "UL", "OL"]);
const INLINE_TAGS = new Set(["A", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "SPAN", "BR", "SMALL", "SUB", "SUP", "MARK", "CODE"]);
const WRAPPER_TAGS = new Set(["DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FOOTER", "CENTER"]);
const SIDES = ["Top", "Right", "Bottom", "Left"];

function block(type, props = {}, style = {}) {
  const entry = defaultBlock(type);
  return { ...entry, props: { ...entry.props, ...props }, style: { ...entry.style, ...style } };
}

function alignOf(el) {
  const align = (el.style?.textAlign || el.getAttribute?.("align") || "").toLowerCase();
  return ["left", "center", "right", "justify"].includes(align) ? align : "";
}

// ─── Inline style reading ────────────────────────────────────────────────────

const num = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function color(value) {
  if (!value || value === "transparent") return "";
  const parsed = parseColor(value);
  return parsed && parsed.a > 0 ? toHex(parsed) : "";
}

function box(style, prop) {
  const out = {};
  SIDES.forEach((side) => {
    out[side.toLowerCase()] = Math.round(num(style[`${prop}${side}`]));
  });
  return out;
}

// The element style the builder writes on its wrappers (see wrapperStyle).
function blockStyleFrom(el) {
  const st = el.style;
  return {
    ...defaultBlockStyle(),
    margin: box(st, "margin"),
    padding: box(st, "padding"),
    background: color(st.backgroundColor),
    textColor: color(st.color),
    align: alignOf(el),
    borderWidth: Math.round(num(st.borderTopWidth)),
    borderColor: color(st.borderTopColor) || "#e1e3e5",
    borderRadius: Math.round(num(st.borderTopLeftRadius)),
    shadow: Boolean(st.boxShadow && st.boxShadow !== "none"),
    maxWidth: Math.round(num(st.maxWidth)),
  };
}

const VALIGN = { "flex-start": "top", center: "center", "flex-end": "bottom" };

function styleOnly(el, allowed) {
  const props = [...el.style].filter((name) => !allowed.some((prefix) => name.startsWith(prefix)));
  return props.length === 0;
}

// ─── Builder structures ──────────────────────────────────────────────────────

// <div style="display:flex;flex-wrap:…;gap"><div style="flex:N 1 0">…</div>…</div>
function isColumns(el) {
  const kids = [...el.children];
  return (
    el.style.display === "flex" &&
    el.style.flexDirection !== "column" &&
    kids.length >= 1 &&
    kids.length <= 6 &&
    kids.every((kid) => kid.tagName === "DIV" && num(kid.style.flexGrow) > 0)
  );
}

function toColumns(el, convert) {
  const kids = [...el.children];
  const minWidth = /min\((\d+)px/.exec(kids[0].style.minWidth || "");
  return block(
    "columns",
    {
      preset: "custom",
      gap: Math.round(num(el.style.columnGap || el.style.gap)),
      verticalAlign: VALIGN[el.style.alignItems] || "top",
      stackAt: el.style.flexWrap === "nowrap" ? 0 : minWidth ? Number(minWidth[1]) : 220,
      columns: kids.map((kid) => ({
        id: createId("col"),
        width: num(kid.style.flexGrow),
        blocks: convert(kid.childNodes),
        background: color(kid.style.backgroundColor),
        padding: Math.round(num(kid.style.paddingTop)),
        verticalAlign: VALIGN[kid.style.justifyContent] || "top",
      })),
    },
    blockStyleFrom(el),
  );
}

// <div style="section look"><div style="…flex-direction:column;margin-left:auto">…</div></div>
function isSection(el) {
  const kids = [...el.children];
  if (kids.length !== 1 || kids[0].tagName !== "DIV") return false;
  const inner = kids[0].style;
  return inner.flexDirection === "column" && inner.marginLeft === "auto" && inner.width === "100%";
}

function toSection(el, convert) {
  const inner = el.children[0];
  const st = el.style;
  const image = /url\(["']?([^"')]+)["']?\)/.exec(st.backgroundImage || "");
  const overlay = /linear-gradient\((rgba?\([^)]*\)|#[0-9a-f]+),/i.exec(st.backgroundImage || "");
  return block(
    "section",
    {
      children: convert(inner.childNodes),
      backgroundImage: image ? image[1] : "",
      overlay: overlay ? color(overlay[1]) : "",
      contentWidth: Math.round(num(inner.style.maxWidth)),
      minHeight: Math.round(num(st.minHeight)),
      verticalAlign: VALIGN[st.justifyContent] || "top",
    },
    blockStyleFrom(el),
  );
}

// ─── Plain HTML ──────────────────────────────────────────────────────────────

function imageBlock(img, { link = "", caption = "" } = {}) {
  const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
  if (!src) return null;
  const url = src.startsWith("//") ? `https:${src}` : src;
  const st = img.style;
  const ratio = /^(\d+)\s*\/\s*(\d+)$/.exec(st.aspectRatio || "");
  const props = { url, alt: img.getAttribute("alt") || "", link, caption };
  if (ratio) {
    props.aspect = `${ratio[1]}:${ratio[2]}`;
    props.fit = st.objectFit === "contain" ? "contain" : "cover";
    props.focus = ["top", "bottom", "left", "right"].includes(st.objectPosition) ? st.objectPosition : "center";
  }
  const figure = img.closest("figure");
  if (figure && /%$/.test(figure.style.width || "")) props.width = Math.round(num(figure.style.width));
  return block("image", props);
}

// A wrapper whose only job is grouping is unwrapped.
function isPlainWrapper(el) {
  if (!WRAPPER_TAGS.has(el.tagName)) return false;
  if (el.classList.contains("tcl-blog")) return true;
  return el.children.length > 0 && styleOnly(el, ["box-sizing"]);
}

// A link styled as a button (the builder's Button element, or a theme button).
function isButtonLink(el) {
  const st = el.style;
  return (st.display === "inline-block" || st.display === "block") && Boolean(st.padding || st.borderTopWidth || st.backgroundColor);
}

const BUTTON_SIZES = { "8px 16px": "sm", "12px 24px": "md", "16px 32px": "lg" };

function buttonBlock(el) {
  const st = el.style;
  const background = color(st.backgroundColor);
  const border = color(st.borderTopColor);
  const variant = st.paddingTop === "0px" ? "link" : background ? "solid" : "outline";
  return block("button", {
    label: (el.textContent || "").trim(),
    url: el.getAttribute("href") || "",
    newTab: el.getAttribute("target") === "_blank",
    variant,
    size: BUTTON_SIZES[st.padding] || "md",
    color: (variant === "solid" ? background : border || color(st.color)) || "#111111",
    labelColor: variant === "solid" ? color(st.color) || "#ffffff" : "#ffffff",
    radius: Math.round(num(st.borderTopLeftRadius)),
    fullWidth: st.display === "block",
  });
}

function hasOnlyMedia(el) {
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  return !text && el.querySelector("img, iframe");
}

function convertNodes(nodes) {
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
      if (!text) return;
      const st = el.style;
      return pushBlock(
        block(
          "heading",
          {
            text,
            level: Number(tag[1]),
            fontSize: Math.round(num(st.fontSize)),
            fontWeight: st.fontWeight ? Math.round(num(st.fontWeight) / 100) * 100 || 700 : 700,
            lineHeight: num(st.lineHeight),
            letterSpacing: num(st.letterSpacing),
            uppercase: st.textTransform === "uppercase",
          },
          { align: alignOf(el), textColor: color(st.color) },
        ),
      );
    }
    if (tag === "HR") {
      const st = el.style;
      const line = /(\d+)px\s+(solid|dashed|dotted|double)\s+(.+)/.exec(st.borderTop || "");
      return pushBlock(
        block("divider", line ? { thickness: Number(line[1]), lineStyle: line[2], color: color(line[3]) || "#e1e3e5", width: /%$/.test(st.width) ? Math.round(num(st.width)) : 100 } : {}),
      );
    }
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
        el.querySelectorAll("img, iframe").forEach((media) => {
          if (media.tagName === "IMG") pushBlock(imageBlock(media, { link: media.closest("a")?.getAttribute("href") || "" }));
          else visit(media);
        });
        return;
      }
      if (el.querySelector("img, iframe")) {
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
    if (tag === "A" && isButtonLink(el)) return pushBlock(buttonBlock(el));
    if (INLINE_TAGS.has(tag)) {
      if (tag === "A" && hasOnlyMedia(el)) {
        const img = el.querySelector("img");
        if (img) return pushBlock(imageBlock(img, { link: el.getAttribute("href") || "" }));
      }
      if (tag === "BR") return;
      textBuffer += `<p>${el.outerHTML}</p>`;
      return;
    }
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "META" || tag === "LINK") return;

    if (WRAPPER_TAGS.has(tag)) {
      if (isPlainWrapper(el)) {
        [...el.childNodes].forEach(visit);
        return;
      }
      if (isColumns(el)) return pushBlock(toColumns(el, convertNodes));
      if (isSection(el)) return pushBlock(toSection(el, convertNodes));

      // Builder text with its own size: <div style="font-size;line-height"><p>…</p></div>
      if (el.children.length && [...el.children].every((kid) => TEXT_TAGS.has(kid.tagName)) && styleOnly(el, ["font-size", "line-height"])) {
        return pushBlock(
          block("text", { html: sanitizeRichText(el.innerHTML, 20000), fontSize: Math.round(num(el.style.fontSize)), lineHeight: num(el.style.lineHeight) }),
        );
      }

      // A styled wrapper around one element: convert the element, keep the look.
      if (el.children.length === 1 && el.style.display !== "flex") {
        const inner = convertNodes(el.childNodes);
        if (inner.length === 1 && inner[0].type !== "html") {
          const look = blockStyleFrom(el);
          return pushBlock({ ...inner[0], style: { ...look, align: look.align || inner[0].style.align } });
        }
      }

      if (!el.children.length) {
        const text = richTextToPlain(el.innerHTML);
        if (text && !el.getAttribute("style")) {
          textBuffer += `<p>${el.innerHTML}</p>`;
          return;
        }
      }
    }
    pushHtml(el);
  };

  [...nodes].forEach(visit);
  flushText();
  return blocks;
}

export function htmlToBlocks(html) {
  const doc = new DOMParser().parseFromString(`<div id="tcl-import-root">${html || ""}</div>`, "text/html");
  return convertNodes(doc.getElementById("tcl-import-root").childNodes);
}

// Replaces a document's content and post details with the article's current
// version from Shopify, keeping the builder's own design settings.
export function mergeArticleIntoDoc(doc, article) {
  const fresh = articleToDoc(article);
  return {
    ...doc,
    post: { ...fresh.post, blogId: fresh.post.blogId || doc.post.blogId },
    blocks: fresh.blocks,
  };
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
