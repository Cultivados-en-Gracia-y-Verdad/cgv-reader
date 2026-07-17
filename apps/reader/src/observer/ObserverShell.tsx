import { useEffect, useState } from "react";
import OPrototype from "./OPrototype";
import SpanishClauseBuilder from "./SpanishClauseBuilder";

type WorkshopLayer = "mark" | "structure";

function readLayerFromHash(): WorkshopLayer {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === "clause") return "structure";
  return "mark";
}

/**
 * Observer is a Reader-styled workshop: the text stays at the center.
 * Layers (marking → structure) change what gathers around the passage;
 * they are not separate destinations that abandon the reading surface.
 *
 * The full self-assembling canvas (one continuous nesting view) is the
 * next rebuild target. Until then, marking and structure remain two
 * layers over the same Titus data, under quieter Reader chrome.
 */
export default function ObserverShell() {
  const [layer, setLayer] = useState<WorkshopLayer>(readLayerFromHash);

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
        <p className="reader-kicker">Observer</p>
        <h1>Workshop — Tito</h1>
        <p className="workshop-lede">
          The text sits at the center. Mark what the Greek shows, then let structure settle in place —
          never by drag-and-drop.
        </p>
        <div className="workshop-layers" role="tablist" aria-label="Workshop layers">
          <button
            type="button"
            className={`workshop-layer${layer === "mark" ? " workshop-layer--active" : ""}`}
            onClick={() => openLayer("mark")}
            role="tab"
            aria-selected={layer === "mark"}
          >
            Mark
          </button>
          <button
            type="button"
            className={`workshop-layer${layer === "structure" ? " workshop-layer--active" : ""}`}
            onClick={() => openLayer("structure")}
            role="tab"
            aria-selected={layer === "structure"}
          >
            Structure
          </button>
        </div>
      </header>

      <div className="workshop-stage">
        {layer === "structure" ? <SpanishClauseBuilder /> : <OPrototype />}
      </div>
    </main>
  );
}
