// Color parsing and conversion for the builder's color picker. Colors are
// stored as hex (#rrggbb, or #rrggbbaa when partly transparent) because every
// sanitizer and the storefront CSS already accept that form.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, places = 0) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function channel(raw, max) {
  const text = String(raw).trim();
  if (text.endsWith("%")) return clamp((parseFloat(text) / 100) * max, 0, max);
  return clamp(parseFloat(text), 0, max);
}

function alphaValue(raw) {
  if (raw === undefined) return 1;
  const text = String(raw).trim();
  const num = text.endsWith("%") ? parseFloat(text) / 100 : parseFloat(text);
  return Number.isFinite(num) ? clamp(num, 0, 1) : NaN;
}

function hueValue(raw) {
  const text = String(raw).trim().toLowerCase();
  let num = parseFloat(text);
  if (text.endsWith("turn")) num *= 360;
  else if (text.endsWith("rad")) num = (num * 180) / Math.PI;
  return ((num % 360) + 360) % 360;
}

// Returns { r, g, b, a } (0-255, alpha 0-1) or null when the text isn't a color.
export function parseColor(input) {
  const text = String(input ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const hex = text.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = [...digits].map((c) => c + c).join("");
    const r = parseInt(digits.slice(0, 2), 16);
    const g = parseInt(digits.slice(2, 4), 16);
    const b = parseInt(digits.slice(4, 6), 16);
    const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a: round(a, 3) };
  }

  const fn = text.match(/^(rgba?|hsla?)\((.*)\)$/);
  if (!fn) return null;
  // Accepts both "1, 2, 3, 0.5" and "1 2 3 / 50%".
  const [main, slashAlpha] = fn[2].split("/");
  const parts = main.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const a = alphaValue(slashAlpha ?? parts[3]);
  if (Number.isNaN(a)) return null;

  if (fn[1].startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((part) => channel(part, 255));
    if ([r, g, b].some((v) => !Number.isFinite(v))) return null;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
  }

  const h = hueValue(parts[0]);
  const s = channel(parts[1], 100) / 100;
  const l = channel(parts[2], 100) / 100;
  if ([h, s, l].some((v) => !Number.isFinite(v))) return null;
  return { ...hslToRgb({ h, s, l }), a };
}

const hex2 = (value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");

export function toHex({ r, g, b, a = 1 }) {
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return a >= 1 ? base : `${base}${hex2(a * 255)}`;
}

// Normalizes any accepted input to stored hex, or "" when it isn't a color.
export function normalizeColorInput(input) {
  const parsed = parseColor(input);
  return parsed ? toHex(parsed) : "";
}

export function toRgbaString({ r, g, b, a = 1 }) {
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${round(a, 2)})`;
}

export function rgbToHsl({ r, g, b }) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

export function toHslaString(color) {
  const { h, s, l } = rgbToHsl(color);
  const body = `${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
  return color.a >= 1 ? `hsl(${body})` : `hsla(${body}, ${round(color.a, 2)})`;
}

// Polaris ColorPicker works in HSB(A): hue 0-360, saturation/brightness/alpha 0-1.
export function rgbToHsb({ r, g, b, a = 1 }) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const d = max - Math.min(rn, gn, bn);
  let h = 0;
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
  }
  return { hue: ((h * 60) + 360) % 360, saturation: max ? d / max : 0, brightness: max, alpha: a };
}

export function hsbToRgb({ hue, saturation, brightness, alpha = 1 }) {
  const f = (n) => {
    const k = (n + hue / 60) % 6;
    return brightness - brightness * saturation * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255), a: round(alpha, 3) };
}

export function formatColor(color, format) {
  if (format === "rgba") return toRgbaString(color);
  if (format === "hsla") return toHslaString(color);
  return toHex(color);
}
