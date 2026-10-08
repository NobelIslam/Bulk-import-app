import crypto from "node:crypto";
import { getFieldType, inputFields, isConditionMet } from "./fields.js";

// ─── Public ids ──────────────────────────────────────────────────────────────

const PUBLIC_ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

// Short, URL- and data-attribute-safe token used on the storefront.
// Excludes look-alike characters (l, 1, 0, o) so merchants can paste it safely.
export function createPublicId(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PUBLIC_ID_ALPHABET[bytes[i] % PUBLIC_ID_ALPHABET.length];
  }
  return out;
}

// ─── Sanitizers ──────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Plain text only. HTML is never stored and never rendered as markup, but we
// still strip control characters so exports and CSV stay clean.
export function sanitizeText(value, maxLength = 2000) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(CONTROL_CHARS, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeMultiline(value, maxLength = 5000) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(CONTROL_CHARS, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLength);
}

// Strips anything that could become markup if a downstream consumer ever
// interpolates the value. Used for the fields we surface in emails/CSV.
export function sanitizeForExport(value) {
  return sanitizeText(value, 2000).replace(/[<>"'`]/g, "");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
// Deliberately permissive: international numbers vary wildly.
const PHONE_PATTERN = /^[+()\-.\s\d]{5,30}$/;
const ALLOWED_FILE_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "heic",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "zip",
];

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(value) && value.length <= 254;
}

export function isValidPhone(value) {
  return PHONE_PATTERN.test(value);
}

function parseNumber(value) {
  const num = Number(sanitizeText(value, 40));
  return Number.isFinite(num) ? num : null;
}

function validatePattern(field, value) {
  const pattern = sanitizeText(field.validation?.pattern, 200);
  if (!pattern) return null;
  // Refuse pathological patterns rather than letting a merchant lock up the
  // submit endpoint.
  if (/(\(.+[+*]\)|\[.*[+*].*\]|\\d[+*]|\\[wds][+*])[+*{]/.test(pattern)) return null;
  try {
    return new RegExp(pattern).test(value) ? null : sanitizeText(field.validation?.patternMessage, 200) || "Invalid format.";
  } catch {
    return null;
  }
}

function normalizeFileValue(value) {
  if (!value || typeof value !== "object") return null;
  const name = sanitizeText(value.name, 200);
  if (!name) return null;
  const size = Number(value.size);
  const extension = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) return null;
  return {
    name,
    size: Number.isFinite(size) && size > 0 ? Math.min(size, 25 * 1024 * 1024) : null,
  };
}

// ─── Submission validation ───────────────────────────────────────────────────
// Validates raw storefront input against the stored schema and returns only the
// fields the schema declares. Unknown keys are dropped, never persisted.

export function validateSubmission(schema, rawData) {
  const values = {};
  const errors = {};
  const source = rawData && typeof rawData === "object" ? rawData : {};
  const fields = inputFields(schema);
  const allFields = Array.isArray(schema?.fields) ? schema.fields : [];

  for (const field of fields) {
    // A field the visitor cannot see must never block or leak into a submission.
    if (field.visible === false || !isConditionMet(field, allFields, source)) continue;

    const raw = source[field.key];
    const type = field.type;

    if (type === "multiCheckbox") {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
      const allowed = (field.options || []).map((option) => sanitizeText(option, 120));
      const picked = list.map((item) => sanitizeText(item, 120)).filter((item) => allowed.includes(item));
      if (field.required && picked.length === 0) {
        errors[field.key] = sanitizeText(schema.settings?.errorRequired, 300) || "This field is required.";
        continue;
      }
      values[field.key] = picked;
      continue;
    }

    if (type === "fileUpload") {
      const file = normalizeFileValue(raw);
      if (field.required && !file) {
        errors[field.key] = sanitizeText(schema.settings?.errorRequired, 300) || "This field is required.";
        continue;
      }
      if (file) values[field.key] = file;
      continue;
    }

    if (type === "checkbox" || type === "consentCheckbox") {
      const checked = raw === true || raw === "true" || raw === "on" || raw === "1" || raw === 1;
      if (type === "consentCheckbox" && !checked) {
        errors[field.key] = sanitizeText(schema.settings?.errorRequired, 300) || "Consent is required.";
        continue;
      }
      values[field.key] = checked;
      continue;
    }

    if (type === "hiddenField") {
      values[field.key] = sanitizeText(field.defaultValue, 500);
      continue;
    }

    const isLong = type === "longText";
    const text = isLong ? sanitizeMultiline(raw) : sanitizeText(raw);
    if (!text) {
      if (field.required) {
        errors[field.key] = sanitizeText(schema.settings?.errorRequired, 300) || "This field is required.";
      }
      continue;
    }

    let value = text;

    if (type === "email" && !isValidEmail(value)) {
      errors[field.key] = sanitizeText(schema.settings?.errorInvalid, 300) || "Enter a valid email address.";
      continue;
    }
    if (type === "phone" && !isValidPhone(value)) {
      errors[field.key] = sanitizeText(schema.settings?.errorInvalid, 300) || "Enter a valid phone number.";
      continue;
    }
    if (type === "number") {
      const num = parseNumber(value);
      if (num === null) {
        errors[field.key] = sanitizeText(schema.settings?.errorInvalid, 300) || "Enter a number.";
        continue;
      }
      if (field.validation?.min !== null && field.validation?.min !== undefined && num < Number(field.validation.min)) {
        errors[field.key] = `Must be at least ${sanitizeText(field.validation.min, 20)}.`;
        continue;
      }
      if (field.validation?.max !== null && field.validation?.max !== undefined && num > Number(field.validation.max)) {
        errors[field.key] = `Must be at most ${sanitizeText(field.validation.max, 20)}.`;
        continue;
      }
      value = num;
    }

    if (typeof value === "string") {
      const minLength = Number(field.validation?.minLength);
      const maxLength = Number(field.validation?.maxLength);
      if (Number.isFinite(minLength) && minLength > 0 && value.length < minLength) {
        errors[field.key] = `Must be at least ${minLength} characters.`;
        continue;
      }
      if (Number.isFinite(maxLength) && maxLength > 0 && value.length > maxLength) {
        errors[field.key] = `Must be at most ${maxLength} characters.`;
        continue;
      }
      const patternError = validatePattern(field, value);
      if (patternError) {
        errors[field.key] = patternError;
        continue;
      }
    }

    if ((type === "dropdown" || type === "radio") && Array.isArray(field.options) && field.options.length > 0) {
      const allowed = field.options.map((option) => sanitizeText(option, 120));
      if (!allowed.includes(value)) {
        errors[field.key] = sanitizeText(schema.settings?.errorInvalid, 300) || "Choose one of the available options.";
        continue;
      }
    }

    values[field.key] = value;
  }

  const isValid = Object.keys(errors).length === 0;
  return { isValid, values: isValid ? values : {}, errors };
}

// ─── Honeypot ────────────────────────────────────────────────────────────────

// Bots fill every input they find. A field that is visually hidden and must
// always arrive empty is the cheapest reliable signal.
export function isHoneypotTripped(rawData, schema) {
  if (schema?.settings?.honeypotEnabled === false) return false;
  const value = rawData?.__tclf_hp;
  if (value === undefined || value === null) return false;
  return sanitizeText(value, 200) !== "";
}

export { getFieldType };