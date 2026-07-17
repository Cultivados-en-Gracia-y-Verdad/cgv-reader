import { useState } from "react";
import { generateManualSkeleton } from "./compiler-skeleton";
import WordOccurrencesTool from "./WordOccurrencesTool";

// C's screen, per cgv-product-suite-spec.md: the skeleton generator (trigger
// against O's live data, preview, export) plus a left-side tools panel — the
// home for gathering tools going forward. Word Occurrences (reusing
// cgv-translator's occurrence logic, doubling as the "cross-reference
// finder" the spec also asks for) is the first tool; more join it here
// later rather than becoming new destinations.
export default function CompilerShell() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ clauseCount: number; verblessCount: number; pendingCount: number; warnings: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    try {
      const result = generateManualSkeleton();
      setMarkdown(result.markdown);
      setSummary({
        clauseCount: result.clauseCount,
        verblessCount: result.verblessCount,
        pendingCount: result.pendingCount,
        warnings: result.warnings
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate the skeleton.");
      setMarkdown(null);
      setSummary(null);
    }
  }

  function handleExport() {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "titus-manual-skeleton.md";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <main className="compiler-shell">
      <header className="compiler-header">
        <p className="reader-kicker">Compiler</p>
        <h1>Manual skeleton — Tito</h1>
        <p className="compiler-scope">
          Mechanically generated from O's current clause data: structure, Scripture text, and grammatical
          explanations only — no theological or interpretive content. Ready for a writer to add commentary to.
        </p>
      </header>

      <div className="compiler-layout">
        <aside className="compiler-tools-panel" aria-label="Compiler tools">
          <h2 className="compiler-tools-heading">Tools</h2>
          <WordOccurrencesTool />
        </aside>

        <div className="compiler-main">
          <div className="compiler-actions">
            <button type="button" className="compiler-generate-btn" onClick={handleGenerate}>
              Generate from O's current data
            </button>
            <button type="button" className="compiler-export-btn" onClick={handleExport} disabled={!markdown}>
              Export as .md
            </button>
          </div>

          {error ? <p className="compiler-error">{error}</p> : null}

          {summary ? (
            <div className="compiler-summary" aria-label="Generation summary">
              <p>
                {summary.clauseCount} clause{summary.clauseCount === 1 ? "" : "s"} placed · {summary.verblessCount}{" "}
                verbless verse{summary.verblessCount === 1 ? "" : "s"} folded in · {summary.pendingCount} clause
                {summary.pendingCount === 1 ? "" : "s"} still pending placement in O
              </p>
              {summary.warnings.length ? (
                <div className="compiler-warnings">
                  <h3>Flagged during generation — check manually</h3>
                  <ul>
                    {summary.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {markdown ? (
            <pre className="compiler-markdown-preview" aria-label="Generated markdown">
              <code>{markdown}</code>
            </pre>
          ) : (
            <p className="compiler-empty">Nothing generated yet — click "Generate from O's current data" above.</p>
          )}
        </div>
      </div>
    </main>
  );
}
