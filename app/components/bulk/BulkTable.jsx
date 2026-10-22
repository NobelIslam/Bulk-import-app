import { useRef, useState } from "react";
import { ActionList, Button, Popover } from "@shopify/polaris";
import { EditIcon, ExternalIcon, MenuHorizontalIcon, UndoIcon } from "@shopify/polaris-icons";
import { coerceValue, formatDate, STATUS_TONES } from "../../bulk/fields";

const STATUS_CLASS = { success: "bk-status--success", attention: "bk-status--attention" };

// The spreadsheet-style table. Fully controlled: the page owns rows, edits,
// selection and filtering; this renders one page of rows.
export default function BulkTable({
  columns,
  rows,
  dirtyKeys,
  invalidKeys,
  selectedIds,
  activeId,
  onCellChange,
  onToggleRow,
  onTogglePage,
  onOpen,
  onOpenInAdmin,
  onRevertRow,
}) {
  const cellRefs = useRef(new Map());
  const editable = columns.filter((column) => column.control !== "readonly");

  const focusCell = (rowIndex, key) => {
    const el = cellRefs.current.get(`${rowIndex}:${key}`);
    if (el) {
      el.focus();
      el.select?.();
    }
  };

  // Enter moves down, Shift+Enter moves up — like a spreadsheet.
  const handleKeyDown = (event, rowIndex, key) => {
    if (event.key === "Enter") {
      event.preventDefault();
      focusCell(rowIndex + (event.shiftKey ? -1 : 1), key);
    }
  };

  // A block of cells copied from Excel or Google Sheets fills the grid from
  // this cell rightwards and downwards; read-only columns are skipped.
  const handlePaste = (event, rowIndex, key) => {
    const text = event.clipboardData?.getData("text") || "";
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n");
    if (lines.at(-1) === "") lines.pop();
    const startCol = editable.findIndex((column) => column.key === key);
    lines.forEach((line, dr) => {
      const row = rows[rowIndex + dr];
      if (!row) return;
      line.split("\t").forEach((cell, dc) => {
        const column = editable[startCol + dc];
        if (column) onCellChange(row.id, column.key, coerceValue(column, cell));
      });
    });
  };

  const pageIds = rows.map((row) => row.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && pageIds.some((id) => selectedIds.has(id));

  return (
    <div className="bk-scroll">
      <table className="bk-table">
        <thead>
          <tr>
            <th className="bk-cell--check">
              <input
                type="checkbox"
                aria-label="Select all rows on this page"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={(event) => onTogglePage(pageIds, event.target.checked)}
              />
            </th>
            <th>Handle</th>
            {columns.map((column) => (
              <th key={column.key} title={column.control === "readonly" ? column.readOnlyReason || "Read-only in this version" : undefined}>
                {column.label}
                {column.required && column.control !== "readonly" && <span style={{ color: "#c5280c" }}> *</span>}
                {column.control === "readonly" && <span style={{ color: "#8a8a8a", fontWeight: 400 }}> · read-only</span>}
              </th>
            ))}
            <th>Updated</th>
            <th className="bk-cell--actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id} className={row.id === activeId ? "bk-row--active" : undefined}>
              <td className="bk-cell--check">
                <input type="checkbox" aria-label={`Select ${row.handle}`} checked={selectedIds.has(row.id)} onChange={() => onToggleRow(row.id)} />
              </td>
              <td>
                <button type="button" className="bk-handle" onClick={() => onOpen(row.id)}>
                  {row.handle}
                </button>
              </td>
              {columns.map((column) => {
                const cellKey = `${row.id}::${column.key}`;
                const value = row.values[column.key] ?? "";
                const className = `${dirtyKeys.has(cellKey) ? "bk-cell--changed" : ""}${invalidKeys.has(cellKey) ? " bk-cell--invalid" : ""}`;
                return (
                  <td key={column.key} className={className || undefined}>
                    <Cell
                      column={column}
                      value={value}
                      inputRef={(el) => {
                        if (el) cellRefs.current.set(`${rowIndex}:${column.key}`, el);
                        else cellRefs.current.delete(`${rowIndex}:${column.key}`);
                      }}
                      onChange={(next) => onCellChange(row.id, column.key, next)}
                      onKeyDown={(event) => handleKeyDown(event, rowIndex, column.key)}
                      onPaste={(event) => handlePaste(event, rowIndex, column.key)}
                      label={`${column.label} for ${row.handle}`}
                    />
                  </td>
                );
              })}
              <td>
                <div className="bk-date">{formatDate(row.updatedAt)}</div>
              </td>
              <td className="bk-cell--actions">
                <RowActions
                  handle={row.handle}
                  hasChanges={columns.some((column) => dirtyKeys.has(`${row.id}::${column.key}`))}
                  onOpen={() => onOpen(row.id)}
                  onOpenInAdmin={() => onOpenInAdmin(row)}
                  onRevert={() => onRevertRow(row.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ column, value, inputRef, onChange, onKeyDown, onPaste, label }) {
  if (column.control === "readonly") {
    return (
      <span className="bk-readonly" title={value || "—"}>
        {value || "—"}
      </span>
    );
  }
  if (column.control === "status") {
    const tone = STATUS_TONES[value];
    return (
      <select
        ref={inputRef}
        aria-label={label}
        className={`bk-status ${STATUS_CLASS[tone] || "bk-status--neutral"}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {!column.options.some((option) => option.value === value) && <option value={value}>{value || "—"}</option>}
        {column.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (column.control === "boolean") {
    return (
      <select ref={inputRef} aria-label={label} className="bk-input" value={value} onChange={(event) => onChange(event.target.value)} onPaste={onPaste}>
        <option value="">—</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }
  return (
    <input
      ref={inputRef}
      aria-label={label}
      className="bk-input"
      type={column.control === "date" ? "date" : "text"}
      inputMode={column.control === "number" || column.control === "decimal" ? "decimal" : undefined}
      value={value}
      title={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  );
}

function RowActions({ handle, hasChanges, onOpen, onOpenInAdmin, onRevert }) {
  const [active, setActive] = useState(false);
  return (
    <Popover
      active={active}
      onClose={() => setActive(false)}
      preferredAlignment="right"
      activator={<Button variant="tertiary" icon={MenuHorizontalIcon} accessibilityLabel={`Actions for ${handle}`} onClick={() => setActive((v) => !v)} />}
    >
      <ActionList
        actionRole="menuitem"
        onActionAnyItem={() => setActive(false)}
        items={[
          { content: "Edit details", icon: EditIcon, onAction: onOpen },
          { content: "Open in Shopify admin", icon: ExternalIcon, onAction: onOpenInAdmin },
          { content: "Revert changes", icon: UndoIcon, disabled: !hasChanges, onAction: onRevert },
        ]}
      />
    </Popover>
  );
}
