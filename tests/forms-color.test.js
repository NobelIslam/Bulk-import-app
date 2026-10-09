import test from "node:test";
import assert from "node:assert/strict";
import { formatColor, hsbToRgb, normalizeColorInput, parseColor, rgbToHsb, toHex } from "../app/forms/color.js";
import { normalizeStyle } from "../app/forms/design.js";

test("accepts hex, rgb(a), hsl(a) and transparent, stored as hex", () => {
  assert.equal(normalizeColorInput("#ABC"), "#aabbcc");
  assert.equal(normalizeColorInput("1a2b3c"), "#1a2b3c");
  assert.equal(normalizeColorInput("rgb(26, 43, 60)"), "#1a2b3c");
  assert.equal(normalizeColorInput("rgba(255, 0, 0, 0.5)"), "#ff000080");
  assert.equal(normalizeColorInput("rgb(255 0 0 / 50%)"), "#ff000080");
  assert.equal(normalizeColorInput("hsl(120, 100%, 50%)"), "#00ff00");
  assert.equal(normalizeColorInput("hsla(0, 0%, 100%, 0.25)"), "#ffffff40");
  assert.equal(normalizeColorInput("transparent"), "#00000000");
  assert.equal(normalizeColorInput("#ff000080"), "#ff000080");
  assert.equal(normalizeColorInput("not a color"), "");
  assert.equal(normalizeColorInput("rgb(1, 2)"), "");
});

test("formats a color as HEX, RGBA or HSLA", () => {
  const color = parseColor("#ff000080");
  assert.equal(formatColor(color, "hex"), "#ff000080");
  assert.equal(formatColor(color, "rgba"), "rgba(255, 0, 0, 0.5)");
  assert.equal(formatColor(color, "hsla"), "hsla(0, 100%, 50%, 0.5)");
  assert.equal(formatColor(parseColor("#00ff00"), "rgba"), "rgb(0, 255, 0)");
});

test("HSB round-trips for the Polaris picker", () => {
  for (const hex of ["#1a2b3c", "#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000", "#80808080"]) {
    assert.equal(toHex(hsbToRgb(rgbToHsb(parseColor(hex)))), hex);
  }
});

test("server keeps transparent card backgrounds", () => {
  const style = normalizeStyle({ backgroundColor: "#ffffff00", textColor: "rgba(0,0,0,1)" });
  assert.equal(style.backgroundColor, "#ffffff00");
  assert.notEqual(style.textColor, "rgba(0,0,0,1)");
});
