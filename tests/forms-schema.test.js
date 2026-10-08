import test from "node:test";
import assert from "node:assert/strict";
import { emptySchema } from "../app/forms/fields.js";
import {
  isHoneypotTripped,
  validateSubmission,
} from "../app/forms/schema.server.js";

function schemaWith(...fields) {
  return {
    ...emptySchema(),
    fields: [...fields, emptySchema().fields[0]],
  };
}

test("rejects missing required and invalid email values", () => {
  const result = validateSubmission(
    schemaWith(
      {
        id: "name",
        type: "shortText",
        key: "name",
        label: "Name",
        required: true,
        validation: {},
      },
      {
        id: "email",
        type: "email",
        key: "email",
        label: "Email",
        required: true,
        validation: {},
      },
    ),
    { name: "", email: "not-an-email" },
  );

  assert.equal(result.isValid, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.email);
});

test("drops unknown fields and validates dropdown options", () => {
  const result = validateSubmission(
    schemaWith({
      id: "topic",
      type: "dropdown",
      key: "topic",
      label: "Topic",
      required: true,
      options: ["Support", "Sales"],
      validation: {},
    }),
    { topic: "Unknown", injected: "must not persist" },
  );

  assert.equal(result.isValid, false);
  assert.ok(result.errors.topic);
  assert.deepEqual(result.values, {});
});

test("honeypot is tripped only when it contains a value", () => {
  const schema = emptySchema();
  assert.equal(isHoneypotTripped({}, schema), false);
  assert.equal(isHoneypotTripped({ __tclf_hp: "" }, schema), false);
  assert.equal(isHoneypotTripped({ __tclf_hp: "bot" }, schema), true);
});

test("fields hidden from the form are neither required nor stored", () => {
  const result = validateSubmission(
    schemaWith({ id: "nick", type: "shortText", key: "nick", label: "Nickname", required: true, visible: false, validation: {} }),
    { nick: "sneaky" },
  );
  assert.equal(result.isValid, true);
  assert.deepEqual(result.values, {});
});

test("conditional fields are only required when their condition is met", () => {
  const schema = schemaWith(
    { id: "topic", type: "dropdown", key: "topic", label: "Topic", options: ["Order", "Other"], validation: {} },
    {
      id: "order",
      type: "shortText",
      key: "order_number",
      label: "Order number",
      required: true,
      validation: {},
      conditional: { fieldId: "topic", equals: "Order" },
    },
  );

  const hidden = validateSubmission(schema, { topic: "Other", order_number: "should be dropped" });
  assert.equal(hidden.isValid, true);
  assert.deepEqual(hidden.values, { topic: "Other" });

  const shown = validateSubmission(schema, { topic: "Order" });
  assert.equal(shown.isValid, false);
  assert.ok(shown.errors.order_number);
});

test("normalizeSchema keeps builder options and clamps spacing", async () => {
  const { normalizeSchema, VALIDATION_PRESETS } = await import("../app/forms/fields.js");
  const letters = VALIDATION_PRESETS.find((preset) => preset.value === "letters").pattern;
  const schema = normalizeSchema({
    fields: [
      {
        id: "a",
        type: "shortText",
        label: "Name",
        width: "quarter",
        visible: false,
        hideLabel: true,
        cssClass: 'bad"><script>x',
        spacing: { margin: { top: 500, left: -4 }, padding: { right: "12" } },
        validation: { preset: "letters", pattern: letters },
      },
      { id: "b", type: "shortText", label: "Old", width: "bogus" },
    ],
  });
  const [a, b] = schema.fields;
  assert.equal(a.width, "quarter");
  assert.equal(a.visible, false);
  assert.equal(a.hideLabel, true);
  assert.equal(a.cssClass, "badscriptx");
  assert.deepEqual(a.spacing.margin, { top: 96, right: 0, bottom: 0, left: 0 });
  assert.equal(a.spacing.padding.right, 12);
  assert.equal(a.validation.preset, "letters");
  assert.equal(b.width, "full");
  assert.equal(b.visible, true);
  assert.equal(schema.fields.at(-1).type, "submitButton");
});

test("clicked fields are inserted above the submit button", async () => {
  const { addField } = await import("../app/forms/builder-state.js");
  const doc = { name: "x", schema: emptySchema() };
  const next = addField(addField(doc, "email"), "phone");
  assert.deepEqual(
    next.schema.fields.map((field) => field.type),
    ["email", "phone", "submitButton"],
  );
});
