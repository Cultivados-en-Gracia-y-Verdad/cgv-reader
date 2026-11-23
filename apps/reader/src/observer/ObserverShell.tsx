import { useEffect, useState } from "react";
import {
  getReaderBookInfo,
  readReaderBook,
  readerBookHasLbfStructure,
  readerBookHasObserverMark,
  subscribeReaderBook,
  type ReaderBookId
} from "@cgv/core";
import { useUiLanguage } from "../core/UiLanguageContext";
import { ensureWorkshopSources } from "./book-assets";
import OPrototype from "./OPrototype";
import SpanishClauseBuilder from "./SpanishClauseBuilder";
import { loadBookData } from "./o-data";
import {
  WHOLE_BOOK_PASSAGE,
  observerPassageKey,
  observerPassageLabel,
  observerVerseRefKey,
  type ObserverPassage,
  type ObserverVerseRef
} from "./observer-passage";
import { setWorkshopBookId } from "./workshop-book";

type WorkshopLayer = "mark" | "structure";

function readLayerFromHash(): WorkshopLayer {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "clause") return "structure";
  return "mark";
}

/**
 * Observer is a Reader-styled workshop: the text stays at the center.
 * Mark = Brick 1–4 on the Greek interlinear. Structure = one continuous
 * Passage + skeleton/review canvas (START-HERE Step 4). Participles appear
 * as read-only satellites beside their host clause — no separate views page.
 *
 * Book follows the shared Reader preference. Structure needs published LBF
 * reverse-interlinear alignment from cgv-data (or the local fallback).
 */
