import { useMemo, useState } from "react";
import { findOccurrencesByLemma, listAvailableLemmas, type WordOccurrence } from "./occurrences";

// Compiler's first gathering tool, per compiler-manual-generation-spec.md:
// reuses cgv-translator's occurrence-generation logic (re-pointed at this
// project's own *.tokens.jsonl data — see occurrences.ts for why) to answer
// one question, Scripture-only: where else in the NT does this word occur?
// Doubles as the "simple cross-reference finder" the spec also calls for —
// finding a lemma's other occurrences *is* locating its cross-references.
// Presents results; never ranks or interprets which ones matter.
export default function WordOccurrencesTool() {
  const lemmas = useMemo(() => listAvailableLemmas(), []);
  const [selectedLemma, setSelectedLemma] = useState("");
  const [results, setResults] = useState<WordOccurrence[] | null>(null);

  function handleFind(lemma: string) {
    setSelectedLemma(lemma);
    setResults(lemma.trim() ? findOccurrencesByLemma(lemma) : null);
  }

  return (
    <section className="compiler-tool" aria-label="Word occurrences">
      <h2>Word occurrences</h2>
      <p className="compiler-tool-note">
        Every place a Greek lemma occurs across the NT — reference, form, and gloss only. Which ones matter is a
        writer's call downstream, not something this locates for you.
      </p>

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

      {results ? (
        results.length ? (
          <ul className="compiler-occurrence-list">
            {results.map((occurrence, index) => (
              <li key={`${occurrence.reference}-${index}`}>
                <span className="compiler-occurrence-ref">{occurrence.reference}</span>
                <span className="compiler-occurrence-greek">{occurrence.surfaceForm}</span>
                <span className="compiler-occurrence-gloss">{occurrence.spanishGloss}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="compiler-tool-note">No occurrences found for that lemma.</p>
        )
      ) : null}
    </section>
  );
}
