// Shared by the bulk editor UI, the server and tests: which control each
// Shopify field type uses, how values are validated, and how sources (a
// metaobject type, or the metafields of one resource) are described.

// ─── Sources ─────────────────────────────────────────────────────────────────

// Resources whose metafields can be bulk edited, with what their core
// columns support.
export const METAFIELD_OWNERS = [
  { ownerType: "PRODUCT", label: "Products", singular: "product", adminPath: "products", statuses: ["ACTIVE", "DRAFT", "ARCHIVED"], hasImage: true },
  { ownerType: "COLLECTION", label: "Collections", singular: "collection", adminPath: "collections", statuses: null, hasImage: true },
  { ownerType: "PAGE", label: "Pages", singular: "page", adminPath: "pages", statuses: ["PUBLISHED", "HIDDEN"], hasImage: false },
  { ownerType: "ARTICLE", label: "Blog posts", singular: "blog post", adminPath: "articles", statuses: ["PUBLISHED", "HIDDEN"], hasImage: true },
  { ownerType: "BLOG", label: "Blogs", singular: "blog", adminPath: "blogs", statuses: null, hasImage: false },
];

export function getOwner(ownerType) {
  return METAFIELD_OWNERS.find((owner) => owner.ownerType === ownerType) || null;
}

// Sources are addressed as "metaobject:<type>" or "metafields:<OWNER_TYPE>".
export function parseSource(value) {
  const match = /^(metaobject|metafields):(.+)$/.exec(String(value || ""));
  if (!match) return null;
  if (match[1] === "metafields" && !getOwner(match[2])) return null;
  return { kind: match[1], id: match[2] };
}

export const STATUS_LABELS = {
  ACTIVE: "Published",
  PUBLISHED: "Published",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
  HIDDEN: "Hidden",
};

export const STATUS_TONES = { ACTIVE: "success", PUBLISHED: "success", DRAFT: undefined, ARCHIVED: "attention", HIDDEN: undefined };

// ─── Field types ─────────────────────────────────────────────────────────────

const TEXT_TYPES = ["single_line_text_field", "url", "color", "rating", "id", "link"];

// "text" | "textarea" | "number" | "decimal" | "boolean" | "date" | "datetime" | "json" | "readonly"
export function controlForType(typeName) {
  if (typeName === "rating" || typeName === "link") return "readonly"; // JSON-shaped values
  if (TEXT_TYPES.includes(typeName)) return "text";
  if (typeName === "multi_line_text_field") return "textarea";
  if (typeName === "number_integer") return "number";
  if (typeName === "number_decimal") return "decimal";
  if (typeName === "boolean") return "boolean";
  if (typeName === "date") return "date";
  if (typeName === "date_time") return "datetime";
  if (typeName === "json") return "json";
  // money, dimension/weight/volume, list.*, *_reference, rich_text_field…
  return "readonly";
}

export function isEditable(column) {
  return column.control !== "readonly";
}

// Returns an error message, or "" when the value is acceptable.
export function validateValue(column, raw) {
  const value = String(raw ?? "");
  const trimmed = value.trim();
  if (!trimmed) return column.required ? "This field is required." : "";
  switch (column.typeName) {
    case "number_integer":
      return /^-?\d+$/.test(trimmed) ? "" : "Use a whole number, like 12.";
    case "number_decimal":
      return /^-?\d+(\.\d+)?$/.test(trimmed) ? "" : "Use a number, like 12.5.";
    case "boolean":
      return trimmed === "true" || trimmed === "false" ? "" : "Use true or false.";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !Number.isNaN(Date.parse(trimmed)) ? "" : "Use a date like 2026-10-22.";
    case "date_time":
      return !Number.isNaN(Date.parse(trimmed)) ? "" : "Use a date and time like 2026-10-22T14:30:00Z.";
    case "url":
      return /^(https?:\/\/|\/|mailto:|tel:)\S+$/i.test(trimmed) ? "" : "Use a full link (https://…) or a path (/pages/…).";
    case "color":
      return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? "" : "Use a hex color like #1a2b3c.";
    case "json":
      try {
        JSON.parse(trimmed);
        return "";
      } catch {
        return "This isn't valid JSON.";
      }
    default:
      return "";
  }
}

// Normalizes pasted or imported text for a column (e.g. "Yes" → "true").
export function coerceValue(column, raw) {
  const value = String(raw ?? "");
  if (column.control === "boolean") {
    const v = value.trim().toLowerCase();
    if (!v) return "";
    return ["true", "1", "yes", "y", "on"].includes(v) ? "true" : "false";
  }
  if (column.control === "status") {
    const v = value.trim().toUpperCase();
    const byLabel = column.options?.find((option) => option.label.toUpperCase() === v || option.value === v);
    return byLabel ? byLabel.value : value;
  }
  return value;
}

// Every validation problem for one row: [{ key, label, message }].
export function rowErrors(row, columns) {
  const errors = [];
  columns.forEach((column) => {
    if (!isEditable(column)) return;
    const message = column.control === "status"
      ? column.options?.some((option) => option.value === row.values[column.key]) ? "" : "Choose a status."
      : validateValue(column, row.values[column.key]);
    if (message) errors.push({ key: column.key, label: column.label, message });
  });
  return errors;
}

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
