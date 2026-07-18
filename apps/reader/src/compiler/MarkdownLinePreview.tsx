interface MarkdownLinePreviewProps {
  /** Base generated markdown — line numbers stay stable while pins accumulate. */
  markdown: string;
  selectedLine: number | null;
  pinnedAfterLines?: Set<number>;
  onSelectLine: (lineNumber: number) => void;
}

/** Generated markdown with 1-based line numbers; click a line to target pins. */
export default function MarkdownLinePreview({
  markdown,
  selectedLine,
  pinnedAfterLines,
  onSelectLine
}: MarkdownLinePreviewProps) {
  const lines = markdown.split("\n");

  return (
    <div className="compiler-line-preview" aria-label="Generated markdown with line numbers">
      <ol className="compiler-line-list">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const selected = selectedLine === lineNumber;
          const hasPin = pinnedAfterLines?.has(lineNumber);
          return (
            <li
              key={lineNumber}
              className={[selected ? "compiler-line--selected" : "", hasPin ? "compiler-line--pinned" : ""]
                .filter(Boolean)
                .join(" ") || undefined}
            >
              <button
                type="button"
                className="compiler-line-button"
                onClick={() => onSelectLine(lineNumber)}
                aria-label={`Select line ${lineNumber}`}
                aria-pressed={selected}
              >
                <span className="compiler-line-number">{lineNumber}</span>
                <span className="compiler-line-text">{line.length ? line : " "}</span>
                {hasPin ? <span className="compiler-line-pin-mark">pin</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
