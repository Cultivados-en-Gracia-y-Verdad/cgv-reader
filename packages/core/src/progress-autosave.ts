import {
  applyProgressBundle,
  buildProgressBundle,
  countExistingProgressKeys,
  type ProgressBundle
} from "./progress-io";
import { PROGRESS_KEYS } from "./progress-keys";
import { readReaderBook, workshopStorageSlug } from "./reader-book";

// Keep the IndexedDB name so existing browser autosave backups still open.
const DB_NAME = "cgv-suite-progress";
const DB_VERSION = 1;
const STORE = "autosave";
const BACKUP_KEY = "backup";
const HANDLE_KEY = "fileHandle";
const META_KEY = "meta";
const DEBOUNCE_MS = 1500;
const STATUS_EVENT = "cgv:progress-autosave";

const PROGRESS_KEY_SET = new Set(PROGRESS_KEYS.map(entry => entry.key));

export type AutosaveMode = "file" | "browser" | "off";

export interface AutosaveStatus {
  mode: AutosaveMode;
  fileName: string | null;
  lastSavedAt: string | null;
  dirty: boolean;
  lastError: string | null;
  supportsFile: boolean;
}

interface AutosaveMeta {
  lastSavedAt: string | null;
  fileName: string | null;
}

type FileHandleLike = {
  name: string;
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
  }>;
  queryPermission?: (desc: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (desc: { mode: "readwrite" }) => Promise<PermissionState>;
};

let started = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let flushInFlight: Promise<void> | null = null;
let lastError: string | null = null;
let cachedMeta: AutosaveMeta = { lastSavedAt: null, fileName: null };
let cachedHandle: FileHandleLike | null = null;
let originalSetItem: typeof localStorage.setItem | null = null;

function supportsFileAutosave(): boolean {
  return typeof window !== "undefined" && typeof (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open autosave database."));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("Autosave read failed."));
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("Autosave write failed."));
  });
}

function emitStatus(): void {
  window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: getAutosaveStatus() }));
}

export function getAutosaveStatus(): AutosaveStatus {
  return {
    mode: cachedHandle ? "file" : started ? "browser" : "off",
    fileName: cachedMeta.fileName,
    lastSavedAt: cachedMeta.lastSavedAt,
    dirty,
    lastError,
    supportsFile: supportsFileAutosave()
  };
}

export function subscribeAutosaveStatus(listener: (status: AutosaveStatus) => void): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<AutosaveStatus>).detail);
  };
  window.addEventListener(STATUS_EVENT, handler);
  listener(getAutosaveStatus());
  return () => window.removeEventListener(STATUS_EVENT, handler);
}

async function ensureFilePermission(handle: FileHandleLike): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  const current = await handle.queryPermission({ mode: "readwrite" });
  if (current === "granted") return true;
  const next = await handle.requestPermission({ mode: "readwrite" });
  return next === "granted";
}

async function writeBundle(bundle: ProgressBundle): Promise<void> {
  await idbSet(BACKUP_KEY, bundle);

  if (cachedHandle) {
    const allowed = await ensureFilePermission(cachedHandle);
    if (!allowed) {
      throw new Error("File permission was denied — browser backup still updated.");
    }
    const writable = await cachedHandle.createWritable();
    await writable.write(JSON.stringify(bundle, null, 2));
    await writable.close();
  }

  cachedMeta = {
    lastSavedAt: bundle.exportedAt,
    fileName: cachedHandle?.name ?? cachedMeta.fileName
  };
  await idbSet(META_KEY, cachedMeta);
  lastError = null;
  dirty = false;
}

export async function flushAutosave(): Promise<void> {
  if (!started) return;
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    try {
      const bundle = buildProgressBundle();
      if (Object.keys(bundle.data).length === 0 && !dirty) return;
      await writeBundle(bundle);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Autosave failed.";
    } finally {
      flushInFlight = null;
      emitStatus();
    }
  })();

  return flushInFlight;
}

export function scheduleAutosave(): void {
  if (!started) return;
  dirty = true;
  emitStatus();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushAutosave();
  }, DEBOUNCE_MS);
}

/** One-time: choose a JSON file that autosave will overwrite after each change. */
export async function linkAutosaveFile(): Promise<boolean> {
  const picker = (window as Window & {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileHandleLike>;
  }).showSaveFilePicker;

  if (!picker) {
    throw new Error("This browser can't link a file for auto-save. Use Save for a manual download.");
  }

  const handle = await picker({
    suggestedName: `${workshopStorageSlug(readReaderBook())}-progress-autosave.json`,
    types: [
      {
        description: "Reader progress JSON",
        accept: { "application/json": [".json"] }
      }
    ]
  });

  cachedHandle = handle;
  cachedMeta.fileName = handle.name;
  await idbSet(HANDLE_KEY, handle);
  await idbSet(META_KEY, cachedMeta);
  dirty = true;
  await flushAutosave();
  emitStatus();
  return true;
}

