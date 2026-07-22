import { useEffect, useState } from "react";
import {
  addCompilerAttachment,
  lineTextAt,
  reattachCompilerAttachment,
  removeCompilerAttachment,
  type CompilerAttachment
} from "./compiler-gathering";
import { findOccurrencesByLemma, listAvailableLemmas, type WordOccurrence } from "./occurrences";

interface WordOccurrencesToolProps {
  markdown: string | null;
  selectedLine: number | null;
  onSelectLine: (lineNumber: number) => void;
  attachments: CompilerAttachment[];
  onAttachmentsChange: (attachments: CompilerAttachment[]) => void;
  lineCount: number;
}

export default function WordOccurrencesTool({
  markdown,
  selectedLine,
  onSelectLine,
  attachments,
  onAttachmentsChange,
  lineCount
}: WordOccurrencesToolProps) {
  const [lemmas, setLemmas] = useState<{ lemma: string; count: number }[]>([]);
  const [selectedLemma, setSelectedLemma] = useState("");
  const [results, setResults] = useState<WordOccurrence[] | null>(null);
  const [definitionText, setDefinitionText] = useState("");
  const [lineInput, setLineInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listAvailableLemmas().then(next => {
      if (!cancelled) setLemmas(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const targetLine = (() => {
    const typed = Number(lineInput);
    if (Number.isFinite(typed) && typed >= 1) return Math.floor(typed);
    return selectedLine;
  })();

  function handleFind(lemma: string) {
    setSelectedLemma(lemma);
    if (!lemma.trim()) {
      setResults(null);
      return;
    }
    void findOccurrencesByLemma(lemma).then(setResults);
  }

  function syncAttachments(next: CompilerAttachment[]) {
    onAttachmentsChange(next);
  }

  function anchorFor(lineNumber: number): string {
    if (!markdown) return "";
    return lineTextAt(markdown, lineNumber);
  }

  function handleAddDefinition() {
    const lemma = selectedLemma.trim();
    const text = definitionText.trim();
    if (!targetLine || !lemma || !text || !markdown) return;
    const anchorText = anchorFor(targetLine);
    if (!anchorText) return;
    onSelectLine(targetLine);
    syncAttachments(
      addCompilerAttachment({
        kind: "definition",
        lineNumber: targetLine,
        anchorText,
        lemma,
        text
      })
    );
    setDefinitionText("");
  }

  function handleAddXref(occurrence: WordOccurrence) {
    if (!targetLine || !markdown) return;
    const anchorText = anchorFor(targetLine);
    if (!anchorText) return;
    onSelectLine(targetLine);
    syncAttachments(
      addCompilerAttachment({
        kind: "xref",
        lineNumber: targetLine,
        anchorText,
        lemma: occurrence.lemma,
        text: "",
        reference: occurrence.reference,
        surfaceForm: occurrence.surfaceForm,
        spanishGloss: occurrence.spanishGloss
      })
    );
  }

  function handleRemove(id: string) {
    syncAttachments(removeCompilerAttachment(id));
  }

  function handleReattach(id: string) {
    if (!targetLine || !markdown) return;
    const anchorText = anchorFor(targetLine);
    if (!anchorText) return;
    onSelectLine(targetLine);
    syncAttachments(reattachCompilerAttachment(id, targetLine, anchorText));
  }

  const orphans = attachments.filter(item => item.lineNumber < 1);
  const placed = attachments.filter(item => item.lineNumber >= 1);

  return (
    <section className="compiler-tool" aria-label="Word occurrences">
      <h2>Word occurrences</h2>
      <p className="compiler-tool-note">
        Find a lemma across the NT, then pin a definition or cross-ref. Pins keep the target line&apos;s
        text so they rematch after Generate. Click a line in the preview, or type a line number.
      </p>

      <label className="compiler-tool-field">
        <span>Apply after line</span>
        <input
          type="number"
          min={1}
          max={Math.max(lineCount, 1)}
          value={lineInput || (selectedLine ?? "")}
          onChange={event => setLineInput(event.target.value)}
          placeholder={selectedLine ? String(selectedLine) : "click a line"}
        />
      </label>
      {targetLine ? (
        <p className="compiler-tool-note">Target: line {targetLine}</p>
      ) : (
        <p className="compiler-tool-note">Select a line in the preview first.</p>
      )}

      <label className="compiler-tool-field">
        <span>Pick a lemma</span>
        <select value={selectedLemma} onChange={event => handleFind(event.target.value)}>
          <option value="">— select —</option>
          {lemmas.map(entry => (
            <option key={entry.lemma} value={entry.lemma}>
              {entry.lemma} ({entry.count})
            </option>
          ))}
        </select>
      </label>

      <label className="compiler-tool-field">
        <span>Or type one directly</span>
        <input
          type="text"
          value={selectedLemma}
          onChange={event => handleFind(event.target.value)}
          placeholder="e.g. ἀπόστολος"
        />
      </label>

      <label className="compiler-tool-field">
        <span>Definition (optional)</span>
        <textarea
          value={definitionText}
          onChange={event => setDefinitionText(event.target.value)}
          rows={2}
          placeholder="Short gloss or working definition…"
        />
      </label>
      <button
        type="button"
        className="compiler-tool-action"
        onClick={handleAddDefinition}
        disabled={!targetLine || !selectedLemma.trim() || !definitionText.trim() || !markdown}
      >
        Pin definition after line
      </button>

      {results ? (
        results.length ? (
          <ul className="compiler-occurrence-list">
            {results.map((occurrence, index) => (
              <li key={`${occurrence.reference}-${index}`}>
                <div className="compiler-occurrence-main">
                  <span className="compiler-occurrence-ref">{occurrence.reference}</span>
                  <span className="compiler-occurrence-greek">{occurrence.surfaceForm}</span>
                  <span className="compiler-occurrence-gloss">{occurrence.spanishGloss}</span>
                </div>
                <button
                  type="button"
                  className="compiler-occurrence-pin"
                  onClick={() => handleAddXref(occurrence)}
                  disabled={!targetLine || !markdown}
                >
                  Pin XRef after L{targetLine ?? "?"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="compiler-tool-note">No occurrences found for that lemma.</p>
        )
      ) : null}

      {orphans.length ? (
        <div className="compiler-pinned-list compiler-pinned-list--orphans">
          <h3>Needs reattach ({orphans.length})</h3>
          <p className="compiler-tool-note">
            These pins survived regenerate but their target line text changed. Select a line, then Reattach.
          </p>
          <ul>
            {orphans.map(item => (
              <li key={item.id}>
                <span>
                  {item.kind === "definition" ? "Def" : "XRef"} · {item.lemma}
                  {item.kind === "definition"
                    ? ` — ${item.text}`
                    : item.reference
                      ? ` — ${item.reference}`
                      : ""}
                </span>
                <button
                  type="button"
                  className="compiler-occurrence-pin"
                  onClick={() => handleReattach(item.id)}
                  disabled={!targetLine || !markdown}
                >
                  {targetLine ? `Reattach to L${targetLine}` : "Select a line"}
                </button>
                <button type="button" className="compiler-occurrence-pin" onClick={() => handleRemove(item.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {placed.length ? (
        <div className="compiler-pinned-list">
          <h3>Pinned for lines</h3>
          <ul>
            {placed.map(item => (
              <li key={item.id}>
                <span>
                  L{item.lineNumber} · {item.kind === "definition" ? "Def" : "XRef"} · {item.lemma}
                  {item.kind === "definition"
                    ? ` — ${item.text}`
                    : item.reference
                      ? ` — ${item.reference}`
                      : ""}
                </span>
                <button type="button" className="compiler-occurrence-pin" onClick={() => handleRemove(item.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
