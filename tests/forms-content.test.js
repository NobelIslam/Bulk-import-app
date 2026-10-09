import test from "node:test";
import assert from "node:assert/strict";
import {
  formatDate,
  isDateAllowed,
  monthGrid,
  richTextToPlain,
  sanitizeRichText,
  scopeCustomCss,
} from "../app/forms/content.js";
import { defaultField, emptySchema, normalizeSchema } from "../app/forms/fields.js";
import { buildFormCss } from "../app/forms/design.js";
import { validateSubmission } from "../app/forms/schema.server.js";

test("rich text keeps formatting and strips everything else", () => {
  const html = sanitizeRichText(
    '<b onclick="x()">Bold</b> <i>it</i><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>',
  );
  assert.equal(
    html,
    '<strong>Bold</strong> <em>it</em><a>bad</a><a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>',
  );
});

test("rich text balances unclosed tags and escapes stray brackets", () => {
  assert.equal(sanitizeRichText("<strong>a <em>b"), "<strong>a <em>b</em></strong>");
  assert.equal(sanitizeRichText("1 < 2 & 3 > 2"), "1 &lt; 2 &amp; 3 &gt; 2");
  assert.equal(richTextToPlain("<p>Hello&nbsp;<strong>there</strong></p><ul><li>x</li></ul>"), "Hello there x");
});

test("custom CSS is scoped to the form", () => {
  const css = scopeCustomCss(
    ".tclf-submit, input { color: red; }\n& { border: 1px solid; }\n@media (max-width: 600px) { .tclf-label { font-size: 12px; } }\n@import url(x.css);\nbody { margin: 0 }",
    ".tclf-form--abc",
  );
  assert.match(css, /\.tclf-form--abc \.tclf-submit, \.tclf-form--abc input\{ color: red; \}/);
  assert.match(css, /\.tclf-form--abc\{ border: 1px solid; \}/);
  assert.match(css, /@media \(max-width: 600px\)\{\.tclf-form--abc \.tclf-label\{/);
  assert.match(css, /\.tclf-form--abc\{ margin: 0 \}/);
  assert.doesNotMatch(css, /@import/);
  assert.doesNotMatch(scopeCustomCss("a{}</style><script>", ".s"), /</);
});

test("generated CSS includes layout and custom CSS", () => {
  const css = buildFormCss({
    publicId: "abc",
    desktop: {},
    mobile: {},
    settings: { layout: "twoColumn", sidePanel: { width: 40, backgroundColor: "#ff0000" }, customCss: ".x{color:red}" },
  });
  assert.match(css, /--tclf-side-width:40%/);
  assert.match(css, /\.tclf-form--abc \.tclf-side \{background:#ff0000;/);
  assert.match(css, /\.tclf-form--abc \.x\{color:red\}/);
});

test("dates format and respect limits", () => {
  assert.equal(formatDate("2026-12-31", "MM/DD/YYYY"), "12/31/2026");
  assert.equal(formatDate("2026-12-31", "DD/MM/YYYY"), "31/12/2026");
  assert.equal(formatDate("2026-03-05", "MMM D, YYYY"), "Mar 5, 2026");
  assert.equal(formatDate("2026-03-05", "D MMMM YYYY"), "5 March 2026");
  assert.equal(formatDate("2026-02-30"), "");
  assert.equal(isDateAllowed("2026-10-10", { minDate: "2026-10-11" }), false);
  assert.equal(isDateAllowed("2026-10-10", { disableWeekends: true }), false); // Saturday
  assert.equal(isDateAllowed("2026-10-01", { disablePast: true }, { today: "2026-10-09" }), false);
  assert.equal(isDateAllowed("2026-10-08", { disablePast: true }, { today: "2026-10-09", slackDays: 1 }), true);
  const grid = monthGrid(2026, 10, 1);
  assert.equal(grid.length, 42);
  assert.equal(grid[0].iso, "2026-09-28"); // Monday before Oct 1st
});

test("normalizeSchema upgrades old content blocks and sanitizes new options", () => {
  const schema = normalizeSchema({
    fields: [
      { id: "h", type: "heading", label: "Old <heading>" },
      { id: "p", type: "paragraph", richText: "<b>Hi</b><script>x</script>", blockStyle: { backgroundColor: "red", textColor: "#111", align: "center" } },
      { id: "i", type: "image", image: { url: "javascript:alert(1)", width: 500 } },
      { id: "d", type: "date", key: "when", dateOptions: { format: "bogus", disablePast: true } },
    ],
    settings: { layout: "twoColumn", sidePanel: { imageUrl: "https://cdn.shopify.com/a.png", content: "<em>x</em>" }, customCss: "a{}" },
  });
  const [heading, paragraph, image, date] = schema.fields;
  assert.equal(heading.richText, "Old &lt;heading&gt;");
  assert.equal(heading.headingLevel, "h3");
  assert.equal(paragraph.richText, "<strong>Hi</strong>");
  assert.equal(paragraph.label, "Hi");
  assert.deepEqual(paragraph.blockStyle, { backgroundColor: "", textColor: "#111", align: "center" });
  assert.equal(image.image.url, "");
  assert.equal(image.image.width, 100);
  assert.equal(image.key, null);
  assert.equal(date.dateOptions.format, "MM/DD/YYYY");
  assert.equal(date.dateOptions.disablePast, true);
  assert.equal(schema.settings.layout, "twoColumn");
  assert.equal(schema.settings.sidePanel.content, "<em>x</em>");
  assert.equal(schema.settings.customCss, "a{}");
  assert.equal(normalizeSchema({ settings: { layout: "weird" } }).settings.layout, "single");
});

test("date submissions are validated against the picker options", () => {
  const date = { ...defaultField("date"), key: "when", required: true, dateOptions: { minDate: "2026-01-01" } };
  const schema = { ...emptySchema(), fields: [date, emptySchema().fields[0]] };
  assert.equal(validateSubmission(schema, { when: "12/31/2026" }).isValid, false);
  assert.equal(validateSubmission(schema, { when: "2025-12-31" }).isValid, false);
  const ok = validateSubmission(schema, { when: "2026-12-31" });
  assert.equal(ok.isValid, true);
  assert.equal(ok.values.when, "2026-12-31");
});

test("fields can be placed into the side column and back", async () => {
  const { placeField } = await import("../app/forms/builder-state.js");
  const { splitColumns } = await import("../app/forms/fields.js");
  const name = { ...defaultField("shortText"), id: "name", key: "name" };
  const submit = emptySchema().fields[0];
  let doc = { schema: { ...emptySchema(), fields: [name, submit], settings: { layout: "twoColumn" } } };

  const image = { ...defaultField("image"), id: "img" };
  doc = placeField(doc, image, "side");
  let cols = splitColumns(doc.schema.fields, doc.schema.settings);
  assert.deepEqual(cols.side.map((f) => f.id), ["img"]);
  assert.deepEqual(cols.main.map((f) => f.id), ["name", submit.id]);

  // Moving a main field to the side puts it before the target field.
  doc = placeField(doc, name, "side", "img");
  cols = splitColumns(doc.schema.fields, doc.schema.settings);
  assert.deepEqual(cols.side.map((f) => f.id), ["name", "img"]);

  // The submit button never leaves the main column.
  doc = placeField(doc, submit, "side");
  assert.equal(doc.schema.fields.find((f) => f.id === submit.id).column, "main");

  // One-column forms show everything in the main column.
  assert.equal(splitColumns(doc.schema.fields, { layout: "single" }).side.length, 0);
  assert.equal(normalizeSchema({ fields: [{ ...submit, column: "side" }] }).fields[0].column, "main");
});
