import { Button, Select, TextField } from "@shopify/polaris";
import { AlertCircleIcon, CalendarIcon, CheckIcon, ExternalIcon, ImageIcon, XIcon } from "@shopify/polaris-icons";
import { formatDate } from "../../bulk/fields";
import { TITLE_KEY } from "../../bulk/keys";

const HELP = {
  multi_line_text_field: "Plain text with line breaks.",
  json: "Must be valid JSON.",
  url: "A full link (https://…) or a store path (/pages/…).",
  color: "A hex color like #1a2b3c.",
  date: "",
  date_time: "Date and time, e.g. 2026-10-22T14:30:00Z.",
};

// Right-hand "Entry details" panel for one row.
export default function EntryPanel({ row, columns, dirtyKeys, errors, onChange, onClose, onOpenInAdmin }) {
  const errorFor = (key) => errors.find((error) => error.key === key)?.message;
  const title = row.values[TITLE_KEY] || row.handle;

  return (
    <aside className="bk-panel" aria-label="Entry details">
      <div className="bk-panel__head">
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>Entry details</h2>
        <Button icon={XIcon} variant="tertiary" accessibilityLabel="Close entry details" onClick={onClose} />
      </div>
      <div className="bk-panel__body">
        <div className="bk-entry">
          <span className="bk-entry__thumb">
            {row.image ? <img src={`${row.image}${row.image.includes("?") ? "&" : "?"}width=160`} alt="" /> : <ImageIcon width={24} height={24} fill="currentColor" />}
          </span>
          <div className="bk-entry__text">
            <div className="bk-entry__handle">{row.handle}</div>
            <div className="bk-entry__title">{title}</div>
          </div>
          <Button icon={ExternalIcon} variant="tertiary" accessibilityLabel="Open in Shopify admin" onClick={() => onOpenInAdmin(row)} />
        </div>

        <TextField label="Handle" value={row.handle} disabled autoComplete="off" helpText="A unique identifier for this entry." />

        {columns.map((column) => {
          const changed = dirtyKeys.has(`${row.id}::${column.key}`);
          const value = row.values[column.key] ?? "";
          const error = errorFor(column.key);
          const help = changed ? "This field will be saved with your changes." : HELP[column.typeName];
          const label = `${column.label}${column.required && column.control !== "readonly" ? " *" : ""}`;
          let control;
          if (column.control === "readonly") {
            control = (
              <TextField
                label={column.label}
                value={value}
                disabled
                multiline={value.length > 60 ? 3 : undefined}
                autoComplete="off"
                helpText={column.readOnlyReason || "This field type can't be edited here yet."}
              />
            );
          } else if (column.control === "status") {
            control = (
              <Select
                label={label}
                options={column.options}
                value={value}
                error={error}
                helpText={help}
                onChange={(next) => onChange(row.id, column.key, next)}
              />
            );
          } else if (column.control === "boolean") {
            control = (
              <Select
                label={label}
                options={[
                  { label: "Not set", value: "" },
                  { label: "True", value: "true" },
                  { label: "False", value: "false" },
                ]}
                value={value}
                error={error}
                helpText={help}
                onChange={(next) => onChange(row.id, column.key, next)}
              />
            );
          } else {
            control = (
              <TextField
                label={label}
                value={value}
                type={column.control === "date" ? "date" : "text"}
                multiline={column.control === "textarea" || column.control === "json" ? 4 : undefined}
                monospaced={column.control === "json"}
                autoComplete="off"
                error={error}
                helpText={help}
                onChange={(next) => onChange(row.id, column.key, next)}
              />
            );
          }
          return (
            <div key={column.key} className={changed ? "bk-field--changed" : undefined}>
              {control}
            </div>
          );
        })}

        <TextField
          label="Updated"
          value={formatDate(row.updatedAt)}
          disabled
          autoComplete="off"
          prefix={<CalendarIcon width={18} height={18} fill="#8a8a8a" style={{ display: "block" }} />}
        />

        {errors.length === 0 ? (
          <div className="bk-check bk-check--ok" role="status">
            <span className="bk-check__icon">
              <CheckIcon />
            </span>
            <div>
              <strong>No validation issues</strong>
              <span style={{ fontSize: 13 }}>This entry is ready to be saved.</span>
            </div>
          </div>
        ) : (
          <div className="bk-check bk-check--bad" role="alert">
            <span className="bk-check__icon">
              <AlertCircleIcon />
            </span>
            <div>
              <strong>{errors.length === 1 ? "1 issue to fix" : `${errors.length} issues to fix`}</strong>
              <ul>
                {errors.map((error) => (
                  <li key={error.key}>
                    {error.label}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
