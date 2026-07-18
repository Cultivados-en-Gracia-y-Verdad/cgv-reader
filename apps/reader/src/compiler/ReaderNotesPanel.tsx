import { readReaderNotes } from "./compiler-gathering";

// Live R→C bridge: shows Reader margin notes. Generate folds them in as
// `Nota (Lector): …` under the matching verse — never as Observer `*` notes.
export default function ReaderNotesPanel() {
  const notes = readReaderNotes().filter(note => note.text.trim());

  return (
    <section className="compiler-tool" aria-label="Reader notes">
      <h2>Reader notes</h2>
      <p className="compiler-tool-note">
        Notes written in Reader for Tito. On Generate they become plain{" "}
        <code>Nota (Lector):</code> lines under the verse — kept separate from Observer grammar{" "}
        <code>*</code> comments.
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
