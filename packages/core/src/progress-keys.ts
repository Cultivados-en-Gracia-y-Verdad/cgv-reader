// Lab-compatible localStorage keys from cgv-reader.
// Suite keeps these identical so Titus progress migrates without re-entry.

export interface ProgressKeyInfo {
  key: string;
  label: string;
}

export const PROGRESS_KEYS: ProgressKeyInfo[] = [
  { key: "the-reader:titus:notes", label: "Notes" },
  { key: "o-prototype:titus:finite-verb-marks", label: "Finite verb marks (Brick 1)" },
  { key: "roots:titus:brick2:mood:imperativeCandidates", label: "Command mood marks" },
  { key: "roots:titus:brick2c:mood:statementCandidates", label: "Statement mood marks" },
  { key: "roots:titus:brick3:mood:subjunctiveCandidates", label: "Subjunctive mood marks" },
  { key: "roots:titus:brick3c:mood:optativeCandidates", label: "Optative mood marks" },
  { key: "roots:titus:brick2b:commandRecipients", label: "Command recipients" },
  { key: "roots:titus:brick3:dependentThoughtIntroducers", label: "Dependent introducer marks" },
  { key: "the-reader:spanish-clause-builder:titus:v3", label: "Clause spans" },
  { key: "the-reader:spanish-clause-builder:titus:statement-command-review:v1", label: "Clause observations" },
  { key: "roots:titus:brick4:participleCandidates", label: "Participle marks (Brick 4)" },
  { key: "the-reader:spanish-clause-builder:titus:participles:v1", label: "Participle classifications" }
];

export const LANGUAGE_KEY = "the-reader:titus:language";
export const NOTES_KEY = "the-reader:titus:notes";
// Bible version key lives in bible-version.ts (BIBLE_VERSION_KEY).
