import { useState, useCallback, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { parseCSVRows } from "../utils/csv";
import ProgressBar from "../components/ProgressBar";
import SummaryCard from "../components/SummaryCard";

// ─── Server ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const pagesJson = formData.get("pages");

  if (!pagesJson) {
    return { error: "No pages data provided", success: [], errors: [] };
  }

  let pages;
  try {
    pages = JSON.parse(pagesJson);
  } catch {
    return { error: "Invalid data format", success: [], errors: [] };
  }

  const results = { success: [], errors: [] };

  for (const page of pages) {
    try {
      const pageInput = {
        title: page.title,
        body: page.body_html || "",
        isPublished: page.published?.toLowerCase() !== "false",
      };
      if (page.handle) pageInput.handle = page.handle;
      if (page.template_suffix) pageInput.templateSuffix = page.template_suffix;

      const response = await admin.graphql(
        `#graphql
        mutation pageCreate($page: PageCreateInput!) {
          pageCreate(page: $page) {
            page {
              id
              title
              handle
            }
            userErrors {
              field
              message
            }
          }
        }`,
        { variables: { page: pageInput } }
      );

      const { data } = await response.json();
      const result = data?.pageCreate;

      if (result?.userErrors?.length > 0) {
        results.errors.push({ title: page.title, errors: result.userErrors });
      } else if (result?.page) {
        results.success.push(result.page);
      } else {
        results.errors.push({
          title: page.title,
          errors: [{ message: "Unknown error occurred" }],
        });
      }
    } catch (err) {
      results.errors.push({
        title: page.title,
        errors: [{ message: err.message || "Request failed" }],
      });
    }
  }

  return results;
};

// ─── CSV Parser ───────────────────────────────────────────────────────────────

const COLUMN_ALIASES = {
  title: "title",        Title: "title",
  handle: "handle",      Handle: "handle",
  body_html: "body_html", content: "body_html", Content: "body_html",
  published: "published", Published: "published",
  template_suffix: "template_suffix", template: "template_suffix", Template: "template_suffix",
};

function normalizeHandle(raw) {
  if (!raw) return "";
  const stripped = raw.replace(/^\/+/, "");
  const segments = stripped.split("/");
  return segments[segments.length - 1] || stripped;
}

function parseCSV(csvText) {
  const rows = parseCSVRows(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => COLUMN_ALIASES[h.trim()] || h.trim());
  return rows
    .slice(1)
    .map((r) => {
      const obj = Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()]));
      if (obj.handle) obj.handle = normalizeHandle(obj.handle);
      return obj;
    })
    .filter((r) => r.title);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CSV_TEMPLATE =
  "Title,Handle,Content,Template\n" +
  '"About Us",/about-us,"<p>Learn more about our company and mission.</p>",cms-pages\n' +
  '"Contact Us",/contact-us,"<p>Get in touch with our team.</p>",cms-pages\n' +
  '"FAQ",/faq,"<h2>Frequently Asked Questions</h2><p>Find answers here.</p>",cms-pages';

const COLUMNS = [
  ["Title",     "Page title",                                                      true],
  ["Handle",    "URL path e.g. /about-us — last segment becomes the slug",         false],
  ["Content",   "HTML content for the page body",                                  false],
  ["Template",  "Template name e.g. cms-pages",                                    false],
  ["published", "true / false — defaults to true if omitted",                      false],
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: "14px" };

const thStyle = {
  padding: "10px 16px",
  textAlign: "left",
  fontWeight: "600",
  whiteSpace: "nowrap",
  background: "#f6f6f7",
  borderBottom: "1px solid #e1e3e5",
  color: "#3d4043",
};

const tdStyle = {
  padding: "10px 16px",
  borderBottom: "1px solid #f1f2f3",
  verticalAlign: "middle",
};

