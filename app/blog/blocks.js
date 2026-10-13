// Blog post documents: block registry, tree operations, normalization and the
// HTML renderer. Shared by the builder (client), the server and tests, so the
// canvas and the published article are produced by the same code and must stay
// free of Node/DOM-only imports.
//
// A document is { post, design, blocks }. Blocks form a tree: a `section` holds
// `children`, a `columns` block holds `columns: [{ id, width, blocks }]`.
// Containers are addressed by id: "root" for the top level, a section's id,
// or a column's id.

import { escapeHtml, sanitizeColor, sanitizeImageUrl, sanitizeRichText, sanitizeUrl } from "../forms/content.js";

export const ROOT = "root";
export const MAX_BLOCKS = 400;
const MAX_DEPTH = 6;

// ─── Registry ────────────────────────────────────────────────────────────────

export const BLOCK_GROUPS = [
  { key: "layout", title: "Layout", hint: "Containers that hold other elements" },
  { key: "basic", title: "Text & media" },
  { key: "more", title: "More" },
];

export const BLOCK_TYPES = [
  { type: "section", label: "Section", group: "layout", icon: "section", container: true, description: "A full-width band with its own background. Drop elements inside." },
  { type: "columns", label: "Columns", group: "layout", icon: "columns", container: true, description: "Side-by-side columns. They stack on phones." },
  { type: "heading", label: "Heading", group: "basic", icon: "heading", description: "A title for a part of your post" },
  { type: "text", label: "Text", group: "basic", icon: "text", description: "Paragraphs with bold, italic, links and lists" },
  { type: "image", label: "Image", group: "basic", icon: "image", description: "A picture with optional caption and link" },
  { type: "button", label: "Button", group: "basic", icon: "button", description: "A call-to-action link styled as a button" },
  { type: "video", label: "Video", group: "basic", icon: "video", description: "A YouTube or Vimeo video" },
  { type: "quote", label: "Quote", group: "more", icon: "quote", description: "A highlighted quote or callout" },
  { type: "list", label: "Checklist", group: "more", icon: "list", description: "Bullet points with a custom icon" },
  { type: "divider", label: "Divider", group: "more", icon: "divider", description: "A line between parts of the post" },
  { type: "spacer", label: "Spacer", group: "more", icon: "spacer", description: "Empty space between elements" },
  { type: "html", label: "Custom HTML", group: "more", icon: "code", description: "Your own HTML snippet (scripts are removed)" },
];

const TYPE_MAP = Object.fromEntries(BLOCK_TYPES.map((entry) => [entry.type, entry]));
export function getBlockType(type) {
  return TYPE_MAP[type] || null;
}

export const COLUMN_PRESETS = [
  { value: "1-1", label: "½ ½", widths: [1, 1] },
  { value: "1-2", label: "⅓ ⅔", widths: [1, 2] },
  { value: "2-1", label: "⅔ ⅓", widths: [2, 1] },
  { value: "1-1-1", label: "⅓ ⅓ ⅓", widths: [1, 1, 1] },
  { value: "1-2-1", label: "¼ ½ ¼", widths: [1, 2, 1] },
  { value: "1-1-1-1", label: "¼ ¼ ¼ ¼", widths: [1, 1, 1, 1] },
];

