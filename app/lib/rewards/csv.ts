/** Minimal RFC-4180 CSV parser (handles quotes, commas, CRLF). Returns rows of strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Finds a column index whose header matches any of the candidate substrings (case-insensitive). */
export function findCol(headers: string[], candidates: string[]): number {
  const h = headers.map((x) => x.trim().toLowerCase());
  for (const c of candidates) {
    const i = h.findIndex((x) => x === c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = h.findIndex((x) => x.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}
