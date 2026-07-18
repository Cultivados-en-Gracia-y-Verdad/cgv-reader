import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  applyProgressBundle,
  downloadProgressFile,
  flushAutosave,
  linkAutosaveFile,
  readProgressFile,
  subscribeAutosaveStatus,
  type AutosaveStatus
} from "@cgv/core";
import { useUiLanguage } from "./UiLanguageContext";

export default function ProgressControls() {
  const { t, language } = useUiLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AutosaveStatus | null>(null);

  useEffect(() => subscribeAutosaveStatus(setStatus), []);

  function formatSavedAt(iso: string | null): string {
    if (!iso) return t.notYet;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return t.notYet;
    return date.toLocaleTimeString(language === "es" ? "es" : "en", {
      hour: "numeric",
      minute: "2-digit"
    });
  }

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
      const confirmed = window.confirm(t.loadConfirm);
      if (!confirmed) return;

      const summary = applyProgressBundle(bundle);
      window.alert(t.loadDone(summary.restoredCount));
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t.loadFailed);
    } finally {
      setBusy(false);
    }
  };

  const handleManualSave = async () => {
    setBusy(true);
    try {
      await flushAutosave();
      downloadProgressFile();
    } finally {
      setBusy(false);
    }
  };

  const handleLinkFile = async () => {
    setBusy(true);
    try {
      await linkAutosaveFile();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      window.alert(error instanceof Error ? error.message : t.linkFailed);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (() => {
    if (!status) return t.autosaveStarting;
    if (status.lastError) return t.autosaveError(status.lastError);
    if (status.mode === "file") {
      const name = status.fileName ?? "file";
      return status.dirty ? t.savingToFile(name) : t.savedToFile(name, formatSavedAt(status.lastSavedAt));
    }
    return status.dirty ? t.savingInBrowser : t.savedInBrowser(formatSavedAt(status.lastSavedAt));
  })();

  return (
    <div className="progress-controls" aria-label={t.progressAria}>
      <p className="progress-autosave-status" role="status" title={status?.lastError ?? statusLabel}>
        {statusLabel}
        {status && status.mode !== "file" && status.supportsFile ? (
          <button type="button" className="progress-autosave-link" onClick={handleLinkFile} disabled={busy}>
            {t.linkFile}
          </button>
        ) : null}
      </p>
      <button
        type="button"
        className="progress-btn"
        onClick={handleManualSave}
        disabled={busy}
        aria-label={t.saveProgress}
        title={t.saveProgress}
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
        aria-label={t.loadProgress}
        title={t.loadProgress}
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
