import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  COMPILER_BIBLE_VERSIONS,
  getReaderBookInfo,
  readCompilerBibleVersion,
  readReaderBook,
  readerBookHasLbfStructure,
  subscribeCompilerBibleVersion,
  subscribeReaderBook,
  writeCompilerBibleVersion,
  type BibleVersionId,
  type ReaderBookId
} from "@cgv/core";
import { useUiLanguage } from "../core/UiLanguageContext";
import { setWorkshopBookId } from "../observer/workshop-book";
import { loadReaderBook } from "../reader/reader-data";
import {
  applyLineAttachments,
  readCompilerAttachments,
  remapAttachmentsToMarkdown,
  writeCompilerAttachments,
  type CompilerAttachment
} from "./compiler-gathering";
import {
  applyMetaToMarkdown,
  createDefaultManualMeta,
  readManualMeta,
  writeManualMeta,
  type ManualMeta
} from "./compiler-meta";
import { generateManualSkeleton } from "./compiler-skeleton";
import MarkdownLinePreview from "./MarkdownLinePreview";
import ReaderNotesPanel from "./ReaderNotesPanel";
import TextSearchTool from "./TextSearchTool";
import WordOccurrencesTool from "./WordOccurrencesTool";

type ToolTab = "search" | "occurrences" | "notes" | "yaml";

