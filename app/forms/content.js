// Sanitizers for merchant-authored content: rich text, image URLs, colors,
// custom CSS and dates. Shared by the builder (client), the server and tests,
// so it must stay free of Node/DOM-only imports.

// ─── Rich text ───────────────────────────────────────────────────────────────

// Inline formatting plus simple block structure. Every attribute is dropped
// except a vetted `href` on links.
const RICH_TAGS = {
  b: "strong",
  strong: "strong",
  i: "em",
  em: "em",
  u: "u",
  s: "s",
  strike: "s",
  br: "br",
  p: "p",
  div: "p",
  ul: "ul",
  ol: "ol",
  li: "li",
  a: "a",
};
const VOID_TAGS = ["br"];
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi;

export function sanitizeUrl(value, { allowRelative = true } = {}) {
  const url = String(value ?? "").trim().slice(0, 2000);
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(mailto|tel):/i.test(url)) return url;
  if (allowRelative && /^\/(?!\/)/.test(url)) return url;
  if (/^\/\//.test(url)) return `https:${url}`;
  return "";
}

export function sanitizeImageUrl(value) {
  const url = sanitizeUrl(value);
  return /^(mailto|tel):/i.test(url) ? "" : url;
}

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Text between tags keeps existing entities but can never open a new tag.
function escapeText(text) {
  return text.replace(/&(?!#?[a-z0-9]+;)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Allowlist sanitizer: anything not in RICH_TAGS is removed, its text kept.
export function sanitizeRichText(value, maxLength = 10000) {
  const source = String(value ?? "")
    .slice(0, maxLength * 2)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(DROP_WITH_CONTENT, "");

  const tagPattern = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi;
  const open = [];
  let out = "";
  let last = 0;
  let match;

  while ((match = tagPattern.exec(source))) {
    out += escapeText(source.slice(last, match.index));
    last = tagPattern.lastIndex;
    const closing = match[1] === "/";
    const tag = RICH_TAGS[match[2].toLowerCase()];
    if (!tag) continue;

    if (VOID_TAGS.includes(tag)) {
      if (!closing) out += "<br>";
      continue;
    }

    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at === -1) continue;
      // Close anything left open inside it so the markup stays balanced.
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }

    if (tag === "a") {
      const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[3]);
      const url = sanitizeUrl(href ? href[1] ?? href[2] ?? href[3] : "");
      const external = /^https?:\/\//i.test(url);
      out += url
        ? `<a href="${escapeAttr(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>`
        : "<a>";
    } else {
      out += `<${tag}>`;
    }
    open.push(tag);
  }
  out += escapeText(source.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out.slice(0, maxLength);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

// Plain-text version of rich text, used for labels, titles and screen readers.
export function richTextToPlain(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => ENTITIES[name])
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ─── Colors ──────────────────────────────────────────────────────────────────

export function sanitizeColor(value) {
  const color = String(value ?? "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ? color : "";
}

// ─── Custom CSS ──────────────────────────────────────────────────────────────

export const CUSTOM_CSS_MAX = 20000;

// `<` never appears in real CSS; removing it means the value can't close the
// <style> tag it is rendered into.
export function sanitizeCustomCss(value) {
  return String(value ?? "")
    .replace(/</g, "")
    .slice(0, CUSTOM_CSS_MAX);
}

function splitSelectors(prelude) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of prelude) {
    if (char === "(" || char === "[") depth += 1;
    if (char === ")" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function scopeSelector(selector, scope) {
  if (selector.includes("&")) return selector.replace(/&/g, scope);
  const rooted = /^(:root|html|body)\b/i.exec(selector);
  if (rooted) {
    const rest = selector.slice(rooted[0].length).trim();
    return rest ? `${scope} ${rest}` : scope;
  }
  return `${scope} ${selector}`;
}

// Finds the `}` matching the `{` at `open`, skipping quoted strings.
function matchingBrace(css, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < css.length; i += 1) {
    const char = css[i];
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

const NESTED_AT_RULES = /^@(media|supports|container|layer|document)\b/i;

function scopeRules(css, scope) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    let prelude = css.slice(i, open);
    // Statement at-rules (@import, @charset …) are dropped.
    const statementEnd = prelude.lastIndexOf(";");
    if (statementEnd !== -1) prelude = prelude.slice(statementEnd + 1);
    prelude = prelude.trim();
    const close = matchingBrace(css, open);
    const body = css.slice(open + 1, close);

    if (NESTED_AT_RULES.test(prelude)) {
      out += `${prelude}{${scopeRules(body, scope)}}\n`;
    } else if (prelude.startsWith("@")) {
      // @keyframes, @font-face … are global by nature and kept as written.
      out += `${prelude}{${body}}\n`;
    } else if (prelude) {
      const selectors = splitSelectors(prelude).map((selector) => scopeSelector(selector, scope));
      if (selectors.length) out += `${selectors.join(", ")}{${body}}\n`;
    }
    i = close + 1;
  }
  return out;
}

// Prefixes every selector with the form's scope class, so a merchant's CSS
// only ever applies to the one form it was written for. `&` targets the form
// card itself.
export function scopeCustomCss(css, scope) {
  const clean = sanitizeCustomCss(css).replace(/\/\*[\s\S]*?\*\//g, "");
  if (!clean.trim()) return "";
  return scopeRules(clean, scope);
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export const DATE_FORMATS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (12/31/2026)" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (31/12/2026)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-12-31)" },
  { value: "MMM D, YYYY", label: "MMM D, YYYY (Dec 31, 2026)" },
  { value: "D MMMM YYYY", label: "D MMMM YYYY (31 December 2026)" },
];

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value) {
  const match = ISO_DATE.exec(String(value ?? "").trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function isIsoDate(value) {
  return parseIsoDate(value) !== null;
}

export function formatDate(iso, format = "MM/DD/YYYY") {
  const parts = parseIsoDate(iso);
  if (!parts) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const name = MONTH_NAMES[parts.month - 1];
  return format
    .replace("YYYY", String(parts.year))
    .replace("MMMM", "\u0001")
    .replace("MMM", "\u0002")
    .replace("MM", pad(parts.month))
    .replace("DD", pad(parts.day))
    .replace(/\bD\b/, String(parts.day))
    .replace("\u0001", name)
    .replace("\u0002", name.slice(0, 3));
}

export function defaultDateOptions() {
  return { format: "MM/DD/YYYY", disablePast: false, disableWeekends: false, minDate: "", maxDate: "", weekStart: 0 };
}

export function normalizeDateOptions(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const base = defaultDateOptions();
  return {
    format: DATE_FORMATS.some((entry) => entry.value === source.format) ? source.format : base.format,
    disablePast: Boolean(source.disablePast),
    disableWeekends: Boolean(source.disableWeekends),
    minDate: isIsoDate(source.minDate) ? source.minDate : "",
    maxDate: isIsoDate(source.maxDate) ? source.maxDate : "",
    weekStart: Number(source.weekStart) === 1 ? 1 : 0,
  };
}

export function toIso(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

// Six rows of seven days covering `month` (1-12), padded with the days of the
// neighbouring months so the grid never changes height.
export function monthGrid(year, month, weekStart = 0) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() - weekStart + 7) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    days.push({
      iso: day.toISOString().slice(0, 10),
      day: day.getUTCDate(),
      outside: day.getUTCMonth() !== month - 1,
    });
  }
  return days;
}

export function weekdayLabels(weekStart = 0) {
  const names = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return [...names.slice(weekStart), ...names.slice(0, weekStart)];
}

export function addDays(iso, amount) {
  const parts = parseIsoDate(iso);
  if (!parts) return iso;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return date.toISOString().slice(0, 10);
}

export function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Whether a visitor may pick `iso`. `slackDays` lets the server tolerate a
// visitor whose local "today" is a day behind UTC.
export function isDateAllowed(iso, options, { slackDays = 0, today = todayIso() } = {}) {
  const parts = parseIsoDate(iso);
  if (!parts) return false;
  const opts = normalizeDateOptions(options);
  if (opts.minDate && iso < opts.minDate) return false;
  if (opts.maxDate && iso > opts.maxDate) return false;
  if (opts.disablePast) {
    const floor = new Date(`${today}T00:00:00Z`);
    floor.setUTCDate(floor.getUTCDate() - slackDays);
    if (iso < floor.toISOString().slice(0, 10)) return false;
  }
  if (opts.disableWeekends) {
    const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    if (weekday === 0 || weekday === 6) return false;
  }
  return true;
}
