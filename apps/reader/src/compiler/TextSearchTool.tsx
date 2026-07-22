import { useEffect, useMemo, useState } from "react";
import {
  addCompilerAttachment,
  lineTextAt,
  searchMarkdownLines,
  type CompilerAttachment
} from "./compiler-gathering";
import { searchBibleText, type BibleVerseHit } from "./occurrences";

type SearchScope = "generated" | "bible";

interface TextSearchToolProps {
  markdown: string | null;
  selectedLine: number | null;
  onSelectLine: (lineNumber: number) => void;
  onAttachmentsChange: (attachments: CompilerAttachment[]) => void;
}

export default function TextSearchTool({
  markdown,
  selectedLine,
  onSelectLine,
  onAttachmentsChange
}: TextSearchToolProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("generated");
  const [bibleHits, setBibleHits] = useState<BibleVerseHit[]>([]);

  const generatedHits = useMemo(
    () => (scope === "generated" && markdown && query.trim() ? searchMarkdownLines(markdown, query) : []),
    [scope, markdown, query]
  );

  useEffect(() => {
    if (scope !== "bible" || !query.trim()) {
      setBibleHits([]);
      return;
    }
    let cancelled = false;
    void searchBibleText(query).then(hits => {
      if (!cancelled) setBibleHits(hits);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, query]);

  function handlePinGenerated(lineNumber: number, snippet: string) {
    if (!markdown) return;
    const anchorText = lineTextAt(markdown, lineNumber);
    if (!anchorText) return;
    onSelectLine(lineNumber);
    onAttachmentsChange(
      addCompilerAttachment({
        kind: "xref",
        lineNumber,
        anchorText,
        lemma: query.trim() || "búsqueda",
        text: "",
        reference: `línea ${lineNumber}`,
        surfaceForm: snippet.trim().slice(0, 80),
        spanishGloss: ""
      })
    );
  }

  function handlePinBible(reference: string, spanishText: string) {
    if (!selectedLine || !markdown) return;
    const anchorText = lineTextAt(markdown, selectedLine);
    if (!anchorText) return;
    onAttachmentsChange(
      addCompilerAttachment({
        kind: "xref",
        lineNumber: selectedLine,
        anchorText,
        lemma: query.trim() || "búsqueda",
        text: "",
        reference,
        surfaceForm: spanishText.trim().slice(0, 120),
        spanishGloss: ""
      })
    );
  }

  return (
    <section className="compiler-tool" aria-label="Search">
      <h2>Search</h2>
      <p className="compiler-tool-note">
        Search the generated manual or the NT (Spanish glosses + Greek). Bible hits pin to the
        selected line in the preview.
        {selectedLine ? ` Selected line: ${selectedLine}.` : ""}
      </p>

      <div className="compiler-search-scope" role="radiogroup" aria-label="Search scope">
        <label className="compiler-search-scope-option">
          <input
            type="radio"
            name="compiler-search-scope"
            checked={scope === "generated"}
            onChange={() => setScope("generated")}
          />
          <span>Generated file</span>
        </label>
        <label className="compiler-search-scope-option">
          <input
            type="radio"
            name="compiler-search-scope"
            checked={scope === "bible"}
            onChange={() => setScope("bible")}
          />
          <span>Bible (NT)</span>
        </label>
      </div>

      {scope === "generated" && !markdown ? (
        <p className="compiler-tool-note">Generate the skeleton first to search the file.</p>
      ) : (
        <label className="compiler-tool-field">
          <span>Phrase or word</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={scope === "bible" ? "e.g. esperanza, ἀπόστολος" : "e.g. esperanza, ἵνα, Nota"}
          />
        </label>
      )}

      {scope === "generated" && query.trim() && markdown ? (
        generatedHits.length ? (
          <ul className="compiler-search-hits">
            {generatedHits.map(hit => (
              <li key={hit.lineNumber}>
                <button type="button" className="compiler-search-hit" onClick={() => onSelectLine(hit.lineNumber)}>
                  <span className="compiler-occurrence-ref">L{hit.lineNumber}</span>
                  {hit.before ? <span className="compiler-search-context">{hit.before}</span> : null}
                  <span className="compiler-search-match">{hit.line}</span>
                  {hit.after ? <span className="compiler-search-context">{hit.after}</span> : null}
                </button>
                <button
                  type="button"
                  className="compiler-occurrence-pin"
                  onClick={() => handlePinGenerated(hit.lineNumber, hit.line)}
                >
                  Pin to L{hit.lineNumber}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="compiler-tool-note">No matches in the generated file.</p>
        )
      ) : null}

      {scope === "bible" && query.trim() ? (
        bibleHits.length ? (
          <ul className="compiler-search-hits">
            {bibleHits.map(hit => (
              <li key={hit.reference}>
                <div className="compiler-search-hit">
                  <span className="compiler-occurrence-ref">{hit.reference}</span>
                  {hit.before ? <span className="compiler-search-context">{hit.before}</span> : null}
                  <span className="compiler-search-match">{hit.spanishText || hit.greekText}</span>
                  {hit.after ? <span className="compiler-search-context">{hit.after}</span> : null}
                </div>
                <button
                  type="button"
                  className="compiler-occurrence-pin"
                  onClick={() => handlePinBible(hit.reference, hit.spanishText || hit.greekText)}
                  disabled={!selectedLine}
                >
                  {selectedLine ? `Pin XRef to L${selectedLine}` : "Select a line first"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="compiler-tool-note">No matches in the NT.</p>
        )
      ) : null}
    </section>
  );
}
