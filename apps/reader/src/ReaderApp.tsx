import { useEffect, useState } from "react";
import {
  READER_BOOKS,
  countExistingProgressKeys,
  downloadProgressFile,
  maybeRestoreFromAutosave,
  readCapabilities,
  readAutosaveBackup,
  readerBookIdFromWorkshopSlug,
  recoverGreekConfirmationsFromAutosave,
  setCapability,
  startProgressAutosave,
  workshopProgressKeys,
  workshopStorageSlug,
  writeReaderBook,
  type CapabilityState,
  type ReaderBookId
} from "@cgv/core";
import CompilerShell from "./compiler/CompilerShell";
import PreferencesPanel from "./core/PreferencesPanel";
import ProgressControls from "./core/ProgressControls";
import { ThemeProvider } from "./core/ThemeContext";
import { UiLanguageProvider, useUiLanguage } from "./core/UiLanguageContext";
import ObserverShell from "./observer/ObserverShell";
import ReaderView from "./reader/ReaderView";

type Zone = "reader" | "observer" | "compiler";

interface SavedReaderNote {
  id: string;
  label: string;
  text: string;
  source?: "local" | "backup";
  updatedAt?: string;
}

interface SavedNoteGroup {
  bookId: ReaderBookId | null;
  bookName: string;
  notes: SavedReaderNote[];
}

const OBSERVER_HASHES = new Set(["o", "clause", "workshop", "interlinear"]);
const COMPILER_HASH = "c";

function readZoneFromHash(capabilities: CapabilityState): Zone {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === COMPILER_HASH && capabilities.compiler) return "compiler";
  if (OBSERVER_HASHES.has(hash) && capabilities.observer) return "observer";
  return "reader";
}

function parseSavedNotes(value: unknown): SavedReaderNote[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((note): note is SavedReaderNote => {
      return (
        note &&
        typeof note === "object" &&
        typeof note.id === "string" &&
        typeof note.label === "string" &&
        typeof note.text === "string" &&
        note.text.trim().length > 0
      );
    })
    .map(note => ({
      ...note,
      text: note.text.trim()
    }));
}

