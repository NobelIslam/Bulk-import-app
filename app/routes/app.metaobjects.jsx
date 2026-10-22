import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useFetcher, useLoaderData, useNavigate, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  ChoiceList,
  InlineStack,
  Modal,
  Page,
  Pagination,
  Popover,
  ProgressBar,
  Select,
  Tag,
  Text,
  TextField,
} from "@shopify/polaris";
import {
  EditIcon,
  ExportIcon,
  FileIcon,
  FilterIcon,
  ImportIcon,
  LayoutColumns3Icon,
  LightbulbIcon,
  LockIcon,
  QuestionCircleIcon,
  SaveIcon,
  SearchIcon,
  UploadIcon,
} from "@shopify/polaris-icons";
import "@shopify/polaris/build/esm/styles.css";
import "../components/bulk/bulk.css";
import { authenticate } from "../shopify.server";
import { logActivity } from "../activity.server";
import { listSources, loadSource, saveChanges, sourceColumns } from "../bulk/sources.server";
import { coerceValue, parseSource, rowErrors, STATUS_LABELS, validateValue } from "../bulk/fields";
import { STATUS_KEY } from "../bulk/keys";
import { parseCSVRows, toCSV } from "../utils/csv";
import BulkTable from "../components/bulk/BulkTable";
import EntryPanel from "../components/bulk/EntryPanel";

const PAGE_ROWS = 50;
const SAVE_CHUNK = 15;

// ─── Server ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  // `type` is the older address format (metaobject type only).
  const legacyType = url.searchParams.get("type");
  const sourceValue = url.searchParams.get("source") || (legacyType ? `metaobject:${legacyType}` : "");
  const empty = { sources: [], sourceValue, columns: [], rows: [], truncated: false, loadError: null };

  let listing;
  try {
    listing = await listSources(admin);
  } catch (error) {
    return { ...empty, loadError: error.message || "Couldn't load your metaobject definitions." };
  }
  const source = parseSource(sourceValue);
  if (!source) return { ...empty, sources: listing.sources, sourceValue: "" };

  const result = await loadSource(admin, source, listing.definitions);
  if (result.error) return { ...empty, sources: listing.sources, loadError: result.error };
  return { sources: listing.sources, sourceValue, columns: result.columns, rows: result.rows, truncated: result.truncated, loadError: null };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const source = parseSource(formData.get("source"));
  let updates = [];
  try {
    updates = JSON.parse(String(formData.get("updates") || "[]"));
  } catch {
    updates = [];
  }
  if (!source || !Array.isArray(updates) || !updates.length) return { success: [], errors: [] };
  try {
    const listing = await listSources(admin);
    const columns = await sourceColumns(admin, source, listing.definitions);
    if (!columns) return { success: [], errors: updates.map((u) => ({ id: u.id, errors: [{ message: "This metaobject type no longer exists." }] })) };
    const result = await saveChanges(admin, source, updates, columns);
    const label = listing.sources.find((entry) => entry.value === formData.get("source"))?.label || "";
    await logActivity(session.shop, "bulk_saved", { label: `${source.kind}:${label}`, count: result.success.length });
    return result;
  } catch (error) {
    return { success: [], errors: updates.map((u) => ({ id: u.id, errors: [{ message: error.message || "Request failed." }] })) };
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const cellKey = (id, key) => `${id}::${key}`;
const splitKey = (key) => {
  const at = key.indexOf("::");
  return [key.slice(0, at), key.slice(at + 2)];
};

function readHidden(source) {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(`bk-hidden:${source}`) || "[]"));
  } catch {
    return new Set();
  }
}

function writeHidden(source, hidden) {
  try {
    window.localStorage.setItem(`bk-hidden:${source}`, JSON.stringify([...hidden]));
  } catch {
    /* storage unavailable: the choice just isn't remembered */
  }
}

const FILTER_CONDITIONS = [
  { label: "contains", value: "contains" },
  { label: "is", value: "is" },
  { label: "is empty", value: "empty" },
  { label: "is not empty", value: "notEmpty" },
];

