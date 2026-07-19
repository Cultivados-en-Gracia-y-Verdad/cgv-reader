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
