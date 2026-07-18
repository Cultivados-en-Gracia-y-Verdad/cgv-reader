import type { UiLanguage } from "@cgv/core";

/** Shared chrome + zone shell strings. Bible text and generated manual stay as-is. */
export interface UiStrings {
  chromeAria: string;
  zonesAria: string;
  reader: string;
  observer: string;
  compiler: string;
  languageAria: string;
  preferences: string;
  prefLanguage: string;
  prefBible: string;
  prefBibleNote: string;
  progressHint: (count: number) => string;
  dismiss: string;
  lockCompiler: string;
  unlockCompiler: string;

  observerKicker: string;
  observerTitle: string;
  observerLede: string;
  workshopLayersAria: string;
  mark: string;
  structure: string;

  compilerKicker: string;
  compilerTitle: string;
  compilerScope: string;
  generate: string;
  exportMd: string;
  lineSelected: (n: number) => string;
  closeFlags: string;
  flagsHeading: string;
  emptyGenerate: string;
  toolsAria: string;
  search: string;
  occurrences: string;
  readerNotes: string;
  yaml: string;
  yamlNote: string;
  resetDefaults: string;
  summaryClauses: (n: number) => string;
  summaryPhrases: (n: number) => string;
  summaryParked: (n: number) => string;
  summaryPins: (n: number) => string;
  summaryFlagsHidden: (n: number) => string;

  readerKicker: string;
  notePlaceholder: string;
  close: string;
  delete: string;
  save: string;
  noteFor: (label: string) => string;
  notesFor: (label: string) => string;

  progressAria: string;
  autosaveStarting: string;
  autosaveError: (msg: string) => string;
  savingToFile: (name: string) => string;
  savedToFile: (name: string, when: string) => string;
  savingInBrowser: string;
  savedInBrowser: (when: string) => string;
  notYet: string;
  linkFile: string;
  saveProgress: string;
  loadProgress: string;
  loadConfirm: string;
  loadDone: (n: number) => string;
  loadFailed: string;
  linkFailed: string;
}

const EN: UiStrings = {
  chromeAria: "App controls",
  zonesAria: "App zones",
  reader: "Reader",
  observer: "Observer",
  compiler: "Compiler",
  languageAria: "Interface language",
  preferences: "Prefs",
  prefLanguage: "Interface language",
  prefBible: "Bible text (Reader)",
  prefBibleNote: "Changes reading text only. Observer keeps LBF + Greek. Notes stay on the same verse.",
  progressHint: count =>
    `Titus progress found in this browser (${count} saved item${count === 1 ? "" : "s"}) — auto-save is on. Link a file in Observer for a disk backup.`,
  dismiss: "Dismiss",
  lockCompiler: "Lock Compiler",
  unlockCompiler: "Unlock Compiler (teachers)",

  observerKicker: "Observer",
  observerTitle: "Workshop — Titus",
  observerLede:
    "The text sits at the center. Mark what the Greek shows, then let structure settle in place — never by drag-and-drop.",
  workshopLayersAria: "Workshop layers",
  mark: "Mark",
  structure: "Structure",

  compilerKicker: "Compiler",
  compilerTitle: "Manual skeleton — Titus",
  compilerScope:
    "Generate from Observer, then pin definitions and cross-refs. Pins survive regenerate when their target line text still exists. Tools stay along the bottom. Reader notes and pins never mix into Observer * grammar slides.",
  generate: "Generate from O's current data",
  exportMd: "Export as .md",
  lineSelected: n => `Line ${n} selected`,
  closeFlags: "Close flags",
  flagsHeading: "Flagged during generation — check manually",
  emptyGenerate: 'Nothing generated yet — click "Generate from O\'s current data" above.',
  toolsAria: "Compiler tools",
  search: "Search",
  occurrences: "Occurrences",
  readerNotes: "Reader notes",
  yaml: "YAML",
  yamlNote: "Frontmatter only. Saved in this browser.",
  resetDefaults: "Reset defaults",
  summaryClauses: n => `${n} clause${n === 1 ? "" : "s"} in outline`,
  summaryPhrases: n => `${n} phrase${n === 1 ? "" : "s"} (+)`,
  summaryParked: n => `${n} parked in O (see flags)`,
  summaryPins: n => `${n} line pin${n === 1 ? "" : "s"}`,
  summaryFlagsHidden: n => `${n} flag${n === 1 ? "" : "s"} hidden`,

  readerKicker: "The Reader",
  notePlaceholder: "Write a short note...",
  close: "Close",
  delete: "Delete",
  save: "Save",
  noteFor: label => `Note for ${label}`,
  notesFor: label => `Notes for ${label}`,

  progressAria: "Save or load Titus progress",
  autosaveStarting: "Auto-save starting…",
  autosaveError: msg => `Auto-save error: ${msg}`,
  savingToFile: name => `Saving to ${name}…`,
  savedToFile: (name, when) => `Auto-saved to ${name} · ${when}`,
  savingInBrowser: "Saving in browser…",
  savedInBrowser: when => `Auto-saved in browser · ${when}`,
  notYet: "not yet",
  linkFile: "Link file",
  saveProgress: "Download a progress backup",
  loadProgress: "Load progress",
  loadConfirm:
    "This replaces your current Titus progress (marked verbs, clauses, moods, observations, notes) with what's in this file. Your current state isn't kept — this can't be undone. Continue?",
  loadDone: n => `Loaded ${n} saved item(s). Reloading to pick up the change…`,
  loadFailed: "Couldn't read that file.",
  linkFailed: "Couldn't link an auto-save file."
};

