// Design tokens + scoped CSS generation for the storefront form.
// Tokens are stored per viewport in Prisma (`Form.desktopStyle`, `Form.mobileStyle`)
// and rendered as CSS variables on a single form-scoped wrapper class, so nothing
// can leak into or out of the merchant's theme.

import { scopeCustomCss } from "./content.js";

export const FONT_FAMILIES = [
  { value: "inherit", label: "Theme font", stack: "inherit" },
  { value: "system", label: "System", stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { value: "inter", label: "Inter", stack: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { value: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { value: "helvetica", label: "Helvetica", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { value: "arial", label: "Arial", stack: "Arial, sans-serif" },
];

export const INPUT_STYLES = [
  { value: "outline", label: "Outline" },
  { value: "filled", label: "Filled" },
  { value: "underline", label: "Underline" },
];

export const BUTTON_STYLES = [
  { value: "solid", label: "Solid" },
  { value: "outline", label: "Outline" },
  { value: "text", label: "Text" },
];

export const ALIGNMENTS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
];

export const BREAKPOINT_MOBILE = 749;

export const DEFAULT_DESKTOP_STYLE = {
  fontFamily: "inherit",
  labelFontSize: 14,
  inputFontSize: 15,
  headingFontSize: 20,
  buttonFontSize: 15,
  textColor: "#202223",
  labelColor: "#202223",
  backgroundColor: "#ffffff",
  borderColor: "#c9cccf",
  accentColor: "#005bd3",
  buttonBackground: "#005bd3",
  buttonTextColor: "#ffffff",
  borderRadius: 8,
  padding: 24,
  gap: 16,
  alignment: "left",
  inputStyle: "outline",
  buttonStyle: "solid",
  formWidth: 640,
  showShadow: false,
  overlayColor: "#000000",
  overlayOpacity: 50,
};

export const STYLE_KEYS = Object.keys(DEFAULT_DESKTOP_STYLE);

export function defaultStyle() {
  return { ...DEFAULT_DESKTOP_STYLE };
}

// Mobile overrides start empty: unset keys fall back to the desktop value.
export function defaultMobileStyle() {
  return {};
}

function isSet(value) {
  return value !== undefined && value !== null && value !== "";
}

// Merges sparse mobile overrides over the desktop tokens for a viewport.
export function resolveStyle(desktop, mobile, viewport) {
  const base = { ...DEFAULT_DESKTOP_STYLE, ...(desktop || {}) };
  if (viewport !== "mobile") return base;
  const overrides = mobile || {};
  const merged = { ...base };
  STYLE_KEYS.forEach((key) => {
    if (isSet(overrides[key])) merged[key] = overrides[key];
  });
  return merged;
}

// Only accepts known keys and clamps every numeric value, so a hand-crafted
// save request cannot inject arbitrary CSS values.
export function normalizeStyle(raw, base = DEFAULT_DESKTOP_STYLE) {
  const out = {};
  STYLE_KEYS.forEach((key) => {
    const value = raw?.[key];
    if (!isSet(value)) return;
    const min = NUMERIC_RANGES[key];
    if (min) {
      const num = Number(value);
      if (!Number.isFinite(num)) return;
      out[key] = Math.min(min[1], Math.max(min[0], Math.round(num)));
      return;
    }
    if (ENUM_VALUES[key] && !ENUM_VALUES[key].includes(String(value))) return;
    if (key.match(/Color$/)) {
      const color = String(value).trim();
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) return;
      out[key] = color;
      return;
    }
    out[key] = String(value).slice(0, 200);
  });
  return { ...base, ...out };
}

export const NUMERIC_RANGES = {
  labelFontSize: [10, 32],
  inputFontSize: [10, 32],
  headingFontSize: [12, 48],
  buttonFontSize: [10, 32],
  borderRadius: [0, 40],
  padding: [0, 96],
  gap: [0, 48],
  formWidth: [240, 1200],
  overlayOpacity: [0, 90],
};

const ENUM_VALUES = {
  fontFamily: FONT_FAMILIES.map((f) => f.value),
  inputStyle: INPUT_STYLES.map((s) => s.value),
  buttonStyle: BUTTON_STYLES.map((s) => s.value),
  alignment: ALIGNMENTS.map((a) => a.value),
};

function fontStack(value) {
  const found = FONT_FAMILIES.find((f) => f.value === value);
  return found ? found.stack : "inherit";
}

function px(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? `${num}px` : `${fallback}px`;
}

// Emits the scoped stylesheet consumed by both the builder preview and the
// storefront runtime. `publicId` scopes every selector.
export function buildFormCss({ publicId, desktop, mobile, settings, forceMobile = false }) {
  const scope = `.tclf-form--${publicId}`;
  const vars = (style) => {
    const map = {
      "--tclf-font": fontStack(style.fontFamily),
      "--tclf-label-size": px(style.labelFontSize, 14),
      "--tclf-input-size": px(style.inputFontSize, 15),
      "--tclf-heading-size": px(style.headingFontSize, 20),
      "--tclf-button-size": px(style.buttonFontSize, 15),
      "--tclf-text": style.textColor,
      "--tclf-label": style.labelColor,
      "--tclf-bg": style.backgroundColor,
      "--tclf-border": style.borderColor,
      "--tclf-accent": style.accentColor,
      "--tclf-button-bg": style.buttonBackground,
      "--tclf-button-text": style.buttonTextColor,
      "--tclf-radius": px(style.borderRadius, 8),
      "--tclf-padding": px(style.padding, 24),
      "--tclf-gap": px(style.gap, 16),
      "--tclf-align": style.alignment,
      "--tclf-width": px(style.formWidth, 640),
      "--tclf-shadow": style.showShadow ? "0 8px 30px rgba(0,0,0,0.12)" : "none",
      "--tclf-overlay": style.overlayColor,
      "--tclf-overlay-opacity": String(Number(style.overlayOpacity) / 100),
    };
    return Object.entries(map)
      .map(([name, value]) => `${name}:${value};`)
      .join("");
  };

  const inputBackground =
    (desktop?.inputStyle || DEFAULT_DESKTOP_STYLE.inputStyle) === "filled" ? "var(--tclf-bg-alt,#f6f6f7)" : "#ffffff";

  const desktopCss = `
${scope} {
  font-family: var(--tclf-font);
  color: var(--tclf-text);
  box-sizing: border-box;
  width: 100%;
  max-width: var(--tclf-width);
  margin: 0 auto;
  text-align: var(--tclf-align);
}
${scope} *, ${scope} *::before, ${scope} *::after { box-sizing: inherit; }
${scope} .tclf-grid { display: flex; flex-wrap: wrap; gap: var(--tclf-gap); }
${scope} .tclf-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
${scope} .tclf-col[hidden] { display: none; }
${scope} .tclf-col[data-width="full"] { flex: 0 0 100%; max-width: 100%; }
${scope} .tclf-col[data-width="threeQuarters"] { flex: 0 0 calc(75% - (var(--tclf-gap) / 4)); max-width: calc(75% - (var(--tclf-gap) / 4)); }
${scope} .tclf-col[data-width="half"] { flex: 0 0 calc(50% - (var(--tclf-gap) / 2)); max-width: calc(50% - (var(--tclf-gap) / 2)); }
${scope} .tclf-col[data-width="third"] { flex: 0 0 calc(33.333% - (var(--tclf-gap) * 2 / 3)); max-width: calc(33.333% - (var(--tclf-gap) * 2 / 3)); }
${scope} .tclf-col[data-width="quarter"] { flex: 0 0 calc(25% - (var(--tclf-gap) * 3 / 4)); max-width: calc(25% - (var(--tclf-gap) * 3 / 4)); }
${scope} .tclf-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
${scope} .tclf-hp { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
${scope} .tclf-divider { border: 0; border-top: 1px solid var(--tclf-border); margin: 4px 0; width: 100%; }
${scope} input[type="checkbox"], ${scope} input[type="radio"] { accent-color: var(--tclf-accent); width: 16px; height: 16px; margin: 2px 0 0; flex-shrink: 0; }
${scope} .tclf-success { padding: 14px 16px; border-radius: var(--tclf-radius); background: #e3f1df; color: #0c5132; font-size: var(--tclf-input-size); }
${scope} .tclf-form-error { padding: 10px 12px; border-radius: var(--tclf-radius); background: #fee9e8; color: #8e1f0b; font-size: 14px; flex: 0 0 100%; }
${scope} .tclf-label { font-size: var(--tclf-label-size); color: var(--tclf-label); font-weight: 500; }
${scope} .tclf-required { color: #d72c0d; margin-inline-start: 2px; }
${scope} .tclf-help { font-size: 12px; color: #6d7175; }
${scope} .tclf-error { font-size: 12px; color: #d72c0d; }
${scope} .tclf-heading { font-size: var(--tclf-heading-size); font-weight: 600; margin: 0; line-height: 1.25; color: inherit; }
${scope} .tclf-paragraph { margin: 0; font-size: var(--tclf-input-size); color: inherit; line-height: 1.5; }
${scope} .tclf-rich p, ${scope} .tclf-rich ul, ${scope} .tclf-rich ol { margin: 0 0 0.6em; }
${scope} .tclf-rich > :last-child { margin-bottom: 0; }
${scope} .tclf-rich ul, ${scope} .tclf-rich ol { padding-inline-start: 1.4em; }
${scope} .tclf-rich a { color: var(--tclf-accent); text-decoration: underline; }
${scope} .tclf-col[data-block-bg] { border-radius: var(--tclf-radius); }
${scope} .tclf-col[data-block-bg]:not([data-has-padding]) { padding: 12px 16px; }
${scope} .tclf-image { display: flex; width: 100%; }
${scope} .tclf-image img { display: block; max-width: 100%; height: auto; }
${scope} .tclf-image-empty { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 120px; border: 1px dashed var(--tclf-border); border-radius: var(--tclf-radius); color: #8a8a8a; font-size: 13px; background: #fafafa; }
${scope} .tclf-layout { display: block; }
${scope}.tclf-card[data-layout="twoColumn"] { padding: 0; overflow: hidden; }
${scope}[data-layout="twoColumn"] .tclf-layout { display: grid; grid-template-columns: var(--tclf-side-width, 45%) minmax(0, 1fr); align-items: stretch; }
${scope}[data-layout="twoColumn"][data-side-position="right"] .tclf-layout { grid-template-columns: minmax(0, 1fr) var(--tclf-side-width, 45%); }
${scope}[data-layout="twoColumn"][data-side-position="right"] .tclf-side { order: 2; }
${scope}[data-layout="twoColumn"] .tclf-main { padding: var(--tclf-padding); min-width: 0; display: flex; flex-direction: column; justify-content: center; }
${scope} .tclf-side { position: relative; display: flex; flex-direction: column; min-height: 260px; padding: var(--tclf-padding); overflow: hidden; }
${scope} .tclf-side[data-valign="top"] { justify-content: flex-start; }
${scope} .tclf-side[data-valign="center"] { justify-content: center; }
${scope} .tclf-side[data-valign="bottom"] { justify-content: flex-end; }
${scope} .tclf-side__img { display: block; width: 100%; }
${scope} .tclf-side[data-fit="cover"] .tclf-side__img { position: absolute; inset: 0; height: 100%; object-fit: cover; }
${scope} .tclf-side[data-fit="contain"] .tclf-side__img { height: auto; max-height: 100%; object-fit: contain; margin-bottom: 16px; }
${scope} .tclf-side__content { position: relative; z-index: 1; }
${scope} .tclf-side__content:empty { display: none; }
${scope} .tclf-date { position: relative; width: 100%; }
${scope} .tclf-date .tclf-date__input { cursor: pointer; padding-right: 40px; }
${scope} .tclf-date__icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; pointer-events: none; color: #6d7175; }
${scope} .tclf-cal { position: absolute; z-index: 50; top: calc(100% + 6px); left: 0; width: 300px; max-width: calc(100vw - 32px); padding: 14px; background: #ffffff; color: #202223; border: 1px solid #e1e3e5; border-radius: 14px; box-shadow: 0 12px 32px rgba(0,0,0,0.16); font-size: 14px; text-align: left; }
${scope} .tclf-cal[hidden] { display: none; }
${scope} .tclf-cal__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
${scope} .tclf-cal__title { font-weight: 600; font-size: 15px; }
${scope} .tclf-cal__nav { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; font-size: 18px; line-height: 1; padding: 0; }
${scope} .tclf-cal__nav:hover:not(:disabled) { background: #f1f2f4; }
${scope} .tclf-cal__nav:disabled { opacity: 0.3; cursor: default; }
${scope} .tclf-cal__grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
${scope} .tclf-cal__dow { text-align: center; font-size: 11px; font-weight: 600; color: #8a8a8a; text-transform: uppercase; padding: 4px 0; }
${scope} .tclf-cal__day { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 50%; background: transparent; color: inherit; font: inherit; font-size: 14px; cursor: pointer; padding: 0; min-height: 0; width: 100%; }
${scope} .tclf-cal__day:hover:not(:disabled) { background: #f1f2f4; }
${scope} .tclf-cal__day:focus-visible { outline: 2px solid var(--tclf-accent); outline-offset: 1px; }
${scope} .tclf-cal__day[data-outside] { color: #b5b5b5; }
${scope} .tclf-cal__day[data-today] { box-shadow: inset 0 0 0 1px var(--tclf-accent); }
${scope} .tclf-cal__day[aria-selected="true"] { background: var(--tclf-accent); color: #ffffff; font-weight: 600; }
${scope} .tclf-cal__day:disabled { color: #d0d0d0; cursor: not-allowed; text-decoration: line-through; }
${scope} .tclf-cal__foot { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f1f2f4; }
${scope} .tclf-cal__link { border: 0; background: transparent; color: var(--tclf-accent); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
${scope} .tclf-cal__link:hover { background: #f1f2f4; }
${scope} input[type="text"], ${scope} input[type="email"], ${scope} input[type="tel"],
${scope} input[type="number"], ${scope} input[type="date"], ${scope} select,
${scope} textarea, ${scope} input[type="file"] {
  font-family: inherit;
  font-size: var(--tclf-input-size);
  color: var(--tclf-text);
  background: ${inputBackground};
  border: 1px solid var(--tclf-border);
  border-radius: var(--tclf-radius);
  padding: 10px 12px;
  width: 100%;
  min-height: 40px;
}
${scope} textarea { min-height: 110px; resize: vertical; }
${scope} [data-input-style="underline"] input, ${scope} [data-input-style="underline"] select,
${scope} [data-input-style="underline"] textarea { border-width: 0 0 1px 0; border-radius: 0; background: transparent; }
${scope} input:focus-visible, ${scope} select:focus-visible, ${scope} textarea:focus-visible {
  outline: 2px solid var(--tclf-accent);
  outline-offset: 1px;
}
${scope} [aria-invalid="true"] { border-color: #d72c0d; }
${scope} .tclf-choice { display: flex; align-items: flex-start; gap: 8px; font-size: var(--tclf-input-size); }
${scope} .tclf-choice-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; border: 0; }
${scope} .tclf-submit {
  font-family: inherit;
  font-size: var(--tclf-button-size);
  border-radius: var(--tclf-radius);
  padding: 11px 22px;
  cursor: pointer;
  border: 1px solid var(--tclf-button-bg);
  background: var(--tclf-button-bg);
  color: var(--tclf-button-text);
}
${scope} .tclf-submit[data-button-style="outline"] { background: transparent; color: var(--tclf-button-bg); }
${scope} .tclf-submit[data-button-style="text"] { background: transparent; color: var(--tclf-button-bg); border-color: transparent; padding-inline: 4px; }
${scope} .tclf-submit:disabled { opacity: 0.6; cursor: not-allowed; }
${scope} .tclf-hidden { display: none; }
${scope}.tclf-card {
  background: var(--tclf-bg);
  border-radius: var(--tclf-radius);
  box-shadow: var(--tclf-shadow);
  padding: var(--tclf-padding);
}
${scope}.tclf-align-center .tclf-grid { justify-content: center; }
`;

  const mobileStyle = resolveStyle(desktop, mobile, "mobile");
  const mobileCss = `
@media (max-width: ${BREAKPOINT_MOBILE}px) {
${scope} {${vars(mobileStyle)}}
${scope} .tclf-col[data-width] { flex: 0 0 100%; max-width: 100%; }
${mobileLayout(scope)}
}
`;

  // The builder's mobile preview is narrower than the breakpoint without the
  // browser being, so it applies the mobile rules unconditionally.
  if (forceMobile) {
    return `${scope} {${vars(mobileStyle)}}${sideCss(scope, settings)}${desktopCss}
${scope} .tclf-col[data-width] { flex: 0 0 100%; max-width: 100%; }
${mobileLayout(scope)}
${customCss(scope, settings)}`;
  }

  return `${scope} {${vars(resolveStyle(desktop, mobile, "desktop"))}}${sideCss(scope, settings)}${desktopCss}${mobileCss}${customCss(scope, settings)}`;
}

// Two columns stack on phones, side panel first.
function mobileLayout(scope) {
  return `${scope}[data-layout="twoColumn"][data-side-position] .tclf-layout { grid-template-columns: 1fr; }
${scope}[data-layout="twoColumn"][data-side-position] .tclf-side { order: 0; min-height: 200px; }`;
}

function sideCss(scope, settings) {
  const side = settings?.sidePanel;
  if (settings?.layout !== "twoColumn" || !side) return "";
  const width = Math.min(65, Math.max(25, Number(side.width) || 45));
  const panel = [
    `background:${side.backgroundColor || "#f6f6f7"};`,
    side.textColor ? `color:${side.textColor};` : "",
    `text-align:${side.textAlign || "left"};`,
  ].join("");
  return `\n${scope} {--tclf-side-width:${width}%;}\n${scope} .tclf-side {${panel}}\n`;
}

// Merchant CSS is appended last so it wins over the generated rules.
function customCss(scope, settings) {
  return settings?.customCss ? `\n/* Custom CSS */\n${scopeCustomCss(settings.customCss, scope)}` : "";
}