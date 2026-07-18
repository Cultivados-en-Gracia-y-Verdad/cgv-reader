// Interface language preference — independent of Bible version/text
// (cgv-product-suite-spec.md: Bible version, Language, and Font are separate).

import { LANGUAGE_KEY } from "./progress-keys";

export type UiLanguage = "en" | "es";

const LISTENERS = new Set<(language: UiLanguage) => void>();

export function readUiLanguage(): UiLanguage {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_KEY);
    return stored === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

export function writeUiLanguage(language: UiLanguage): void {
  window.localStorage.setItem(LANGUAGE_KEY, language);
  for (const listener of LISTENERS) listener(language);
}

/** Subscribe to language changes (same-tab). Returns unsubscribe. */
export function subscribeUiLanguage(listener: (language: UiLanguage) => void): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}
