import test from "node:test";
import assert from "node:assert/strict";
import { coerceValue, controlForType, parseSource, rowErrors, validateValue } from "../app/bulk/fields.js";
import { loadSource, saveChanges, sourceColumns } from "../app/bulk/sources.server.js";
import { STATUS_KEY, TITLE_KEY } from "../app/bulk/keys.js";

// Records every GraphQL call and answers from a handler.
function fakeAdmin(handler) {
  const calls = [];
  return {
    calls,
    graphql: async (query, options = {}) => {
      calls.push({ query, variables: options.variables || {} });
      const data = handler(query, options.variables || {}, calls.length);
      return { json: async () => ({ data }) };
    },
  };
}

test("parseSource accepts metaobject types and known resources only", () => {
  assert.deepEqual(parseSource("metaobject:lookbook"), { kind: "metaobject", id: "lookbook" });
  assert.deepEqual(parseSource("metafields:PRODUCT"), { kind: "metafields", id: "PRODUCT" });
  assert.equal(parseSource("metafields:ORDER"), null);
  assert.equal(parseSource("nonsense"), null);
});

test("field types map to editable controls or read-only", () => {
  assert.equal(controlForType("single_line_text_field"), "text");
  assert.equal(controlForType("multi_line_text_field"), "textarea");
  assert.equal(controlForType("number_integer"), "number");
  assert.equal(controlForType("boolean"), "boolean");
  assert.equal(controlForType("json"), "json");
  assert.equal(controlForType("money"), "readonly");
  assert.equal(controlForType("list.single_line_text_field"), "readonly");
  assert.equal(controlForType("product_reference"), "readonly");
});

test("values are validated per field type", () => {
  const col = (typeName, extra = {}) => ({ typeName, control: controlForType(typeName), ...extra });
  assert.equal(validateValue(col("number_integer"), "12"), "");
  assert.notEqual(validateValue(col("number_integer"), "1.5"), "");
  assert.equal(validateValue(col("number_decimal"), "-1.25"), "");
  assert.notEqual(validateValue(col("date"), "22/10/2026"), "");
  assert.equal(validateValue(col("date"), "2026-10-22"), "");
  assert.notEqual(validateValue(col("url"), "example.com"), "");
  assert.equal(validateValue(col("url"), "/pages/about"), "");
  assert.notEqual(validateValue(col("color"), "red"), "");
  assert.notEqual(validateValue(col("json"), "{bad"), "");
  assert.notEqual(validateValue(col("single_line_text_field", { required: true }), "  "), "");
  assert.equal(validateValue(col("single_line_text_field"), ""), "");
});

test("pasted values are coerced for booleans and statuses", () => {
  assert.equal(coerceValue({ control: "boolean" }, "Yes"), "true");
  assert.equal(coerceValue({ control: "boolean" }, "no"), "false");
  const status = { control: "status", options: [{ value: "ACTIVE", label: "Published" }, { value: "DRAFT", label: "Draft" }] };
  assert.equal(coerceValue(status, "published"), "ACTIVE");
  assert.equal(coerceValue(status, "DRAFT"), "DRAFT");
  const errors = rowErrors({ values: { [STATUS_KEY]: "NOPE" } }, [{ key: STATUS_KEY, label: "Status", control: "status", options: status.options }]);
  assert.equal(errors.length, 1);
});

const PRODUCT_DEFS = {
  metafieldDefinitions: {
    nodes: [
      { namespace: "custom", key: "subtitle", name: "Subtitle", type: { name: "single_line_text_field" } },
      { namespace: "custom", key: "care", name: "Care", type: { name: "multi_line_text_field" } },
      { namespace: "custom", key: "price_note", name: "Price note", type: { name: "money" } },
      { namespace: "bad ns", key: "x", name: "Unsafe", type: { name: "single_line_text_field" } },
    ],
  },
};

