export type {
  BibleFile,
  BibleIndex,
  BibleIndexStats,
  BibleVerse,
  ResolveBibleReferenceResult
} from "./types";
export type { InlineBibleMatch } from "./inline-references";

export { buildBibleBookAliases } from "./aliases";
export { buildBibleIndex, getBibleIndexStats, isEmptyBibleIndex } from "./build-index";
export {
  formatBiblePopupText,
  formatBibleVerseLabel,
  formatScriptureLine
} from "./format";
export { bibleFileExtension, normalizeBibleVersion, normalizeReferenceText } from "./normalize";
export { parseNblaContent } from "./parse-nbla";
export { parseReferenceParts } from "./parse-reference";
export { resolveBibleReference } from "./resolve";
export {
  findInlineBibleReferenceMatches,
  getInlineBibleReferenceAtPosition
} from "./inline-references";
