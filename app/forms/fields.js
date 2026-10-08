// Field type registry. Shared by the builder (client) and the storefront renderer,
// so it must stay free of Node/DOM-only imports.

// ─── Field categories ────────────────────────────────────────────────────────

export const FIELD_GROUPS = [
  { key: "input", title: "Input fields" },
  { key: "choice", title: "Choices" },
  { key: "layout", title: "Content" },
  { key: "advanced", title: "Advanced" },
  { key: "action", title: "Actions" },
];

// ─── Field types ─────────────────────────────────────────────────────────────
// `width` is the default column width. `hasOptions` types render an option list
// editor. `submissionKey` false means the field is presentational and never
// captured in the submission payload.

export const FIELD_TYPES = [
  {
    type: "shortText",
    label: "Text input",
    description: "Collect short text from customers",
    group: "input",
    width: "full",
    control: "input",
    icon: "text",
    defaultLabel: "Short text",
  },
  {
    type: "longText",
    label: "Long text",
    description: "Collect a longer, multi-line answer",
    group: "input",
    width: "full",
    control: "textarea",
    icon: "textLong",
    defaultLabel: "Message",
  },
  {
    type: "email",
    label: "Email",
    description: "Collect a valid email address",
    group: "input",
    width: "full",
    control: "email",
    icon: "email",
    defaultLabel: "Email address",
    placeholder: "you@example.com",
  },
  {
    type: "phone",
    label: "Phone",
    description: "Collect a phone number",
    group: "input",
    width: "full",
    control: "tel",
    icon: "phone",
    defaultLabel: "Phone number",
    placeholder: "(555) 123-4567",
  },
  {
    type: "number",
    label: "Number",
    description: "Collect a number, with optional limits",
    group: "input",
    width: "half",
    control: "number",
    icon: "hash",
    defaultLabel: "Number",
  },
  {
    type: "date",
    label: "Date picker",
    description: "Let customers pick a date",
    group: "input",
    width: "half",
    control: "date",
    icon: "calendar",
    defaultLabel: "Date",
  },
  {
    type: "fileUpload",
    label: "File upload",
    description: "Let customers attach a file",
    group: "input",
    width: "full",
    control: "file",
    icon: "upload",
    defaultLabel: "Attachment",
  },
  {
    type: "dropdown",
    label: "Dropdown",
    description: "Pick one option from a list",
    group: "choice",
    width: "full",
    control: "select",
    icon: "list",
    defaultLabel: "Choose an option",
    placeholder: "Select an option",
    hasOptions: true,
  },
  {
    type: "radio",
    label: "Radio group",
    description: "Pick exactly one of a few options",
    group: "choice",
    width: "full",
    control: "radio",
    icon: "radio",
    defaultLabel: "Pick one",
    hasOptions: true,
  },
  {
    type: "checkbox",
    label: "Checkbox",
    description: "A single yes/no tick box",
    group: "choice",
    width: "full",
    control: "checkbox",
    icon: "checkbox",
    defaultLabel: "I agree",
  },
  {
    type: "multiCheckbox",
    label: "Multiple checkboxes",
    description: "Pick any number of options",
    group: "choice",
    width: "full",
    control: "checkboxGroup",
    icon: "checkboxGroup",
    defaultLabel: "Pick any",
    hasOptions: true,
  },
  {
    type: "consentCheckbox",
    label: "Consent checkbox",
    description: "Required agreement, e.g. to be contacted",
    group: "choice",
    width: "full",
    control: "consent",
    icon: "shield",
    defaultLabel: "I agree to be contacted",
    helpText: "Required so visitors know what happens to their data.",
  },
  {
    type: "paragraph",
    label: "Paragraph",
    description: "Instructions or supporting text",
    group: "layout",
    width: "full",
    control: "paragraph",
    icon: "paragraph",
    defaultLabel: "Add some instructions for your visitors.",
    submissionKey: false,
  },
  {
    type: "heading",
    label: "Heading",
    description: "A title to split the form into sections",
    group: "layout",
    width: "full",
    control: "heading",
    icon: "heading",
    defaultLabel: "Section heading",
    submissionKey: false,
  },
  {
    type: "divider",
    label: "Divider",
    description: "A horizontal line between sections",
    group: "layout",
    width: "full",
    control: "divider",
    icon: "divider",
    defaultLabel: "Divider",
    submissionKey: false,
  },
  {
    type: "hiddenField",
    label: "Hidden field",
    description: "Send a fixed value with every submission",
    group: "advanced",
    width: "full",
    control: "hidden",
    icon: "eye",
    defaultLabel: "Hidden field",
  },
  {
    type: "submitButton",
    label: "Submit button",
    description: "Sends the form",
    group: "action",
    width: "full",
    control: "submit",
    icon: "button",
    defaultLabel: "Submit",
    submissionKey: false,
  },
];

