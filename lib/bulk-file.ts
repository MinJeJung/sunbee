import type { Row } from "read-excel-file";

export function parseCsvText(text: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    const next = text[index + 1] ?? "";
    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function valueText(value: Row[number] | undefined): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

export function matrixToRecords(matrix: readonly (readonly Row[number][])[]): readonly Readonly<Record<string, unknown>>[] {
  const header = matrix[0]?.map((value) => valueText(value)) ?? [];
  return matrix.slice(1).map((values) => {
    const record: Record<string, unknown> = {};
    header.forEach((key, index) => {
      if (key) record[key] = valueText(values[index]);
    });
    return record;
  }).filter((record) => Object.values(record).some(Boolean));
}
