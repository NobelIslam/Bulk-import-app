import { defaultField } from "../fields";

// Templates are plain JSON-compatible schemas. Adding a template means adding a
// file in this folder and registering it in ./index.js — no code changes.

export function field(type, overrides = {}) {
  return { ...defaultField(type), ...overrides };
}

export function heading(text) {
  return field("heading", { label: text });
}

export function paragraph(text) {
  return field("paragraph", { label: text });
}

export function consent(text) {
  return field("consentCheckbox", {
    label: text,
    helpText: "Required so visitors know what happens to their data.",
    required: true,
  });
}