const ES: UiStrings = {
  chromeAria: "Controles de la aplicación",
  zonesAria: "Zonas de la aplicación",
  reader: "Lector",
  observer: "Observador",
  compiler: "Compilador",
  languageAria: "Idioma de la interfaz",
  preferences: "Prefs",
  prefLanguage: "Idioma de la interfaz",
  prefBible: "Texto bíblico (Lector)",
  prefBibleNote:
    "Solo cambia el texto de lectura. Observador conserva LBF + griego. Las notas siguen en el mismo versículo.",
  progressHint: count =>
    `Progreso de Tito encontrado en este navegador (${count} elemento${count === 1 ? "" : "s"} guardado${count === 1 ? "" : "s"}) — el guardado automático está activo. Vincule un archivo en Observador para una copia en disco.`,
  dismiss: "Cerrar",
  lockCompiler: "Bloquear Compilador",
  unlockCompiler: "Desbloquear Compilador (maestros)",

  observerKicker: "Observador",
  observerTitle: "Taller — Tito",
  observerLede:
    "El texto está en el centro. Marque lo que muestra el griego; luego deje que la estructura se asiente en su lugar — nunca por arrastrar y soltar.",
  workshopLayersAria: "Capas del taller",
  mark: "Marcar",
  structure: "Estructura",

  compilerKicker: "Compilador",
  compilerTitle: "Esqueleto del manual — Tito",
  compilerScope:
    "Genere desde Observador; luego fije definiciones y referencias. Los pines sobreviven al regenerar si el texto de la línea sigue existiendo. Las herramientas están abajo. Las notas del Lector y los pines no se mezclan con las diapositivas gramaticales * de Observador.",
  generate: "Generar desde los datos actuales de O",
  exportMd: "Exportar como .md",
  lineSelected: n => `Línea ${n} seleccionada`,
  closeFlags: "Cerrar avisos",
  flagsHeading: "Marcado durante la generación — revise manualmente",
  emptyGenerate: 'Aún no hay nada generado — pulse "Generar desde los datos actuales de O" arriba.',
  toolsAria: "Herramientas del Compilador",
  search: "Buscar",
  occurrences: "Ocurrencias",
  readerNotes: "Notas del Lector",
  yaml: "YAML",
  yamlNote: "Solo frontmatter. Se guarda en este navegador.",
  resetDefaults: "Restablecer valores",
  summaryClauses: n => `${n} cláusula${n === 1 ? "" : "s"} en el esquema`,
  summaryPhrases: n => `${n} frase${n === 1 ? "" : "s"} (+)`,
  summaryParked: n => `${n} aparcada${n === 1 ? "" : "s"} en O (ver avisos)`,
  summaryPins: n => `${n} pin${n === 1 ? "" : "es"} de línea`,
  summaryFlagsHidden: n => `${n} aviso${n === 1 ? "" : "s"} oculto${n === 1 ? "" : "s"}`,

  readerKicker: "El Lector",
  notePlaceholder: "Escriba una nota breve...",
  close: "Cerrar",
  delete: "Borrar",
  save: "Guardar",
  noteFor: label => `Nota para ${label}`,
  notesFor: label => `Notas de ${label}`,

  progressAria: "Guardar o cargar el progreso de Tito",
  autosaveStarting: "Iniciando guardado automático…",
  autosaveError: msg => `Error de guardado automático: ${msg}`,
  savingToFile: name => `Guardando en ${name}…`,
  savedToFile: (name, when) => `Guardado en ${name} · ${when}`,
  savingInBrowser: "Guardando en el navegador…",
  savedInBrowser: when => `Guardado en el navegador · ${when}`,
  notYet: "aún no",
  linkFile: "Vincular archivo",
  saveProgress: "Descargar copia del progreso",
  loadProgress: "Cargar progreso",
  loadConfirm:
    "Esto reemplaza su progreso actual de Tito (verbos marcados, cláusulas, modos, observaciones, notas) con lo que hay en este archivo. El estado actual no se conserva — no se puede deshacer. ¿Continuar?",
  loadDone: n => `Se cargaron ${n} elemento(s). Recargando para aplicar el cambio…`,
  loadFailed: "No se pudo leer ese archivo.",
  linkFailed: "No se pudo vincular un archivo de guardado automático."
};

export const UI_STRINGS: Record<UiLanguage, UiStrings> = {
  en: EN,
  es: ES
};
