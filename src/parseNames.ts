// Accepts a plain name-per-line list or a simple CSV export (name in the
// first column) - good enough for "paste from a spreadsheet" without
// pulling in a full CSV parser.
export function parseNamesFile(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim() ?? "")
    .filter((name) => name.length > 0);
}

export function parseNamesText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((name) => name.length > 0);
}
