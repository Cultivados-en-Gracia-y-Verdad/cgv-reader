import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  readUiLanguage,
  subscribeUiLanguage,
  writeUiLanguage,
  type UiLanguage
} from "@cgv/core";
import { UI_STRINGS, type UiStrings } from "./ui-strings";

interface UiLanguageContextValue {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  t: UiStrings;
}

const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

export function UiLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(() => readUiLanguage());

  useEffect(() => subscribeUiLanguage(setLanguageState), []);

  const value = useMemo<UiLanguageContextValue>(
    () => ({
      language,
      setLanguage: (next: UiLanguage) => {
        writeUiLanguage(next);
        setLanguageState(next);
      },
      t: UI_STRINGS[language]
    }),
    [language]
  );

  return <UiLanguageContext.Provider value={value}>{children}</UiLanguageContext.Provider>;
}

export function useUiLanguage(): UiLanguageContextValue {
  const ctx = useContext(UiLanguageContext);
  if (!ctx) {
    throw new Error("useUiLanguage must be used within UiLanguageProvider");
  }
  return ctx;
}

export function LanguageToggle() {
  const { language, setLanguage, t } = useUiLanguage();
  return (
    <div className="language-toggle" role="tablist" aria-label={t.languageAria}>
      <button
        type="button"
        className={`language-toggle-option${language === "en" ? " language-toggle-option--active" : ""}`}
        onClick={() => setLanguage("en")}
        role="tab"
        aria-selected={language === "en"}
      >
        EN
      </button>
      <button
        type="button"
        className={`language-toggle-option${language === "es" ? " language-toggle-option--active" : ""}`}
        onClick={() => setLanguage("es")}
        role="tab"
        aria-selected={language === "es"}
      >
        ES
      </button>
    </div>
  );
}
