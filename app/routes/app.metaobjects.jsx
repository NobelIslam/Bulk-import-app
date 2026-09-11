import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { parseCSVRows, toCSV } from "../utils/csv";
import ProgressBar from "../components/ProgressBar";
import SummaryCard from "../components/SummaryCard";
import EditableGrid from "../components/EditableGrid";

// ─── Server ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 250;
const MAX_ENTRIES = 2000; // safety cap; UI surfaces a "truncated" notice rather than silently dropping rows
const CHUNK_SIZE = 15; // rows per save request, batched via aliased mutations
const PAGE_ROWS = 50; // grid rows per page, applied after search/filter

// The GraphQL client throws on any top-level `errors` in the response body (e.g. ACCESS_DENIED
// for a missing scope) even though the HTTP status is 200. Node's console.log truncates the
// nested error object as "[Array]", which makes these unreadable in server logs — pull out a
// flat, loggable message instead.
function describeGraphQLError(err) {
  const first = err?.graphQLErrors?.[0];
  if (first) {
    const extra = first.extensions && Object.keys(first.extensions).length
      ? ` | extensions: ${JSON.stringify(first.extensions)}`
      : "";
    return `${first.message}${extra}`;
  }
  return err?.message || "Something went wrong loading data from Shopify.";
}