test("loading product metafields builds columns, aliases and rows", async () => {
  const admin = fakeAdmin((query) => {
    if (query.includes("metafieldDefinitions")) return PRODUCT_DEFS;
    return {
      products: {
        nodes: [
          {
            id: "gid://shopify/Product/1",
            handle: "shirt",
            updatedAt: "2026-10-01T00:00:00Z",
            title: "Shirt",
            status: "ACTIVE",
            featuredMedia: { preview: { image: { url: "https://cdn/x.jpg" } } },
            mf0: { value: "Soft cotton" },
            mf1: null,
            mf2: { value: '{"amount":"5"}' },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    };
  });
  const result = await loadSource(admin, parseSource("metafields:PRODUCT"), []);
  assert.deepEqual(result.columns.map((c) => c.key), [TITLE_KEY, STATUS_KEY, "custom.subtitle", "custom.care", "custom.price_note"]);
  assert.equal(result.columns.find((c) => c.key === "custom.price_note").control, "readonly");
  const query = admin.calls[1].query;
  assert.match(query, /mf0: metafield\(namespace: "custom", key: "subtitle"\)/);
  assert.doesNotMatch(query, /bad ns/);
  const [row] = result.rows;
  assert.equal(row.values["custom.subtitle"], "Soft cotton");
  assert.equal(row.values["custom.care"], "");
  assert.equal(row.values[STATUS_KEY], "ACTIVE");
  assert.equal(row.image, "https://cdn/x.jpg");
  assert.equal(row.adminPath, "products/1");
});

test("saving metafields: set, delete for blanks, read-only ignored, core update, errors mapped", async () => {
  const admin = fakeAdmin((query, variables) => {
    if (query.includes("metafieldDefinitions")) return PRODUCT_DEFS;
    if (query.includes("metafieldsSet")) {
      // Reject the second item of the batch.
      return { metafieldsSet: { metafields: [], userErrors: [{ field: ["metafields", "1", "value"], message: "Too long" }] } };
    }
    if (query.includes("metafieldsDelete")) return { metafieldsDelete: { deletedMetafields: [], userErrors: [] } };
    if (query.includes("productUpdate")) return { c0: { product: { id: variables.id0 }, userErrors: [] } };
    return {};
  });
  const source = parseSource("metafields:PRODUCT");
  const columns = await sourceColumns(admin, source, []);
  const result = await saveChanges(
    admin,
    source,
    [
      { id: "gid://shopify/Product/1", changes: { "custom.subtitle": "New", "custom.care": "", "custom.price_note": "999", [STATUS_KEY]: "DRAFT" } },
      { id: "gid://shopify/Product/2", changes: { "custom.subtitle": "Way too long" } },
    ],
    columns,
  );

  const set = admin.calls.find((c) => c.query.includes("metafieldsSet"));
  assert.deepEqual(
    set.variables.metafields.map((m) => [m.ownerId, m.key, m.type, m.value]),
    [
      ["gid://shopify/Product/1", "subtitle", "single_line_text_field", "New"],
      ["gid://shopify/Product/2", "subtitle", "single_line_text_field", "Way too long"],
    ],
  );
  const del = admin.calls.find((c) => c.query.includes("metafieldsDelete"));
  assert.deepEqual(del.variables.metafields, [{ ownerId: "gid://shopify/Product/1", namespace: "custom", key: "care" }]);
  assert.ok(!admin.calls.some((c) => JSON.stringify(c.variables).includes("999")), "read-only money value must not be sent");
  const core = admin.calls.find((c) => c.query.includes("productUpdate"));
  assert.equal(core.variables.status0, "DRAFT");
  assert.equal(core.variables.title0, undefined);

  assert.deepEqual(result.success, ["gid://shopify/Product/1"]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].id, "gid://shopify/Product/2");
  assert.equal(result.errors[0].errors[0].field, "Subtitle");
});

test("saving metaobjects sends fields and publish status in one update", async () => {
  const definitions = [
    {
      type: "lookbook",
      capabilities: { publishable: { enabled: true } },
      fieldDefinitions: [
        { key: "headline", name: "Headline", required: true, type: { name: "single_line_text_field" } },
        { key: "products", name: "Products", required: false, type: { name: "list.product_reference" } },
      ],
    },
  ];
  const admin = fakeAdmin((query, variables) => ({ m0: { metaobject: { id: variables.id0 }, userErrors: [] } }));
  const source = parseSource("metaobject:lookbook");
  const columns = await sourceColumns(admin, source, definitions);
  const result = await saveChanges(admin, source, [{ id: "gid://shopify/Metaobject/9", changes: { headline: "Fall", products: "[]", [STATUS_KEY]: "ACTIVE", [TITLE_KEY]: "x" } }], columns);
  const input = admin.calls[0].variables.input0;
  assert.deepEqual(input.fields, [{ key: "headline", value: "Fall" }]);
  assert.deepEqual(input.capabilities, { publishable: { status: "ACTIVE" } });
  assert.deepEqual(result.success, ["gid://shopify/Metaobject/9"]);
});
