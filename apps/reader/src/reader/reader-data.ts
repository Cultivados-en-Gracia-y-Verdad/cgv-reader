import { parseNblaContent, type BibleVerse } from "cgv-bible";
import titusNbla from "@cgv-data/bibles/NBLA/tito.nbla.md?raw";

export interface ReaderBook {
  title: string;
  version: string;
  verses: BibleVerse[];
}

export function loadTitus(): ReaderBook {
  return {
    title: "Tito",
    version: "NBLA",
    verses: parseNblaContent(titusNbla)
  };
}