const codeStyle = {
  background: "#e4e5e7",
  padding: "1px 6px",
  borderRadius: "3px",
  fontFamily: "monospace",
  fontSize: "12px",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ published }) {
  const isDraft = published?.toLowerCase() === "false";
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: 600,
      background: isDraft ? "#fff3cd" : "#d4edda",
      color:      isDraft ? "#856404" : "#155724",
    }}>
      {isDraft ? "Draft" : "Published"}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BulkPageImporter() {
  const fetcher    = useFetcher();
  const shopify    = useAppBridge();
  const fileRef    = useRef(null);

  // Sequential import queue — all stored in refs to avoid stale closures
  const queueRef      = useRef([]);   // full pages array for current import
  const indexRef      = useRef(0);    // index of page currently being processed
  const resultsRef    = useRef({ success: [], errors: [] });
  const cancelRef     = useRef(false);
  const activeRef     = useRef(false); // true while an import session is running
  const prevStateRef  = useRef("idle");

  const [pages,       setPages]       = useState([]);
  const [fileName,    setFileName]    = useState("");
  const [parseError,  setParseError]  = useState("");
  const [isDragOver,  setIsDragOver]  = useState(false);
  const [importState, setImportState] = useState(null);
  // null                                      → idle
  // { phase:"importing", current, total, success:[], errors:[] }
  // { phase:"done",      success:[], errors:[], cancelled:bool }

  const isImporting = importState?.phase === "importing";
  const isDone      = importState?.phase === "done";
  const showSteps   = !isImporting && !isDone;

  // ── Detect fetcher completion and drive the queue ──────────────────────────

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = fetcher.state;

    // Only act on the idle transition (request just finished)
    if (!(prev !== "idle" && fetcher.state === "idle")) return;
    if (!activeRef.current || !fetcher.data) return;

    // Merge results from completed page
    resultsRef.current.success.push(...(fetcher.data.success || []));
    resultsRef.current.errors.push(...(fetcher.data.errors || []));

    const completedIdx = indexRef.current;
    const nextIdx      = completedIdx + 1;
    const total        = queueRef.current.length;
    const cancelled    = cancelRef.current;
    const done         = nextIdx >= total || cancelled;

    if (done) {
      activeRef.current = false;
      const { success, errors } = resultsRef.current;
      setImportState({ phase: "done", total, success: [...success], errors: [...errors], cancelled });
      if (success.length > 0) {
        shopify.toast.show(`Imported ${success.length} page${success.length !== 1 ? "s" : ""}`);
      }
      return;
    }

    // Update progress and submit next page
    indexRef.current = nextIdx;
    setImportState((prev) => ({
      ...prev,
      current: nextIdx,
      success: [...resultsRef.current.success],
      errors:  [...resultsRef.current.errors],
    }));

    fetcher.submit(
      { pages: JSON.stringify([queueRef.current[nextIdx]]) },
      { method: "POST" }
    );
  }, [fetcher.state, fetcher.data, shopify]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── File handling ──────────────────────────────────────────────────────────

  const processFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      return;
    }
    setFileName(file.name);
    setParseError("");
    setPages([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseCSV(e.target.result);
        if (parsed.length === 0) {
          setParseError('No valid rows found. Make sure your CSV has a "Title" column with data.');
        } else {
          setPages(parsed);
        }
      } catch {
        setParseError("Failed to parse the CSV. Please check the format.");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleFileChange = useCallback((e) => processFile(e.target.files?.[0]), [processFile]);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    processFile(e.dataTransfer.files?.[0]);
  }, [processFile]);

  // ── Start import ───────────────────────────────────────────────────────────

  const handleImport = useCallback(() => {
    if (!pages.length || isImporting) return;

    // Reset refs
    queueRef.current   = pages;
    indexRef.current   = 0;
    resultsRef.current = { success: [], errors: [] };
    cancelRef.current  = false;
    activeRef.current  = true;

    setImportState({ phase: "importing", current: 0, total: pages.length, success: [], errors: [] });

    // Kick off first page
    fetcher.submit(
      { pages: JSON.stringify([pages[0]]) },
      { method: "POST" }
    );
  }, [pages, isImporting, fetcher]);

  const handleCancel = useCallback(() => { cancelRef.current = true; }, []);

  const handleReset = useCallback(() => {
    setPages([]);
    setFileName("");
    setParseError("");
    setImportState(null);
    cancelRef.current = false;
    activeRef.current = false;
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleDownloadTemplate = useCallback(() => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "page-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const progressPercent = importState?.total
    ? Math.round((importState.current / importState.total) * 100)
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <s-page heading="Bulk Page Importer">

      {/* Primary action button */}
      {pages.length > 0 && showSteps && (
        <s-button slot="primary-action" onClick={handleImport}>
          Import {pages.length} Page{pages.length !== 1 ? "s" : ""}
        </s-button>
      )}

      {/* ── Import progress ───────────────────────────────────────────────── */}
      {isImporting && (
        <s-section heading="Importing pages…">
          <s-stack direction="block" gap="base">

            <div style={{
              background: "#f6f6f7",
              border: "1px solid #e1e3e5",
              borderRadius: "10px",
              padding: "24px",
            }}>
              <s-stack direction="block" gap="base">

                {/* Bar label row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <s-text>
                    Page <strong>{importState.current}</strong> of <strong>{importState.total}</strong>
                  </s-text>
                  <s-text emphasis="bold">{progressPercent}%</s-text>
                </div>

                <ProgressBar percent={progressPercent} />

                {/* Live counters */}
                <div style={{ display: "flex", gap: "20px", marginTop: "4px" }}>
                  <span style={{ fontSize: "13px", color: "#155724", display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ fontWeight: 700 }}>✓</span>
                    {importState.success.length} imported
                  </span>
                  <span style={{
                    fontSize: "13px",
                    color: importState.errors.length > 0 ? "#d72c0d" : "#8c9196",
                    display: "flex", alignItems: "center", gap: "5px",
                  }}>
                    <span style={{ fontWeight: 700 }}>✗</span>
                    {importState.errors.length} failed
                  </span>
                </div>

              </s-stack>
            </div>

            <s-button variant="tertiary" onClick={handleCancel}>
              Cancel import
            </s-button>

          </s-stack>
        </s-section>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {isDone && (
        <s-section heading={importState.cancelled ? "Import cancelled" : "Import complete"}>
          <s-stack direction="block" gap="base">

            {/* Summary cards */}
            <div style={{ display: "flex", gap: "12px" }}>
              <SummaryCard
                value={importState.success.length}
                label="Imported"
                color={importState.success.length > 0 ? "green" : "grey"}
              />
              {importState.errors.length > 0 && (
                <SummaryCard value={importState.errors.length} label="Failed" color="red" />
              )}
              {importState.cancelled && (() => {
                const skipped = importState.total - importState.success.length - importState.errors.length;
                return skipped > 0
                  ? <SummaryCard value={skipped} label="Skipped" color="yellow" />
                  : null;
              })()}
            </div>

            {/* Error detail list */}
            {importState.errors.length > 0 && (
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="tight">
                  <s-text emphasis="bold">Failed pages</s-text>
                  {importState.errors.map((err, i) => (
                    <s-paragraph key={i}>
                      <s-text emphasis="bold">{err.title}</s-text>
                      {": "}
                      {err.errors.map((e) => e.message).join(", ")}
                    </s-paragraph>
                  ))}
                </s-stack>
              </s-box>
            )}

            <s-button variant="tertiary" onClick={handleReset}>
              Import more pages
            </s-button>

          </s-stack>
        </s-section>
      )}

      {/* ── Steps ─────────────────────────────────────────────────────────── */}
      {showSteps && (
        <>
          {/* Step 1 — Template */}
          <s-section heading="Step 1 — Download the CSV template">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Download the template and fill in your page data. Only{" "}
                <code style={codeStyle}>Title</code> is required.
              </s-paragraph>

              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="tight">
                  {COLUMNS.map(([col, desc, required]) => (
                    <s-paragraph key={col}>
                      <code style={codeStyle}>{col}</code>
                      {required && (
                        <span style={{ marginLeft: "5px", color: "#d72c0d", fontSize: "11px", fontWeight: 700 }}>
                          required
                        </span>
                      )}{" "}
                      — {desc}
                    </s-paragraph>
                  ))}
                </s-stack>
              </s-box>

              <s-button onClick={handleDownloadTemplate}>Download CSV template</s-button>
            </s-stack>
          </s-section>

          {/* Step 2 — Upload */}
          <s-section heading="Step 2 — Upload your CSV file">
            <s-stack direction="block" gap="base">

              {/* Drop zone */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload CSV file"
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${isDragOver ? "#2c6ecb" : pages.length > 0 ? "#008060" : "#c9cccf"}`,
                  borderRadius: "10px",
                  padding: pages.length > 0 ? "24px" : "48px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: isDragOver ? "#f0f4ff" : pages.length > 0 ? "#f1faf5" : "#fafbfb",
                  transition: "all 0.15s ease",
                  userSelect: "none",
                }}
              >
                {pages.length > 0 ? (
                  /* Loaded state */
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" }}>
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "8px",
                      background: "#008060", display: "flex", alignItems: "center",
                      justifyContent: "center", flexShrink: 0,
                    }}>
                      <span style={{ fontSize: "20px", color: "#fff" }}>✓</span>
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: "#202223" }}>{fileName}</div>
                      <div style={{ fontSize: "13px", color: "#008060", marginTop: "2px" }}>
                        {pages.length} page{pages.length !== 1 ? "s" : ""} ready to import
                      </div>
                    </div>
                    <div style={{ marginLeft: "auto", fontSize: "12px", color: "#6d7175" }}>
                      Click to replace
                    </div>
                  </div>
                ) : (
                  /* Empty state */
                  <s-stack direction="block" gap="tight">
                    <div style={{ fontSize: "32px", lineHeight: 1, marginBottom: "4px" }}>📄</div>
                    <s-text emphasis="bold">Click to upload or drag and drop</s-text>
                    <s-text>CSV files only</s-text>
                  </s-stack>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />

              {parseError && (
                <div style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  background: "#fff4f4",
                  border: "1px solid #ffd2d2",
                }}>
                  <span style={{ fontSize: "16px", lineHeight: 1, flexShrink: 0 }}>⚠</span>
                  <s-text>{parseError}</s-text>
                </div>
              )}

            </s-stack>
          </s-section>

          {/* Step 3 — Preview */}
          {pages.length > 0 && (
            <s-section heading={`Step 3 — Review and import (${pages.length} page${pages.length !== 1 ? "s" : ""})`}>
              <s-stack direction="block" gap="base">

                <s-box borderWidth="base" borderRadius="base">
                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          {["#", "Title", "Handle", "Status", "Template"].map((h) => (
                            <th key={h} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pages.map((page, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafbfb" }}>
                            <td style={{ ...tdStyle, color: "#8c9196", width: "36px", fontSize: "12px" }}>
                              {i + 1}
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 500, maxWidth: "260px" }}>
                              {page.title}
                            </td>
                            <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", color: page.handle ? "#202223" : "#8c9196" }}>
                              {page.handle || "auto"}
                            </td>
                            <td style={tdStyle}>
                              <StatusBadge published={page.published} />
                            </td>
                            <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", color: page.template_suffix ? "#202223" : "#8c9196" }}>
                              {page.template_suffix || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </s-box>

                <s-stack direction="inline" gap="base">
                  <s-button onClick={handleImport}>
                    Import {pages.length} Page{pages.length !== 1 ? "s" : ""}
                  </s-button>
                  <s-button variant="tertiary" onClick={handleReset}>
                    Clear
                  </s-button>
                </s-stack>

              </s-stack>
            </s-section>
          )}
        </>
      )}

      {/* ── Aside ─────────────────────────────────────────────────────────── */}
      <s-section slot="aside" heading="CSV format tips">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text emphasis="bold">HTML content</s-text>
          </s-paragraph>
          <s-paragraph>
            Wrap fields with HTML or commas in double quotes.
            Use <code style={codeStyle}>&quot;&quot;</code> to escape a literal quote inside a quoted field.
          </s-paragraph>

          <s-paragraph>
            <s-text emphasis="bold">Handles</s-text>
          </s-paragraph>
          <s-paragraph>
            Full paths like <code style={codeStyle}>/video/my-page</code> are supported — only the last segment is used as the slug. Leave empty to auto-generate from the title.
          </s-paragraph>

          <s-paragraph>
            <s-text emphasis="bold">Draft pages</s-text>
          </s-paragraph>
          <s-paragraph>
            Set <code style={codeStyle}>published</code> to{" "}
            <code style={codeStyle}>false</code> to save as draft.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Supported columns">
        <s-unordered-list>
          {COLUMNS.map(([col, , required]) => (
            <s-list-item key={col}>
              <code style={codeStyle}>{col}</code>
              {required && (
                <span style={{ marginLeft: "5px", color: "#d72c0d", fontSize: "11px" }}>*</span>
              )}
            </s-list-item>
          ))}
        </s-unordered-list>
        <s-paragraph>
          <s-text>* required — column names are case-insensitive</s-text>
        </s-paragraph>
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
