#!/usr/bin/env python3
"""Careful repair of data/lbf/nt/tito.alignment.json.

Does NOT wholesale-rebuild (that destroyed finite-verb maps). Starts from the
committed Mission Mutual bootstrap, applies hand-verified overrides, then
high-confidence content remaps/fills from BLE gloss → LBF surface.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CGV_DATA = ROOT.parent / "cgv-data"
OUT = ROOT / "data/lbf/nt/tito.alignment.json"
LBF_MD = ROOT / "data/lbf/nt/tito.md"

# Prefer git HEAD as base when present; else current file.
def load_base() -> dict:
    import subprocess

    try:
        raw = subprocess.check_output(
            ["git", "show", "HEAD:data/lbf/nt/tito.alignment.json"],
            cwd=ROOT,
            text=True,
        )
        return json.loads(raw)
    except Exception:
        return json.loads(OUT.read_text())


INTERLINEAR_TOKEN_PATTERN = re.compile(r"(\S+?)<([^|<>]+)\|([^|<>]+)\|([^|<>]+)\|([^<>]+)>")
WORD_PATTERN = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+", re.UNICODE)
FUNCTION = {
    "de",
    "del",
    "la",
    "el",
    "los",
    "las",
    "un",
    "una",
    "y",
    "e",
    "o",
    "a",
    "al",
    "en",
    "con",
    "por",
    "para",
    "que",
    "lo",
    "su",
    "sus",
    "mi",
    "tu",
    "ni",
    "se",
    "le",
    "les",
    "me",
    "te",
    "nos",
    "os",
    "es",
    "son",
    "fue",
    "ha",
    "han",
    "como",
    "si",
    "no",
    "ya",
    "mas",
    "más",
    "sino",
    "pero",
}


def norm(value: str) -> str:
    value = value.lower().strip()
    value = "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", value)


def stem_es(value: str) -> str:
    n = norm(value)
    for suf in (
        "amente",
        "mente",
        "ciones",
        "cion",
        "ando",
        "iendo",
        "aron",
        "ieron",
        "amos",
        "emos",
        "imos",
        "aba",
        "ado",
        "ido",
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
    for name in ("tito-01", "tito-02", "tito-03"):
        path = CGV_DATA / f"interlinears/NT/{name}.interlinear.txt"
        for line in path.read_text().splitlines():
            match = re.match(r"^tito\s+(\d+):(\d+)\t", line, re.I)
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


# Verified overrides: (chapter, verse, token) -> (lbfWordIndex, lbfSurface)
# Full-book pass Jul 2026: fix index theft, relatives, and clear content gaps.
HAND: dict[tuple[int, int, int], tuple[int, str]] = {
    # 1:1–1:5
    (1, 1, 3): (3, "Dios"),
    (1, 1, 6): (7, "Jesús"),
    (1, 1, 7): (6, "Cristo"),
    (1, 1, 16): (23, "de acuerdo con"),
    (1, 2, 5): (8, "la cual"),
    (1, 2, 8): (15, "mentira"),
    (1, 2, 11): (19, "tiempos"),
    (1, 3, 1): (5, "manifestó"),
    (1, 3, 2): (0, "y"),
    (1, 3, 3): (4, "tiempo"),
    (1, 3, 4): (3, "propio"),
    (1, 3, 6): (7, "palabra"),
    (1, 3, 7): (6, "su"),
    (1, 3, 8): (8, "por"),
    (1, 3, 9): (10, "predicación"),
    (1, 3, 10): (12, "la cual"),
    (1, 3, 11): (15, "confiada"),
    (1, 3, 12): (13, "me"),
    (1, 3, 13): (16, "según"),
    (1, 3, 14): (18, "mandato"),
    (1, 3, 15): (19, "de"),
    (1, 3, 16): (22, "Salvador"),
    (1, 3, 17): (21, "nuestro"),
    (1, 3, 18): (20, "Dios"),
    (1, 4, 14): (16, "Cristo"),
    (1, 5, 2): (2, "Por esta razón"),
    (1, 5, 13): (17, "cada"),
    # 1:6–1:10
    (1, 6, 4): (3, "irreprochable"),
    (1, 6, 9): (9, "con"),
    (1, 7, 5): (7, "irreprochable"),
    (1, 7, 8): (11, "Dios"),
    (1, 7, 15): (17, "bebedor"),
    (1, 7, 17): (19, "violento"),
    (1, 8, 3): (2, "amante de lo bueno"),
    (1, 9, 1): (0, "reteniendo"),
    (1, 9, 3): (4, "conforme"),
    (1, 9, 11): (12, "tanto"),
    (1, 9, 18): (19, "como"),
    (1, 9, 20): (25, "contradicen"),
    (1, 10, 4): (3, "e"),
    (1, 10, 6): (5, "vanos habladores"),
    (1, 10, 9): (9, "sobre todo"),
    # 1:11–1:16
    (1, 11, 1): (1, "a quienes"),
    (1, 11, 3): (4, "tapar la boca"),
    (1, 11, 9): (13, "lo que"),
    (1, 11, 14): (17, "por causa de"),
    (1, 13, 7): (5, "esta"),
    (1, 13, 12): (9, "para que"),
    (1, 13, 13): (12, "sean sanos"),
    (1, 13, 15): (14, "la"),
    (1, 14, 2): (1, "prestando atención"),
    (1, 15, 2): (4, "puras"),
    (1, 15, 4): (7, "puros"),
    (1, 15, 6): (8, "pero"),
    (1, 15, 11): (16, "puro"),
    (1, 15, 12): (17, "sino que"),
    (1, 15, 13): (26, "están contaminadas"),
    (1, 15, 14): (20, "su"),
    (1, 15, 15): (19, "tanto"),
    (1, 15, 18): (22, "como"),
    (1, 16, 5): (4, "pero"),
    (1, 16, 10): (12, "e"),
    (1, 16, 11): (13, "inobedientes"),
    (1, 16, 12): (14, "y"),
    (1, 16, 13): (16, "para"),
    # Ch 2
    (2, 1, 2): (0, "Pero"),
    (2, 1, 4): (4, "lo que"),
    (2, 1, 6): (7, "la"),
    (2, 2, 1): (2, "ancianos"),
    (2, 2, 4): (5, "dignos"),
    (2, 3, 1): (1, "ancianas"),
    (2, 4, 2): (2, "instruyan"),
    (2, 4, 7): (12, "amantes de sus hijos"),
    (2, 5, 7): (9, "propios"),
    (2, 5, 13): (15, "de"),
    (2, 5, 14): (16, "Dios"),
    (2, 6, 2): (4, "jóvenes"),
    (2, 6, 5): (7, "prudentes"),
    (2, 7, 3): (0, "mostrándote"),
    (2, 7, 10): (10, "enseñanza"),
    (2, 8, 9): (14, "nada"),
    (2, 9, 2): (6, "propios"),
    (2, 9, 3): (7, "amos"),
    (2, 9, 10): (13, "contradiciendo"),
    (2, 10, 2): (1, "apropiándose"),
    (2, 10, 3): (2, "sino"),
    (2, 10, 5): (6, "fidelidad"),
    (2, 10, 14): (16, "nuestro"),
    (2, 11, 1): (3, "manifestado"),
    (2, 12, 18): (19, "el"),
    (2, 12, 19): (20, "presente"),
    (2, 13, 1): (0, "aguardando"),
    (2, 14, 1): (0, "quien"),
    (2, 14, 2): (2, "dio"),
    (2, 15, 1): (0, "Estas cosas"),
    # Ch 3
    (3, 1, 3): (6, "gobernantes"),
    (3, 1, 5): (3, "sometan"),
    (3, 1, 7): (15, "para"),
    (3, 1, 12): (13, "estar"),
    (3, 2, 9): (10, "hacia"),
    (3, 3, 9): (10, "esclavizados"),
    (3, 4, 2): (0, "Pero"),
    (3, 4, 5): (6, "y"),
    (3, 5, 10): (8, "sino"),
    (3, 5, 13): (10, "su"),
    (3, 5, 17): (14, "mediante"),
    (3, 6, 1): (1, "el cual"),
    (3, 6, 7): (9, "Jesús"),
    (3, 7, 7): (8, "llegáramos a ser"),
    (3, 8, 8): (11, "te"),
    (3, 8, 9): (12, "afirmes firmemente"),
    (3, 8, 15): (16, "los"),
    (3, 8, 18): (27, "Estas cosas"),
    (3, 8, 19): (29, "son"),
    (3, 8, 23): (33, "para"),
    (3, 9, 2): (0, "Pero"),
    (3, 9, 3): (4, "controversias"),
    (3, 9, 10): (9, "acerca de la ley"),
    (3, 10, 1): (2, "sectario"),
    (3, 11, 1): (0, "sabiendo"),
    (3, 12, 7): (8, "Tíquico"),
    (3, 13, 3): (3, "jurista"),
    (3, 14, 3): (2, "también"),
    (3, 14, 8): (6, "dedicarse"),
    (3, 14, 9): (10, "para"),
    (3, 14, 11): (13, "urgentes"),
    (3, 14, 13): (14, "para"),
    (3, 14, 16): (18, "infructuosos"),
}

DROP = {
    (1, 3, 5),  # τὸν — absorbed into "su palabra"
    (1, 9, 16),  # τῇ — stole "a" from "a los que contradicen"
    (1, 13, 1),  # ἡ — LBF "Este testimonio"; bootstrap stole "la" from "en la fe"
    (3, 1, 2),  # αὐτοὺς — absorbed into "Recuérdales"; stole "los"
    (3, 5, 5),  # ἐν — stole "de" near regeneración
    (3, 5, 12),  # τὸ — stole "la" of regeneración
    (3, 8, 14),  # προΐστασθαι — absorbed into "se dediquen"
    (3, 9, 4),  # καὶ — LBF uses comma between controversias/genealogías
}


def main() -> None:
    base = load_base()
    verses = load_lbf_verses()
    ble = load_ble()
    records = {(r["chapter"], r["verse"], r["token"]): r for r in base["records"]}

    for key in DROP:
        records.pop(key, None)

    def set_rec(chapter: int, verse: int, token: int, index: int, surface: str) -> None:
        ble_tok = ble[(chapter, verse)][token - 1]
        records[(chapter, verse, token)] = {
            "chapter": chapter,
            "verse": verse,
            "token": token,
            "greekSurface": ble_tok["surface"],
            "lbfSurface": surface,
            "lbfWordIndex": index,
        }

    for (chapter, verse, token), (index, surface) in HAND.items():
        set_rec(chapter, verse, token, index, surface)

    remaps = 0
    fills = 0
    for (chapter, verse), tokens in ble.items():
        words = tokenize(verses[(chapter, verse)])
        used = {records[k]["lbfWordIndex"] for k in records if k[0] == chapter and k[1] == verse}

        for i, token in enumerate(tokens, 1):
            key = (chapter, verse, i)
            if key in DROP:
                continue
            gloss_parts = [p for p in re.split(r"\s+", token["gloss"]) if norm(p) and norm(p) not in FUNCTION]
            content = token["morph"].startswith(("N-", "A-", "V-", "R-", "P-"))
            if not gloss_parts:
                continue

            def hits(allow_used: bool = False) -> list[tuple[int, int, str]]:
                found: list[tuple[int, int, str]] = []
                for word_index, word in enumerate(words):
                    if not allow_used and word_index in used:
                        if key not in records or records[key]["lbfWordIndex"] != word_index:
                            continue
                    word_n = norm(word)
                    for part in gloss_parts:
                        part_n = norm(part)
                        if word_n == part_n:
                            found.append((0, word_index, word))
                            break
                        if len(part_n) >= 4 and (word_n.startswith(part_n) or part_n.startswith(word_n)):
                            found.append((1, word_index, word))
                            break
                        if stem_es(word) == stem_es(part) and len(stem_es(part)) >= 4:
                            found.append((2, word_index, word))
                            break
                found.sort()
                return found

            if key in records:
                current = records[key]
                if content and norm(current["lbfSurface"]) in FUNCTION:
                    options = [h for h in hits(False) if norm(h[2]) not in FUNCTION]
                    if options:
                        options.sort(key=lambda item: (item[0], abs(item[1] - current["lbfWordIndex"])))
                        _score, word_index, word = options[0]
                        used.discard(current["lbfWordIndex"])
                        set_rec(chapter, verse, i, word_index, word)
                        used.add(word_index)
                        remaps += 1
            elif content:
                options = [h for h in hits(False) if norm(h[2]) not in FUNCTION and h[0] <= 1]
                exact = [h for h in options if h[0] == 0]
                if len({h[1] for h in exact}) == 1:
                    _score, word_index, word = exact[0]
                    set_rec(chapter, verse, i, word_index, word)
                    used.add(word_index)
                    fills += 1
                elif len(options) == 1:
                    _score, word_index, word = options[0]
                    set_rec(chapter, verse, i, word_index, word)
                    used.add(word_index)
                    fills += 1

    out_records = sorted(records.values(), key=lambda r: (r["chapter"], r["verse"], r["token"]))
    total = sum(len(tokens) for tokens in ble.values())
    payload = {
        "meta": {
            "book": "tito",
            "spanish": "LBF",
            "greekSpine": "MorphGNT/BLE",
            "note": "Mission Mutual bootstrap + BLE glosses; hand-verified overrides; high-confidence content remaps/fills.",
            "coverage": f"{len(out_records)}/{total}",
            "repairs": {"contentRemaps": remaps, "highConfidenceFills": fills, "handOverrides": len(HAND)},
        },
        "records": out_records,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {OUT}")
    print(f"Coverage {len(out_records)}/{total} ({len(out_records)/total:.1%})")
    print(f"Remaps={remaps} fills={fills} hand={len(HAND)}")


if __name__ == "__main__":
    main()
