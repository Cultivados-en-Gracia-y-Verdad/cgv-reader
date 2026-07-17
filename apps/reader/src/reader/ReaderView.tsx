import { useEffect, useMemo, useRef, useState } from "react";
import type { BibleVerse } from "cgv-bible";
import { loadTitus } from "./reader-data";

interface ReaderNote {
  id: string;
  target: string;
  label: string;
  text: string;
  updatedAt: string;
}

interface NoteTarget {
  key: string;
  label: string;
}

const NOTES_KEY = "the-reader:titus:notes";
const LANGUAGE_KEY = "the-reader:titus:language";

// Interface language — independent of Bible version/text (per
// cgv-product-suite-spec.md's Reader preferences: Bible version, Language,
// and Font are separate knobs). This only ever changes Reader's own chrome
// (labels, button text, placeholders) — never the loaded Bible text itself.
type Language = "en" | "es";

const STRINGS: Record<Language, {
  kicker: string;
  notePlaceholder: string;
  close: string;
  delete: string;
  save: string;
  noteFor: (label: string) => string;
  notesFor: (label: string) => string;
}> = {
  en: {
    kicker: "The Reader",
    notePlaceholder: "Write a short note...",
    close: "Close",
    delete: "Delete",
    save: "Save",
    noteFor: label => `Note for ${label}`,
    notesFor: label => `Notes for ${label}`
  },
  es: {
    kicker: "El Lector",
    notePlaceholder: "Escriba una nota breve...",
    close: "Cerrar",
    delete: "Borrar",
    save: "Guardar",
    noteFor: label => `Nota para ${label}`,
    notesFor: label => `Notas de ${label}`
  }
};

function readLanguage(): Language {
  const stored = window.localStorage.getItem(LANGUAGE_KEY);
  return stored === "es" ? "es" : "en";
}

function verseKey(verse: BibleVerse): string {
  return `${verse.book}.${verse.chapter}.${verse.verse}`;
}

function verseLabel(verse: BibleVerse): string {
  return `${verse.book} ${verse.chapter}:${verse.verse}`;
}

function targetContainsVerse(target: string, key: string): boolean {
  const [start, end] = target.split("--");
  if (!end) return target === key;
  return key >= start && key <= end;
}

function readNotes(): ReaderNote[] {
  try {
    const stored = window.localStorage.getItem(NOTES_KEY);
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
  const book = useMemo(() => loadTitus(), []);
  const [notes, setNotes] = useState<ReaderNote[]>(readNotes);
  const [language, setLanguage] = useState<Language>(readLanguage);
  const t = STRINGS[language];
  const [activeTarget, setActiveTarget] = useState<NoteTarget | null>(null);
  const [draft, setDraft] = useState("");
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!activeTarget) return;
    const existing = notes.find(note => note.target === activeTarget.key);
    setDraft(existing?.text ?? "");
    window.setTimeout(() => noteInputRef.current?.focus(), 60);
  }, [activeTarget, notes]);

  const chapters = useMemo(() => {
    const grouped = new Map<number, BibleVerse[]>();
    for (const verse of book.verses) {
      const chapter = grouped.get(verse.chapter) ?? [];
      chapter.push(verse);
      grouped.set(verse.chapter, chapter);
    }
    return Array.from(grouped.entries());
  }, [book.verses]);

  const notesByVerse = useMemo(() => {
    const grouped = new Map<string, ReaderNote[]>();
    for (const verse of book.verses) {
      const key = verseKey(verse);
      grouped.set(
        key,
        notes.filter(note => targetContainsVerse(note.target, key))
      );
    }
    return grouped;
  }, [book.verses, notes]);

  function openVerseNote(verse: BibleVerse) {
    setActiveTarget({ key: verseKey(verse), label: verseLabel(verse) });
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
          label: activeTarget.label,
          text,
          updatedAt: new Date().toISOString()
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
      <div className="language-toggle" role="tablist" aria-label="Interface language">
        <button
          type="button"
          className={`language-toggle-option${language === "en" ? " language-toggle-option--active" : ""}`}
          onClick={() => setLanguage("en")}
          role="tab"
          aria-selected={language === "en"}
        >
          EN
        </button>
        <button
          type="button"
          className={`language-toggle-option${language === "es" ? " language-toggle-option--active" : ""}`}
          onClick={() => setLanguage("es")}
          role="tab"
          aria-selected={language === "es"}
        >
          ES
        </button>
      </div>
      <article className="reader-page" aria-label={t.kicker}>
        <header className="reader-header">
          <p className="reader-kicker">{t.kicker}</p>
          <h1>{book.title}</h1>
          <p className="reader-version">{book.version}</p>
        </header>

        <div className="reader-book">
          {chapters.map(([chapter, verses]) => (
            <section className="reader-chapter" key={chapter} aria-labelledby={`chapter-${chapter}`}>
              <h2 id={`chapter-${chapter}`}>{chapter}</h2>
              {verses.map(verse => {
                const key = verseKey(verse);
                const verseNotes = notesByVerse.get(key) ?? [];

                return (
                  <div
                    className={`reader-line${activeTarget?.key === key ? " reader-line--active" : ""}`}
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
                      {verse.text}
                    </p>
                    <aside className="reader-margin-notes" aria-label={t.notesFor(verseLabel(verse))}>
                      {verseNotes.map(note => (
                        <button
                          type="button"
                          className="reader-note"
                          key={note.id}
                          onClick={() => setActiveTarget({ key: note.target, label: note.label })}
                        >
                          {note.text}
                        </button>
                      ))}
                    </aside>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
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
