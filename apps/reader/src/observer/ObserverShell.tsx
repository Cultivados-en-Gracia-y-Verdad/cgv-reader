import { useEffect, useState } from "react";
import {
  getReaderBookInfo,
  readReaderBook,
  readerBookHasLbfStructure,
  subscribeReaderBook,
  type ReaderBookId
} from "@cgv/core";
import { useUiLanguage } from "../core/UiLanguageContext";
import OPrototype from "./OPrototype";
import SpanishClauseBuilder from "./SpanishClauseBuilder";
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
 * Passage + skeleton/review canvas (START-HERE Step 4). Participle Views
 * remain a deliberate pull-back from that canvas.
 *
 * Book follows the shared Reader preference so Mark loads the selected NT
 * book. Structure still needs LBF reverse-interlinear alignment (Tito, 1 Pedro).
 */
export default function ObserverShell() {
  const { t } = useUiLanguage();
  const [layer, setLayer] = useState<WorkshopLayer>(readLayerFromHash);
  const [bookId, setBookId] = useState<ReaderBookId>(() => readReaderBook());
  const bookInfo = getReaderBookInfo(bookId);
  const hasLbfStructure = readerBookHasLbfStructure(bookId);

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

  function openLayer(next: WorkshopLayer) {
    window.location.hash = next === "structure" ? "clause" : "workshop";
    setLayer(next);
  }

  return (
    <main className="workshop-shell">
      <header className="workshop-header">
        <p className="reader-kicker">{t.observerKicker}</p>
        <h1>{t.observerTitle(bookInfo.displayName)}</h1>
        <p className="workshop-lede">{t.observerLede}</p>
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
            <SpanishClauseBuilder key={bookId} bookId={bookId} />
          ) : (
            <p className="workshop-lbf-gate" role="status">
              {t.structureNeedsLbf(bookInfo.displayName)}
            </p>
          )
        ) : (
          <OPrototype key={bookId} bookId={bookId} />
        )}
      </div>
    </main>
  );
}