function matchesFieldFilter(row, filter) {
  const value = String(row.values[filter.key] ?? "").toLowerCase();
  const target = filter.value.trim().toLowerCase();
  if (filter.condition === "empty") return value.trim() === "";
  if (filter.condition === "notEmpty") return value.trim() !== "";
  if (filter.condition === "is") return value === target;
  return value.includes(target);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BulkEditor() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const importRef = useRef(null);

  const { columns, sourceValue } = data;
  const sourceLabel = data.sources.find((source) => source.value === sourceValue)?.label || "";
  const isMetafields = sourceValue.startsWith("metafields:");

  // Editable copy of the loaded rows; reset when the source changes.
  const [loadedSource, setLoadedSource] = useState(sourceValue);
  const [rows, setRows] = useState(data.rows);
  const [dirty, setDirty] = useState({});
  const originalRef = useRef(new Map(data.rows.map((row) => [row.id, { ...row.values }])));

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fieldFilter, setFieldFilter] = useState(null);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [onlyInvalid, setOnlyInvalid] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [saveState, setSaveState] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (loadedSource !== sourceValue) {
    setLoadedSource(sourceValue);
    setRows(data.rows);
    setDirty({});
    originalRef.current = new Map(data.rows.map((row) => [row.id, { ...row.values }]));
    setSearch("");
    setStatusFilter("");
    setFieldFilter(null);
    setOnlyChanged(false);
    setOnlyInvalid(false);
    setPage(1);
    setSelectedIds(new Set());
    setActiveId(null);
    setSaveState(null);
  }

  useEffect(() => {
    setHidden(readHidden(sourceValue));
  }, [sourceValue]);

  // ─── Derived state ───────────────────────────────────────────────────────

  const dirtyKeys = useMemo(() => new Set(Object.keys(dirty)), [dirty]);
  const dirtyRowIds = useMemo(() => new Set(Object.keys(dirty).map((key) => splitKey(key)[0])), [dirty]);
  const columnByKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);

  // Only edited cells are validated: existing data is never blocked.
  const invalidKeys = useMemo(() => {
    const set = new Set();
    Object.entries(dirty).forEach(([key, value]) => {
      const column = columnByKey.get(splitKey(key)[1]);
      if (!column) return;
      const message =
        column.control === "status" ? (column.options.some((option) => option.value === value) ? "" : "Choose a status.") : validateValue(column, value);
      if (message) set.add(key);
    });
    return set;
  }, [dirty, columnByKey]);
  const invalidRowIds = useMemo(() => new Set([...invalidKeys].map((key) => splitKey(key)[0])), [invalidKeys]);

  const statusColumn = columnByKey.get(STATUS_KEY);
  const readOnlyCount = columns.filter((column) => column.control === "readonly").length;
  const editableColumns = columns.filter((column) => column.control !== "readonly");
  const visibleColumns = columns.filter((column) => !hidden.has(column.key));

  const deferredSearch = useDeferredValue(search);
  const filteredRows = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.values[STATUS_KEY] !== statusFilter) return false;
      if (onlyChanged && !dirtyRowIds.has(row.id)) return false;
      if (onlyInvalid && !invalidRowIds.has(row.id)) return false;
      if (fieldFilter && !matchesFieldFilter(row, fieldFilter)) return false;
      if (!term) return true;
      if (row.handle.toLowerCase().includes(term)) return true;
      return Object.values(row.values).some((value) => String(value).toLowerCase().includes(term));
    });
  }, [rows, deferredSearch, statusFilter, onlyChanged, onlyInvalid, fieldFilter, dirtyRowIds, invalidRowIds]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_ROWS));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_ROWS, currentPage * PAGE_ROWS);
  const activeRow = activeId ? rows.find((row) => row.id === activeId) : null;
  const activeErrors = useMemo(() => {
    if (!activeRow) return [];
    // Unchanged existing values only count when they break a rule the row needs to save.
    return rowErrors(activeRow, columns).filter((error) => dirtyKeys.has(cellKey(activeRow.id, error.key)) || error.message === "This field is required.");
  }, [activeRow, columns, dirtyKeys]);

  // ─── Editing ─────────────────────────────────────────────────────────────

  const handleCellChange = useCallback((id, key, value) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, values: { ...row.values, [key]: value } } : row)));
    setDirty((prev) => {
      const k = cellKey(id, key);
      const original = originalRef.current.get(id)?.[key] ?? "";
      if (original === value) {
        if (!(k in prev)) return prev;
        const next = { ...prev };
        delete next[k];
        return next;
      }
      return { ...prev, [k]: value };
    });
  }, []);

  const revertRows = useCallback((ids) => {
    setRows((prev) => prev.map((row) => (ids.has(row.id) ? { ...row, values: { ...originalRef.current.get(row.id) } } : row)));
    setDirty((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !ids.has(splitKey(key)[0]))));
  }, []);

  const discardAll = () => {
    setRows((prev) => prev.map((row) => ({ ...row, values: { ...originalRef.current.get(row.id) } })));
    setDirty({});
    setConfirmDiscard(false);
    shopify.toast.show("Changes discarded");
  };

  // ─── Bulk set ────────────────────────────────────────────────────────────

  const [bulkKey, setBulkKey] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const bulkColumn = columnByKey.get(bulkKey);
  const applyBulk = () => {
    if (!bulkColumn || !selectedIds.size) return;
    const value = coerceValue(bulkColumn, bulkValue);
    selectedIds.forEach((id) => handleCellChange(id, bulkColumn.key, value));
    shopify.toast.show(`Set ${bulkColumn.label} on ${selectedIds.size} row${selectedIds.size === 1 ? "" : "s"}. Review, then save.`);
  };

  // ─── Saving (chunked, sequential) ───────────────────────────────────────

  const queueRef = useRef([]);
  const indexRef = useRef(0);
  const resultsRef = useRef({ success: [], errors: [] });
  const cancelRef = useRef(false);
  const prevStateRef = useRef("idle");
  const isSaving = saveState?.phase === "saving";

  const submitChunk = useCallback(
    (chunk) => fetcher.submit({ source: sourceValue, updates: JSON.stringify(chunk) }, { method: "post" }),
    [fetcher, sourceValue],
  );

  const handleSave = () => {
    if (isSaving || !dirtyRowIds.size) return;
    if (invalidRowIds.size) {
      const first = rows.find((row) => invalidRowIds.has(row.id));
      if (first) setActiveId(first.id);
      shopify.toast.show(`Fix ${invalidKeys.size} invalid value${invalidKeys.size === 1 ? "" : "s"} before saving.`, { isError: true });
      return;
    }
    const updates = [...dirtyRowIds].map((id) => ({
      id,
      changes: Object.fromEntries(Object.entries(dirty).filter(([key]) => splitKey(key)[0] === id).map(([key, value]) => [splitKey(key)[1], value])),
    }));
    const chunks = [];
    for (let i = 0; i < updates.length; i += SAVE_CHUNK) chunks.push(updates.slice(i, i + SAVE_CHUNK));
    queueRef.current = chunks;
    indexRef.current = 0;
    resultsRef.current = { success: [], errors: [] };
    cancelRef.current = false;
    setSaveState({ phase: "saving", done: 0, total: updates.length });
    submitChunk(chunks[0]);
  };

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = fetcher.state;
    if (prev === "idle" || fetcher.state !== "idle" || !fetcher.data || !isSaving) return;

    const chunk = queueRef.current[indexRef.current] || [];
    const { success = [], errors = [] } = fetcher.data;
    resultsRef.current.success.push(...success);
    resultsRef.current.errors.push(...errors);

    const saved = new Set(success);
    if (saved.size) {
      const now = new Date().toISOString();
      chunk.forEach((update) => {
        if (!saved.has(update.id)) return;
        originalRef.current.set(update.id, { ...originalRef.current.get(update.id), ...update.changes });
      });
      setDirty((prevDirty) => Object.fromEntries(Object.entries(prevDirty).filter(([key]) => !saved.has(splitKey(key)[0]))));
      setRows((prevRows) => prevRows.map((row) => (saved.has(row.id) ? { ...row, updatedAt: now } : row)));
    }

    const next = indexRef.current + 1;
    const done = next >= queueRef.current.length || cancelRef.current;
    const processed = queueRef.current.slice(0, next).reduce((sum, c) => sum + c.length, 0);
    if (done) {
      const { success: allSuccess, errors: allErrors } = resultsRef.current;
      setSaveState({ phase: "done", total: processed, success: allSuccess.length, errors: allErrors, cancelled: cancelRef.current });
      if (allSuccess.length) shopify.toast.show(`Saved ${allSuccess.length} entr${allSuccess.length === 1 ? "y" : "ies"}`);
      return;
    }
    indexRef.current = next;
    setSaveState((state) => ({ ...state, done: processed }));
    submitChunk(queueRef.current[next]);
  }, [fetcher.state, fetcher.data, isSaving, shopify, submitChunk]);

  // ─── Leaving with unsaved changes ────────────────────────────────────────

  const hasChanges = dirtyRowIds.size > 0;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (!hasChanges) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // ─── CSV ─────────────────────────────────────────────────────────────────

  const exportCsv = () => {
    const header = ["Handle", ...columns.map((column) => column.label)];
    const body = filteredRows.map((row) => [
      row.handle,
      ...columns.map((column) => (column.key === STATUS_KEY ? STATUS_LABELS[row.values[column.key]] || row.values[column.key] : row.values[column.key] ?? "")),
    ]);
    const blob = new Blob([toCSV(header, body)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(sourceLabel || "entries").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const importCsv = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const csvRows = parseCSVRows(String(event.target.result));
      if (csvRows.length < 2) {
        shopify.toast.show("No rows found in that CSV.", { isError: true });
        return;
      }
      const headers = csvRows[0].map((h) => h.trim().toLowerCase());
      const handleIndex = headers.indexOf("handle");
      if (handleIndex === -1) {
        shopify.toast.show('The CSV needs a "Handle" column.', { isError: true });
        return;
      }
      const byHeader = new Map();
      columns.forEach((column) => {
        byHeader.set(column.label.trim().toLowerCase(), column);
        byHeader.set(column.key.toLowerCase(), column);
      });
      const byHandle = new Map(rows.map((row) => [row.handle, row]));
      let staged = 0;
      let unmatched = 0;
      csvRows.slice(1).forEach((cells) => {
        const row = byHandle.get((cells[handleIndex] || "").trim());
        if (!row) {
          if (cells.some((cell) => cell.trim())) unmatched += 1;
          return;
        }
        headers.forEach((header, i) => {
          const column = byHeader.get(header);
          if (i === handleIndex || !column || column.control === "readonly") return;
          const value = coerceValue(column, (cells[i] ?? "").trim());
          if (value !== (row.values[column.key] ?? "")) {
            handleCellChange(row.id, column.key, value);
            staged += 1;
          }
        });
      });
      shopify.toast.show(`Staged ${staged} change${staged === 1 ? "" : "s"} for review${unmatched ? ` · ${unmatched} row${unmatched === 1 ? "" : "s"} not matched` : ""}.`);
    };
    reader.readAsText(file);
  };

  const openInAdmin = (row) => window.open(`shopify://admin/${row.adminPath}`, "_top");

  // ─── Render ──────────────────────────────────────────────────────────────

  const sourceOptions = [
    { label: "Choose what to edit…", value: "" },
    ...["Metaobjects", "Metafields"]
      .map((group) => ({ title: group, options: data.sources.filter((s) => s.group === group).map((s) => ({ label: s.label, value: s.value })) }))
      .filter((group) => group.options.length),
  ];

  const resetPage = (fn) => (...args) => {
    fn(...args);
    setPage(1);
  };

  const filterTags = [];
  if (fieldFilter) {
    const column = columnByKey.get(fieldFilter.key);
    const condition = FILTER_CONDITIONS.find((c) => c.value === fieldFilter.condition)?.label;
    const needsValue = fieldFilter.condition === "contains" || fieldFilter.condition === "is";
    filterTags.push({ key: "field", label: `${column?.label} ${condition}${needsValue ? ` “${fieldFilter.value}”` : ""}`, clear: () => setFieldFilter(null) });
  }
  if (onlyChanged) filterTags.push({ key: "changed", label: "Unsaved changes", clear: () => setOnlyChanged(false) });
  if (onlyInvalid) filterTags.push({ key: "invalid", label: "Validation issues", clear: () => setOnlyInvalid(false) });

  return (
    <Page
      fullWidth
      title="Metaobject & Metafields Editor"
      subtitle="Bulk edit your store's metaobjects and metafields. Make changes directly in the table or import/export via CSV."
      primaryAction={{
        content: "Save changes",
        icon: SaveIcon,
        disabled: !hasChanges || isSaving,
        loading: isSaving,
        onAction: handleSave,
      }}
      secondaryActions={[
        { content: "Import CSV", icon: ImportIcon, disabled: !sourceValue || isSaving, onAction: () => importRef.current?.click() },
        { content: "Export CSV", icon: ExportIcon, disabled: !rows.length, onAction: exportCsv },
        { content: "Discard", disabled: !hasChanges || isSaving, onAction: () => setConfirmDiscard(true) },
      ]}
    >
      <input
        ref={importRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => {
          importCsv(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <div className={`bk-layout${activeRow ? " bk-layout--panel" : ""}`}>
        <div className="bk-main">
          {data.loadError && (
            <Banner tone="critical" title="Couldn't load data from Shopify">
              <p>{data.loadError}</p>
            </Banner>
          )}

          {saveState?.phase === "saving" && (
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingSm">{`Saving changes… ${saveState.done} of ${saveState.total}`}</Text>
                  <Button variant="plain" onClick={() => (cancelRef.current = true)}>
                    Stop after this batch
                  </Button>
                </InlineStack>
                <ProgressBar progress={saveState.total ? (saveState.done / saveState.total) * 100 : 0} size="small" />
              </BlockStack>
            </Card>
          )}

          {saveState?.phase === "done" && (
            <Banner
              tone={saveState.errors.length ? "warning" : "success"}
              title={
                saveState.errors.length
                  ? `Saved ${saveState.success} of ${saveState.total} entries${saveState.cancelled ? " (stopped)" : ""}`
                  : `Saved ${saveState.success} entr${saveState.success === 1 ? "y" : "ies"}`
              }
              onDismiss={() => setSaveState(null)}
            >
              {saveState.errors.length > 0 && (
                <BlockStack gap="100">
                  <p>These entries weren&apos;t saved. Their changes are still highlighted, so you can fix them and save again:</p>
                  {saveState.errors.slice(0, 10).map((error) => {
                    const row = rows.find((r) => r.id === error.id);
                    return (
                      <InlineStack key={error.id} gap="200" blockAlign="center">
                        <Button variant="plain" onClick={() => setActiveId(error.id)}>
                          {row?.handle || error.id}
                        </Button>
                        <Text as="span" tone="subdued">
                          {error.errors.map((e) => `${e.field ? `${e.field}: ` : ""}${e.message}`).join(" · ")}
                        </Text>
                      </InlineStack>
                    );
                  })}
                </BlockStack>
              )}
            </Banner>
          )}

          <Card>
            <div className="bk-filters">
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  1. Choose what to edit
                </Text>
                <Select
                  label="Metaobject type or resource"
                  labelHidden
                  options={sourceOptions}
                  value={sourceValue}
                  onChange={(value) => navigate(value ? `/app/metaobjects?source=${encodeURIComponent(value)}` : "/app/metaobjects")}
                />
                <Text as="p" variant="bodySm" tone="subdued">
                  {isMetafields ? `Edit the metafields of your ${sourceLabel.toLowerCase()}.` : "Pick a metaobject type, or a resource to edit its metafields."}
                </Text>
              </BlockStack>
              <span className="bk-filters__divider" aria-hidden="true" />
              <BlockStack gap="300">
                <TextField
                  label="Search entries"
                  labelHidden
                  prefix={<SearchIcon width={18} height={18} fill="#8a8a8a" style={{ display: "block" }} />}
                  placeholder="Search entries by handle, title, or content…"
                  value={search}
                  onChange={resetPage(setSearch)}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={resetPage(() => setSearch(""))}
                  disabled={!sourceValue}
                />
                <div className="bk-chips">
                  {statusColumn && (
                    <>
                      <button type="button" className="bk-chip" aria-pressed={!statusFilter} onClick={resetPage(() => setStatusFilter(""))}>
                        All
                      </button>
                      {statusColumn.options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className="bk-chip"
                          aria-pressed={statusFilter === option.value}
                          onClick={resetPage(() => setStatusFilter(option.value))}
                        >
                          {option.label}
                        </button>
                      ))}
                    </>
                  )}
                  <span className="bk-chips__spacer" />
                  <MoreFilters
                    columns={columns}
                    disabled={!sourceValue}
                    fieldFilter={fieldFilter}
                    onlyChanged={onlyChanged}
                    onlyInvalid={onlyInvalid}
                    onApply={(next) => {
                      setFieldFilter(next.fieldFilter);
                      setOnlyChanged(next.onlyChanged);
                      setOnlyInvalid(next.onlyInvalid);
                      setPage(1);
                    }}
                  />
                </div>
                {filterTags.length > 0 && (
                  <InlineStack gap="200">
                    {filterTags.map((tag) => (
                      <Tag key={tag.key} onRemove={resetPage(tag.clear)}>
                        {tag.label}
                      </Tag>
                    ))}
                  </InlineStack>
                )}
              </BlockStack>
            </div>
          </Card>

          {sourceValue && !data.loadError && (
            <>
              <div className="bk-stats">
                <Stat tone="blue" icon={<FileIcon />} label="Total entries" value={`${rows.length.toLocaleString()}${data.truncated ? "+" : ""}`} hint={isMetafields ? `${sourceLabel} loaded` : "Metaobjects in this type"} />
                <Stat tone="amber" icon={<EditIcon />} label="Changed rows" value={dirtyRowIds.size.toLocaleString()} hint={invalidRowIds.size ? `${invalidRowIds.size} need fixing` : "Unsaved changes"} />
                <Stat tone="purple" icon={<LockIcon />} label="Read-only fields" value={readOnlyCount} hint="Fields can't be edited in this version" />
              </div>

              <div className="bk-table-card">
                <div className="bk-table-head">
                  <Text as="h2" variant="headingMd">
                    {`${filteredRows.length.toLocaleString()} entr${filteredRows.length === 1 ? "y" : "ies"}`}
                  </Text>
                  <ColumnsMenu
                    columns={columns}
                    hidden={hidden}
                    onChange={(next) => {
                      setHidden(next);
                      writeHidden(sourceValue, next);
                    }}
                  />
                </div>

                {selectedIds.size > 0 && (
                  <div className="bk-bulkbar">
                    <span className="bk-bulkbar__count">{`${selectedIds.size} selected`}</span>
                    <div style={{ minWidth: 180 }}>
                      <Select
                        label="Field"
                        labelHidden
                        options={[{ label: "Set a field…", value: "" }, ...editableColumns.map((c) => ({ label: c.label, value: c.key }))]}
                        value={bulkKey}
                        onChange={(value) => {
                          setBulkKey(value);
                          setBulkValue("");
                        }}
                      />
                    </div>
                    {bulkColumn && (
                      <div style={{ minWidth: 200 }}>
                        {bulkColumn.control === "status" || bulkColumn.control === "boolean" ? (
                          <Select
                            label="Value"
                            labelHidden
                            options={[
                              { label: "Choose…", value: "" },
                              ...(bulkColumn.control === "status" ? bulkColumn.options : [{ label: "True", value: "true" }, { label: "False", value: "false" }]),
                            ]}
                            value={bulkValue}
                            onChange={setBulkValue}
                          />
                        ) : (
                          <TextField label="Value" labelHidden placeholder="New value (blank clears it)" value={bulkValue} onChange={setBulkValue} autoComplete="off" />
                        )}
                      </div>
                    )}
                    <Button variant="primary" disabled={!bulkColumn} onClick={applyBulk}>
                      Apply to selected
                    </Button>
                    <Button onClick={() => revertRows(new Set(selectedIds))}>Revert selected</Button>
                    {selectedIds.size < filteredRows.length && (
                      <Button variant="plain" onClick={() => setSelectedIds(new Set(filteredRows.map((row) => row.id)))}>
                        {`Select all ${filteredRows.length}`}
                      </Button>
                    )}
                    <Button variant="plain" onClick={() => setSelectedIds(new Set())}>
                      Clear selection
                    </Button>
                  </div>
                )}

                {pageRows.length ? (
                  <BulkTable
                    columns={visibleColumns}
                    rows={pageRows}
                    dirtyKeys={dirtyKeys}
                    invalidKeys={invalidKeys}
                    selectedIds={selectedIds}
                    activeId={activeId}
                    onCellChange={handleCellChange}
                    onToggleRow={(id) =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    onTogglePage={(ids, checked) =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
                        return next;
                      })
                    }
                    onOpen={setActiveId}
                    onOpenInAdmin={openInAdmin}
                    onRevertRow={(id) => revertRows(new Set([id]))}
                  />
                ) : (
                  <div className="bk-empty">{rows.length ? "No entries match your search and filters." : "There are no entries here yet."}</div>
                )}

                <div className="bk-table-foot">
                  <span>{`${selectedIds.size} of ${filteredRows.length.toLocaleString()} selected`}</span>
                  <InlineStack gap="300" blockAlign="center">
                    {pageCount > 1 && <Text as="span" tone="subdued">{`Page ${currentPage} of ${pageCount}`}</Text>}
                    <Pagination
                      hasPrevious={currentPage > 1}
                      onPrevious={() => setPage(currentPage - 1)}
                      hasNext={currentPage < pageCount}
                      onNext={() => setPage(currentPage + 1)}
                    />
                  </InlineStack>
                </div>
              </div>
              {data.truncated && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Showing the first 2,000 entries.
                </Text>
              )}
            </>
          )}

          {!sourceValue && !data.loadError && (
            <Card>
              <div className="bk-empty">
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="h2" variant="headingMd">
                    Choose what you want to edit
                  </Text>
                  <Text as="p" tone="subdued">
                    Pick a metaobject type, or Products, Collections, Pages, Blog posts or Blogs to bulk edit their metafields.
                  </Text>
                </BlockStack>
              </div>
            </Card>
          )}

          <Tips />
        </div>

        {activeRow && (
          <EntryPanel
            key={activeRow.id}
            row={activeRow}
            columns={columns}
            dirtyKeys={dirtyKeys}
            errors={activeErrors}
            onChange={handleCellChange}
            onClose={() => setActiveId(null)}
            onOpenInAdmin={openInAdmin}
          />
        )}
      </div>

      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard all unsaved changes?"
        primaryAction={{ content: "Discard changes", destructive: true, onAction: discardAll }}
        secondaryActions={[{ content: "Keep editing", onAction: () => setConfirmDiscard(false) }]}
      >
        <Modal.Section>
          <p>{`Changes to ${dirtyRowIds.size} entr${dirtyRowIds.size === 1 ? "y" : "ies"} will be lost. This can't be undone.`}</p>
        </Modal.Section>
      </Modal>

      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        primaryAction={{ content: "Leave without saving", destructive: true, onAction: () => blocker.proceed?.() }}
        secondaryActions={[{ content: "Stay and save", onAction: () => blocker.reset?.() }]}
      >
        <Modal.Section>
          <p>{`You have unsaved changes to ${dirtyRowIds.size} entr${dirtyRowIds.size === 1 ? "y" : "ies"}. If you leave now, they'll be lost.`}</p>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Stat({ tone, icon, label, value, hint }) {
  return (
    <div className={`bk-stat bk-stat--${tone}`}>
      <span className="bk-stat__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <div className="bk-stat__label">{label}</div>
        <div className="bk-stat__value">{value}</div>
        <div className="bk-stat__hint">{hint}</div>
      </div>
    </div>
  );
}

function ColumnsMenu({ columns, hidden, onChange }) {
  const [active, setActive] = useState(false);
  const visible = columns.filter((column) => !hidden.has(column.key)).map((column) => column.key);
  return (
    <Popover
      active={active}
      onClose={() => setActive(false)}
      preferredAlignment="right"
      activator={
        <Button icon={LayoutColumns3Icon} onClick={() => setActive((v) => !v)} disclosure>
          Columns
        </Button>
      }
    >
      <div style={{ padding: 16, maxHeight: 360, overflowY: "auto", minWidth: 240 }}>
        <ChoiceList
          allowMultiple
          title="Show columns"
          choices={columns.map((column) => ({ label: column.label, value: column.key }))}
          selected={visible}
          onChange={(selected) => onChange(new Set(columns.map((c) => c.key).filter((key) => !selected.includes(key))))}
        />
        <div style={{ marginTop: 8 }}>
          <Button variant="plain" onClick={() => onChange(new Set())}>
            Show all
          </Button>
        </div>
      </div>
    </Popover>
  );
}

function MoreFilters({ columns, disabled, fieldFilter, onlyChanged, onlyInvalid, onApply }) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState(null);

  const open = () => {
    setDraft({
      fieldKey: fieldFilter?.key || "",
      condition: fieldFilter?.condition || "contains",
      value: fieldFilter?.value || "",
      onlyChanged,
      onlyInvalid,
    });
    setActive(true);
  };
  const needsValue = draft && (draft.condition === "contains" || draft.condition === "is");
  const apply = () => {
    onApply({
      fieldFilter: draft.fieldKey && (!needsValue || draft.value.trim()) ? { key: draft.fieldKey, condition: draft.condition, value: draft.value } : null,
      onlyChanged: draft.onlyChanged,
      onlyInvalid: draft.onlyInvalid,
    });
    setActive(false);
  };

  return (
    <Popover
      active={active}
      onClose={() => setActive(false)}
      preferredAlignment="right"
      activator={
        <Button variant="tertiary" icon={FilterIcon} disabled={disabled} onClick={() => (active ? setActive(false) : open())}>
          More filters
        </Button>
      }
    >
      {draft && (
        <div style={{ padding: 16, width: 320 }}>
          <BlockStack gap="300">
            <Select
              label="Field"
              options={[{ label: "Any field…", value: "" }, ...columns.map((c) => ({ label: c.label, value: c.key }))]}
              value={draft.fieldKey}
              onChange={(fieldKey) => setDraft({ ...draft, fieldKey })}
            />
            {draft.fieldKey && (
              <InlineStack gap="200" wrap={false}>
                <div style={{ width: 130 }}>
                  <Select label="Condition" labelHidden options={FILTER_CONDITIONS} value={draft.condition} onChange={(condition) => setDraft({ ...draft, condition })} />
                </div>
                {needsValue && (
                  <div style={{ flex: 1 }}>
                    <TextField label="Value" labelHidden value={draft.value} onChange={(value) => setDraft({ ...draft, value })} autoComplete="off" placeholder="Value" />
                  </div>
                )}
              </InlineStack>
            )}
            <Checkbox label="Only rows with unsaved changes" checked={draft.onlyChanged} onChange={(value) => setDraft({ ...draft, onlyChanged: value })} />
            <Checkbox label="Only rows with validation issues" checked={draft.onlyInvalid} onChange={(value) => setDraft({ ...draft, onlyInvalid: value })} />
            <InlineStack align="space-between">
              <Button
                variant="plain"
                onClick={() => {
                  onApply({ fieldFilter: null, onlyChanged: false, onlyInvalid: false });
                  setActive(false);
                }}
              >
                Clear filters
              </Button>
              <Button variant="primary" onClick={apply}>
                Apply
              </Button>
            </InlineStack>
          </BlockStack>
        </div>
      )}
    </Popover>
  );
}

function Tips() {
  return (
    <div className="bk-tips">
      <span className="bk-tips__bulb" aria-hidden="true">
        <LightbulbIcon width={22} height={22} fill="currentColor" />
      </span>
      <div className="bk-tip">
        <UploadIcon />
        <div>
          <strong>Use CSV for bulk updates</strong>
          Export your data, make changes in Excel or Google Sheets, then import the CSV to review before saving. You can
          also paste a block of cells straight into the table.
        </div>
      </div>
      <div className="bk-tip">
        <LockIcon />
        <div>
          <strong>Changed cells are highlighted</strong>
          Cells you modify stay highlighted until you save. Fields with structured data (money, lists, references) are
          read-only.
        </div>
      </div>
      <div className="bk-tip">
        <QuestionCircleIcon />
        <div>
          <strong>Need help?</strong>
          Learn more about metaobjects and metafields in Shopify&apos;s{" "}
          <a href="https://help.shopify.com/manual/custom-data" target="_blank" rel="noreferrer">
            custom data documentation
          </a>
          .
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