export async function unlinkAutosaveFile(): Promise<void> {
  cachedHandle = null;
  cachedMeta = { ...cachedMeta, fileName: null };
  await idbSet(HANDLE_KEY, null);
  await idbSet(META_KEY, cachedMeta);
  emitStatus();
}

/**
 * If localStorage was wiped but IndexedDB still has a bundle, restore it.
 * Returns true when a restore was applied (caller should reload).
 */
export async function maybeRestoreFromAutosave(): Promise<boolean> {
  if (countExistingProgressKeys() > 0) return false;
  const backup = await idbGet<ProgressBundle>(BACKUP_KEY);
  if (!backup?.data || typeof backup.data !== "object") return false;
  if (Object.keys(backup.data).length === 0) return false;

  const confirmed = window.confirm(
    "Browser storage looks empty, but an auto-save backup was found. Restore your progress from that backup?"
  );
  if (!confirmed) return false;

  applyProgressBundle(backup);
  return true;
}

const CLAUSE_ASSIGNMENTS_KEY = "the-reader:spanish-clause-builder:titus:v3";

/**
 * Repair greekConfirmedAt if a buggy reader dropped it from in-memory state
 * and a later write wiped timestamps from localStorage — pull them back from
 * the IndexedDB autosave snapshot when present.
 */
export async function recoverGreekConfirmationsFromAutosave(): Promise<number> {
  const raw = window.localStorage.getItem(CLAUSE_ASSIGNMENTS_KEY);
  if (!raw) return 0;

  let current: Record<string, Record<string, unknown>>;
  try {
    current = JSON.parse(raw) as Record<string, Record<string, unknown>>;
  } catch {
    return 0;
  }
  if (!current || typeof current !== "object") return 0;

  const alreadyConfirmed = Object.values(current).filter(
    value => value && typeof value === "object" && typeof value.greekConfirmedAt === "string"
  ).length;
  if (alreadyConfirmed > 0) return 0;

  const backup = await idbGet<ProgressBundle>(BACKUP_KEY);
  const backupAssignments = backup?.data?.[CLAUSE_ASSIGNMENTS_KEY];
  if (!backupAssignments || typeof backupAssignments !== "object") return 0;

  let merged = 0;
  for (const [finiteVerbId, assignment] of Object.entries(current)) {
    if (!assignment || typeof assignment !== "object") continue;
    if (typeof assignment.greekConfirmedAt === "string") continue;
    const fromBackup = (backupAssignments as Record<string, Record<string, unknown>>)[finiteVerbId];
    if (fromBackup && typeof fromBackup.greekConfirmedAt === "string") {
      assignment.greekConfirmedAt = fromBackup.greekConfirmedAt;
      merged += 1;
    }
  }

  if (merged > 0) {
    window.localStorage.setItem(CLAUSE_ASSIGNMENTS_KEY, JSON.stringify(current));
  }
  return merged;
}

function isProgressStorageKey(key: string): boolean {
  if (PROGRESS_KEY_SET.has(key)) return true;
  return (
    key.startsWith("o-prototype:") ||
    key.startsWith("roots:") ||
    key.startsWith("the-reader:spanish-clause-builder:") ||
    key === "the-reader:titus:notes"
  );
}

function patchLocalStorage(): void {
  if (originalSetItem) return;
  originalSetItem = window.localStorage.setItem.bind(window.localStorage);
  window.localStorage.setItem = (key: string, value: string) => {
    originalSetItem!(key, value);
    if (isProgressStorageKey(key)) scheduleAutosave();
  };
}

export async function startProgressAutosave(): Promise<void> {
  if (started || typeof window === "undefined" || typeof indexedDB === "undefined") return;
  started = true;
  patchLocalStorage();

  try {
    cachedMeta = (await idbGet<AutosaveMeta>(META_KEY)) ?? { lastSavedAt: null, fileName: null };
    const handle = await idbGet<FileHandleLike | null>(HANDLE_KEY);
    cachedHandle = handle ?? null;
    if (cachedHandle) cachedMeta.fileName = cachedHandle.name;
  } catch {
    // IndexedDB unavailable — still track dirty via in-memory status.
  }

  window.addEventListener("beforeunload", () => {
    if (dirty) void flushAutosave();
  });
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && dirty) void flushAutosave();
  });

  emitStatus();
  // Capture current localStorage snapshot once at boot.
  if (countExistingProgressKeys() > 0) scheduleAutosave();
}
