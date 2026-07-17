import { useEffect, useState } from "react";
import { countExistingProgressKeys, readCapabilities, setCapability, type CapabilityState } from "@cgv/core";
import CompilerShell from "./compiler/CompilerShell";
import ProgressControls from "./core/ProgressControls";
import ObserverShell from "./observer/ObserverShell";
import ReaderView from "./reader/ReaderView";

type Zone = "reader" | "observer" | "compiler";

const OBSERVER_HASHES = new Set(["o", "clause", "workshop", "interlinear"]);
const COMPILER_HASH = "c";

function readZoneFromHash(capabilities: CapabilityState): Zone {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === COMPILER_HASH && capabilities.compiler) return "compiler";
  if (OBSERVER_HASHES.has(hash) && capabilities.observer) return "observer";
  return "reader";
}

/**
 * The Reader is the app.
 * Observer is an optional unlock (student workshop).
 * Compiler is a specialized unlock (CGV teachers).
 * Writer stays a separate markdown editor.
 */
export default function ReaderApp() {
  const [capabilities, setCapabilities] = useState<CapabilityState>(() => readCapabilities());
  const [zone, setZone] = useState<Zone>(() => readZoneFromHash(readCapabilities()));
  const [progressHint, setProgressHint] = useState<string | null>(null);

  useEffect(() => {
    const onHashChange = () => setZone(readZoneFromHash(capabilities));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [capabilities]);

  useEffect(() => {
    const count = countExistingProgressKeys();
    if (count > 0) {
      setProgressHint(
        `Titus progress found in this browser (${count} saved item${count === 1 ? "" : "s"}) — same keys as cgv-reader, so your lab work carries over.`
      );
    }
  }, []);

  function openReader() {
    window.history.pushState(null, "", window.location.pathname);
    setZone("reader");
  }

  function openObserver() {
    if (!capabilities.observer) return;
    if (!OBSERVER_HASHES.has(window.location.hash.replace(/^#/, ""))) {
      window.location.hash = "workshop";
    }
    setZone("observer");
  }

  function openCompiler() {
    if (!capabilities.compiler) return;
    window.location.hash = COMPILER_HASH;
    setZone("compiler");
  }

  function toggleCompilerUnlock() {
    const next = setCapability("compiler", !capabilities.compiler);
    setCapabilities(next);
    if (!next.compiler && zone === "compiler") openReader();
  }

  return (
    <>
      <div className="app-chrome" aria-label="Reader controls">
        <div className="zone-toggle" role="tablist" aria-label="Reader zones">
          <button
            type="button"
            className={`zone-toggle-option${zone === "reader" ? " zone-toggle-option--active" : ""}`}
            onClick={openReader}
            role="tab"
            aria-selected={zone === "reader"}
          >
            Reader
          </button>
          {capabilities.observer ? (
            <button
              type="button"
              className={`zone-toggle-option${zone === "observer" ? " zone-toggle-option--active" : ""}`}
              onClick={openObserver}
              role="tab"
              aria-selected={zone === "observer"}
            >
              Observer
            </button>
          ) : null}
          {capabilities.compiler ? (
            <button
              type="button"
              className={`zone-toggle-option${zone === "compiler" ? " zone-toggle-option--active" : ""}`}
              onClick={openCompiler}
              role="tab"
              aria-selected={zone === "compiler"}
            >
              Compiler
            </button>
          ) : null}
        </div>

        {(zone === "observer" || zone === "compiler") && <ProgressControls />}
      </div>

      {progressHint && zone === "reader" ? (
        <p className="migration-banner" role="status">
          {progressHint}
          <button type="button" className="migration-banner-dismiss" onClick={() => setProgressHint(null)}>
            Dismiss
          </button>
        </p>
      ) : null}

      {/* Temporary teacher unlock for local development — replace with real entitlements later. */}
      {zone === "reader" ? (
        <button type="button" className="teacher-unlock" onClick={toggleCompilerUnlock}>
          {capabilities.compiler ? "Lock Compiler" : "Unlock Compiler (teachers)"}
        </button>
      ) : null}

      {zone === "observer" ? (
        <ObserverShell />
      ) : zone === "compiler" ? (
        <CompilerShell />
      ) : (
        <ReaderView />
      )}
    </>
  );
}
