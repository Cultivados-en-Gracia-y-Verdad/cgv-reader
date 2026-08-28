import { useEffect, useMemo, useRef, useState } from "react";
import type { BibleVerse } from "cgv-bible";
import {
  CGV_DATASET_PROVENANCE,
  READER_BOOKS,
  getReaderBookInfo,
  readBibleVersion,
  readReaderBook,
  readerBookHasLbfStructure,
  subscribeBibleVersion,
  subscribeReaderBook,
  workshopProgressKeys,
  writeReaderBook,
  type BibleVersionId,
  type ReaderBookId
} from "@cgv/core";
import { useUiLanguage } from "../core/UiLanguageContext";
import {
  loadLbfReaderVerseParts,
  loadReaderBook,
  type ReaderBook,
  type ReaderVersePart
} from "./reader-data";

interface ReaderNoteAnchor {
  kind: "lbf-word";
  wordIndex: number;
  surface: string;
  sourceTokenIds: string[];
  alignmentUnitIds: string[];
}

interface ReaderNote {
  id: string;
  target: string;
  verseTarget?: string;
  label: string;
  text: string;
  updatedAt: string;
  progressSchemaVersion?: 2;
  datasetId?: string;
  datasetVersion?: string;
  bibleVersion?: BibleVersionId;
  anchor?: ReaderNoteAnchor;
}

interface NoteTarget {
  key: string;
  verseTarget: string;
  label: string;
  bibleVersion: BibleVersionId;
  anchor?: ReaderNoteAnchor;
}

function verseKey(verse: BibleVerse): string {
  return `${verse.book}.${verse.chapter}.${verse.verse}`;
}

function verseLabel(verse: BibleVerse): string {
  return `${verse.book} ${verse.chapter}:${verse.verse}`;
}

function targetContainsVerse(note: ReaderNote, key: string): boolean {
  if (note.verseTarget) return note.verseTarget === key;
  const [startRaw, endRaw] = note.target.split("--");
  const start = startRaw.split("#")[0];
  const end = endRaw?.split("#")[0];
  if (!end) return start === key;
  return key >= start && key <= end;
}

function noteVerseTarget(note: ReaderNote): string {
  return note.verseTarget ?? note.target.split("--")[0].split("#")[0];
}

function notesStorageKey(bookId: ReaderBookId): string {
  return workshopProgressKeys(bookId).readerNotes;
}

function noteBelongsToBook(target: string, bookDisplayName: string): boolean {
  const start = target.split("--")[0]?.trim() ?? "";
  if (!start) return false;
  return start === bookDisplayName || start.startsWith(`${bookDisplayName}.`);
}

