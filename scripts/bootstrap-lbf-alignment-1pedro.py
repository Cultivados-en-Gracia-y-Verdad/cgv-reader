#!/usr/bin/env python3
"""Bootstrap data/lbf/nt/1pedro.alignment.json from BLE interlinear + LBF text.

DEPRECATED for 1 Pedro. Prefer:

  python3 scripts/compile-lbf-alignment-1pedro.py

which compiles Morph→LBF from translator reverse-links (source of truth).
This greedy bootstrap + HAND dict caused repeated re-alignments of the same
verses because it duplicated work the translator had already done.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CGV_DATA = ROOT.parent / "cgv-data"
OUT = ROOT / "data/lbf/nt/1pedro.alignment.json"
LBF_MD = ROOT / "data/lbf/nt/1pedro.md"

INTERLINEAR_TOKEN_PATTERN = re.compile(r"(\S+?)<([^|<>]+)\|([^|<>]+)\|([^|<>]+)\|([^<>]+)>")
WORD_PATTERN = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+", re.UNICODE)
FUNCTION = {
    "de", "del", "la", "el", "los", "las", "un", "una", "y", "e", "o", "a", "al",
    "en", "con", "por", "para", "que", "lo", "su", "sus", "mi", "tu", "ni", "se",
    "le", "les", "me", "te", "nos", "os", "es", "son", "fue", "ha", "han", "como",
    "si", "no", "ya", "mas", "más", "sino", "pero", "pues",
}


def norm(value: str) -> str:
    value = value.lower().strip()
    value = "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", value)


def stem_es(value: str) -> str:
    n = norm(value)
    for suf in (
        "amente", "mente", "ciones", "cion", "ando", "iendo", "aron", "ieron",
        "amos", "emos", "imos", "aba", "ado", "ido", "osos", "osas", "oso", "osa",
    ):
        if len(n) > len(suf) + 3 and n.endswith(suf):
            return n[: -len(suf)]
    return n[: max(4, len(n) - 2)] if len(n) > 5 else n


def tokenize(text: str) -> list[str]:
    return [m.group(0) for m in WORD_PATTERN.finditer(text) if re.search(r"[\wáéíóúüñÁÉÍÓÚÜÑ]", m.group(0))]


def load_lbf_verses() -> dict[tuple[int, int], str]:
    content = LBF_MD.read_text()
    verses: dict[tuple[int, int], str] = {}
    chapter = verse = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal chapter, verse, buffer
        if chapter and verse and buffer:
            verses[(chapter, verse)] = " ".join(buffer).strip()
        buffer = []

    for line in content.splitlines():
        chapter_header = re.match(r"^##\s+Capítulo\s+(\d+)", line, re.I)
        if chapter_header:
            flush()
            chapter = int(chapter_header.group(1))
            verse = None
            continue
        verse_header = re.match(r"^###\s+(\d+):(\d+)", line)
        if verse_header:
            flush()
            chapter = int(verse_header.group(1))
            verse = int(verse_header.group(2))
            continue
        if not line.strip() or line.startswith("#") or line.startswith(">"):
            continue
        if chapter and verse:
            buffer.append(line.strip())
    flush()
    return verses


def load_ble() -> dict[tuple[int, int], list[dict]]:
    out: dict[tuple[int, int], list[dict]] = {}
    for path in sorted((CGV_DATA / "interlinears/NT").glob("1pedro-*.interlinear.txt")):
        for line in path.read_text().splitlines():
            match = re.match(r"^1pedro\s+(\d+):(\d+)\t", line, re.I)
            if not match:
                continue
            chapter, verse = int(match.group(1)), int(match.group(2))
            tab = line.find("\t")
            tokens = []
            for token_match in INTERLINEAR_TOKEN_PATTERN.finditer(line[tab + 1 :]):
                surface, _lemma, _strongs, morph, gloss = token_match.groups()
                tokens.append({"surface": surface, "morph": morph, "gloss": gloss.replace("·", " ")})
            out[(chapter, verse)] = tokens
    return out


def score_match(part: str, word: str) -> int | None:
    part_n, word_n = norm(part), norm(word)
    if not part_n or not word_n:
        return None
    if word_n == part_n:
        return 0
    # LBF often compounds "Jesucristo"; BLE glosses split Jesús / Cristo.
    if word_n == "jesucristo" and part_n in {"jesus", "cristo", "jesucristo"}:
        return 0
    if len(part_n) >= 3 and (word_n.startswith(part_n) or part_n.startswith(word_n)):
        return 1
    if stem_es(word) == stem_es(part) and len(stem_es(part)) >= 3:
        return 2
    return None


# Verified overrides: (chapter, verse, token) -> (lbfWordIndex, lbfSurface)
HAND: dict[tuple[int, int, int], tuple[int, str]] = {
    # 1:25 — bootstrap stole δὲ→Y and left most of the verse unaligned.
    # LBF: Pero la palabra del Señor permanece para siempre. Y esta es la
    #      palabra que les fue anunciada como evangelio
    (1, 25, 1): (1, "la"),
    (1, 25, 2): (0, "Pero"),
    (1, 25, 3): (2, "palabra"),
    (1, 25, 4): (4, "Señor"),
    (1, 25, 5): (5, "permanece"),
    (1, 25, 6): (6, "para"),
    (1, 25, 8): (7, "siempre"),
    (1, 25, 9): (9, "esta"),
    (1, 25, 10): (8, "Y"),
    (1, 25, 11): (10, "es"),
    (1, 25, 12): (11, "la"),
    (1, 25, 13): (12, "palabra"),
    (1, 25, 14): (13, "que"),
    (1, 25, 15): (16, "anunciada"),
    (1, 25, 17): (14, "les"),
    # 1:24 — rebuilt from translator reverse-links.
    # Morph: αὐτῆς for TR ἀνθρώπου; no αὐτοῦ (absorbed into “su flor” on τὸ ἄνθος).
    (1, 24, 1): (0, "Porque"),
    (1, 24, 2): (1, "toda"),
    (1, 24, 3): (2, "carne"),
    (1, 24, 4): (4, "es como"),
    (1, 24, 5): (5, "hierba"),
    (1, 24, 6): (6, "y"),
    (1, 24, 7): (7, "toda"),
    (1, 24, 8): (9, "la gloria"),
    (1, 24, 9): (11, "del hombre"),
    (1, 24, 10): (12, "como"),
    (1, 24, 11): (13, "flor"),
    (1, 24, 12): (15, "de hierba"),
    (1, 24, 13): (19, "se seca"),
    (1, 24, 14): (16, "La hierba"),
    (1, 24, 15): (17, "La hierba"),
    (1, 24, 16): (20, "y"),
    (1, 24, 17): (21, "su flor"),
    (1, 24, 18): (22, "su flor"),
    (1, 24, 19): (24, "se cae"),
    # 1:12 — rebuilt from translator reverse-links (Morph spine; TR ἐν omitted
    # after ὑμᾶς, so “en el Espíritu Santo” rides on πνεύματι).
    # Phrase 13–15 LBF units:
    (1, 12, 1): (1, "A ellos"),
    (1, 12, 2): (4, "les fue revelado"),
    (1, 12, 3): (5, "que"),
    (1, 12, 4): (6, "no"),
    (1, 12, 5): (11, "a sí mismos"),
    (1, 12, 6): (14, "a nosotros"),
    (1, 12, 7): (12, "sino"),
    (1, 12, 8): (8, "se servían"),
    (1, 12, 9): (17, "con estas cosas"),
    (1, 12, 10): (19, "las cuales"),
    (1, 12, 11): (20, "ahora"),
    (1, 12, 12): (24, "les han sido anunciadas"),
    (1, 12, 13): (21, "les han sido anunciadas"),
    (1, 12, 14): (25, "por medio de"),
    (1, 12, 15): (28, "quienes les predicaron el evangelio"),
    (1, 12, 16): (30, "quienes les predicaron el evangelio"),
    (1, 12, 17): (29, "quienes les predicaron el evangelio"),
    (1, 12, 18): (35, "en el Espíritu Santo"),
    (1, 12, 19): (36, "en el Espíritu Santo"),
    (1, 12, 20): (37, "enviado"),
    (1, 12, 21): (38, "del cielo"),
    (1, 12, 22): (39, "del cielo"),
    (1, 12, 23): (40, "cosas en las cuales"),
    (1, 12, 24): (43, "cosas en las cuales"),
    (1, 12, 25): (46, "anhelan"),
    (1, 12, 26): (45, "los ángeles"),
    (1, 12, 27): (47, "mirar"),
    # 5:13 — missing ὑμᾶς / συνεκλεκτὴ / μου; LBF expands ἡ ἐν… to "la que está…"
    # LBF: Los saluda la que está en Babilonia, elegida juntamente con ustedes,
    #      y Marcos, mi hijo
    (5, 13, 1): (1, "saluda"),
    (5, 13, 2): (0, "Los"),
    (5, 13, 3): (2, "la"),
    (5, 13, 4): (5, "en"),
    (5, 13, 5): (6, "Babilonia"),
    (5, 13, 6): (7, "elegida"),
    (5, 13, 7): (11, "y"),
    (5, 13, 8): (12, "Marcos"),
    (5, 13, 10): (14, "hijo"),
    (5, 13, 11): (13, "mi"),
    # Brick 4 unresolved participles (Structure "couldn't match … to any Spanish word")
    (1, 3, 17): (16, "renacer"),
    (1, 3, 21): (20, "viva"),
    (1, 4, 8): (8, "reservada"),
    (1, 6, 7): (13, "necesario"),
    (1, 6, 8): (15, "afligidos"),
    (1, 7, 10): (14, "perece"),
    (1, 8, 9): (12, "ven"),
    (1, 8, 10): (13, "creyendo"),
    (1, 8, 16): (20, "glorioso"),
    (1, 9, 1): (0, "obteniendo"),
    (1, 10, 14): (10, "profetizaron"),
    (1, 11, 13): (17, "testimonio"),
    (1, 13, 2): (2, "ciñendo"),
    (1, 13, 8): (10, "sobrios"),
    (1, 13, 13): (22, "traída"),
    (1, 14, 5): (5, "conformándose"),
    (1, 15, 4): (6, "llamó"),
    (1, 18, 1): (0, "sabiendo"),
    (1, 21, 8): (10, "levantó"),
    (1, 21, 15): (17, "dio"),
    (1, 23, 1): (1, "nacido"),
    (1, 23, 10): (15, "viva"),
    (1, 23, 13): (17, "permanente"),
    (2, 1, 1): (2, "desechando"),
    (2, 4, 3): (0, "Acercándose"),
    (2, 4, 5): (4, "viva"),
    (2, 4, 9): (5, "desechada"),
    (2, 5, 5): (4, "vivas"),
    (2, 6, 15): (27, "cree"),
    (2, 7, 6): (3, "creen"),
    (2, 7, 7): (11, "desobedecen"),
    (2, 7, 13): (17, "edificadores"),
    (2, 9, 20): (20, "llamó"),
    (2, 12, 7): (0, "manteniendo"),
    (2, 16, 7): (4, "usando"),
    (2, 18, 3): (2, "sométanse"),
    (3, 1, 3): (2, "sométanse"),
    (3, 2, 1): (1, "observar"),
    (3, 5, 9): (10, "esperaban"),
    (3, 5, 14): (13, "sometiéndose"),
    (3, 6, 15): (20, "temer"),
    (3, 7, 4): (2, "convivan"),
    (3, 7, 12): (7, "dando"),
    (3, 9, 12): (12, "bendiciendo"),
    (3, 10, 3): (2, "quiere"),
    (3, 12, 16): (25, "hacen"),
    (3, 15, 16): (18, "pida"),
    (3, 16, 15): (20, "insultan"),
    (3, 18, 16): (18, "muerto"),
    (3, 18, 19): (23, "vivificado"),
    (3, 19, 8): (4, "fue"),
    # 3:20 LBF currently drops ἀπειθήσασιν ("desobedientes"); park on ποτε→vez for now.
    (3, 20, 1): (0, "vez"),
    (3, 20, 12): (13, "construía"),
    (4, 3, 11): (18, "andado"),
    (4, 5, 6): (6, "preparado"),
    (4, 5, 8): (10, "vivos"),
    (4, 8, 8): (2, "tengan"),
    (4, 10, 8): (6, "sírvalo"),
    (4, 12, 11): (9, "está"),
    (4, 12, 15): (17, "sucediera"),
    (4, 13, 18): (26, "júbilo"),
    (5, 1, 17): (29, "revelada"),
    (5, 2, 8): (9, "cuidándolo"),
    (5, 3, 3): (2, "dominando"),
    (5, 3, 8): (11, "siendo"),
    (5, 4, 2): (3, "manifieste"),
    (5, 7, 5): (0, "echando"),
    (5, 9, 6): (5, "sabiendo"),
    (5, 10, 7): (8, "llamó"),
    (5, 12, 12): (13, "exhortando"),
    (5, 12, 14): (16, "testimonio"),
}

# Tokens that must stay unaligned (function absorbed into a neighboring Spanish word).
DROP: set[tuple[int, int, int]] = {
    (1, 25, 7),   # τὸν — inside εἰς τὸν αἰῶνα → para siempre
    (1, 25, 16),  # εἰς — absorbed into les (ὑμᾶς)
    (5, 13, 9),   # ὁ — absorbed into mi hijo
}

# Verses whose HAND map fully replaces the greedy rows for that verse.
HAND_FULL_VERSES: set[tuple[int, int]] = {(1, 12), (1, 24), (1, 25), (5, 13)}


def main() -> None:
    if not LBF_MD.exists():
        raise SystemExit(f"Missing LBF markdown: {LBF_MD}")

    verses = load_lbf_verses()
    ble = load_ble()
    records: dict[tuple[int, int, int], dict] = {}

    for (chapter, verse), tokens in sorted(ble.items()):
        words = tokenize(verses.get((chapter, verse), ""))
        if not words:
            print(f"WARN: no LBF words for {chapter}:{verse}")
            continue
        used: set[int] = set()
        cursor = 0
        n = len(tokens)

        for i, token in enumerate(tokens, 1):
            parts = [p for p in re.split(r"\s+", token["gloss"]) if norm(p)]
            if not parts:
                continue
            content = token["morph"].startswith(("N-", "A-", "V-", "R-", "P-"))
            denom = max(1, n - 1)
            expect = int(round((i - 1) / denom * max(0, len(words) - 1)))

            hits: list[tuple[int, int, int, int, str]] = []
            for word_index, word in enumerate(words):
                if word_index in used:
                    continue
                word_is_function = norm(word) in FUNCTION
                best: int | None = None
                for part in parts:
                    part_is_function = norm(part) in FUNCTION
                    # Content Greek never claims Spanish function words (stops
                    # Ἰησοῦ / Χριστοῦ stealing "de" from "de Jesús"/"de Cristo").
                    if content and word_is_function:
                        continue
                    if (not content) and word_is_function and not part_is_function:
                        continue
                    score = score_match(part, word)
                    if score is None:
                        continue
                    best = score if best is None else min(best, score)
                if best is not None:
                    hits.append((best, abs(word_index - expect), abs(word_index - cursor), word_index, word))

            if not hits:
                continue
            hits.sort()
            max_score = 2 if content else 1
            cands = [h for h in hits if h[0] <= max_score]
            if not cands:
                continue
            _score, _e, _c, word_index, word = cands[0]
            records[(chapter, verse, i)] = {
                "chapter": chapter,
                "verse": verse,
                "token": i,
                "greekSurface": token["surface"],
                "lbfSurface": word,
                "lbfWordIndex": word_index,
            }
            used.add(word_index)
            cursor = max(cursor, word_index + 1)

    for key in DROP:
        records.pop(key, None)

    # Full-verse HAND: clear greedy rows so overrides aren't fighting leftovers.
    for key in list(records):
        if (key[0], key[1]) in HAND_FULL_VERSES:
            records.pop(key, None)

    for (chapter, verse, token), (index, surface) in HAND.items():
        ble_tok = ble[(chapter, verse)][token - 1]
        records[(chapter, verse, token)] = {
            "chapter": chapter,
            "verse": verse,
            "token": token,
            "greekSurface": ble_tok["surface"],
            "lbfSurface": surface,
            "lbfWordIndex": index,
        }

    out_records = sorted(records.values(), key=lambda r: (r["chapter"], r["verse"], r["token"]))
    total = sum(len(tokens) for tokens in ble.values())
    payload = {
        "meta": {
            "book": "1pedro",
            "spanish": "LBF",
            "greekSpine": "MorphGNT/BLE",
            "note": (
                "Bootstrap BLE gloss → LBF (greedy positional, function-theft guards), "
                "plus HAND overrides where verified."
            ),
            "coverage": f"{len(out_records)}/{total}",
            "alignedTokens": len(out_records),
            "totalTokens": total,
            "repairs": {"handOverrides": len(HAND)},
        },
        "records": out_records,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {OUT}")
    print(f"Coverage {len(out_records)}/{total} ({len(out_records) / total:.1%})")
    print(f"Hand overrides: {len(HAND)}")


if __name__ == "__main__":
    main()
