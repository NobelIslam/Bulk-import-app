import { controlForType, getOwner, METAFIELD_OWNERS, STATUS_LABELS } from "./fields.js";
import { STATUS_KEY, TITLE_KEY } from "./keys.js";

// Loads and saves the rows behind the bulk editor. Every source (a
// metaobject type, or one resource's metafields) is returned in the same
// shape, so the UI treats them identically:
//   columns: [{ key, label, typeName, control, required, core?, options?, namespace?, mfKey? }]
//   rows:    [{ id, handle, image, updatedAt, adminPath, values: { [columnKey]: string } }]

const MAX_ROWS = 2000;
const METAOBJECT_PAGE = 250;
const SAFE_KEY = /^[A-Za-z0-9_-]+$/;


function graphQLMessage(err) {
  const first = err?.graphQLErrors?.[0] || err?.body?.errors?.graphQLErrors?.[0];
  if (first?.message) return first.message;
  return err?.message || "Something went wrong talking to Shopify.";
}

async function gql(admin, query, variables) {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  const body = await response.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

const numericId = (gid) => String(gid).split("/").pop();
const statusOptions = (values) => values.map((value) => ({ value, label: STATUS_LABELS[value] || value }));

// ─── Source list ─────────────────────────────────────────────────────────────

export async function listSources(admin) {
  const data = await gql(
    admin,
    `#graphql
    query BulkEditorDefinitions {
      metaobjectDefinitions(first: 100) {
        nodes {
          id type name
          capabilities { publishable { enabled } }
          fieldDefinitions { key name required type { name } }
        }
      }
    }`,
  );
  const definitions = data.metaobjectDefinitions.nodes;
  return {
    definitions,
    sources: [
      ...definitions.map((def) => ({ value: `metaobject:${def.type}`, label: def.name, group: "Metaobjects" })),
      ...METAFIELD_OWNERS.map((owner) => ({ value: `metafields:${owner.ownerType}`, label: owner.label, group: "Metafields" })),
    ],
  };
}

// ─── Metaobjects ─────────────────────────────────────────────────────────────

function metaobjectColumns(definition) {
  const publishable = Boolean(definition.capabilities?.publishable?.enabled);
  return [
    { key: TITLE_KEY, label: "Title", typeName: "single_line_text_field", control: "readonly", core: true, readOnlyReason: "The title comes from the entry's display name field." },
    ...(publishable
      ? [{ key: STATUS_KEY, label: "Status", control: "status", core: true, required: true, options: statusOptions(["ACTIVE", "DRAFT"]) }]
      : []),
    ...definition.fieldDefinitions.map((fd) => ({
      key: fd.key,
      label: fd.name,
      typeName: fd.type.name,
      control: controlForType(fd.type.name),
      required: fd.required,
    })),
  ];
}

async function loadMetaobjects(admin, definition) {
  const publishable = Boolean(definition.capabilities?.publishable?.enabled);
  const columns = metaobjectColumns(definition);
  const rows = [];
  let after = null;
  let hasNext = true;
  while (hasNext && rows.length < MAX_ROWS) {
    const data = await gql(
      admin,
      `#graphql
      query BulkEditorMetaobjects($type: String!, $first: Int!, $after: String) {
        metaobjects(type: $type, first: $first, after: $after) {
          nodes {
            id handle displayName updatedAt
            capabilities { publishable { status } }
            fields { key value }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { type: definition.type, first: METAOBJECT_PAGE, after },
    );
    data.metaobjects.nodes.forEach((node) => {
      const values = { [TITLE_KEY]: node.displayName || "" };
      if (publishable) values[STATUS_KEY] = node.capabilities?.publishable?.status || "DRAFT";
      definition.fieldDefinitions.forEach((fd) => {
        values[fd.key] = node.fields.find((field) => field.key === fd.key)?.value ?? "";
      });
      rows.push({
        id: node.id,
        handle: node.handle,
        image: "",
        updatedAt: node.updatedAt,
        adminPath: `content/metaobjects/entries/${definition.type}/${numericId(node.id)}`,
        values,
      });
    });
    hasNext = data.metaobjects.pageInfo.hasNextPage;
    after = data.metaobjects.pageInfo.endCursor;
  }
  return { columns, rows: rows.slice(0, MAX_ROWS), truncated: hasNext };
}

// ─── Resource metafields ─────────────────────────────────────────────────────

const RESOURCE_QUERIES = {
  PRODUCT: { root: "products", fields: "title status featuredMedia { preview { image { url } } }" },
  COLLECTION: { root: "collections", fields: "title image { url }" },
  PAGE: { root: "pages", fields: "title isPublished" },
  ARTICLE: { root: "articles", fields: "title isPublished image { url }" },
  BLOG: { root: "blogs", fields: "title" },
};

function resourceStatus(ownerType, node) {
  if (ownerType === "PRODUCT") return node.status;
  if (ownerType === "PAGE" || ownerType === "ARTICLE") return node.isPublished ? "PUBLISHED" : "HIDDEN";
  return null;
}

function resourceImage(node) {
  return node.featuredMedia?.preview?.image?.url || node.image?.url || "";
}

async function metafieldDefinitions(admin, ownerType) {
  const defsData = await gql(
    admin,
    `#graphql
    query BulkEditorMetafieldDefinitions($ownerType: MetafieldOwnerType!) {
      metafieldDefinitions(ownerType: $ownerType, first: 100) {
        nodes { namespace key name type { name } }
      }
    }`,
    { ownerType },
  );
  // Namespaces and keys are inlined as aliases below, so only safe ones are used.
  return defsData.metafieldDefinitions.nodes.filter((def) => SAFE_KEY.test(def.namespace) && SAFE_KEY.test(def.key));
}

function metafieldColumns(owner, definitions) {
  return [
    { key: TITLE_KEY, label: "Title", typeName: "single_line_text_field", control: "text", required: true, core: true },
    ...(owner.statuses ? [{ key: STATUS_KEY, label: "Status", control: "status", required: true, core: true, options: statusOptions(owner.statuses) }] : []),
    ...definitions.map((def) => ({
      key: `${def.namespace}.${def.key}`,
      label: def.name,
      typeName: def.type.name,
      control: controlForType(def.type.name),
      namespace: def.namespace,
      mfKey: def.key,
    })),
  ];
}

async function loadMetafields(admin, ownerType) {
  const owner = getOwner(ownerType);
  const definitions = await metafieldDefinitions(admin, ownerType);
  const columns = metafieldColumns(owner, definitions);

  // Ask only for the defined metafields, each as its own alias, and size pages
  // so the query stays under Shopify's cost limit.
  const aliases = definitions.map((def, i) => `mf${i}: metafield(namespace: "${def.namespace}", key: "${def.key}") { value }`).join("\n");
  const pageSize = Math.max(10, Math.min(100, Math.floor(900 / (definitions.length + 6))));
  const { root, fields } = RESOURCE_QUERIES[ownerType];

  const rows = [];
  let after = null;
  let hasNext = true;
  while (hasNext && rows.length < MAX_ROWS) {
    // Built at runtime (resource root and metafield aliases), so no #graphql tag.
    const data = await gql(
      admin,
      `query BulkEditorResources($first: Int!, $after: String) {
        ${root}(first: $first, after: $after) {
          nodes { id handle updatedAt ${fields} ${aliases} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { first: pageSize, after },
    );
    const connection = data[root];
    connection.nodes.forEach((node) => {
      const values = { [TITLE_KEY]: node.title || "" };
      const status = resourceStatus(ownerType, node);
      if (owner.statuses) values[STATUS_KEY] = status || "";
      definitions.forEach((def, i) => {
        values[`${def.namespace}.${def.key}`] = node[`mf${i}`]?.value ?? "";
      });
      rows.push({
        id: node.id,
        handle: node.handle,
        image: resourceImage(node),
        updatedAt: node.updatedAt,
        adminPath: `${owner.adminPath}/${numericId(node.id)}`,
        values,
      });
    });
    hasNext = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
  }
  return { columns, rows: rows.slice(0, MAX_ROWS), truncated: hasNext };
}

export async function loadSource(admin, source, definitions) {
  try {
    if (source.kind === "metaobject") {
      const definition = definitions.find((def) => def.type === source.id);
      if (!definition) return { error: "That metaobject type no longer exists." };
      return await loadMetaobjects(admin, definition);
    }
    return await loadMetafields(admin, source.id);
  } catch (err) {
    return { error: graphQLMessage(err) };
  }
}

// ─── Saving ──────────────────────────────────────────────────────────────────
// updates: [{ id, changes: { [columnKey]: value } }]
// Returns { success: [id], errors: [{ id, errors: [{ field, message }] }] }.

function collectErrors() {
  const map = new Map();
  return {
    add(id, message, field = "") {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ field, message });
    },
    has: (id) => map.has(id),
    list: () => [...map.entries()].map(([id, errors]) => ({ id, errors })),
  };
}

async function saveMetaobjects(admin, updates, columns) {
  const errors = collectErrors();
  const parts = [];
  const variables = {};
  const defs = [];
  updates.forEach((update, i) => {
    const input = {};
    const fields = Object.entries(update.changes)
      .filter(([key]) => !key.startsWith("__"))
      .map(([key, value]) => ({ key, value: String(value) }));
    if (fields.length) input.fields = fields;
    if (STATUS_KEY in update.changes) input.capabilities = { publishable: { status: update.changes[STATUS_KEY] } };
    defs.push(`$id${i}: ID!, $input${i}: MetaobjectUpdateInput!`);
    parts.push(`m${i}: metaobjectUpdate(id: $id${i}, metaobject: $input${i}) { metaobject { id } userErrors { field message } }`);
    variables[`id${i}`] = update.id;
    variables[`input${i}`] = input;
  });
  try {
    const data = await gql(admin, `mutation BulkEditorMetaobjectSave(${defs.join(", ")}) { ${parts.join("\n")} }`, variables);
    updates.forEach((update, i) => {
      const result = data[`m${i}`];
      if (!result?.metaobject) errors.add(update.id, "Shopify didn't accept this change.");
      result?.userErrors?.forEach((error) => errors.add(update.id, error.message, labelFor(columns, error.field?.at(-1))));
    });
  } catch (err) {
    updates.forEach((update) => errors.add(update.id, graphQLMessage(err)));
  }
  return errors;
}

function labelFor(columns, key) {
  return columns.find((column) => column.key === key || column.mfKey === key)?.label || "";
}

const CORE_MUTATIONS = {
  PRODUCT: (i, changes) => ({
    def: `$id${i}: ID!, $title${i}: String, $status${i}: ProductStatus`,
    part: `c${i}: productUpdate(product: { id: $id${i}, title: $title${i}, status: $status${i} }) { product { id } userErrors { field message } }`,
    vars: { [`title${i}`]: changes[TITLE_KEY], [`status${i}`]: changes[STATUS_KEY] },
  }),
  COLLECTION: (i, changes) => ({
    def: `$id${i}: ID!, $title${i}: String`,
    part: `c${i}: collectionUpdate(input: { id: $id${i}, title: $title${i} }) { collection { id } userErrors { field message } }`,
    vars: { [`title${i}`]: changes[TITLE_KEY] },
  }),
  PAGE: (i, changes) => ({
    def: `$id${i}: ID!, $input${i}: PageUpdateInput!`,
    part: `c${i}: pageUpdate(id: $id${i}, page: $input${i}) { page { id } userErrors { field message } }`,
    vars: { [`input${i}`]: publishInput(changes) },
  }),
  ARTICLE: (i, changes) => ({
    def: `$id${i}: ID!, $input${i}: ArticleUpdateInput!`,
    part: `c${i}: articleUpdate(id: $id${i}, article: $input${i}) { article { id } userErrors { field message } }`,
    vars: { [`input${i}`]: publishInput(changes) },
  }),
  BLOG: (i, changes) => ({
    def: `$id${i}: ID!, $input${i}: BlogUpdateInput!`,
    part: `c${i}: blogUpdate(id: $id${i}, blog: $input${i}) { blog { id } userErrors { field message } }`,
    vars: { [`input${i}`]: TITLE_KEY in changes ? { title: changes[TITLE_KEY] } : {} },
  }),
};

function publishInput(changes) {
  const input = {};
  if (TITLE_KEY in changes) input.title = changes[TITLE_KEY];
  if (STATUS_KEY in changes) input.isPublished = changes[STATUS_KEY] === "PUBLISHED";
  return input;
}

async function saveMetafields(admin, ownerType, updates, columns) {
  const errors = collectErrors();
  const byKey = new Map(columns.filter((column) => column.namespace).map((column) => [column.key, column]));
  const sets = [];
  const deletes = [];
  const core = [];

  updates.forEach((update) => {
    const coreChanges = {};
    Object.entries(update.changes).forEach(([key, value]) => {
      if (key === TITLE_KEY || key === STATUS_KEY) {
        coreChanges[key] = value;
        return;
      }
      const column = byKey.get(key);
      if (!column) return;
      const target = { ownerId: update.id, namespace: column.namespace, key: column.mfKey };
      if (String(value).trim() === "") deletes.push(target);
      else sets.push({ ...target, type: column.typeName, value: String(value) });
    });
    if (Object.keys(coreChanges).length) core.push({ id: update.id, changes: coreChanges });
  });

  for (let start = 0; start < sets.length; start += 25) {
    const batch = sets.slice(start, start + 25);
    try {
      const data = await gql(
        admin,
        `#graphql
        mutation BulkEditorMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id }
            userErrors { field message }
          }
        }`,
        { metafields: batch },
      );
      data.metafieldsSet.userErrors.forEach((error) => {
        const index = Number(error.field?.[1]);
        const item = batch[Number.isInteger(index) ? index : 0];
        errors.add(item.ownerId, error.message, labelFor(columns, item.key));
      });
    } catch (err) {
      batch.forEach((item) => errors.add(item.ownerId, graphQLMessage(err), labelFor(columns, item.key)));
    }
  }

  for (let start = 0; start < deletes.length; start += 25) {
    const batch = deletes.slice(start, start + 25);
    try {
      const data = await gql(
        admin,
        `#graphql
        mutation BulkEditorMetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            deletedMetafields { ownerId }
            userErrors { field message }
          }
        }`,
        { metafields: batch },
      );
      data.metafieldsDelete.userErrors.forEach((error) => batch.forEach((item) => errors.add(item.ownerId, error.message)));
    } catch (err) {
      batch.forEach((item) => errors.add(item.ownerId, graphQLMessage(err)));
    }
  }

  if (core.length) {
    const build = CORE_MUTATIONS[ownerType];
    const defs = [];
    const parts = [];
    const variables = {};
    core.forEach((item, i) => {
      const { def, part, vars } = build(i, item.changes);
      defs.push(def);
      parts.push(part);
      variables[`id${i}`] = item.id;
      Object.assign(variables, vars);
    });
    try {
      const data = await gql(admin, `mutation BulkEditorCoreSave(${defs.join(", ")}) { ${parts.join("\n")} }`, variables);
      core.forEach((item, i) => {
        data[`c${i}`]?.userErrors?.forEach((error) => errors.add(item.id, error.message, error.field?.at(-1) === "title" ? "Title" : ""));
      });
    } catch (err) {
      core.forEach((item) => errors.add(item.id, graphQLMessage(err)));
    }
  }
  return errors;
}

// Columns as Shopify defines them right now, for saving: field types and
// namespaces always come from Shopify, never from the browser.
export async function sourceColumns(admin, source, definitions) {
  if (source.kind === "metaobject") {
    const definition = definitions.find((def) => def.type === source.id);
    return definition ? metaobjectColumns(definition) : null;
  }
  return metafieldColumns(getOwner(source.id), await metafieldDefinitions(admin, source.id));
}

export async function saveChanges(admin, source, rawUpdates, columns) {
  const editable = new Set(columns.filter((column) => column.control !== "readonly").map((column) => column.key));
  const updates = rawUpdates
    .map((update) => ({
      id: String(update.id),
      changes: Object.fromEntries(Object.entries(update.changes || {}).filter(([key]) => editable.has(key)).map(([key, value]) => [key, String(value ?? "")])),
    }))
    .filter((update) => Object.keys(update.changes).length > 0);
  if (!updates.length) return { success: rawUpdates.map((update) => String(update.id)), errors: [] };
  const errors = source.kind === "metaobject" ? await saveMetaobjects(admin, updates, columns) : await saveMetafields(admin, source.id, updates, columns);
  return {
    success: updates.filter((update) => !errors.has(update.id)).map((update) => update.id),
    errors: errors.list(),
  };
}
