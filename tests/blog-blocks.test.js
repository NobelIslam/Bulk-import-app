import test from "node:test";
import assert from "node:assert/strict";
import {
  applyColumnPreset,
  countBlocks,
  defaultBlock,
  docFromTemplate,
  duplicateBlock,
  findBlock,
  getLayoutPreset,
  insertBlock,
  LAYOUT_PRESETS,
  moveBlock,
  normalizeDoc,
  postSummary,
  POST_TEMPLATES,
  removeBlock,
  renderDocHtml,
  ROOT,
  sanitizeCustomHtml,
  videoEmbedUrl,
} from "../app/blog/blocks.js";

const ids = (list) => list.map((block) => block.type);

test("insert, move within and between containers, remove", () => {
  const section = defaultBlock("section");
  const heading = defaultBlock("heading");
  const text = defaultBlock("text");
  let blocks = [section, heading, text];

  blocks = moveBlock(blocks, text.id, ROOT, 0);
  assert.deepEqual(ids(blocks), ["text", "section", "heading"]);

  blocks = moveBlock(blocks, heading.id, section.id, 0);
  assert.deepEqual(ids(blocks), ["text", "section"]);
  assert.equal(findBlock(blocks, heading.id).containerId, section.id);

  blocks = moveBlock(blocks, text.id, ROOT, 2);
  assert.deepEqual(ids(blocks), ["section", "text"]);

  blocks = removeBlock(blocks, heading.id);
  assert.equal(findBlock(blocks, heading.id), null);
});

test("a container can't be moved into itself", () => {
  const outer = defaultBlock("section");
  const inner = defaultBlock("section");
  let blocks = insertBlock([outer], outer.id, 0, inner);
  const before = blocks;
  blocks = moveBlock(blocks, outer.id, inner.id, 0);
  assert.equal(blocks, before);
});

test("duplicate gives nested containers fresh ids", () => {
  const cols = getLayoutPreset("features").build();
  const { blocks, copy } = duplicateBlock([cols], cols.id);
  assert.equal(blocks.length, 2);
  assert.notEqual(copy.props.columns[0].id, cols.props.columns[0].id);
  assert.equal(countBlocks(blocks), 2 * countBlocks([cols]));
});

test("reducing columns keeps their content", () => {
  const cols = getLayoutPreset("features").build();
  const two = applyColumnPreset(cols, "1-1");
  assert.equal(two.props.columns.length, 2);
  assert.equal(countBlocks([two]), countBlocks([cols]));
});

test("every template and layout survives normalization and renders", () => {
  for (const { key } of POST_TEMPLATES) {
    const doc = docFromTemplate(key);
    const once = normalizeDoc(JSON.parse(JSON.stringify(doc)));
    assert.deepEqual(normalizeDoc(JSON.parse(JSON.stringify(once))), once, key);
    assert.match(renderDocHtml(once), /^<div class="tcl-blog"/);
  }
  for (const preset of LAYOUT_PRESETS) {
    const doc = normalizeDoc({ blocks: [preset.build()] });
    assert.equal(doc.blocks.length, 1, preset.key);
  }
});

test("normalization strips injected markup and unknown blocks", () => {
  const doc = normalizeDoc({
    blocks: [
      { type: "heading", props: { text: '<img src=x onerror="alert(1)">' }, style: { background: "red;evil" } },
      { type: "text", props: { html: '<p onclick="x">Hi<script>alert(1)</script></p>' } },
      { type: "button", props: { url: "javascript:alert(1)" } },
      { type: "evil" },
    ],
  });
  const html = renderDocHtml(doc);
  assert.equal(doc.blocks.length, 3);
  assert.doesNotMatch(html, /<script|\son(error|click)="|javascript:/i);
  assert.match(html, /&lt;img/);
});

test("custom HTML keeps markup but drops scripts and handlers", () => {
  const out = sanitizeCustomHtml('<div onclick="x">A</div><script>bad()</script><iframe src="https://evil.com"></iframe><iframe src="https://www.youtube.com/embed/abc"></iframe><a href="javascript:x">l</a>');
  assert.doesNotMatch(out, /script|onclick|evil\.com|javascript:/);
  assert.match(out, /youtube\.com\/embed\/abc/);
  assert.match(out, /<div>A<\/div>/);
});

test("video links become embed URLs", () => {
  assert.equal(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(videoEmbedUrl("https://vimeo.com/76979871"), "https://player.vimeo.com/video/76979871");
  assert.equal(videoEmbedUrl("https://example.com/v"), "");
});

test("column widths: set, resize, add and remove keep a 100% row", async () => {
  const { addColumn, columnPercents, normalizeDoc, removeColumn, renderDocHtml, resizeColumnPair, setColumnWidth } = await import("../app/blog/blocks.js");
  const sum = (block) => Math.round(columnPercents(block).reduce((a, b) => a + b, 0));
  let cols = getLayoutPreset("features").build();

  cols = setColumnWidth(cols, 0, 50);
  assert.equal(cols.props.preset, "custom");
  assert.equal(Math.round(columnPercents(cols)[0]), 50);
  assert.equal(Math.round(columnPercents(cols)[1]), 25);
  assert.equal(sum(cols), 100);

  cols = resizeColumnPair(cols, 1, 0.8);
  assert.equal(Math.round(columnPercents(cols)[0]), 50);
  assert.equal(Math.round(columnPercents(cols)[1]), 40);
  assert.equal(sum(cols), 100);

  cols = addColumn(cols);
  assert.equal(cols.props.columns.length, 4);
  assert.equal(sum(cols), 100);

  const before = countBlocks([cols]);
  cols = removeColumn(cols, 1);
  assert.equal(cols.props.columns.length, 3);
  assert.equal(countBlocks([cols]), before);

  // Custom widths, per-column look and stacking survive a save and render.
  cols.props.columns[0].background = "#ff0000";
  cols.props.columns[0].verticalAlign = "center";
  cols.props.stackAt = 0;
  const saved = normalizeDoc(JSON.parse(JSON.stringify({ blocks: [cols] })));
  assert.deepEqual(saved.blocks[0].props.columns.map((col) => col.width), cols.props.columns.map((col) => col.width));
  const html = renderDocHtml(saved);
  assert.match(html, /flex-wrap:nowrap/);
  assert.match(html, /background:#ff0000/);
  assert.match(html, /justify-content:center/);
});

test("postSummary uses the first image and opening text when the post has no featured image or summary", () => {
  const doc = docFromTemplate("article");
  const columns = getLayoutPreset("imageText").build();
  columns.props.columns[0].blocks[0].props.url = "https://cdn.shopify.com/a.jpg";
  doc.blocks = [
    { ...defaultBlock("text"), props: { ...defaultBlock("text").props, html: "<p>Hello&nbsp;<strong>world</strong> &amp; friends</p>" } },
    columns,
  ];
  doc.post.author = "  Maria Khan ";
  const summary = postSummary(doc);
  assert.equal(summary.image, "https://cdn.shopify.com/a.jpg");
  assert.equal(summary.excerpt, "Hello world & friends");
  assert.equal(summary.author, "Maria Khan");

  doc.post.image = "https://cdn.shopify.com/featured.jpg";
  doc.post.summary = "x".repeat(200);
  const preferred = postSummary(doc);
  assert.equal(preferred.image, "https://cdn.shopify.com/featured.jpg");
  assert.equal(preferred.excerpt.length, 140);
  assert.ok(preferred.excerpt.endsWith("…"));
  assert.deepEqual(postSummary(null), { image: "", excerpt: "", author: "", blogId: "" });
});
