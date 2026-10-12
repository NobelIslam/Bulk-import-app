import test from "node:test";
import assert from "node:assert/strict";
import { buildFormCss, DEFAULT_DESKTOP_STYLE, NUMERIC_RANGES, normalizeStyle, resolveStyle } from "../app/forms/design.js";
import { defaultField, FIELD_TYPES, normalizeSchema } from "../app/forms/fields.js";

// Every design setting changed away from its default, the way a merchant would.
function customizedStyle() {
  const style = {};
  for (const [key, value] of Object.entries(DEFAULT_DESKTOP_STYLE)) {
    if (typeof value === "boolean") style[key] = !value;
    else if (NUMERIC_RANGES[key]) style[key] = NUMERIC_RANGES[key][0] + 1;
    else if (/Color$|Background$/.test(key)) style[key] = "#12345680";
    else style[key] = value;
  }
  style.fontFamily = "georgia";
  style.alignment = "center";
  style.inputStyle = "underline";
  style.buttonStyle = "outline";
  return style;
}

for (const showShadow of [true, false]) {
  test(`saved design renders exactly like the builder (shadow ${showShadow ? "on" : "off"})`, () => {
    const builder = { ...customizedStyle(), showShadow };
    const mobile = { padding: 12, showShadow: !showShadow };
    // What the server stores, then reads back as JSON for the storefront.
    const savedDesktop = JSON.parse(JSON.stringify(normalizeStyle(builder)));
    const savedMobile = JSON.parse(JSON.stringify(normalizeStyle(mobile, {})));

    const builderCss = buildFormCss({ publicId: "x", desktop: builder, mobile });
    const liveCss = buildFormCss({ publicId: "x", desktop: savedDesktop, mobile: savedMobile });
    assert.equal(liveCss, builderCss);
    assert.deepEqual(resolveStyle(savedDesktop, savedMobile, "desktop"), resolveStyle(builder, mobile, "desktop"));
    assert.deepEqual(resolveStyle(savedDesktop, savedMobile, "mobile"), resolveStyle(builder, mobile, "mobile"));
  });
}

test("forms saved before the fix with showShadow \"false\" render without a shadow", () => {
  const css = buildFormCss({ publicId: "x", desktop: { ...DEFAULT_DESKTOP_STYLE, showShadow: "false" }, mobile: {} });
  assert.match(css, /--tclf-shadow:none;/);
  assert.doesNotMatch(css, /--tclf-shadow:0 8px/);
});

test("every field type survives a save unchanged", () => {
  const fields = FIELD_TYPES.map((meta) => defaultField(meta.type)).filter(Boolean);
  const once = normalizeSchema({ fields, settings: { submitText: "Go" } });
  const twice = normalizeSchema(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once);
  assert.equal(once.fields.length, fields.length);
});
