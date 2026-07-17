import { normalizeReferenceText } from "./normalize";

function titleCaseBookName(value: string): string {
  return value.replace(/\b\p{L}/gu, letter => letter.toUpperCase());
}

export function buildBibleBookAliases(book: string): string[] {
  const aliases = new Set([book, titleCaseBookName(book)]);
  const spacedNumberMatch = book.match(/^([123])\s*(.+)$/i);

  if (spacedNumberMatch) {
    const number = spacedNumberMatch[1];
    const name = titleCaseBookName(spacedNumberMatch[2].trim());
    aliases.add(`${number}${name}`);
    aliases.add(`${number} ${name}`);
  }

  const normalized = normalizeReferenceText(book);
  const accentAliases: Record<string, string[]> = {
    efesios: ["Efésios"],
    galatas: ["Gálatas"],
    genesis: ["Génesis"]
  };

  for (const alias of accentAliases[normalized] || []) {
    aliases.add(alias);
  }

  return Array.from(aliases);
}