function addNotesToRecovery(
  groups: Map<string, SavedNoteGroup>,
  bookSlug: string,
  rawNotes: unknown,
  source: "local" | "backup"
): void {
  const notes = parseSavedNotes(rawNotes);
  if (!notes.length) return;

  const bookId = readerBookIdFromWorkshopSlug(bookSlug);
  const bookInfo = bookId ? READER_BOOKS.find(book => book.id === bookId) : null;
  const groupKey = bookId ?? bookSlug;
  const group =
    groups.get(groupKey) ??
    ({
      bookId,
      bookName: bookInfo?.displayName ?? bookSlug,
      notes: []
    } satisfies SavedNoteGroup);

  const seen = new Set(group.notes.map(note => `${note.label}|${note.text}`));
  for (const note of notes) {
    const key = `${note.label}|${note.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    group.notes.push({
      ...note,
      source
    });
  }

  groups.set(groupKey, group);
}

function addNotesFromJson(groups: Map<string, SavedNoteGroup>, bookSlug: string, raw: string | null): void {
  if (!raw) return;
  try {
    addNotesToRecovery(groups, bookSlug, JSON.parse(raw), "local");
  } catch {
    /* ignore corrupt note stores */
  }
}

async function readSavedReaderNotes(): Promise<SavedNoteGroup[]> {
  const groups = new Map<string, SavedNoteGroup>();

  for (const book of READER_BOOKS) {
    addNotesFromJson(groups, workshopStorageSlug(book.id), window.localStorage.getItem(workshopProgressKeys(book.id).readerNotes));
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    const match = key?.match(/^the-reader:([^:]+):notes$/);
    if (!match) continue;
    addNotesFromJson(groups, match[1]!, window.localStorage.getItem(key));
  }

  try {
    const backup = await readAutosaveBackup();
    const data = backup?.data ?? {};
    for (const [key, value] of Object.entries(data)) {
      const match = key.match(/^the-reader:([^:]+):notes$/);
      if (!match) continue;
      addNotesToRecovery(groups, match[1], value, "backup");
    }
  } catch {
    /* IndexedDB can be unavailable in some browser privacy modes. */
  }

  return Array.from(groups.values()).map(group => ({
    ...group,
    notes: group.notes.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
  }));
}

function ReaderAppInner() {
  const { t } = useUiLanguage();
  const [capabilities, setCapabilities] = useState<CapabilityState>(() => readCapabilities());
  const [zone, setZone] = useState<Zone>(() => readZoneFromHash(readCapabilities()));
  const [progressHint, setProgressHint] = useState<string | null>(null);
  const [progressCount, setProgressCount] = useState(0);
  const [showSavedNotes, setShowSavedNotes] = useState(false);
  const [savedNotes, setSavedNotes] = useState<SavedNoteGroup[]>([]);

  useEffect(() => {
    const onHashChange = () => setZone(readZoneFromHash(capabilities));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [capabilities]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const restored = await maybeRestoreFromAutosave();
      if (cancelled) return;
      if (restored) {
        window.location.reload();
        return;
      }

      const recoveredConfirmations = await recoverGreekConfirmationsFromAutosave();
      if (cancelled) return;
      if (recoveredConfirmations > 0) {
        window.location.reload();
        return;
      }

      await startProgressAutosave();
      if (cancelled) return;

      const count = countExistingProgressKeys();
      if (count > 0) {
        setProgressCount(count);
        setProgressHint("show");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function openReader() {
    window.history.pushState(null, "", window.location.pathname);
    setZone("reader");
  }

  function openObserver() {
    if (!capabilities.observer) return;
    if (!OBSERVER_HASHES.has(window.location.hash.replace(/^#/, ""))) {
      window.location.hash = "workshop";
    }
    setZone("observer");
  }

  function openCompiler() {
    if (!capabilities.compiler) return;
    window.location.hash = COMPILER_HASH;
    setZone("compiler");
  }

  function toggleCompilerUnlock() {
    const next = setCapability("compiler", !capabilities.compiler);
    setCapabilities(next);
    if (!next.compiler && zone === "compiler") openReader();
  }

  async function openSavedNotes() {
    setSavedNotes(await readSavedReaderNotes());
    setShowSavedNotes(true);
  }

  function openBookFromRecovery(bookId: ReaderBookId) {
    writeReaderBook(bookId);
    openReader();
    setShowSavedNotes(false);
    setProgressHint(null);
  }

  return (
    <>
      <div className="app-chrome" aria-label={t.chromeAria}>
        <div className="app-chrome-left">
          <PreferencesPanel />
        </div>
        <div className="zone-toggle" role="tablist" aria-label={t.zonesAria}>
          <button
            type="button"
            className={`zone-toggle-option${zone === "reader" ? " zone-toggle-option--active" : ""}`}
            onClick={openReader}
            role="tab"
            aria-selected={zone === "reader"}
          >
            {t.reader}
          </button>
          {capabilities.observer ? (
            <button
              type="button"
              className={`zone-toggle-option${zone === "observer" ? " zone-toggle-option--active" : ""}`}
              onClick={openObserver}
              role="tab"
              aria-selected={zone === "observer"}
            >
              {t.observer}
            </button>
          ) : null}
          {capabilities.compiler ? (
            <button
              type="button"
              className={`zone-toggle-option${zone === "compiler" ? " zone-toggle-option--active" : ""}`}
              onClick={openCompiler}
              role="tab"
              aria-selected={zone === "compiler"}
            >
              {t.compiler}
            </button>
          ) : null}
        </div>

        {(zone === "observer" || zone === "compiler") && <ProgressControls />}
      </div>

      {progressHint && zone === "reader" ? (
        <p className="migration-banner" role="status">
          <span className="migration-banner-copy">{t.progressHint(progressCount)}</span>
          <span className="migration-banner-actions">
            <button type="button" className="migration-banner-action" onClick={() => void openSavedNotes()}>
              {t.recoverNotes}
            </button>
            <button type="button" className="migration-banner-action" onClick={() => downloadProgressFile()}>
              {t.downloadBackup}
            </button>
            <button type="button" className="migration-banner-dismiss" onClick={() => setProgressHint(null)}>
              {t.dismiss}
            </button>
          </span>
        </p>
      ) : null}

      {showSavedNotes ? (
        <div className="reader-note-panel reader-recovery-panel" role="dialog" aria-label={t.recoveredNotesTitle}>
          <div className="reader-note-panel-inner reader-recovery-panel-inner">
            <div className="reader-recovery-header">
              <p>{t.recoveredNotesTitle}</p>
              <button type="button" onClick={() => setShowSavedNotes(false)}>
                {t.close}
              </button>
            </div>
            {savedNotes.length ? (
              <div className="reader-recovery-list">
                {savedNotes.map(group => {
                  const bookId = group.bookId;
                  return (
                    <section className="reader-recovery-book" key={bookId ?? group.bookName}>
                      <div className="reader-recovery-book-header">
                        <h2>{group.bookName}</h2>
                        {bookId ? (
                          <button type="button" onClick={() => openBookFromRecovery(bookId)}>
                            {t.openBook(group.bookName)}
                          </button>
                        ) : null}
                      </div>
                      {group.notes.map(note => (
                        <article className="reader-recovery-note" key={note.id}>
                          <h3>{note.label}</h3>
                          <p>{note.text}</p>
                        </article>
                      ))}
                    </section>
                  );
                })}
              </div>
            ) : (
              <p className="reader-recovery-empty">{t.recoveredNotesEmpty}</p>
            )}
          </div>
        </div>
      ) : null}

      {/* Temporary teacher unlock for local development — replace with real entitlements later. */}
      {zone === "reader" ? (
        <button type="button" className="teacher-unlock" onClick={toggleCompilerUnlock}>
          {capabilities.compiler ? t.lockCompiler : t.unlockCompiler}
        </button>
      ) : null}

      {zone === "observer" ? (
        <ObserverShell />
      ) : zone === "compiler" ? (
        <CompilerShell />
      ) : (
        <ReaderView />
      )}
    </>
  );
}

/**
 * The Reader is the app.
 * Observer is an optional unlock (student workshop).
 * Compiler is a specialized unlock (CGV teachers).
 * Writer stays a separate markdown editor.
 */
export default function ReaderApp() {
  return (
    <ThemeProvider>
      <UiLanguageProvider>
        <ReaderAppInner />
      </UiLanguageProvider>
    </ThemeProvider>
  );
}
