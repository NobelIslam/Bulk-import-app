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
