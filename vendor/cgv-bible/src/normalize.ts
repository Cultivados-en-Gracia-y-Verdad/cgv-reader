export function normalizeReferenceText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function normalizeBibleVersion(value?: string | null): string {
  const cleaned = String(value || "NBLA")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .toUpperCase();
  return cleaned || "NBLA";
}

export function bibleFileExtension(version: string): string {
  return `.${normalizeBibleVersion(version).toLowerCase()}.md`;
}