export const FIELD_TYPE_MAP = FIELD_TYPES.reduce((acc, field) => {
  acc[field.type] = field;
  return acc;
}, {});

export function getFieldType(type) {
  return FIELD_TYPE_MAP[type] || null;
}

// ─── Layout ──────────────────────────────────────────────────────────────────

// `third` predates the 25/50/75/100 picker; templates still use it.
export const FIELD_WIDTHS = ["quarter", "third", "half", "threeQuarters", "full"];

export const WIDTH_OPTIONS = [
  { value: "quarter", label: "25%" },
  { value: "third", label: "33%" },
  { value: "half", label: "50%" },
  { value: "threeQuarters", label: "75%" },
  { value: "full", label: "100%" },
];

export const SPACING_SIDES = ["top", "right", "bottom", "left"];
const SPACING_MAX = 96;

export function defaultSpacing() {
  return {
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

function normalizeBox(raw) {
  const out = {};
  SPACING_SIDES.forEach((side) => {
    const num = Number(raw?.[side]);
    out[side] = Number.isFinite(num) ? Math.min(SPACING_MAX, Math.max(0, Math.round(num))) : 0;
  });
  return out;
}

export function normalizeSpacing(raw) {
  return { margin: normalizeBox(raw?.margin), padding: normalizeBox(raw?.padding) };
}

// Only plain class tokens survive, so the value can never break out of the attribute.
export function sanitizeClassName(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

// ─── Validation presets ──────────────────────────────────────────────────────

export const VALIDATION_PRESETS = [
  { value: "none", label: "None", pattern: "" },
  { value: "letters", label: "Letters only", pattern: "^[A-Za-z\\s'.-]+$", message: "Use letters only." },
  { value: "numbers", label: "Numbers only", pattern: "^[0-9]+$", message: "Use numbers only." },
  { value: "alphanumeric", label: "Letters and numbers", pattern: "^[A-Za-z0-9\\s]+$", message: "Use letters and numbers only." },
  { value: "url", label: "Website URL", pattern: "^https?://\\S+$", message: "Enter a full URL starting with http:// or https://." },
  { value: "custom", label: "Custom pattern (regex)", pattern: null },
];

// Fields where a text pattern makes sense.
export const PATTERN_FIELD_TYPES = ["shortText", "longText", "phone"];

export function presetForValidation(validation) {
  const pattern = validation?.pattern || "";
  if (!pattern) return validation?.preset === "custom" ? "custom" : "none";
  const match = VALIDATION_PRESETS.find((preset) => preset.pattern && preset.pattern === pattern);
  return match ? match.value : "custom";
}

// ─── Conditional visibility ──────────────────────────────────────────────────

function isAnswered(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  return String(value).trim() !== "" && String(value) !== "false";
}

// Shared by the builder preview, the storefront runtime contract and the server,
// so a field hidden on the page is never required on submit.
export function isConditionMet(field, fields, values) {
  const condition = field?.conditional;
  if (!condition?.fieldId) return true;
  const source = (fields || []).find((entry) => entry.id === condition.fieldId);
  if (!source || !source.key) return true;
  const value = values?.[source.key];
  const expected = String(condition.equals ?? "").trim();
  if (!expected) return isAnswered(value);
  if (Array.isArray(value)) return value.map(String).includes(expected);
  if (value === true || value === "true" || value === "on") return ["true", "yes", "on", "checked"].includes(expected.toLowerCase());
  return String(value ?? "").trim().toLowerCase() === expected.toLowerCase();
}

// ─── Field factories ─────────────────────────────────────────────────────────

let idCounter = 0;

// Deterministic-enough unique id. Server code overwrites these with cuid-backed
// ids, but the builder needs stable client ids before the first save.
export function createFieldId() {
  idCounter += 1;
  return `fld_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function slugifyKey(label, takenKeys = []) {
  const base =
    String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field";
  let key = base;
  let suffix = 2;
  while (takenKeys.includes(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

export function defaultField(type, takenKeys = []) {
  const meta = getFieldType(type);
  if (!meta) return null;
  const label = meta.defaultLabel;
  return {
    id: createFieldId(),
    type: meta.type,
    key: meta.submissionKey === false ? null : slugifyKey(label, takenKeys),
    label,
    placeholder: meta.placeholder || "",
    helpText: meta.helpText || "",
    required: meta.type === "consentCheckbox",
    defaultValue: "",
    width: meta.width,
    options: meta.hasOptions ? ["Option 1", "Option 2"] : [],
    validation: defaultValidation(),
    conditional: null,
    visible: true,
    hideLabel: false,
    cssClass: "",
    spacing: defaultSpacing(),
  };
}

export function defaultValidation() {
  return {
    preset: "none",
    min: null,
    max: null,
    minLength: null,
    maxLength: null,
    pattern: "",
    patternMessage: "",
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeValidation(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const preset = VALIDATION_PRESETS.some((entry) => entry.value === source.preset) ? source.preset : null;
  const next = {
    min: numberOrNull(source.min),
    max: numberOrNull(source.max),
    minLength: numberOrNull(source.minLength),
    maxLength: numberOrNull(source.maxLength),
    pattern: String(source.pattern ?? "").slice(0, 200),
    patternMessage: String(source.patternMessage ?? "").slice(0, 200),
  };
  next.preset = preset === "custom" ? "custom" : presetForValidation(next);
  return next;
}

// ─── Schema helpers ──────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 1;

export function defaultFormSettings() {
  return {
    submitText: "Submit",
    submitLoadingText: "Submitting…",
    successMode: "message",
    successMessage: "Thanks! Your submission has been received.",
    redirectUrl: "",
    errorRequired: "This field is required.",
    errorInvalid: "Please enter a valid value.",
    errorSubmit: "Something went wrong. Please try again.",
    notificationEmails: [],
    autoReplyEnabled: false,
    autoReplyMessage: "",
    createCustomer: false,
    honeypotEnabled: true,
    rateLimitPerMinute: 5,
    recaptchaEnabled: false,
    recaptchaSiteKey: "",
  };
}

export function defaultPlacement() {
  return {
    mode: "inline",
    openMode: "modal",
    triggers: [],
    targets: { mode: "all", urls: [] },
    buttonBindings: [],
  };
}

export function emptySchema() {
  return {
    version: SCHEMA_VERSION,
    fields: [createSubmitField()],
    settings: defaultFormSettings(),
  };
}

export function createSubmitField() {
  return { ...defaultField("submitButton"), label: "Submit" };
}

// Fields that are actually captured in a submission payload.
export function inputFields(schema) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  return fields.filter((field) => getFieldType(field.type)?.submissionKey !== false);
}

export function findField(schema, fieldId) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  return fields.find((field) => field.id === fieldId) || null;
}

// Strips every key the builder never owns, so a hand-crafted request cannot
// inject fields into a stored schema. Shape is rebuilt field by field.
export function normalizeSchema(raw) {
  const base = emptySchema();
  const fields = Array.isArray(raw?.fields) ? raw.fields : [];

  const takenKeys = [];
  const normalizedFields = fields
    .slice(0, 200)
    .map((field) => {
      const meta = getFieldType(field?.type);
      if (!meta) return null;
      const next = defaultField(meta.type, takenKeys);
      next.id = typeof field.id === "string" && field.id ? field.id.slice(0, 40) : next.id;
      next.label = String(field.label ?? next.label).slice(0, 300);
      next.placeholder = String(field.placeholder ?? "").slice(0, 200);
      next.helpText = String(field.helpText ?? "").slice(0, 300);
      next.required = Boolean(field.required);
      next.defaultValue = typeof field.defaultValue === "string" ? field.defaultValue.slice(0, 500) : "";
      next.width = FIELD_WIDTHS.includes(field.width) ? field.width : meta.width;
      next.options = Array.isArray(field.options)
        ? field.options.slice(0, 50).map((option) => String(option).slice(0, 120))
        : [];
      next.validation = normalizeValidation(field.validation);
      next.key =
        meta.submissionKey === false
          ? null
          : typeof field.key === "string" && field.key
            ? slugifyKey(field.key, takenKeys)
            : next.key;
      if (next.key) takenKeys.push(next.key);
      next.conditional =
        typeof field.conditional === "object" && field.conditional?.fieldId
          ? {
              fieldId: String(field.conditional.fieldId).slice(0, 40),
              equals: String(field.conditional.equals ?? "").slice(0, 120),
            }
          : null;
      next.visible = field.visible !== false;
      next.hideLabel = Boolean(field.hideLabel);
      next.cssClass = sanitizeClassName(field.cssClass);
      next.spacing = normalizeSpacing(field.spacing);
      return next;
    })
    .filter(Boolean);

  if (!normalizedFields.some((field) => field.type === "submitButton")) {
    normalizedFields.push(createSubmitField());
  }

  return {
    version: SCHEMA_VERSION,
    fields: normalizedFields,
    settings: { ...base.settings, ...(typeof raw?.settings === "object" && raw.settings ? raw.settings : {}) },
  };
}