export const FONT_FAMILIES = [
  { value: "inherit", label: "Theme font", stack: "inherit" },
  { value: "system", label: "System", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { value: "serif", label: "Georgia (serif)", stack: 'Georgia, "Times New Roman", serif' },
  { value: "helvetica", label: "Helvetica", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { value: "mono", label: "Monospace", stack: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
];

export const SPACING_SIDES = ["top", "right", "bottom", "left"];

// ─── Factories ───────────────────────────────────────────────────────────────

let counter = 0;
export function createId(prefix = "b") {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function box(top = 0, right = 0, bottom = 0, left = 0) {
  return { top, right, bottom, left };
}

export function defaultBlockStyle() {
  return {
    margin: box(0, 0, 0, 0),
    padding: box(0, 0, 0, 0),
    background: "",
    textColor: "",
    align: "",
    borderWidth: 0,
    borderColor: "#e1e3e5",
    borderRadius: 0,
    shadow: false,
    maxWidth: 0,
  };
}

export const MAX_COLUMNS = 6;

function column(width = 1, blocks = []) {
  return { id: createId("col"), width, blocks, background: "", padding: 0, verticalAlign: "top" };
}

const DEFAULT_PROPS = {
  section: () => ({ children: [], backgroundImage: "", overlay: "", contentWidth: 0, minHeight: 0, verticalAlign: "top" }),
  columns: () => ({ preset: "1-1", columns: [column(), column()], gap: 24, verticalAlign: "top", stackAt: 220 }),
  heading: () => ({ text: "Your heading", level: 2, fontSize: 0, fontWeight: 700, lineHeight: 0, letterSpacing: 0, uppercase: false }),
  text: () => ({ html: "<p>Write something your readers will love. Select text to make it <strong>bold</strong>, <em>italic</em> or a link.</p>", fontSize: 0, lineHeight: 0 }),
  image: () => ({ url: "", alt: "", width: 100, link: "", newTab: false, caption: "", aspect: "auto", focus: "center", fit: "cover" }),
  button: () => ({ label: "Shop now", url: "/collections/all", newTab: false, variant: "solid", size: "md", color: "#111111", labelColor: "#ffffff", radius: 8, fullWidth: false }),
  video: () => ({ url: "", aspect: "16:9" }),
  quote: () => ({ html: "<p>A memorable line from your post goes here.</p>", cite: "", accent: "#111111", variant: "bar", fontSize: 0 }),
  list: () => ({ items: ["First point", "Second point", "Third point"], icon: "check", iconColor: "#008060", gap: 8 }),
  divider: () => ({ thickness: 1, color: "#e1e3e5", width: 100, lineStyle: "solid" }),
  spacer: () => ({ height: 40 }),
  html: () => ({ code: "<p>Custom HTML</p>" }),
};

export function defaultBlock(type) {
  if (!DEFAULT_PROPS[type]) return null;
  const block = { id: createId(), type, props: DEFAULT_PROPS[type](), style: defaultBlockStyle() };
  if (type === "section") block.style.padding = box(48, 24, 48, 24);
  if (type === "button" || type === "image") block.style.margin = box(0, 0, 0, 0);
  return block;
}

export function defaultDesign() {
  return {
    contentWidth: 760,
    fontFamily: "inherit",
    fontSize: 17,
    lineHeight: 1.7,
    textColor: "",
    headingColor: "",
    linkColor: "",
    background: "",
    blockGap: 20,
  };
}

export function defaultPostSettings() {
  return {
    title: "Untitled post",
    blogId: "",
    author: "",
    image: "",
    imageAlt: "",
    summary: "",
    tags: "",
    handle: "",
    seoTitle: "",
    seoDescription: "",
  };
}

export function emptyDoc() {
  return { version: 1, post: defaultPostSettings(), design: defaultDesign(), blocks: [] };
}

// ─── Tree helpers ────────────────────────────────────────────────────────────

function childLists(block) {
  if (block.type === "section") return [{ id: block.id, blocks: block.props.children }];
  if (block.type === "columns") return block.props.columns.map((col) => ({ id: col.id, blocks: col.blocks }));
  return [];
}

// Calls fn(block, containerId, index, depth) for every block, depth first.
export function walk(blocks, fn, containerId = ROOT, depth = 0) {
  blocks.forEach((block, index) => {
    fn(block, containerId, index, depth);
    childLists(block).forEach((list) => walk(list.blocks, fn, list.id, depth + 1));
  });
}

export function countBlocks(blocks) {
  let total = 0;
  walk(blocks, () => {
    total += 1;
  });
  return total;
}

export function findBlock(blocks, id) {
  let found = null;
  walk(blocks, (block, containerId, index) => {
    if (!found && block.id === id) found = { block, containerId, index };
  });
  return found;
}

// Container ids inside a block (its own sections/columns and all nested ones).
export function containerIdsWithin(block) {
  const ids = new Set();
  const visit = (entry) => {
    childLists(entry).forEach((list) => {
      ids.add(list.id);
      list.blocks.forEach(visit);
    });
  };
  visit(block);
  return ids;
}

export function getContainerBlocks(blocks, containerId) {
  if (containerId === ROOT) return blocks;
  let result = null;
  walk(blocks, (block) => {
    if (result) return;
    childLists(block).forEach((list) => {
      if (list.id === containerId) result = list.blocks;
    });
  });
  return result;
}

// Immutable update of one container's block list.
function mapContainer(blocks, containerId, fn) {
  if (containerId === ROOT) return fn(blocks);
  let changed = false;
  const visit = (list) =>
    list.map((block) => {
      if (block.type === "section") {
        if (block.id === containerId) {
          changed = true;
          return { ...block, props: { ...block.props, children: fn(block.props.children) } };
        }
        const children = visit(block.props.children);
        return children === block.props.children ? block : { ...block, props: { ...block.props, children } };
      }
      if (block.type === "columns") {
        let touched = false;
        const columns = block.props.columns.map((col) => {
          if (col.id === containerId) {
            changed = true;
            touched = true;
            return { ...col, blocks: fn(col.blocks) };
          }
          const inner = visit(col.blocks);
          if (inner !== col.blocks) touched = true;
          return inner === col.blocks ? col : { ...col, blocks: inner };
        });
        return touched ? { ...block, props: { ...block.props, columns } } : block;
      }
      return block;
    });
  const next = visit(blocks);
  return changed ? next : blocks;
}

export function insertBlock(blocks, containerId, index, block) {
  return mapContainer(blocks, containerId, (list) => {
    const next = [...list];
    const at = index === null || index === undefined || index > next.length ? next.length : Math.max(0, index);
    next.splice(at, 0, block);
    return next;
  });
}

export function removeBlock(blocks, id) {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  return mapContainer(blocks, found.containerId, (list) => list.filter((entry) => entry.id !== id));
}

// Moves a block to `index` in `containerId`, where index counts positions in
// the target list as it is before the move.
export function moveBlock(blocks, id, containerId, index) {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  if (containerIdsWithin(found.block).has(containerId)) return blocks;
  let at = index;
  if (found.containerId === containerId) {
    if (at === found.index || at === found.index + 1) return blocks;
    if (at > found.index) at -= 1;
  }
  return insertBlock(removeBlock(blocks, id), containerId, at, found.block);
}

export function updateBlock(blocks, id, updater) {
  const found = findBlock(blocks, id);
  if (!found) return blocks;
  return mapContainer(blocks, found.containerId, (list) =>
    list.map((entry) => (entry.id === id ? updater(entry) : entry)),
  );
}

// Deep copy with fresh ids, so duplicates never share container ids.
export function cloneBlock(block) {
  const copy = JSON.parse(JSON.stringify(block));
  const reassign = (entry) => {
    entry.id = createId();
    if (entry.type === "section") entry.props.children.forEach(reassign);
    if (entry.type === "columns") {
      entry.props.columns.forEach((col) => {
        col.id = createId("col");
        col.blocks.forEach(reassign);
      });
    }
  };
  reassign(copy);
  return copy;
}

export function duplicateBlock(blocks, id) {
  const found = findBlock(blocks, id);
  if (!found) return { blocks, copy: null };
  const copy = cloneBlock(found.block);
  return { blocks: insertBlock(blocks, found.containerId, found.index + 1, copy), copy };
}

// Changing the column preset keeps content: extra columns are merged into the
// last remaining one, new columns start empty.
export function applyColumnPreset(block, preset) {
  const entry = COLUMN_PRESETS.find((option) => option.value === preset);
  if (!entry || block.type !== "columns") return block;
  const current = block.props.columns;
  const next = entry.widths.map((width, index) => {
    if (index < current.length) return { ...column(width), ...current[index], width };
    return column(width);
  });
  if (current.length > next.length) {
    const overflow = current.slice(next.length).flatMap((col) => col.blocks);
    next[next.length - 1] = { ...next[next.length - 1], blocks: [...next[next.length - 1].blocks, ...overflow] };
  }
  return { ...block, props: { ...block.props, preset, columns: next } };
}

// Column widths as percentages of the row (they're stored as flex weights).
export function columnPercents(block) {
  const total = block.props.columns.reduce((sum, col) => sum + col.width, 0) || 1;
  return block.props.columns.map((col) => (col.width / total) * 100);
}

const round1 = (value) => Math.round(value * 10) / 10;

// Sets one column to `percent` of the row; the others share the rest in
// their current proportions.
export function setColumnWidth(block, index, percent) {
  const percents = columnPercents(block);
  const count = percents.length;
  if (count < 2) return block;
  const min = 5;
  const target = Math.min(100 - min * (count - 1), Math.max(min, percent));
  const othersTotal = percents.reduce((sum, value, i) => (i === index ? sum : sum + value), 0) || 1;
  const next = percents.map((value, i) => (i === index ? target : Math.max(min, (value / othersTotal) * (100 - target))));
  return {
    ...block,
    props: {
      ...block.props,
      preset: "custom",
      columns: block.props.columns.map((col, i) => ({ ...col, width: round1(next[i]) })),
    },
  };
}

// Drag-resize between two neighbouring columns: `fraction` is the left
// column's share of the pair.
export function resizeColumnPair(block, leftIndex, fraction) {
  const cols = block.props.columns;
  if (leftIndex < 0 || leftIndex >= cols.length - 1) return block;
  const percents = columnPercents(block);
  const pair = percents[leftIndex] + percents[leftIndex + 1];
  const f = Math.min(0.92, Math.max(0.08, fraction));
  const next = [...percents];
  next[leftIndex] = pair * f;
  next[leftIndex + 1] = pair * (1 - f);
  return {
    ...block,
    props: { ...block.props, preset: "custom", columns: cols.map((col, i) => ({ ...col, width: round1(next[i]) })) },
  };
}

export function addColumn(block) {
  if (block.props.columns.length >= MAX_COLUMNS) return block;
  const percents = columnPercents(block);
  const share = 100 / (percents.length + 1);
  const scaled = percents.map((value) => (value * (100 - share)) / 100);
  return {
    ...block,
    props: {
      ...block.props,
      preset: "custom",
      columns: [...block.props.columns.map((col, i) => ({ ...col, width: round1(scaled[i]) })), column(round1(share))],
    },
  };
}

// Removing a column moves its elements into the column before it.
export function removeColumn(block, index) {
  const cols = block.props.columns;
  if (cols.length <= 1) return block;
  const target = index === 0 ? 1 : index - 1;
  const next = cols
    .map((col, i) => (i === target ? { ...col, blocks: index === 0 ? [...cols[0].blocks, ...col.blocks] : [...col.blocks, ...cols[index].blocks] } : col))
    .filter((_, i) => i !== index);
  return { ...block, props: { ...block.props, preset: "custom", columns: next } };
}

export function updateColumn(block, index, patch) {
  return {
    ...block,
    props: { ...block.props, columns: block.props.columns.map((col, i) => (i === index ? { ...col, ...patch } : col)) },
  };
}

// ─── Layout presets (palette "Ready-made layouts") ───────────────────────────

function withStyle(block, style) {
  return { ...block, style: { ...block.style, ...style } };
}

function make(type, props = {}, style = {}) {
  const block = defaultBlock(type);
  return withStyle({ ...block, props: { ...block.props, ...props } }, style);
}

function columnsOf(preset, contents) {
  let block = applyColumnPreset(make("columns"), preset);
  block = {
    ...block,
    props: {
      ...block.props,
      columns: block.props.columns.map((col, index) => ({ ...col, blocks: contents[index] || [] })),
    },
  };
  return block;
}

export const LAYOUT_PRESETS = [
  {
    key: "hero",
    label: "Hero banner",
    description: "Big centered title, intro and button on a colored band",
    build: () =>
      make(
        "section",
        {
          children: [
            make("heading", { text: "A headline that grabs attention", level: 2, fontSize: 40 }),
            make("text", { html: "<p>One or two sentences that tell readers why this post matters.</p>", fontSize: 19 }, { margin: box(12, 0, 24, 0) }),
            make("button", { label: "Read more" }),
          ],
          minHeight: 0,
        },
        { background: "#f4f1ea", align: "center", padding: box(72, 24, 72, 24) },
      ),
  },
  {
    key: "imageText",
    label: "Image + text",
    description: "A picture beside a heading and paragraph",
    build: () =>
      columnsOf("1-1", [
        [make("image", { alt: "" })],
        [make("heading", { text: "Tell the story", level: 3 }), make("text", {}, { margin: box(12, 0, 0, 0) })],
      ]),
  },
  {
    key: "textImage",
    label: "Text + image",
    description: "Heading and paragraph beside a picture",
    build: () =>
      columnsOf("1-1", [
        [make("heading", { text: "Tell the story", level: 3 }), make("text", {}, { margin: box(12, 0, 0, 0) })],
        [make("image", { alt: "" })],
      ]),
  },
  {
    key: "features",
    label: "Three features",
    description: "Three columns, each with a title and text",
    build: () =>
      columnsOf(
        "1-1-1",
        [1, 2, 3].map((n) => [
          make("heading", { text: `Feature ${n}`, level: 4 }),
          make("text", { html: "<p>A short description of this point.</p>" }, { margin: box(8, 0, 0, 0) }),
        ]),
      ),
  },
  {
    key: "cta",
    label: "Call to action",
    description: "A boxed message with a button",
    build: () =>
      make(
        "section",
        {
          children: [
            make("heading", { text: "Ready to try it?", level: 3 }),
            make("text", { html: "<p>Give readers a clear next step.</p>" }, { margin: box(8, 0, 20, 0) }),
            make("button", { label: "Shop the collection" }),
          ],
        },
        { background: "#111111", textColor: "#ffffff", align: "center", borderRadius: 16, padding: box(40, 24, 40, 24) },
      ),
  },
  {
    key: "gallery",
    label: "Image gallery",
    description: "Three images in a row",
    build: () => columnsOf("1-1-1", [[make("image")], [make("image")], [make("image")]]),
  },
];

export function getLayoutPreset(key) {
  return LAYOUT_PRESETS.find((preset) => preset.key === key) || null;
}

// ─── Post starters (create-post dialog) ──────────────────────────────────────

export const POST_TEMPLATES = [
  { key: "blank", label: "Blank", description: "An empty canvas" },
  { key: "article", label: "Classic article", description: "Intro, image, sections and a quote" },
  { key: "feature", label: "Feature story", description: "Hero banner, image + text rows and a call to action" },
  { key: "listicle", label: "List post", description: "Numbered sections with images" },
];

export function docFromTemplate(key) {
  const doc = emptyDoc();
  if (key === "article") {
    doc.blocks = [
      make("text", { html: "<p>Start with a short introduction that tells readers what they will learn.</p>", fontSize: 19 }),
      make("image"),
      make("heading", { text: "The first big idea" }),
      make("text"),
      make("quote"),
      make("heading", { text: "Wrapping up" }),
      make("text"),
    ];
  } else if (key === "feature") {
    doc.design.contentWidth = 1100;
    doc.blocks = [getLayoutPreset("hero").build(), getLayoutPreset("imageText").build(), getLayoutPreset("textImage").build(), getLayoutPreset("cta").build()];
  } else if (key === "listicle") {
    doc.blocks = [
      make("text", { html: "<p>Here are our favourite picks this season.</p>", fontSize: 19 }),
      ...[1, 2, 3].flatMap((n) => [make("heading", { text: `${n}. Your pick`, level: 2 }), make("image"), make("text")]),
    ];
  }
  return doc;
}

// ─── Normalization (server and client) ───────────────────────────────────────

const clampNum = (value, min, max, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
};
const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);
const str = (value, max) => String(value ?? "").slice(0, max);

function normalizeBox(raw, max = 200) {
  const out = {};
  SPACING_SIDES.forEach((side) => {
    out[side] = Math.round(clampNum(raw?.[side], -max, max, 0));
  });
  return out;
}

function normalizeStyle(raw) {
  const base = defaultBlockStyle();
  const source = raw && typeof raw === "object" ? raw : {};
  const padding = normalizeBox(source.padding);
  SPACING_SIDES.forEach((side) => {
    padding[side] = Math.max(0, padding[side]);
  });
  return {
    margin: normalizeBox(source.margin),
    padding,
    background: sanitizeColor(source.background),
    textColor: sanitizeColor(source.textColor),
    align: oneOf(source.align, ["", "left", "center", "right", "justify"], ""),
    borderWidth: Math.round(clampNum(source.borderWidth, 0, 20, 0)),
    borderColor: sanitizeColor(source.borderColor) || base.borderColor,
    borderRadius: Math.round(clampNum(source.borderRadius, 0, 200, 0)),
    shadow: source.shadow === true,
    maxWidth: Math.round(clampNum(source.maxWidth, 0, 2000, 0)),
  };
}

const NORMALIZE_PROPS = {
  section: (p, ctx) => ({
    children: normalizeList(p.children, ctx),
    backgroundImage: sanitizeImageUrl(p.backgroundImage),
    overlay: sanitizeColor(p.overlay),
    contentWidth: Math.round(clampNum(p.contentWidth, 0, 2000, 0)),
    minHeight: Math.round(clampNum(p.minHeight, 0, 1200, 0)),
    verticalAlign: oneOf(p.verticalAlign, ["top", "center", "bottom"], "top"),
  }),
  columns: (p, ctx) => {
    const preset = oneOf(p.preset, ["custom", ...COLUMN_PRESETS.map((entry) => entry.value)], "1-1");
    const raw = (Array.isArray(p.columns) ? p.columns : []).slice(0, MAX_COLUMNS);
    const widths =
      preset === "custom"
        ? (raw.length ? raw : [{}, {}]).map((col) => Math.round(clampNum(col?.width, 1, 1000, 1) * 10) / 10)
        : COLUMN_PRESETS.find((entry) => entry.value === preset).widths;
    return {
      preset,
      gap: Math.round(clampNum(p.gap, 0, 120, 24)),
      verticalAlign: oneOf(p.verticalAlign, ["top", "center", "bottom"], "top"),
      stackAt: Math.round(clampNum(p.stackAt, 0, 600, 220)),
      columns: widths.map((width, index) => ({
        id: typeof raw[index]?.id === "string" && raw[index].id ? raw[index].id.slice(0, 60) : createId("col"),
        width,
        blocks: normalizeList(raw[index]?.blocks, ctx),
        background: sanitizeColor(raw[index]?.background),
        padding: Math.round(clampNum(raw[index]?.padding, 0, 120, 0)),
        verticalAlign: oneOf(raw[index]?.verticalAlign, ["top", "center", "bottom"], "top"),
      })),
    };
  },
  heading: (p) => ({
    text: str(p.text, 500),
    level: Math.round(clampNum(p.level, 1, 6, 2)),
    fontSize: Math.round(clampNum(p.fontSize, 0, 120, 0)),
    fontWeight: Math.round(clampNum(p.fontWeight, 100, 900, 700) / 100) * 100,
    lineHeight: clampNum(p.lineHeight, 0, 3, 0),
    letterSpacing: clampNum(p.letterSpacing, -5, 20, 0),
    uppercase: p.uppercase === true,
  }),
  text: (p) => ({
    html: sanitizeRichText(p.html, 20000),
    fontSize: Math.round(clampNum(p.fontSize, 0, 72, 0)),
    lineHeight: clampNum(p.lineHeight, 0, 3, 0),
  }),
  image: (p) => ({
    url: sanitizeImageUrl(p.url),
    alt: str(p.alt, 300),
    width: Math.round(clampNum(p.width, 10, 100, 100)),
    link: sanitizeUrl(p.link),
    newTab: p.newTab === true,
    caption: str(p.caption, 500),
    aspect: oneOf(p.aspect, ["auto", "1:1", "4:3", "3:2", "16:9", "21:9", "3:4", "4:5", "2:3", "9:16"], "auto"),
    focus: oneOf(p.focus, ["center", "top", "bottom", "left", "right"], "center"),
    fit: oneOf(p.fit, ["cover", "contain"], "cover"),
  }),
  button: (p) => ({
    label: str(p.label, 120),
    url: sanitizeUrl(p.url),
    newTab: p.newTab === true,
    variant: oneOf(p.variant, ["solid", "outline", "link"], "solid"),
    size: oneOf(p.size, ["sm", "md", "lg"], "md"),
    color: sanitizeColor(p.color) || "#111111",
    labelColor: sanitizeColor(p.labelColor) || "#ffffff",
    radius: Math.round(clampNum(p.radius, 0, 100, 8)),
    fullWidth: p.fullWidth === true,
  }),
  video: (p) => ({ url: sanitizeUrl(p.url, { allowRelative: false }), aspect: oneOf(p.aspect, ["16:9", "4:3", "1:1", "9:16"], "16:9") }),
  quote: (p) => ({
    html: sanitizeRichText(p.html, 5000),
    cite: str(p.cite, 200),
    accent: sanitizeColor(p.accent) || "#111111",
    variant: oneOf(p.variant, ["bar", "boxed", "large"], "bar"),
    fontSize: Math.round(clampNum(p.fontSize, 0, 72, 0)),
  }),
  list: (p) => ({
    items: (Array.isArray(p.items) ? p.items : []).slice(0, 50).map((item) => str(item, 500)),
    icon: oneOf(p.icon, ["check", "dot", "arrow", "number", "star"], "check"),
    iconColor: sanitizeColor(p.iconColor) || "#008060",
    gap: Math.round(clampNum(p.gap, 0, 60, 8)),
  }),
  divider: (p) => ({
    thickness: Math.round(clampNum(p.thickness, 1, 20, 1)),
    color: sanitizeColor(p.color) || "#e1e3e5",
    width: Math.round(clampNum(p.width, 5, 100, 100)),
    lineStyle: oneOf(p.lineStyle, ["solid", "dashed", "dotted", "double"], "solid"),
  }),
  spacer: (p) => ({ height: Math.round(clampNum(p.height, 0, 600, 40)) }),
  html: (p) => ({ code: sanitizeCustomHtml(p.code) }),
};

function normalizeBlock(raw, ctx) {
  if (!raw || typeof raw !== "object" || !NORMALIZE_PROPS[raw.type]) return null;
  if (ctx.count >= MAX_BLOCKS) return null;
  const meta = getBlockType(raw.type);
  if (meta.container && ctx.depth >= MAX_DEPTH) return null;
  ctx.count += 1;
  const defaults = DEFAULT_PROPS[raw.type]();
  const props = { ...defaults, ...(raw.props && typeof raw.props === "object" ? raw.props : {}) };
  const childCtx = meta.container ? { ...ctx, depth: ctx.depth + 1 } : ctx;
  const block = {
    id: typeof raw.id === "string" && raw.id ? raw.id.slice(0, 60) : createId(),
    type: raw.type,
    props: NORMALIZE_PROPS[raw.type](props, childCtx),
    style: normalizeStyle(raw.style),
  };
  ctx.count = childCtx.count;
  return block;
}

function normalizeList(list, ctx) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const block = normalizeBlock(raw, ctx);
    if (block) out.push(block);
  }
  return out;
}

export function normalizeDesign(raw) {
  const base = defaultDesign();
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    contentWidth: Math.round(clampNum(source.contentWidth, 0, 2400, base.contentWidth)),
    fontFamily: oneOf(source.fontFamily, FONT_FAMILIES.map((entry) => entry.value), base.fontFamily),
    // 0 means "use the theme's", as imported articles do.
    fontSize: Number(source.fontSize) === 0 ? 0 : Math.round(clampNum(source.fontSize, 10, 32, base.fontSize)),
    lineHeight: Number(source.lineHeight) === 0 ? 0 : clampNum(source.lineHeight, 1, 3, base.lineHeight),
    textColor: sanitizeColor(source.textColor),
    headingColor: sanitizeColor(source.headingColor),
    linkColor: sanitizeColor(source.linkColor),
    background: sanitizeColor(source.background),
    blockGap: Math.round(clampNum(source.blockGap, 0, 120, base.blockGap)),
  };
}