export default function CompilerShell() {
  const { t } = useUiLanguage();
  const [bookId, setBookId] = useState<ReaderBookId>(() => readReaderBook());
  const bookInfo = getReaderBookInfo(bookId);
  const hasLbf = readerBookHasLbfStructure(bookId);
  const [baseMarkdown, setBaseMarkdown] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<CompilerAttachment[]>(() => readCompilerAttachments());
  const [summary, setSummary] = useState<{
    clauseCount: number;
    verblessCount: number;
    pendingCount: number;
    warnings: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  const [meta, setMeta] = useState<ManualMeta>(() => readManualMeta());
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [toolTab, setToolTab] = useState<ToolTab>("search");
  const [bibleVersion, setBibleVersion] = useState<BibleVersionId>(() => readCompilerBibleVersion());
  const [generating, setGenerating] = useState(false);

  // Sync before children/generate read getWorkshopBookId() (same as Observer).
  setWorkshopBookId(bookId);

  useEffect(() => {
    return subscribeReaderBook(next => {
      setBookId(next);
      setWorkshopBookId(next);
    });
  }, []);

  useEffect(() => {
    writeManualMeta(meta);
  }, [meta]);

  useEffect(() => subscribeCompilerBibleVersion(setBibleVersion), []);

  useEffect(() => {
    if (!baseMarkdown) return;
    setBaseMarkdown(current => (current ? applyMetaToMarkdown(current, meta) : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- meta-driven rewrite of base only
  }, [meta]);

  const exportMarkdown = useMemo(() => {
    if (!baseMarkdown) return null;
    return applyLineAttachments(baseMarkdown, attachments);
  }, [baseMarkdown, attachments]);

  const pinnedAfterLines = useMemo(
    () => new Set(attachments.map(item => item.lineNumber)),
    [attachments]
  );

  function updateMetaField<K extends keyof ManualMeta>(key: K, value: ManualMeta[K]) {
    setMeta(current => ({ ...current, [key]: value }));
  }

  function handleMetaInput(key: keyof ManualMeta) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      updateMetaField(key, event.currentTarget.value);
    };
  }

  function handleBibleChange(next: BibleVersionId) {
    writeCompilerBibleVersion(next);
    setBibleVersion(next);
  }

  async function handleGenerate() {
    if (!hasLbf) {
      setError(t.compilerNeedsLbf(bookInfo.displayName));
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const readingTextsByVerse = new Map<string, string>();
      if (bibleVersion !== "LBF") {
        const book = await loadReaderBook(bookId, bibleVersion);
        for (const verse of book.verses) {
          readingTextsByVerse.set(`${verse.chapter}:${verse.verse}`, verse.text);
        }
      }

      const result = generateManualSkeleton({
        meta,
        readingTextsByVerse: bibleVersion === "LBF" ? undefined : readingTextsByVerse
      });
      setBaseMarkdown(result.markdown);
      // Rematch durable pins by anchor line text (do not wipe gathering work).
      const remapped = remapAttachmentsToMarkdown(result.markdown, readCompilerAttachments());
      writeCompilerAttachments(remapped);
      setAttachments(remapped);
      setSelectedLine(null);
      const orphanCount = remapped.filter(item => item.lineNumber < 1).length;
      const warnings = [...result.warnings];
      if (orphanCount) {
        warnings.push(
          `${orphanCount} pin${orphanCount === 1 ? "" : "s"} could not rematch after regenerate — reattach in Occurrences.`
        );
      }
      setSummary({
        clauseCount: result.clauseCount,
        verblessCount: result.verblessCount,
        pendingCount: result.pendingCount,
        warnings
      });
      setWarningsDismissed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate the skeleton.");
      setBaseMarkdown(null);
      setSummary(null);
      setWarningsDismissed(false);
    } finally {
      setGenerating(false);
    }
  }

  function handleExport() {
    if (!exportMarkdown) return;
    const blob = new Blob([exportMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const slug = (meta.title || meta.book || bookId)
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");
    link.download = `${slug || bookId}-manual-skeleton.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleResetMeta() {
    setMeta(createDefaultManualMeta());
  }

  function handleAttachmentsChange(next: CompilerAttachment[]) {
    setAttachments(next);
  }

  return (
    <main className="compiler-shell compiler-shell--docked">
      <header className="compiler-header">
        <p className="reader-kicker">{t.compilerKicker}</p>
        <h1>{t.compilerTitle(bookInfo.displayName)}</h1>
        <p className="compiler-scope">{t.compilerScope}</p>
      </header>

      {!hasLbf ? (
        <p className="compiler-error" role="status">
          {t.compilerNeedsLbf(bookInfo.displayName)}
        </p>
      ) : null}

      <div className="compiler-actions">
        <label className="compiler-bible-field">
          <span>{t.compilerBible}</span>
          <select
            value={bibleVersion}
            onChange={event => handleBibleChange(event.target.value as BibleVersionId)}
            aria-describedby="compiler-bible-note"
            disabled={!hasLbf}
          >
            {COMPILER_BIBLE_VERSIONS.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.label} — {entry.description}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="compiler-generate-btn"
          onClick={() => void handleGenerate()}
          disabled={generating || !hasLbf}
        >
          {generating ? t.loadingBook : t.generate}
        </button>
        <button type="button" className="compiler-export-btn" onClick={handleExport} disabled={!exportMarkdown}>
          {t.exportMd}
        </button>
        {selectedLine ? <span className="compiler-selected-line">{t.lineSelected(selectedLine)}</span> : null}
      </div>
      <p className="compiler-bible-note" id="compiler-bible-note">
        {t.compilerBibleNote}
      </p>

      {error ? <p className="compiler-error">{error}</p> : null}

      {summary ? (
        <div className="compiler-summary" aria-label="Generation summary">
          <div className="compiler-summary-header">
            <p>
              {t.summaryClauses(summary.clauseCount)}
              {summary.verblessCount ? ` · ${t.summaryPhrases(summary.verblessCount)}` : ""}
              {summary.pendingCount ? ` · ${t.summaryParked(summary.pendingCount)}` : ""}
              {attachments.length ? ` · ${t.summaryPins(attachments.length)}` : ""}
              {summary.warnings.length && warningsDismissed
                ? ` · ${t.summaryFlagsHidden(summary.warnings.length)}`
                : ""}
            </p>
            {summary.warnings.length && !warningsDismissed ? (
              <button
                type="button"
                className="clause-audit-dismiss"
                onClick={() => setWarningsDismissed(true)}
                aria-label={t.closeFlags}
              >
                {t.closeFlags}
              </button>
            ) : null}
          </div>
          {summary.warnings.length && !warningsDismissed ? (
            <div className="compiler-warnings">
              <h3>{t.flagsHeading}</h3>
              <ul>
                {summary.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="compiler-workspace">
        {baseMarkdown ? (
          <MarkdownLinePreview
            markdown={baseMarkdown}
            selectedLine={selectedLine}
            pinnedAfterLines={pinnedAfterLines}
            onSelectLine={setSelectedLine}
          />
        ) : (
          <p className="compiler-empty">{t.emptyGenerate}</p>
        )}
      </div>

      <div className="compiler-bottom-dock" aria-label={t.toolsAria}>
        <div className="compiler-dock-tabs" role="tablist">
          {(
            [
              ["search", t.search],
              ["occurrences", t.occurrences],
              ["notes", t.readerNotes],
              ["yaml", t.yaml]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={toolTab === id}
              className={toolTab === id ? "compiler-dock-tab compiler-dock-tab--active" : "compiler-dock-tab"}
              onClick={() => setToolTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="compiler-dock-body" role="tabpanel">
          {toolTab === "search" ? (
            <TextSearchTool
              markdown={baseMarkdown}
              selectedLine={selectedLine}
              onSelectLine={setSelectedLine}
              onAttachmentsChange={handleAttachmentsChange}
            />
          ) : null}
          {toolTab === "occurrences" ? (
            <WordOccurrencesTool
              markdown={baseMarkdown}
              selectedLine={selectedLine}
              onSelectLine={setSelectedLine}
              attachments={attachments}
              onAttachmentsChange={handleAttachmentsChange}
              lineCount={baseMarkdown ? baseMarkdown.split("\n").length : 0}
            />
          ) : null}
          {toolTab === "notes" ? <ReaderNotesPanel /> : null}
          {toolTab === "yaml" ? (
            <section className="compiler-tool" aria-label={t.yaml}>
              <h2>{t.yaml}</h2>
              <p className="compiler-tool-note">{t.yamlNote}</p>
              <div className="compiler-yaml-grid">
                {(
                  [
                    ["book", "book"],
                    ["title", "title"],
                    ["subtitle", "subtitle"],
                    ["author", "author"],
                    ["cover", "cover"],
                    ["date", "date"],
                    ["version", "version"]
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="compiler-tool-field">
                    <span>{label}</span>
                    <input
                      type={key === "date" ? "date" : "text"}
                      value={meta[key]}
                      onChange={handleMetaInput(key)}
                      autoComplete="off"
                    />
                  </label>
                ))}
              </div>
              <button type="button" className="compiler-meta-reset" onClick={handleResetMeta}>
                {t.resetDefaults}
              </button>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
