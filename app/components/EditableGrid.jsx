import { useCallback, useRef, useState } from "react";

// A spreadsheet-style editable table.
//
// columns: [{ key, label, control: "text"|"textarea"|"number"|"boolean"|"date"|"readonly", required?, distinctValues?: string[] }]
//   distinctValues, when present, turns on an Excel-style filter checklist for that column.
// rows:    [{ id, handle, values: { [key]: string } }] — already paginated by the caller
// dirtyKeys: Set of `${rowId}::${key}` for highlighting changed cells
// onCellChange(rowId, key, value): fired for every edit, including each cell touched by a paste
// columnFilters: { [key]: Set<string> } — present only for columns actively narrowed
// onToggleFilterValue(key, value) / onSelectAllFilter(key) / onClearAllFilter(key)
// selectedIds: Set<string> of selected row ids (may include ids beyond this page)
// onToggleRow(rowId) / onTogglePage(checked) — checked applies to every row currently passed in `rows`
//
// Purely controlled/presentational — the caller owns row values, dirty tracking, filtering, and selection.
export default function EditableGrid({
  columns,
  rows,
  dirtyKeys,
  onCellChange,
  columnFilters = {},
  onToggleFilterValue,
  onSelectAllFilter,
  onClearAllFilter,
  selectedIds = new Set(),
  onToggleRow,
  onTogglePage,
}) {
  const cellRefs = useRef({}); // `${rowIndex}-${colIndex}` -> element
  const [openFilterKey, setOpenFilterKey] = useState(null);

  const setCellRef = useCallback((rowIndex, colIndex, el) => {
    const refKey = `${rowIndex}-${colIndex}`;
    if (el) cellRefs.current[refKey] = el;
    else delete cellRefs.current[refKey];
  }, []);

  const focusCell = (rowIndex, colIndex) => {
    const el = cellRefs.current[`${rowIndex}-${colIndex}`];
    if (el) { el.focus(); el.select?.(); }
  };

  const handleKeyDown = (e, rowIndex, colIndex) => {
    const move = (dr, dc) => {
      e.preventDefault();
      focusCell(rowIndex + dr, colIndex + dc);
    };
    if (e.key === "Enter") move(1, 0);
    else if (e.key === "ArrowDown" && e.altKey) move(1, 0);
    else if (e.key === "ArrowUp" && e.altKey) move(-1, 0);
  };

  const coerceForControl = (control, raw) => {
    if (control !== "boolean") return raw;
    const v = raw.trim().toLowerCase();
    return ["true", "1", "yes", "y"].includes(v) ? "true" : "false";
  };

  const handlePaste = (e, rowIndex, colIndex) => {
    const text = e.clipboardData?.getData("text");
    if (!text || !text.includes("\t") && !text.includes("\n")) return; // let single-value paste behave natively
    e.preventDefault();

    const pastedRows = text.replace(/\r/g, "").split("\n").filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === ""));
    pastedRows.forEach((line, dr) => {
      const cells = line.split("\t");
      cells.forEach((cellValue, dc) => {
        const targetRow = rows[rowIndex + dr];
        const targetCol = columns[colIndex + dc];
        if (!targetRow || !targetCol || targetCol.control === "readonly") return;
        onCellChange(targetRow.id, targetCol.key, coerceForControl(targetCol.control, cellValue));
      });
    });
  };

  const pageAllSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const pageSomeSelected = !pageAllSelected && rows.some((r) => selectedIds.has(r.id));

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: "32px" }}>
              <input
                type="checkbox"
                checked={pageAllSelected}
                ref={(el) => el && (el.indeterminate = pageSomeSelected)}
                onChange={(e) => onTogglePage(e.target.checked)}
              />
            </th>
            <th style={thStyle}>Handle</th>
            {columns.map((col) => {
              const isFilterable = Array.isArray(col.distinctValues);
              const allowed = columnFilters[col.key];
              const isFiltered = allowed !== undefined;
              const isChecked = (v) => !allowed || allowed.has(v);

              return (
                <th key={col.key} style={{ ...thStyle, position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span>
                      {col.label}
                      {col.required && <span style={{ color: "#d72c0d", marginLeft: "4px" }}>*</span>}
                      {col.control === "readonly" && (
                        <span style={{ marginLeft: "6px", fontSize: "11px", fontWeight: 400, color: "#8c9196" }} title="Not editable in this version">
                          (read-only)
                        </span>
                      )}
                    </span>
                    {isFilterable && (
                      <button
                        type="button"
                        onClick={() => setOpenFilterKey(openFilterKey === col.key ? null : col.key)}
                        title="Filter"
                        style={filterButtonStyle(isFiltered)}
                      >
                        ▾
                      </button>
                    )}
                  </div>

                  {isFilterable && openFilterKey === col.key && (
                    <>
                      <div
                        role="presentation"
                        style={backdropStyle}
                        onClick={() => setOpenFilterKey(null)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setOpenFilterKey(null);
                        }}
                      />
                      <div style={popoverStyle}>
                        <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                          <button type="button" style={popoverLinkStyle} onClick={() => onSelectAllFilter(col.key)}>
                            Select all
                          </button>
                          <button type="button" style={popoverLinkStyle} onClick={() => onClearAllFilter(col.key)}>
                            Clear
                          </button>
                        </div>
                        <div style={{ maxHeight: "220px", overflowY: "auto" }}>
                          {col.distinctValues.map((v) => (
                            <label key={v || "__blank"} style={popoverRowStyle}>
                              <input
                                type="checkbox"
                                checked={isChecked(v)}
                                onChange={() => onToggleFilterValue(col.key, v)}
                              />
                              <span style={{ fontWeight: 400 }}>{v || "(blank)"}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id} style={{ background: rowIndex % 2 === 0 ? "#fff" : "#fafbfb" }}>
              <td style={tdStyle}>
                <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => onToggleRow(row.id)} />
              </td>
              <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px", color: "#6d7175", whiteSpace: "nowrap" }}>
                {row.handle}
              </td>
              {columns.map((col, colIndex) => {
                const value = row.values[col.key] ?? "";
                const isDirty = dirtyKeys.has(`${row.id}::${col.key}`);
                const cellStyle = {
                  ...tdStyle,
                  padding: "4px 6px",
                  background: isDirty ? "#fff8e5" : undefined,
                };

                if (col.control === "readonly") {
                  const display = value.length > 60 ? `${value.slice(0, 60)}…` : value;
                  return (
                    <td key={col.key} style={{ ...cellStyle, color: "#8c9196", fontStyle: "italic" }} title={value || "—"}>
                      {display || "—"}
                    </td>
                  );
                }

                const shared = {
                  ref: (el) => setCellRef(rowIndex, colIndex, el),
                  onKeyDown: (e) => handleKeyDown(e, rowIndex, colIndex),
                  onPaste: (e) => handlePaste(e, rowIndex, colIndex),
                  style: inputStyle(isDirty),
                };

                return (
                  <td key={col.key} style={cellStyle}>
                    {col.control === "textarea" ? (
                      <textarea
                        {...shared}
                        value={value}
                        rows={2}
                        onChange={(e) => onCellChange(row.id, col.key, e.target.value)}
                      />
                    ) : col.control === "boolean" ? (
                      <input
                        {...shared}
                        type="checkbox"
                        style={{ width: "16px", height: "16px" }}
                        checked={value === "true"}
                        onChange={(e) => onCellChange(row.id, col.key, e.target.checked ? "true" : "false")}
                      />
                    ) : (
                      <input
                        {...shared}
                        type={col.control === "number" ? "number" : col.control === "date" ? "date" : "text"}
                        value={value}
                        onChange={(e) => onCellChange(row.id, col.key, e.target.value)}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: "600",
  whiteSpace: "nowrap",
  background: "#f6f6f7",
  borderBottom: "1px solid #e1e3e5",
  color: "#3d4043",
  position: "sticky",
  top: 0,
};

const tdStyle = {
  padding: "8px 12px",
  borderBottom: "1px solid #f1f2f3",
  verticalAlign: "middle",
};

const filterButtonStyle = (isFiltered) => ({
  border: "none",
  background: isFiltered ? "#2c6ecb" : "transparent",
  color: isFiltered ? "#fff" : "#6d7175",
  borderRadius: "3px",
  width: "18px",
  height: "18px",
  lineHeight: "18px",
  fontSize: "10px",
  cursor: "pointer",
  flexShrink: 0,
});

const backdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 10,
};

const popoverStyle = {
  position: "absolute",
  top: "100%",
  left: 0,
  marginTop: "4px",
  background: "#fff",
  border: "1px solid #c9cccf",
  borderRadius: "6px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  padding: "10px",
  minWidth: "180px",
  zIndex: 11,
  fontWeight: 400,
  textTransform: "none",
};

const popoverLinkStyle = {
  border: "none",
  background: "none",
  color: "#2c6ecb",
  fontSize: "12px",
  cursor: "pointer",
  padding: 0,
};

const popoverRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "13px",
  padding: "3px 0",
  cursor: "pointer",
};

const inputStyle = (isDirty) => ({
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 8px",
  fontSize: "13px",
  border: `1px solid ${isDirty ? "#e0b100" : "#c9cccf"}`,
  borderRadius: "4px",
  background: isDirty ? "#fff8e5" : "#fff",
  fontFamily: "inherit",
});
