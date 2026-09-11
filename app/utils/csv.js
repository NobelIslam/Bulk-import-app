// Quote-aware CSV tokenizer — handles quoted fields, escaped "" and CRLF/CR normalization.
// Returns raw rows of string cells; callers are responsible for header mapping.
export function parseCSVRows(csvText) {
  const normalized = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (c === '"') {
      if (inQuotes && normalized[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      row.push(field); field = "";
    } else if (c === "\n" && !inQuotes) {
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }

  return rows;
}

// Serializes rows of cells into a CSV string, quoting fields that need it.
export function toCSV(headerRow, dataRows) {
  const escapeCell = (value) => {
    const str = value == null ? "" : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [headerRow, ...dataRows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\n");
}
