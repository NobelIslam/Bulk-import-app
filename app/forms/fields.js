// Field type registry. Shared by the builder (client) and the storefront renderer,
// so it must stay free of Node/DOM-only imports.

// ─── Field categories ────────────────────────────────────────────────────────

export const FIELD_GROUPS = [
  { key: "input", title: "Input fields" },
  { key: "choice", title: "Choices" },
  { key: "advanced", title: "Advanced" },
  { key: "layout", title: "Content" },
];

// ─── Field types ─────────────────────────────────────────────────────────────
// `width` is the default column width. `hasOptions` types render an option list
// editor. `submissionKey` false means the field is presentational and never
// captured in the submission payload.

export const FIELD_TYPES = [
  {
    type: "shortText",
    label: "Short text",
    group: "input",
    width: "full",
    control: "input",
    icon: "text",
    defaultLabel: "Short text",
  },
  {
    type: "longText",
    label: "Long text",
    group: "input",
    width: "full",
    control: "textarea",
    icon: "textLong",
    defaultLabel: "Message",
  },
  {
    type: "email",
    label: "Email",
    group: "input",
    width: "half",
    control: "email",
    icon: "email",
    defaultLabel: "Email address",
    placeholder: "you@example.com",
  },
  {
    type: "phone",
    label: "Phone",
    group: "input",
    width: "half",
    control: "tel",
    icon: "mobile",
    defaultLabel: "Phone number",
    placeholder: "+1 555 000 0000",
  },
  {
    type: "number",
    label: "Number",
    group: "input",
    width: "half",
    control: "number",
    icon: "hash",
    defaultLabel: "Number",
  },
  {
    type: "date",
    label: "Date",
    group: "input",
    width: "half",
    control: "date",
    icon: "calendar",
    defaultLabel: "Date",
  },
  {
    type: "fileUpload",
    label: "File upload",
    group: "advanced",
    width: "full",
    control: "file",
    icon: "upload",
    defaultLabel: "Attachment",
  },
  {
    type: "hiddenField",
    label: "Hidden field",
    group: "advanced",
    width: "full",
    control: "hidden",
    icon: "eye",
    defaultLabel: "Hidden field",
    submissionKey: false,
  },
  {
    type: "dropdown",
    label: "Dropdown",
    group: "choice",
    width: "half",
    control: "select",
    icon: "list",
    defaultLabel: "Choose an option",
    hasOptions: true,
  },
  {
    type: "radio",
    label: "Radio buttons",
    group: "choice",
    width: "full",
    control: "radio",
    icon: "select",
    defaultLabel: "Pick one",
    hasOptions: true,
  },
  {
    type: "checkbox",
    label: "Checkbox",
    group: "choice",
    width: "full",
    control: "checkbox",
    icon: "checkbox",
    defaultLabel: "I agree",
  },
  {
    type: "multiCheckbox",
    label: "Multiple checkboxes",
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
    group: "advanced",
    width: "full",
    control: "consent",
    icon: "shield",
    defaultLabel: "I agree to the privacy policy",
    helpText: "Required so visitors know what happens to their data.",
  },
  {
    type: "heading",
    label: "Heading",
    group: "layout",
    width: "full",
    control: "heading",
    icon: "heading",
    defaultLabel: "Section heading",
    submissionKey: false,
  },
  {
    type: "paragraph",
    label: "Paragraph",
    group: "layout",
    width: "full",
    control: "paragraph",
    icon: "paragraph",
    defaultLabel: "Add some instructions for your visitors.",
    submissionKey: false,
  },
  {
    type: "submitButton",
    label: "Submit button",
    group: "layout",
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
    required: meta.type === "consentCheckbox" ? true : false,
    defaultValue: "",
    width: meta.width,
    options: meta.hasOptions ? ["Option 1", "Option 2"] : [],
    validation: defaultValidation(),
    conditional: null,
  };
}

export function defaultValidation() {
  return {
    min: null,
    max: null,
    minLength: null,
    maxLength: null,
    pattern: "",
    patternMessage: "",
  };
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
  return {
    id: createFieldId(),
    type: "submitButton",
    key: null,
    label: "Submit",
    placeholder: "",
    helpText: "",
    required: false,
    defaultValue: "",
    width: "full",
    options: [],
    validation: defaultValidation(),
    conditional: null,
  };
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
      next.label = String(field.label ?? next.label).slice(0, 120);
      next.placeholder = String(field.placeholder ?? "").slice(0, 200);
      next.helpText = String(field.helpText ?? "").slice(0, 300);
      next.required = Boolean(field.required);
      next.defaultValue = typeof field.defaultValue === "string" ? field.defaultValue.slice(0, 500) : "";
      next.width = ["full", "half", "third"].includes(field.width) ? field.width : meta.width;
      next.options = Array.isArray(field.options)
        ? field.options.slice(0, 50).map((option) => String(option).slice(0, 120))
        : [];
      next.validation = {
        ...defaultValidation(),
        ...(typeof field.validation === "object" && field.validation ? field.validation : {}),
      };
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

export const WIDTH_LABELS = {
  full: "Full width",
  half: "Half width",
  third: "One third",
};