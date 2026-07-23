import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BIBLE_VERSIONS,
  READER_BOOKS,
  readBibleVersion,
  readReaderBook,
  readerBookHasLbf,
  subscribeBibleVersion,
  subscribeReaderBook,
  writeBibleVersion,
  writeReaderBook,
  type BibleVersionId,
  type ReaderBookId
} from "@cgv/core";
import { useTheme, type ThemePreference } from "./ThemeContext";
import { useUiLanguage } from "./UiLanguageContext";

/**
 * Preferences: interface language + Reader book + Bible version.
 * Bible version / book only change Reader text — never Observer's LBF/MorphGNT stack.
 */
export default function PreferencesPanel() {
  const { t, language, setLanguage } = useUiLanguage();
  const { preference: theme, setPreference: setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [bibleVersion, setBibleVersion] = useState<BibleVersionId>(() => readBibleVersion());
  const [bookId, setBookId] = useState<ReaderBookId>(() => readReaderBook());
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribeBibleVersion(setBibleVersion), []);
  useEffect(() => subscribeReaderBook(setBookId), []);

  const versionOptions = useMemo(() => {
    if (readerBookHasLbf(bookId)) return BIBLE_VERSIONS;
    return BIBLE_VERSIONS.filter(entry => entry.id !== "LBF");
  }, [bookId]);

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

  function handleBookChange(next: ReaderBookId) {
    writeReaderBook(next);
    setBookId(next);
    if (bibleVersion === "LBF" && !readerBookHasLbf(next)) {
      writeBibleVersion("NBLA");
      setBibleVersion("NBLA");
    }
  }

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
        aria-label={t.preferences}
        title={t.preferences}
        onClick={() => setOpen(current => !current)}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path
            d="M8.2 2.4h3.6l.35 1.7a5.8 5.8 0 0 1 1.35.78l1.65-.7 1.8 3.1-1.3 1.25c.1.45.15.9.15 1.37s-.05.92-.15 1.37l1.3 1.25-1.8 3.1-1.65-.7a5.8 5.8 0 0 1-1.35.78l-.35 1.7H8.2l-.35-1.7a5.8 5.8 0 0 1-1.35-.78l-1.65.7-1.8-3.1 1.3-1.25A6.2 6.2 0 0 1 4.2 10c0-.47.05-.92.15-1.37L3.05 7.38l1.8-3.1 1.65.7c.4-.32.86-.58 1.35-.78L8.2 2.4Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="10" r="2.35" stroke="currentColor" strokeWidth="1.35" />
        </svg>
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
            <span>{t.prefTheme}</span>
            <select
              value={theme}
              onChange={event => setTheme(event.target.value as ThemePreference)}
            >
              <option value="system">{t.themeSystem}</option>
              <option value="light">{t.themeLight}</option>
              <option value="dark">{t.themeDark}</option>
            </select>
          </label>
          <label className="prefs-field">
            <span>{t.prefBook}</span>
            <select
              value={bookId}
              onChange={event => handleBookChange(event.target.value as ReaderBookId)}
            >
              {READER_BOOKS.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="prefs-field">
            <span>{t.prefBible}</span>
            <select
              value={bibleVersion === "LBF" && !readerBookHasLbf(bookId) ? "NBLA" : bibleVersion}
              onChange={event => handleBibleChange(event.target.value as BibleVersionId)}
            >
              {versionOptions.map(entry => (
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