export default function ObserverShell() {
  const { t } = useUiLanguage();
  const [layer, setLayer] = useState<WorkshopLayer>(readLayerFromHash);
  const [bookId, setBookId] = useState<ReaderBookId>(() => readReaderBook());
  const bookInfo = getReaderBookInfo(bookId);
  const hasLbfStructure = readerBookHasLbfStructure(bookId);
  const hasMarkSpine = readerBookHasObserverMark(bookId);
  const [sourcesReady, setSourcesReady] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [verseRefs, setVerseRefs] = useState<ObserverVerseRef[]>([]);
  const [passage, setPassage] = useState<ObserverPassage>(WHOLE_BOOK_PASSAGE);

  // Keep the module workshop book aligned before children render. Structure
  // helpers still read getWorkshopBookId() in places; a useEffect sync would
  // leave the first paint on the previous book (Tito marks/participles on a
  // 1 Pedro header).
  setWorkshopBookId(bookId);

  useEffect(() => {
    return subscribeReaderBook(next => {
      setBookId(next);
      setWorkshopBookId(next);
    });
  }, []);

  useEffect(() => {
    const onHashChange = () => setLayer(readLayerFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!hasLbfStructure || layer !== "structure") {
      setSourcesReady(false);
      setSourcesError(null);
      return;
    }
    let live = true;
    setSourcesReady(false);
    setSourcesError(null);
    ensureWorkshopSources(bookId).then(
      () => {
        if (live) setSourcesReady(true);
      },
      (error: unknown) => {
        if (live) setSourcesError(error instanceof Error ? error.message : String(error));
      }
    );
    return () => {
      live = false;
    };
  }, [bookId, hasLbfStructure, layer]);

  useEffect(() => {
    let live = true;
    setVerseRefs([]);
    setPassage(WHOLE_BOOK_PASSAGE);
    if (!hasMarkSpine) {
      return () => {
        live = false;
      };
    }

    void loadBookData(bookId).then(
      data => {
        if (!live) return;
        setVerseRefs(
          data.greek.flatMap(([, verses]) =>
            verses.map(verse => ({ chapter: verse.chapter, verse: verse.verse }))
          )
        );
      },
      () => {
        // The layer itself reports source-loading errors. Passage controls
        // simply stay unavailable until a usable verse index exists.
      }
    );
    return () => {
      live = false;
    };
  }, [bookId, hasMarkSpine]);

  function openLayer(next: WorkshopLayer) {
    window.location.hash = next === "structure" ? "clause" : "workshop";
    setLayer(next);
  }

  const passageStartIndex =
    passage.kind === "range"
      ? verseRefs.findIndex(reference => observerVerseRefKey(reference) === observerVerseRefKey(passage.start))
      : -1;
  const passageEndIndex =
    passage.kind === "range"
      ? verseRefs.findIndex(reference => observerVerseRefKey(reference) === observerVerseRefKey(passage.end))
      : -1;

  function choosePassageMode(kind: "book" | "range") {
    if (kind === "book" || !verseRefs.length) {
      setPassage(WHOLE_BOOK_PASSAGE);
      return;
    }
    setPassage({ kind: "range", start: verseRefs[0], end: verseRefs[0] });
  }

  function choosePassageStart(index: number) {
    if (passage.kind !== "range" || !verseRefs[index]) return;
    const endIndex = passageEndIndex < index ? index : passageEndIndex;
    setPassage({ kind: "range", start: verseRefs[index], end: verseRefs[endIndex] });
  }

  function choosePassageEnd(index: number) {
    if (passage.kind !== "range" || !verseRefs[index]) return;
    const startIndex = passageStartIndex > index ? index : passageStartIndex;
    setPassage({ kind: "range", start: verseRefs[startIndex], end: verseRefs[index] });
  }

  return (
    <main className="workshop-shell">
      <header className="workshop-header">
        <p className="reader-kicker">{t.observerKicker}</p>
        <h1>{t.observerTitle(bookInfo.displayName)}</h1>
        <p className="workshop-lede">{t.observerLede}</p>
        {verseRefs.length ? (
          <div className="workshop-passage-picker" aria-label={t.studyScope}>
            <label>
              <span>{t.studyScope}</span>
              <select
                value={passage.kind}
                onChange={event => choosePassageMode(event.target.value as "book" | "range")}
              >
                <option value="book">{t.wholeBook}</option>
                <option value="range">{t.passage}</option>
              </select>
            </label>
            {passage.kind === "range" ? (
              <>
                <label>
                  <span>{t.passageFrom}</span>
                  <select value={passageStartIndex} onChange={event => choosePassageStart(Number(event.target.value))}>
                    {verseRefs.map((reference, index) => (
                      <option key={observerVerseRefKey(reference)} value={index}>
                        {observerVerseRefKey(reference)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t.passageTo}</span>
                  <select value={passageEndIndex} onChange={event => choosePassageEnd(Number(event.target.value))}>
                    {verseRefs.map((reference, index) => (
                      <option key={observerVerseRefKey(reference)} value={index}>
                        {observerVerseRefKey(reference)}
                      </option>
                    ))}
                  </select>
                </label>
                <strong>
                  {bookInfo.displayName} {observerPassageLabel(passage)}
                </strong>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="workshop-layers" role="tablist" aria-label={t.workshopLayersAria}>
          <button
            type="button"
            className={`workshop-layer${layer === "mark" ? " workshop-layer--active" : ""}`}
            onClick={() => openLayer("mark")}
            role="tab"
            aria-selected={layer === "mark"}
          >
            {t.mark}
          </button>
          <button
            type="button"
            className={`workshop-layer${layer === "structure" ? " workshop-layer--active" : ""}`}
            onClick={() => openLayer("structure")}
            role="tab"
            aria-selected={layer === "structure"}
          >
            {t.structure}
          </button>
        </div>
      </header>

      <div className="workshop-stage">
        {layer === "structure" ? (
          hasLbfStructure ? (
            sourcesError ? (
              <p className="workshop-lbf-gate" role="status">
                {sourcesError}
              </p>
            ) : sourcesReady ? (
              <SpanishClauseBuilder
                key={`${bookId}:${observerPassageKey(passage)}`}
                bookId={bookId}
                passage={passage}
              />
            ) : (
              <p className="workshop-lbf-gate" role="status">
                {t.loadingBook}
              </p>
            )
          ) : (
            <p className="workshop-lbf-gate" role="status">
              {t.structureNeedsLbf(bookInfo.displayName)}
            </p>
          )
        ) : hasMarkSpine ? (
          <OPrototype
            key={`${bookId}:${observerPassageKey(passage)}`}
            bookId={bookId}
            passage={passage}
          />
        ) : (
          <p className="workshop-lbf-gate" role="status">
            {t.markNeedsMorphGnt(bookInfo.displayName)}
          </p>
        )}
      </div>
    </main>
  );
}