const EMPTY_RESULT = { definitions: [], selectedType: "", fieldDefinitions: [], entries: [], truncated: false };

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";

  let definitions;
  try {
    const defsResponse = await admin.graphql(`#graphql
      query MetaobjectDefinitions {
        metaobjectDefinitions(first: 100) {
          nodes {
            id
            type
            name
            fieldDefinitions {
              key
              name
              required
              type { name }
            }
          }
        }
      }`);
    const { data: defsData } = await defsResponse.json();
    definitions = defsData?.metaobjectDefinitions?.nodes || [];
  } catch (err) {
    const message = describeGraphQLError(err);
    console.error("MetaobjectDefinitions query failed:", message);
    return { ...EMPTY_RESULT, selectedType: type, loadError: message };
  }

  if (!type) {
    return { ...EMPTY_RESULT, definitions };
  }

  const selectedDef = definitions.find((d) => d.type === type);
  const fieldDefinitions = selectedDef?.fieldDefinitions || [];

  let entries = [];
  let cursor = null;
  let hasNextPage = true;

  try {
    while (hasNextPage && entries.length < MAX_ENTRIES) {
      const response = await admin.graphql(
        `#graphql
        query MetaobjectEntries($type: String!, $first: Int!, $after: String) {
          metaobjects(type: $type, first: $first, after: $after) {
            nodes {
              id
              handle
              fields { key value }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { variables: { type, first: PAGE_SIZE, after: cursor } }
      );
      const { data } = await response.json();
      const connection = data?.metaobjects;
      if (!connection) break;
      entries.push(...connection.nodes);
      hasNextPage = connection.pageInfo.hasNextPage;
      cursor = connection.pageInfo.endCursor;
    }
  } catch (err) {
    const message = describeGraphQLError(err);
    console.error("MetaobjectEntries query failed:", message);
    return { definitions, selectedType: type, fieldDefinitions, entries: [], truncated: false, loadError: message };
  }

  const truncated = hasNextPage;
  if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);

  return { definitions, selectedType: type, fieldDefinitions, entries, truncated };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const updatesJson = formData.get("updates");

  if (!updatesJson) return { success: [], errors: [] };

  let updates;
  try {
    updates = JSON.parse(updatesJson);
  } catch {
    return { success: [], errors: [] };
  }
  if (!Array.isArray(updates) || updates.length === 0) return { success: [], errors: [] };

  const variableDefs = updates
    .map((_, i) => `$id${i}: ID!, $fields${i}: [MetaobjectFieldInput!]!`)
    .join(", ");
  const mutationParts = updates
    .map(
      (_, i) => `
      m${i}: metaobjectUpdate(id: $id${i}, metaobject: { fields: $fields${i} }) {
        metaobject { id handle }
        userErrors { field message code }
      }`
    )
    .join("\n");

  const variables = {};
  updates.forEach((u, i) => {
    variables[`id${i}`] = u.id;
    variables[`fields${i}`] = u.changedFields;
  });

  const results = { success: [], errors: [] };

  try {
    const response = await admin.graphql(
      `#graphql
      mutation BulkMetaobjectUpdate(${variableDefs}) {
        ${mutationParts}
      }`,
      { variables }
    );
    const { data } = await response.json();

    updates.forEach((u, i) => {
      const result = data?.[`m${i}`];
      if (result?.userErrors?.length > 0) {
        results.errors.push({ id: u.id, errors: result.userErrors });
      } else if (result?.metaobject) {
        results.success.push({ id: u.id, handle: result.metaobject.handle });
      } else {
        results.errors.push({ id: u.id, errors: [{ message: "Unknown error occurred" }] });
      }
    });
  } catch (err) {
    updates.forEach((u) => {
      results.errors.push({ id: u.id, errors: [{ message: err.message || "Request failed" }] });
    });
  }

  return results;
};

// ─── Field type → grid control mapping ─────────────────────────────────────────

function controlForType(typeName) {
  if (["single_line_text_field", "url", "color", "rating"].includes(typeName)) return "text";
  if (typeName === "multi_line_text_field") return "textarea";
  if (typeName === "number_integer" || typeName === "number_decimal") return "number";
  if (typeName === "boolean") return "boolean";
  if (typeName === "date") return "date";
  if (typeName === "date_time") return "text"; // RFC3339 string — plain text avoids datetime-local's lossy format
  return "readonly"; // money, json, list.*, *_reference, rich_text_field, etc.
}

function buildRows(entries, fieldDefinitions) {
  return entries.map((entry) => {
    const values = {};
    fieldDefinitions.forEach((fd) => {
      values[fd.key] = entry.fields.find((f) => f.key === fd.key)?.value ?? "";
    });
    return { id: entry.id, handle: entry.handle, values };
  });
}

function buildOriginalValues(entries, fieldDefinitions) {
  const orig = {};
  entries.forEach((entry) => {
    fieldDefinitions.forEach((fd) => {
      orig[`${entry.id}::${fd.key}`] = entry.fields.find((f) => f.key === fd.key)?.value ?? "";
    });
  });
  return orig;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MetaobjectEditor() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const importFileRef = useRef(null);

  const columns = useMemo(
    () =>
      loaderData.fieldDefinitions.map((fd) => ({
        key: fd.key,
        label: fd.name,
        control: controlForType(fd.type.name),
        required: fd.required,
      })),
    [loaderData.fieldDefinitions]
  );

  // Local editable copy of the loaded entries — resets whenever the selected type changes.
  const [datasetKey, setDatasetKey] = useState(loaderData.selectedType);
  const [rows, setRows] = useState(() => buildRows(loaderData.entries, loaderData.fieldDefinitions));
  const [dirty, setDirty] = useState({}); // "rowId::fieldKey" -> pending value
  const originalValuesRef = useRef(buildOriginalValues(loaderData.entries, loaderData.fieldDefinitions));

  // Search / column filters / pagination — all client-side over the already-loaded rows.
  const [searchTerm, setSearchTerm] = useState("");
  const [columnFilters, setColumnFilters] = useState({}); // { [fieldKey]: Set<string> } — present only when actively narrowed
  const [page, setPage] = useState(1);

  if (datasetKey !== loaderData.selectedType) {
    setDatasetKey(loaderData.selectedType);
    setRows(buildRows(loaderData.entries, loaderData.fieldDefinitions));
    setDirty({});
    originalValuesRef.current = buildOriginalValues(loaderData.entries, loaderData.fieldDefinitions);
    setSearchTerm("");
    setColumnFilters({});
    setPage(1);
  }

  const dirtyKeys = useMemo(() => new Set(Object.keys(dirty)), [dirty]);
  const dirtyRowCount = useMemo(
    () => new Set(Object.keys(dirty).map((k) => k.split("::")[0])).size,
    [dirty]
  );

  const columnsWithFilters = useMemo(
    () =>
      columns.map((col) => {
        const set = new Set(rows.map((r) => r.values[col.key] ?? ""));
        return { ...col, distinctValues: [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) };
      }),
    [columns, rows]
  );

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      for (const [key, allowed] of Object.entries(columnFilters)) {
        if (!allowed.has(row.values[key] ?? "")) return false;
      }
      if (!term) return true;
      if (row.handle.toLowerCase().includes(term)) return true;
      return columns.some((c) => (row.values[c.key] ?? "").toLowerCase().includes(term));
    });
  }, [rows, searchTerm, columnFilters, columns]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_ROWS));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_ROWS, currentPage * PAGE_ROWS);

  // Sequential save queue — chunks of changed rows, driven by fetcher idle transitions.
  const queueRef = useRef([]);
  const indexRef = useRef(0);
  const resultsRef = useRef({ success: [], errors: [] });
  const cancelRef = useRef(false);
  const activeRef = useRef(false);
  const prevFetcherStateRef = useRef("idle");
  const totalRowsRef = useRef(0);

  const [saveState, setSaveState] = useState(null);
  const isSaving = saveState?.phase === "saving";
  const isDone = saveState?.phase === "done";
  const showGrid = !isSaving && !isDone;

  useEffect(() => {
    const prev = prevFetcherStateRef.current;
    prevFetcherStateRef.current = fetcher.state;

    if (!(prev !== "idle" && fetcher.state === "idle")) return;
    if (!activeRef.current || !fetcher.data) return;

    const { success = [], errors = [] } = fetcher.data;
    const completedIdx = indexRef.current;
    const completedChunk = queueRef.current[completedIdx] || [];

    resultsRef.current.success.push(...success);
    resultsRef.current.errors.push(...errors);

    success.forEach(({ id }) => {
      const row = completedChunk.find((r) => r.id === id);
      row?.changedFields.forEach(({ key, value }) => {
        originalValuesRef.current[`${id}::${key}`] = value;
      });
    });

    setDirty((prevDirty) => {
      const next = { ...prevDirty };
      success.forEach(({ id }) => {
        const row = completedChunk.find((r) => r.id === id);
        row?.changedFields.forEach(({ key }) => {
          delete next[`${id}::${key}`];
        });
      });
      return next;
    });

    const nextIdx = completedIdx + 1;
    const totalChunks = queueRef.current.length;
    const cancelled = cancelRef.current;
    const done = nextIdx >= totalChunks || cancelled;
    const rowsDone = queueRef.current.slice(0, completedIdx + 1).reduce((sum, c) => sum + c.length, 0);

    if (done) {
      activeRef.current = false;
      const { success: allSuccess, errors: allErrors } = resultsRef.current;
      setSaveState({
        phase: "done",
        total: totalRowsRef.current,
        success: [...allSuccess],
        errors: [...allErrors],
        cancelled,
      });
      if (allSuccess.length > 0) {
        shopify.toast.show(`Saved ${allSuccess.length} change${allSuccess.length !== 1 ? "s" : ""}`);
      }
      return;
    }

    indexRef.current = nextIdx;
    setSaveState((prevState) => ({
      ...prevState,
      current: rowsDone,
      success: [...resultsRef.current.success],
      errors: [...resultsRef.current.errors],
    }));

    fetcher.submit(
      { updates: JSON.stringify(queueRef.current[nextIdx].map((r) => ({ id: r.id, changedFields: r.changedFields }))) },
      { method: "POST" }
    );
  }, [fetcher.state, fetcher.data, shopify]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTypeChange = useCallback(
    (e) => {
      const val = e.target.value;
      navigate(val ? `/app/metaobjects?type=${encodeURIComponent(val)}` : "/app/metaobjects");
    },
    [navigate]
  );

  const handleCellChange = useCallback((rowId, key, value) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, values: { ...r.values, [key]: value } } : r)));
    setDirty((prev) => {
      const dirtyKey = `${rowId}::${key}`;
      if (originalValuesRef.current[dirtyKey] === value) {
        if (!(dirtyKey in prev)) return prev;
        const next = { ...prev };
        delete next[dirtyKey];
        return next;
      }
      return { ...prev, [dirtyKey]: value };
    });
  }, []);

  const handleSave = useCallback(() => {
    if (isSaving) return;
    const dirtyRowIds = [...new Set(Object.keys(dirty).map((k) => k.split("::")[0]))];
    if (!dirtyRowIds.length) return;

    const changedRows = dirtyRowIds.map((id) => ({
      id,
      changedFields: Object.entries(dirty)
        .filter(([k]) => k.split("::")[0] === id)
        .map(([k, v]) => ({ key: k.split("::")[1], value: v })),
    }));

    const chunks = chunkArray(changedRows, CHUNK_SIZE);
    queueRef.current = chunks;
    indexRef.current = 0;
    resultsRef.current = { success: [], errors: [] };
    cancelRef.current = false;
    activeRef.current = true;
    totalRowsRef.current = changedRows.length;

    setSaveState({ phase: "saving", current: 0, total: changedRows.length, success: [], errors: [] });

    fetcher.submit(
      { updates: JSON.stringify(chunks[0].map((r) => ({ id: r.id, changedFields: r.changedFields }))) },
      { method: "POST" }
    );
  }, [dirty, isSaving, fetcher]);

  const handleCancelSave = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const handleContinueEditing = useCallback(() => setSaveState(null), []);

  const handleDiscard = useCallback(() => {
    setRows(buildRows(loaderData.entries, loaderData.fieldDefinitions));
    setDirty({});
  }, [loaderData.entries, loaderData.fieldDefinitions]);

  const handleSearchChange = useCallback((value) => {
    setSearchTerm(value);
    setPage(1);
  }, []);

  const handleToggleFilterValue = useCallback(
    (key, value) => {
      setColumnFilters((prev) => {
        const distinctValues = columnsWithFilters.find((c) => c.key === key)?.distinctValues || [];
        const current = new Set(prev[key] ? [...prev[key]] : distinctValues);
        if (current.has(value)) current.delete(value);
        else current.add(value);

        const next = { ...prev };
        if (current.size >= distinctValues.length) delete next[key];
        else next[key] = current;
        return next;
      });
      setPage(1);
    },
    [columnsWithFilters]
  );

  const handleSelectAllFilter = useCallback((key) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPage(1);
  }, []);

  const handleClearAllFilter = useCallback((key) => {
    setColumnFilters((prev) => ({ ...prev, [key]: new Set() }));
    setPage(1);
  }, []);

  const handlePageChange = useCallback(
    (next) => setPage(Math.min(Math.max(1, next), pageCount)),
    [pageCount]
  );

  const handleExportCSV = useCallback(() => {
    const header = ["Handle", ...columns.map((c) => c.label)];
    const data = filteredRows.map((r) => [r.handle, ...columns.map((c) => r.values[c.key] ?? "")]);
    const csv = toCSV(header, data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${loaderData.selectedType || "metaobjects"}-export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [columns, filteredRows, loaderData.selectedType]);

  const handleImportFile = useCallback(
    (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvRows = parseCSVRows(String(e.target.result));
        if (csvRows.length < 2) {
          shopify.toast.show("No rows found in that CSV.", { isError: true });
          return;
        }
        const headers = csvRows[0].map((h) => h.trim().toLowerCase());
        const handleIdx = headers.indexOf("handle");
        if (handleIdx === -1) {
          shopify.toast.show('CSV must include a "Handle" column.', { isError: true });
          return;
        }
        const colByHeader = new Map(columns.map((c) => [c.label.trim().toLowerCase(), c]));

        let staged = 0;
        let unmatched = 0;
        csvRows.slice(1).forEach((cells) => {
          const handle = (cells[handleIdx] || "").trim();
          const row = rows.find((r) => r.handle === handle);
          if (!row) {
            unmatched++;
            return;
          }
          headers.forEach((h, i) => {
            if (i === handleIdx) return;
            const col = colByHeader.get(h);
            if (!col || col.control === "readonly") return;
            const newValue = (cells[i] || "").trim();
            if (newValue !== (row.values[col.key] ?? "")) {
              handleCellChange(row.id, col.key, newValue);
              staged++;
            }
          });
        });

        shopify.toast.show(
          `Staged ${staged} change${staged !== 1 ? "s" : ""} for review${unmatched ? ` (${unmatched} row${unmatched !== 1 ? "s" : ""} not matched)` : ""}.`
        );
      };
      reader.readAsText(file);
    },
    [columns, rows, handleCellChange, shopify]
  );

  const progressPercent = saveState?.total ? Math.round((saveState.current / saveState.total) * 100) : 0;
  const handleFor = (id) => rows.find((r) => r.id === id)?.handle || id;
  const selectedDefinition = loaderData.definitions.find((d) => d.type === loaderData.selectedType);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <s-page heading="Metaobject Editor" inlineSize="large">
      {dirtyRowCount > 0 && showGrid && (
        <s-button slot="primary-action" onClick={handleSave}>
          Save {dirtyRowCount} change{dirtyRowCount !== 1 ? "s" : ""}
        </s-button>
      )}

      {/* ── Load error ────────────────────────────────────────────────────── */}
      {loaderData.loadError && (
        <s-section heading="Couldn't load data from Shopify">
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-start",
              padding: "12px 16px",
              borderRadius: "8px",
              background: "#fff4f4",
              border: "1px solid #ffd2d2",
            }}
          >
            <span style={{ fontSize: "16px", lineHeight: 1, flexShrink: 0 }}>⚠</span>
            <s-text>{loaderData.loadError}</s-text>
          </div>
        </s-section>
      )}

      {/* ── Saving progress ───────────────────────────────────────────────── */}
      {isSaving && (
        <s-section heading="Saving changes…">
          <s-stack direction="block" gap="base">
            <div style={{ background: "#f6f6f7", border: "1px solid #e1e3e5", borderRadius: "10px", padding: "24px" }}>
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <s-text>
                    <strong>{saveState.current}</strong> of <strong>{saveState.total}</strong> rows
                  </s-text>
                  <s-text emphasis="bold">{progressPercent}%</s-text>
                </div>
                <ProgressBar percent={progressPercent} />
                <div style={{ display: "flex", gap: "20px", marginTop: "4px" }}>
                  <span style={{ fontSize: "13px", color: "#155724" }}>✓ {saveState.success.length} saved</span>
                  <span style={{ fontSize: "13px", color: saveState.errors.length > 0 ? "#d72c0d" : "#8c9196" }}>
                    ✗ {saveState.errors.length} failed
                  </span>
                </div>
              </s-stack>
            </div>
            <s-button variant="tertiary" onClick={handleCancelSave}>
              Cancel
            </s-button>
          </s-stack>
        </s-section>
      )}

      {/* ── Save results ──────────────────────────────────────────────────── */}
      {isDone && (
        <s-section heading={saveState.cancelled ? "Save cancelled" : "Save complete"}>
          <s-stack direction="block" gap="base">
            <div style={{ display: "flex", gap: "12px" }}>
              <SummaryCard value={saveState.success.length} label="Saved" color={saveState.success.length > 0 ? "green" : "grey"} />
              {saveState.errors.length > 0 && <SummaryCard value={saveState.errors.length} label="Failed" color="red" />}
            </div>
            {saveState.errors.length > 0 && (
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="tight">
                  <s-text emphasis="bold">Failed rows</s-text>
                  {saveState.errors.map((err, i) => (
                    <s-paragraph key={i}>
                      <s-text emphasis="bold">{handleFor(err.id)}</s-text>: {err.errors.map((e) => e.message).join(", ")}
                    </s-paragraph>
                  ))}
                </s-stack>
              </s-box>
            )}
            <s-button variant="tertiary" onClick={handleContinueEditing}>
              Continue editing
            </s-button>
          </s-stack>
        </s-section>
      )}

      {/* ── Type selector ─────────────────────────────────────────────────── */}
      {showGrid && (
        <s-section heading="Step 1 — Choose what to edit">
          <s-stack direction="block" gap="base">
            <select
              value={loaderData.selectedType}
              onChange={handleTypeChange}
              disabled={isSaving}
              style={{ padding: "8px 12px", fontSize: "14px", borderRadius: "6px", border: "1px solid #c9cccf", maxWidth: "360px" }}
            >
              <option value="">Select a metaobject type…</option>
              {loaderData.definitions.map((d) => (
                <option key={d.type} value={d.type}>
                  {d.name} ({d.type})
                </option>
              ))}
            </select>
            {loaderData.definitions.length === 0 && (
              <s-text>
                No metaobject definitions found in this store yet. Create one in Shopify Admin under Settings → Custom data.
              </s-text>
            )}
          </s-stack>
        </s-section>
      )}

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      {showGrid && loaderData.selectedType && (
        <s-section
          heading={`Step 2 — Edit ${selectedDefinition?.name || loaderData.selectedType} (${rows.length}${loaderData.truncated ? "+" : ""} entries)`}
        >
          <s-stack direction="block" gap="base">
            {loaderData.truncated && (
              <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#fff3cd", border: "1px solid #ffe083", fontSize: "13px", color: "#856404" }}>
                Showing the first {rows.length} entries — this type has more than the {MAX_ENTRIES}-entry limit for this page.
              </div>
            )}

            {rows.length === 0 ? (
              <s-text>This metaobject type has no entries yet.</s-text>
            ) : (
              <>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search handle or any field value…"
                  style={{ padding: "8px 12px", fontSize: "14px", borderRadius: "6px", border: "1px solid #c9cccf", maxWidth: "360px" }}
                />

                <s-stack direction="inline" gap="base">
                  <s-button onClick={handleExportCSV}>Export CSV ({filteredRows.length})</s-button>
                  <s-button onClick={() => importFileRef.current?.click()}>Import CSV</s-button>
                  {dirtyRowCount > 0 && (
                    <s-button variant="tertiary" onClick={handleDiscard}>
                      Discard changes
                    </s-button>
                  )}
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      handleImportFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </s-stack>

                {filteredRows.length === 0 ? (
                  <s-text>No rows match your search/filters.</s-text>
                ) : (
                  <>
                    <EditableGrid
                      columns={columnsWithFilters}
                      rows={pageRows}
                      dirtyKeys={dirtyKeys}
                      onCellChange={handleCellChange}
                      columnFilters={columnFilters}
                      onToggleFilterValue={handleToggleFilterValue}
                      onSelectAllFilter={handleSelectAllFilter}
                      onClearAllFilter={handleClearAllFilter}
                    />

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <s-text>
                        Showing {(currentPage - 1) * PAGE_ROWS + 1}–{Math.min(currentPage * PAGE_ROWS, filteredRows.length)} of {filteredRows.length}
                      </s-text>
                      <s-stack direction="inline" gap="tight">
                        <s-button variant="tertiary" disabled={currentPage <= 1} onClick={() => handlePageChange(currentPage - 1)}>
                          Previous
                        </s-button>
                        <s-text>
                          Page {currentPage} of {pageCount}
                        </s-text>
                        <s-button variant="tertiary" disabled={currentPage >= pageCount} onClick={() => handlePageChange(currentPage + 1)}>
                          Next
                        </s-button>
                      </s-stack>
                    </div>
                  </>
                )}
              </>
            )}
          </s-stack>
        </s-section>
      )}

      {/* ── Aside ─────────────────────────────────────────────────────────── */}
      <s-section heading="Tips">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Click a cell to edit it. Paste a block of cells copied from Excel or Google Sheets directly into the grid to fill many rows at once.
          </s-paragraph>
          <s-paragraph>
            Changed cells are highlighted until you save. Fields with structured data (money, lists, references) are read-only in this version.
          </s-paragraph>
          <s-paragraph>
            Prefer working offline? Use <s-text emphasis="bold">Export CSV</s-text>, edit in Excel, then <s-text emphasis="bold">Import CSV</s-text> to stage the changes here for review before saving.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
