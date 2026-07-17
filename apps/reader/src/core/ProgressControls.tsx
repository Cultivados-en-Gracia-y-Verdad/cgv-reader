import { useRef, useState, type ChangeEvent } from "react";
import { applyProgressBundle, downloadProgressFile, readProgressFile } from "@cgv/core";

export default function ProgressControls() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const bundle = await readProgressFile(file);
      const confirmed = window.confirm(
        "This replaces your current Titus progress (marked verbs, clauses, moods, observations, notes) with what's in this file. Your current state isn't kept — this can't be undone. Continue?"
      );
      if (!confirmed) return;

      const summary = applyProgressBundle(bundle);
      window.alert(`Loaded ${summary.restoredCount} saved item(s). Reloading to pick up the change…`);
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="progress-controls" aria-label="Save or load Titus progress">
      <button
        type="button"
        className="progress-btn"
        onClick={downloadProgressFile}
        disabled={busy}
        aria-label="Save progress"
        title="Save progress"
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path
            d="M10 3v9m0 0 3.5-3.5M10 12l-3.5-3.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="progress-btn"
        onClick={handleLoadClick}
        disabled={busy}
        aria-label="Load progress"
        title="Load progress"
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
          <path
            d="M10 12V3m0 0 3.5 3.5M10 3 6.5 6.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="progress-file-input"
        onChange={handleFileChange}
      />
    </div>
  );
}
