import { readReaderNotes } from "./compiler-gathering";

// Live R→C bridge: shows Reader margin notes. Generate folds them in as
// Writer entries (`> …`) under the matching verse — never as Observer `*`.
export default function ReaderNotesPanel() {
  const notes = readReaderNotes().filter(note => note.text.trim());

  return (
    <section className="compiler-tool" aria-label="Reader notes">
      <h2>Reader notes</h2>
      <p className="compiler-tool-note">
        Notes written in Reader. On Generate they become Writer entries (
        <code>&gt; …</code>) under the verse — separate from Observer grammar <code>*</code>{" "}
        inserts and from Scripture markers (<code>####</code> / <code>-</code> / <code>+</code>).
      </p>
      {notes.length ? (
        <ul className="compiler-notes-list">
          {notes.map(note => (
            <li key={note.id}>
              <span className="compiler-occurrence-ref">{note.label || note.target}</span>
              <span className="compiler-note-text">{note.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="compiler-tool-note">No Reader notes in this browser yet.</p>
      )}
    </section>
  );
}
