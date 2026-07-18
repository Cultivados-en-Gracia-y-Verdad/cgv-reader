import { useEffect, useId, useRef, useState } from "react";
import {
  BIBLE_VERSIONS,
  readBibleVersion,
  subscribeBibleVersion,
  writeBibleVersion,
  type BibleVersionId
} from "@cgv/core";
import { useUiLanguage } from "./UiLanguageContext";

/**
 * Preferences: interface language + Reader Bible version.
 * Bible version only changes Reader text — never Observer's LBF/MorphGNT stack.
 */
export default function PreferencesPanel() {
  const { t, language, setLanguage } = useUiLanguage();
  const [open, setOpen] = useState(false);
  const [bibleVersion, setBibleVersion] = useState<BibleVersionId>(() => readBibleVersion());
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribeBibleVersion(setBibleVersion), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleBibleChange(next: BibleVersionId) {
    writeBibleVersion(next);
    setBibleVersion(next);
  }

  return (
    <div className="prefs-root" ref={rootRef}>
      <button
        type="button"
        className={`prefs-toggle${open ? " prefs-toggle--open" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(current => !current)}
      >
        {t.preferences}
      </button>
      {open ? (
        <div className="prefs-panel" id={panelId} role="dialog" aria-label={t.preferences}>
          <label className="prefs-field">
            <span>{t.prefLanguage}</span>
            <select
              value={language}
              onChange={event => setLanguage(event.target.value === "es" ? "es" : "en")}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
          <label className="prefs-field">
            <span>{t.prefBible}</span>
            <select
              value={bibleVersion}
              onChange={event => handleBibleChange(event.target.value as BibleVersionId)}
            >
              {BIBLE_VERSIONS.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.label} — {entry.description}
                </option>
              ))}
            </select>
          </label>
          <p className="prefs-note">{t.prefBibleNote}</p>
        </div>
      ) : null}
    </div>
  );
}