function readNotes(bookId: ReaderBookId): ReaderNote[] {
  try {
    const stored = window.localStorage.getItem(notesStorageKey(bookId));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function makeNoteId(): string {
  if ("crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Pure encounter with the text — reading and margin notes only. No path out
// to Observer's structural tools lives here; that seam is the R/O toggle one
// level up (see ../ReaderApp.tsx), not a jump-button inside the page itself.
export default function ReaderView() {
  const { t } = useUiLanguage();
  const [bibleVersion, setBibleVersion] = useState<BibleVersionId>(() => readBibleVersion());
  const [bookId, setBookId] = useState<ReaderBookId>(() => readReaderBook());
  const [book, setBook] = useState<ReaderBook | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notes, setNotes] = useState<ReaderNote[]>(() => readNotes(readReaderBook()));
  const [activeTarget, setActiveTarget] = useState<NoteTarget | null>(null);
  const [draft, setDraft] = useState("");
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => subscribeBibleVersion(setBibleVersion), []);
  useEffect(() => subscribeReaderBook(setBookId), []);

  useEffect(() => {
    let cancelled = false;
    setBook(null);
    setLoadError(null);
    setActiveTarget(null);
    setNotes(readNotes(bookId));

    void loadReaderBook(bookId, bibleVersion)
      .then(next => {
        if (!cancelled) setBook(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, bibleVersion]);

  useEffect(() => {
    // Do not persist another book's notes into this book's key during the
    // book-switch render (old notes briefly remain until the load effect runs).
    const bookName = getReaderBookInfo(bookId).displayName;
    if (notes.some(note => note.target && !noteBelongsToBook(note.target, bookName))) {
      return;
    }
    window.localStorage.setItem(notesStorageKey(bookId), JSON.stringify(notes));
  }, [bookId, notes]);

  useEffect(() => {
    if (!activeTarget) return;
    const existing = notes.find(note => note.target === activeTarget.key);
    setDraft(existing?.text ?? "");
    window.setTimeout(() => noteInputRef.current?.focus(), 60);
  }, [activeTarget, notes]);

  const chapters = useMemo(() => {
    if (!book) return [] as Array<[number, BibleVerse[]]>;
    const grouped = new Map<number, BibleVerse[]>();
    for (const verse of book.verses) {
      const chapter = grouped.get(verse.chapter) ?? [];
      chapter.push(verse);
      grouped.set(verse.chapter, chapter);
    }
    return Array.from(grouped.entries());
  }, [book]);

  const notesByVerse = useMemo(() => {
    const grouped = new Map<string, ReaderNote[]>();
    if (!book) return grouped;
    for (const verse of book.verses) {
      const key = verseKey(verse);
      grouped.set(
        key,
        notes.filter(note => targetContainsVerse(note, key))
      );
    }
    return grouped;
  }, [book, notes]);

  const wordNotesEnabled = Boolean(
    book && book.version === "LBF" && readerBookHasLbfStructure(book.id)
  );

  function openVerseNote(verse: BibleVerse) {
    const key = verseKey(verse);
    setActiveTarget({ key, verseTarget: key, label: verseLabel(verse), bibleVersion: book?.version ?? bibleVersion });
  }

  function wordTargetKey(verse: BibleVerse, part: ReaderVersePart): string {
    const sourceIds = part.sourceTokenIds?.join("+") || "unaligned";
    return `${verseKey(verse)}#LBF:${CGV_DATASET_PROVENANCE.gitCommit}:${part.wordIndex}:${sourceIds}`;
  }

  function openWordNote(verse: BibleVerse, part: ReaderVersePart) {
    if (part.wordIndex === undefined) return;
    const key = wordTargetKey(verse, part);
    setActiveTarget({
      key,
      verseTarget: verseKey(verse),
      label: `${verseLabel(verse)} · «${part.text}»`,
      bibleVersion: "LBF",
      anchor: {
        kind: "lbf-word",
        wordIndex: part.wordIndex,
        surface: part.text,
        sourceTokenIds: part.sourceTokenIds ?? [],
        alignmentUnitIds: part.alignmentUnitIds ?? []
      }
    });
  }

  function openSavedNote(note: ReaderNote) {
    setActiveTarget({
      key: note.target,
      verseTarget: noteVerseTarget(note),
      label: note.label,
      bibleVersion: note.bibleVersion ?? book?.version ?? bibleVersion,
      anchor: note.anchor
    });
  }

  function saveDraft() {
    if (!activeTarget) return;

    const text = draft.trim();
    setNotes(current => {
      const withoutTarget = current.filter(note => note.target !== activeTarget.key);
      if (!text) return withoutTarget;
      return [
        ...withoutTarget,
        {
          id: current.find(note => note.target === activeTarget.key)?.id ?? makeNoteId(),
          target: activeTarget.key,
          verseTarget: activeTarget.verseTarget,
          label: activeTarget.label,
          text,
          updatedAt: new Date().toISOString(),
          progressSchemaVersion: 2,
          datasetId: CGV_DATASET_PROVENANCE.id,
          datasetVersion: CGV_DATASET_PROVENANCE.gitCommit,
          bibleVersion: activeTarget.bibleVersion,
          anchor: activeTarget.anchor
        }
      ];
    });
    setActiveTarget(null);
    setDraft("");
  }

  function removeActiveNote() {
    if (!activeTarget) return;
    setNotes(current => current.filter(note => note.target !== activeTarget.key));
    setActiveTarget(null);
    setDraft("");
  }

  return (
    <main className="reader-shell">
      <article className="reader-page" aria-label={t.readerKicker}>
        <header className="reader-header">
          <p className="reader-kicker">{t.readerKicker}</p>
          <label className="reader-book-select">
            <span className="visually-hidden">{t.prefBook}</span>
            <select
              value={bookId}
              onChange={event => writeReaderBook(event.target.value as ReaderBookId)}
              aria-label={t.prefBook}
            >
              {READER_BOOKS.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </label>
          <h1>{book?.title ?? "…"}</h1>
          <p className="reader-version">{book?.versionLabel ?? ""}</p>
          {wordNotesEnabled ? <p className="reader-word-note-hint">{t.wordNotesHint}</p> : null}
        </header>

        {loadError ? <p className="reader-load-error">{loadError}</p> : null}
        {!book && !loadError ? <p className="reader-loading">{t.loadingBook}</p> : null}

        {book ? (
          <div className="reader-book">
            {chapters.map(([chapter, verses]) => (
              <section className="reader-chapter" key={chapter} aria-labelledby={`chapter-${chapter}`}>
                <h2 id={`chapter-${chapter}`}>{chapter}</h2>
                {verses.map(verse => {
                  const key = verseKey(verse);
                  const verseNotes = notesByVerse.get(key) ?? [];

                  return (
                    <div
                      className={`reader-line${activeTarget?.verseTarget === key ? " reader-line--active" : ""}`}
                      key={key}
                    >
                      <button
                        type="button"
                        className={`reader-note-mark${verseNotes.length ? " reader-note-mark--has-note" : ""}`}
                        onClick={() => openVerseNote(verse)}
                        aria-label={t.noteFor(verseLabel(verse))}
                      >
                        {verseNotes.length ? "*" : "+"}
                      </button>
                      <p className="reader-verse" onClick={() => openVerseNote(verse)}>
                        <sup>{verse.verse}</sup>
                        {wordNotesEnabled
                          ? loadLbfReaderVerseParts(book.id, verse).map((part, index) => {
                              if (part.wordIndex === undefined) {
                                return <span key={`text-${index}`}>{part.text}</span>;
                              }
                              const target = wordTargetKey(verse, part);
                              const hasNote = notes.some(note => note.target === target);
                              const isActive = activeTarget?.key === target;
                              return (
                                <button
                                  type="button"
                                  className={`reader-word${hasNote ? " reader-word--has-note" : ""}${isActive ? " reader-word--active" : ""}`}
                                  key={`word-${part.wordIndex}`}
                                  onClick={event => {
                                    event.stopPropagation();
                                    openWordNote(verse, part);
                                  }}
                                  aria-label={t.noteFor(`${verseLabel(verse)}, ${part.text}`)}
                                >
                                  {part.text}
                                </button>
                              );
                            })
                          : verse.text}
                      </p>
                      <aside className="reader-margin-notes" aria-label={t.notesFor(verseLabel(verse))}>
                        {verseNotes.map(note => (
                          <button
                            type="button"
                            className="reader-note"
                            key={note.id}
                            onClick={() => openSavedNote(note)}
                          >
                            {note.anchor ? (
                              <span className="reader-note-anchor">«{note.anchor.surface}»</span>
                            ) : null}
                            <span>{note.text}</span>
                          </button>
                        ))}
                      </aside>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        ) : null}
      </article>

      {activeTarget && (
        <div className="reader-note-panel" role="dialog" aria-label={t.noteFor(activeTarget.label)}>
          <div className="reader-note-panel-inner">
            <p>{activeTarget.label}</p>
            <textarea
              ref={noteInputRef}
              value={draft}
              onChange={event => setDraft(event.currentTarget.value)}
              placeholder={t.notePlaceholder}
            />
            <div className="reader-note-actions">
              <button type="button" onClick={() => setActiveTarget(null)}>
                {t.close}
              </button>
              <button type="button" onClick={removeActiveNote}>
                {t.delete}
              </button>
              <button type="button" className="reader-note-save" onClick={saveDraft}>
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