export function slugifyHandle(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function normalizePost(raw) {
  const base = defaultPostSettings();
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    title: str(source.title, 255).trim() || base.title,
    blogId: /^gid:\/\/shopify\/Blog\/\d+$/.test(source.blogId) ? source.blogId : "",
    author: str(source.author, 120),
    image: sanitizeImageUrl(source.image),
    imageAlt: str(source.imageAlt, 300),
    summary: str(source.summary, 1000),
    tags: str(source.tags, 1000),
    handle: slugifyHandle(source.handle),
    seoTitle: str(source.seoTitle, 120),
    seoDescription: str(source.seoDescription, 320),
  };
}

// Rebuilds the whole document field by field, so a hand-crafted save request
// can't inject markup, styles or unknown keys.
export function normalizeDoc(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    version: 1,
    post: normalizePost(source.post),
    design: normalizeDesign(source.design),
    blocks: normalizeList(source.blocks, { count: 0, depth: 0 }),
  };
}

// ─── Custom HTML ─────────────────────────────────────────────────────────────

const ALLOWED_IFRAME = /^https:\/\/(www\.)?(youtube(-nocookie)?\.com|player\.vimeo\.com|open\.spotify\.com|www\.google\.com\/maps)\//i;

// Merchant-authored HTML: scripts, event handlers and javascript: URLs are
// removed; iframes are kept only for well-known embed providers.
export function sanitizeCustomHtml(value) {
  let html = String(value ?? "").slice(0, 50000);
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(script|object|embed|base|meta|link|form)\b[\s\S]*?(<\/\1\s*>|$)/gi, "");
  html = html.replace(/<(script|object|embed|base|meta|link|form)\b[^>]*\/?>/gi, "");
  html = html.replace(/<iframe\b([^>]*)>([\s\S]*?<\/iframe\s*>)?/gi, (match, attrs) => {
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const url = src ? src[1] ?? src[2] : "";
    return ALLOWED_IFRAME.test(url) ? match : "";
  });
  html = html.replace(/\s(on[a-z]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/(href|src|action|formaction|xlink:href)\s*=\s*(["']?)\s*(javascript|vbscript|data):[^"'>\s]*\2/gi, '$1="#"');
  html = html.replace(/expression\s*\(/gi, "");
  return html;
}

// ─── Styles (shared by canvas and HTML) ──────────────────────────────────────

// CSS objects use camelCase keys, so React can apply them directly and the
// renderer can serialize the same objects to inline style attributes.
export function cssText(style) {
  return Object.entries(style)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
    .join(";");
}

const px = (value) => `${value}px`;
const boxCss = (b) => `${px(b.top)} ${px(b.right)} ${px(b.bottom)} ${px(b.left)}`;
const isZeroBox = (b) => SPACING_SIDES.every((side) => !b[side]);

// The wrapper style every block gets: spacing, background, border, alignment.
export function wrapperStyle(block) {
  const s = block.style;
  return {
    margin: isZeroBox(s.margin) ? undefined : boxCss(s.margin),
    padding: isZeroBox(s.padding) ? undefined : boxCss(s.padding),
    background: s.background || undefined,
    color: s.textColor || undefined,
    textAlign: s.align || undefined,
    border: s.borderWidth ? `${px(s.borderWidth)} solid ${s.borderColor}` : undefined,
    borderRadius: s.borderRadius ? px(s.borderRadius) : undefined,
    boxShadow: s.shadow ? "0 10px 30px rgba(0,0,0,0.12)" : undefined,
    maxWidth: s.maxWidth ? px(s.maxWidth) : undefined,
    marginLeft: s.maxWidth && !s.margin.left ? "auto" : undefined,
    marginRight: s.maxWidth && !s.margin.right ? "auto" : undefined,
    overflow: s.borderRadius && (s.background || block.type === "image") ? "hidden" : undefined,
    boxSizing: "border-box",
  };
}

const ALIGN_FLEX = { top: "flex-start", center: "center", bottom: "flex-end" };

export function sectionStyle(block) {
  const p = block.props;
  const image = p.backgroundImage
    ? `${p.overlay ? `linear-gradient(${p.overlay}, ${p.overlay}), ` : ""}url("${p.backgroundImage.replace(/["\\\n]/g, "")}") center / cover no-repeat`
    : undefined;
  return {
    ...wrapperStyle(block),
    background: image ? `${image}${block.style.background ? ` ${block.style.background}` : ""}` : block.style.background || undefined,
    minHeight: p.minHeight ? px(p.minHeight) : undefined,
    display: p.minHeight ? "flex" : undefined,
    flexDirection: p.minHeight ? "column" : undefined,
    justifyContent: p.minHeight ? ALIGN_FLEX[p.verticalAlign] : undefined,
  };
}

export function sectionInnerStyle(block, design) {
  return {
    width: "100%",
    maxWidth: block.props.contentWidth ? px(block.props.contentWidth) : undefined,
    marginLeft: "auto",
    marginRight: "auto",
    display: "flex",
    flexDirection: "column",
    gap: px(design.blockGap),
  };
}

export function columnsStyle(block) {
  const anyAligned = block.props.columns.some((col) => col.verticalAlign && col.verticalAlign !== "top");
  return {
    ...wrapperStyle(block),
    display: "flex",
    flexWrap: block.props.stackAt ? "wrap" : "nowrap",
    gap: px(block.props.gap),
    // Columns aligned individually need equal heights to align inside.
    alignItems: anyAligned ? "stretch" : ALIGN_FLEX[block.props.verticalAlign],
  };
}

// Columns keep their ratio when there's room and wrap onto new rows (stack)
// once each would be narrower than 220px, so no media queries are needed.
export function columnStyle(col, design, block) {
  const stackAt = block ? block.props.stackAt : 220;
  return {
    flex: `${col.width} 1 0`,
    minWidth: stackAt ? `min(${stackAt}px, 100%)` : "0",
    display: "flex",
    flexDirection: "column",
    justifyContent: col.verticalAlign && col.verticalAlign !== "top" ? ALIGN_FLEX[col.verticalAlign] : undefined,
    gap: px(design.blockGap),
    background: col.background || undefined,
    padding: col.padding ? px(col.padding) : undefined,
    borderRadius: col.background && block?.style.borderRadius ? px(block.style.borderRadius) : undefined,
    boxSizing: "border-box",
  };
}

export function pageStyle(design) {
  const font = FONT_FAMILIES.find((entry) => entry.value === design.fontFamily);
  return {
    maxWidth: design.contentWidth ? px(design.contentWidth) : undefined,
    margin: "0 auto",
    fontFamily: font && font.value !== "inherit" ? font.stack : undefined,
    fontSize: design.fontSize ? px(design.fontSize) : undefined,
    lineHeight: design.lineHeight ? String(design.lineHeight) : undefined,
    color: design.textColor || undefined,
    background: design.background || undefined,
    padding: design.background ? "24px" : undefined,
    display: "flex",
    flexDirection: "column",
    gap: px(design.blockGap),
    boxSizing: "border-box",
  };
}

// ─── Leaf rendering ──────────────────────────────────────────────────────────

const attr = (value) => escapeHtml(value);

function linkTarget(newTab) {
  return newTab ? ' target="_blank" rel="noopener noreferrer"' : "";
}

// Links inside rich text take the design's link color.
function colorLinks(html, color) {
  if (!color) return html;
  return html.replace(/<a(\s|>)/g, `<a style="color:${color}"$1`);
}

const HEADING_SIZES = { 1: 40, 2: 32, 3: 26, 4: 21, 5: 18, 6: 16 };
const ASPECTS = {
  "1:1": "1 / 1", "4:3": "4 / 3", "3:2": "3 / 2", "16:9": "16 / 9", "21:9": "21 / 9",
  "3:4": "3 / 4", "4:5": "4 / 5", "2:3": "2 / 3", "9:16": "9 / 16",
};
const BUTTON_SIZES = { sm: "8px 16px", md: "12px 24px", lg: "16px 32px" };
const BUTTON_FONT = { sm: "14px", md: "16px", lg: "18px" };
const LIST_ICONS = { check: "✓", dot: "•", arrow: "→", star: "★" };

export function videoEmbedUrl(url) {
  const value = String(url || "");
  const yt = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/i.exec(value);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d{4,15})/i.exec(value);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return "";
}

function placeholder(text, minHeight = 160) {
  return `<div style="${cssText({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: px(minHeight),
    background: "#f1f2f4",
    color: "#8a8a8a",
    fontSize: "14px",
    borderRadius: "8px",
    textAlign: "center",
    padding: "16px",
  })}">${escapeHtml(text)}</div>`;
}

// Returns the inner HTML of a leaf block. `editor` renders placeholders for
// empty images/videos so merchants can see and select them; the published
// HTML omits them.
export function renderLeaf(block, design, { editor = false } = {}) {
  const p = block.props;
  switch (block.type) {
    case "heading": {
      const tag = `h${p.level}`;
      // With theme typography, headings without their own size keep the theme's.
      const themeType = !design.fontSize && !p.fontSize;
      const style = cssText({
        margin: "0",
        fontSize: p.fontSize ? px(p.fontSize) : themeType ? undefined : px(HEADING_SIZES[p.level]),
        fontWeight: themeType && p.fontWeight === 700 ? undefined : String(p.fontWeight),
        lineHeight: p.lineHeight ? String(p.lineHeight) : themeType ? undefined : "1.25",
        letterSpacing: p.letterSpacing ? px(p.letterSpacing) : undefined,
        textTransform: p.uppercase ? "uppercase" : undefined,
        color: block.style.textColor || design.headingColor || undefined,
      });
      return `<${tag} style="${style}">${escapeHtml(p.text)}</${tag}>`;
    }
    case "text": {
      const style = cssText({
        fontSize: p.fontSize ? px(p.fontSize) : undefined,
        lineHeight: p.lineHeight ? String(p.lineHeight) : undefined,
      });
      const html = colorLinks(p.html, design.linkColor);
      return style ? `<div style="${style}">${html}</div>` : html;
    }
    case "image": {
      if (!p.url) return editor ? placeholder("Choose an image in the settings panel →", 200) : "";
      const img = `<img src="${attr(p.url)}" alt="${attr(p.alt)}" loading="lazy" style="${cssText({
        display: "block",
        width: "100%",
        height: p.aspect === "auto" ? "auto" : "100%",
        aspectRatio: p.aspect === "auto" ? undefined : ASPECTS[p.aspect],
        objectFit: p.aspect === "auto" ? undefined : p.fit || "cover",
        objectPosition: p.aspect === "auto" || !p.focus || p.focus === "center" ? undefined : p.focus,
        borderRadius: block.style.borderRadius ? px(block.style.borderRadius) : undefined,
      })}">`;
      const linked = p.link ? `<a href="${attr(p.link)}"${linkTarget(p.newTab)}>${img}</a>` : img;
      const caption = p.caption
        ? `<figcaption style="${cssText({ marginTop: "8px", fontSize: "0.875em", opacity: "0.75", textAlign: "center" })}">${escapeHtml(p.caption)}</figcaption>`
        : "";
      const align = block.style.align;
      return `<figure style="${cssText({
        margin: align === "center" || !align ? "0 auto" : align === "right" ? "0 0 0 auto" : "0",
        width: `${p.width}%`,
      })}">${linked}${caption}</figure>`;
    }
    case "button": {
      if (!p.label) return "";
      const solid = p.variant === "solid";
      const style = cssText({
        display: p.fullWidth ? "block" : "inline-block",
        padding: p.variant === "link" ? "0" : BUTTON_SIZES[p.size],
        fontSize: BUTTON_FONT[p.size],
        fontWeight: "600",
        lineHeight: "1.2",
        textDecoration: p.variant === "link" ? "underline" : "none",
        textAlign: "center",
        borderRadius: px(p.radius),
        border: p.variant === "link" ? "0" : `2px solid ${p.color}`,
        background: solid ? p.color : "transparent",
        color: solid ? p.labelColor : p.color,
      });
      return `<a href="${attr(p.url || "#")}"${linkTarget(p.newTab)} style="${style}">${escapeHtml(p.label)}</a>`;
    }
    case "video": {
      const src = videoEmbedUrl(p.url);
      if (!src) return editor ? placeholder("Paste a YouTube or Vimeo link in the settings panel →", 220) : "";
      return `<div style="${cssText({ position: "relative", width: "100%", aspectRatio: ASPECTS[p.aspect], overflow: "hidden", borderRadius: block.style.borderRadius ? px(block.style.borderRadius) : undefined })}"><iframe src="${attr(src)}" title="Video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="${cssText({ position: "absolute", inset: "0", width: "100%", height: "100%", border: "0" })}"></iframe></div>`;
    }
    case "quote": {
      const quoteStyle = {
        margin: "0",
        fontSize: p.fontSize ? px(p.fontSize) : p.variant === "large" ? "1.5em" : "1.15em",
        fontStyle: "italic",
        lineHeight: "1.5",
      };
      if (p.variant === "bar") Object.assign(quoteStyle, { borderLeft: `4px solid ${p.accent}`, paddingLeft: "20px" });
      if (p.variant === "boxed") Object.assign(quoteStyle, { borderLeft: `4px solid ${p.accent}`, padding: "20px 24px", background: "rgba(0,0,0,0.04)", borderRadius: "8px" });
      if (p.variant === "large") Object.assign(quoteStyle, { textAlign: "center", color: p.accent });
      const cite = p.cite
        ? `<footer style="${cssText({ marginTop: "12px", fontSize: "0.85em", fontStyle: "normal", fontWeight: "600" })}">— ${escapeHtml(p.cite)}</footer>`
        : "";
      return `<blockquote style="${cssText(quoteStyle)}">${colorLinks(p.html, design.linkColor)}${cite}</blockquote>`;
    }
    case "list": {
      const items = p.items.filter((item) => item.trim());
      if (!items.length) return editor ? placeholder("Add list items in the settings panel →", 60) : "";
      const rows = items
        .map((item, index) => {
          const marker = p.icon === "number" ? `${index + 1}.` : LIST_ICONS[p.icon];
          return `<li style="${cssText({ display: "flex", gap: "10px", alignItems: "baseline" })}"><span aria-hidden="true" style="${cssText({ color: p.iconColor, fontWeight: "700", flexShrink: "0", minWidth: "1em" })}">${marker}</span><span>${escapeHtml(item)}</span></li>`;
        })
        .join("");
      return `<ul style="${cssText({ listStyle: "none", margin: "0", padding: "0", display: "flex", flexDirection: "column", gap: px(p.gap) })}">${rows}</ul>`;
    }
    case "divider":
      return `<hr style="${cssText({
        border: "0",
        borderTop: `${px(p.thickness)} ${p.lineStyle} ${p.color}`,
        width: `${p.width}%`,
        margin: block.style.align === "left" ? "0" : block.style.align === "right" ? "0 0 0 auto" : "0 auto",
      })}">`;
    case "spacer":
      return `<div aria-hidden="true" style="height:${px(p.height)}"></div>`;
    case "html":
      return sanitizeCustomHtml(p.code);
    default:
      return "";
  }
}

// ─── Full document rendering (published HTML) ────────────────────────────────

function renderBlock(block, design) {
  if (block.type === "section") {
    const inner = block.props.children.map((child) => renderBlock(child, design)).join("");
    return `<div style="${cssText(sectionStyle(block))}"><div style="${cssText(sectionInnerStyle(block, design))}">${inner}</div></div>`;
  }
  if (block.type === "columns") {
    const cols = block.props.columns
      .map((col) => `<div style="${cssText(columnStyle(col, design, block))}">${col.blocks.map((child) => renderBlock(child, design)).join("")}</div>`)
      .join("");
    return `<div style="${cssText(columnsStyle(block))}">${cols}</div>`;
  }
  const inner = renderLeaf(block, design);
  if (!inner) return "";
  return `<div style="${cssText(wrapperStyle(block))}">${inner}</div>`;
}

// The article body. Everything is inline-styled, so it survives Shopify's
// editor and theme CSS without a stylesheet.
export function renderDocHtml(doc) {
  const body = doc.blocks
    .map((block) => renderBlock(block, doc.design))
    .filter(Boolean)
    .join("\n");
  return `<div class="tcl-blog" style="${cssText(pageStyle(doc.design))}">\n${body}\n</div>`;
}

export function summaryHtml(summary) {
  const text = String(summary || "").trim();
  return text ? `<p>${escapeHtml(text)}</p>` : "";
}
