#!/usr/bin/env python3
"""Seed Daniel reverse-links (OSHB → LBF) with gloss-assisted matching.

Requires: daniel-oshb-spine.json (run build-daniel-oshb-spine.py first)
Writes:  herramientas/.../oshb-spine/daniel/daniel-reverse-links.json
         (and daniel-phrases.json — one phrase per verse)

Default: all 12 chapters. Pass --chapter N to seed a single chapter only.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT.parent / "herramientas" / "cgv-translator" / "translations" / "oshb-spine" / "daniel"
SPINE = OUT_DIR / "daniel-oshb-spine.json"
PHRASES = OUT_DIR / "daniel-phrases.json"
LINKS = OUT_DIR / "daniel-reverse-links.json"
LBF_MD = ROOT / "data/lbf/ot/daniel.md"

WORD_RE = re.compile(
    r"[A-Za-zÁÉÍÓÚÜáéíóúüÑñÂÊÎÔÛâêîôûÄËÏÖÜäëïöü]+(?:'[A-Za-zÁÉÍÓÚÜáéíóúüÑñÂÊÎÔÛâêîôû]+)?"
)

FUNCTION = {
    "el", "la", "los", "las", "un", "una", "unos", "unas",
    "de", "del", "al", "a", "en", "por", "para", "con", "sin",
    "que", "y", "e", "o", "u", "su", "sus", "lo", "les", "nos",
    "me", "te", "se", "le", "este", "esta", "estos", "estas",
    "ese", "esa", "esos", "esas", "si", "no", "ni", "ya", "mas",
    "mi", "tu", "mis", "tus", "nuestro", "nuestra", "nuestros", "nuestras",
    "he", "ha", "has", "han", "hemos", "habeis", "habéis",
    "oh", "pues", "asi", "así", "muy", "todo", "toda", "todos", "todas",
}

# Gloss fragments that are structural / not content Spanish
GLOSS_SKIP = {
    "obj", "the", "a", "an", "and", "of", "to", "in", "on", "at",
}


def mt_to_protestant(ch: int, vs: int) -> tuple[int, int]:
    """Map OSHB/MT Daniel refs to Protestant/LBF verse numbers.

    MT 3:31–33 → Prot 4:1–3; MT 4:n → Prot 4:(n+3);
    MT 6:1 → Prot 5:31; MT 6:n (n≥2) → Prot 6:(n−1).
    """
    if ch == 3 and vs >= 31:
        return 4, vs - 30
    if ch == 4:
        return 4, vs + 3
    if ch == 6 and vs == 1:
        return 5, 31
    if ch == 6 and vs >= 2:
        return 6, vs - 1
    return ch, vs



def fold(value: str) -> str:
    value = value.lower().strip().replace("·", " ")
    value = "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", value)


def tokenize_spanish(spanish: str) -> list[dict]:
    return [
        {
            "surface": m.group(0),
            "charStart": m.start(),
            "charEnd": m.end(),
            "fold": fold(m.group(0)),
        }
        for m in WORD_RE.finditer(spanish)
    ]


def bundle_spanish(spanish: str) -> list[dict]:
    units = tokenize_spanish(spanish)
    if not units:
        return []
    bundles: list[dict] = []
    pending: list[dict] = []
    for u in units:
        if u["fold"] in FUNCTION:
            pending.append(u)
            continue
        group = pending + [u]
        pending = []
        bundles.append(
            {
                "surface": spanish[group[0]["charStart"] : group[-1]["charEnd"]],
                "charStart": group[0]["charStart"],
                "charEnd": group[-1]["charEnd"],
                "contentFold": u["fold"],
            }
        )
    if pending and bundles:
        last = bundles[-1]
        last["surface"] = spanish[last["charStart"] : pending[-1]["charEnd"]]
        last["charEnd"] = pending[-1]["charEnd"]
    elif pending:
        bundles.append(
            {
                "surface": spanish[pending[0]["charStart"] : pending[-1]["charEnd"]],
                "charStart": pending[0]["charStart"],
                "charEnd": pending[-1]["charEnd"],
                "contentFold": pending[-1]["fold"],
            }
        )
    return bundles


def gloss_parts(gloss: str) -> list[str]:
    parts = []
    for raw in re.split(r"[\s·/]+", gloss or ""):
        f = fold(raw)
        if f and f not in FUNCTION and f not in GLOSS_SKIP:
            parts.append(f)
    return parts


def gloss_score(gloss: str, bundle: dict) -> int:
    parts = gloss_parts(gloss)
    if not parts:
        return 0
    content = bundle["contentFold"]
    surface = fold(bundle["surface"])
    best = 0
    for part in parts:
        if part == content:
            best = max(best, 100)
        elif part in content or content in part:
            best = max(best, 80)
        elif part in surface:
            best = max(best, 60)
        else:
            n = min(5, len(part), len(content))
            if n >= 4 and part[:n] == content[:n]:
                best = max(best, 40)
    return best


def is_function_token(tok: dict) -> bool:
    morph = (tok.get("morph") or "").upper()
    # OSHB: articles, prepositions, conjunctions, object marker, negatives, pronouns
    if "/Td" in morph or morph.endswith("Td") or morph.startswith("HTd") or morph.startswith("ATd"):
        return True
    if morph.startswith("HR") or morph.startswith("AR"):
        # preposition — often function; keep if gloss has content
        parts = gloss_parts(tok.get("es") or "")
        if not parts:
            return True
    if morph.startswith("HC") or morph.startswith("AC"):
        # conjunction / waw — function when alone
        parts = gloss_parts(tok.get("es") or "")
        if not parts or parts == ["y"]:
            return True
    if morph.startswith("HTo") or morph.startswith("ATo") or morph == "HTo":
        return True
    if morph.startswith("HTn") or morph.startswith("ATn"):
        return True
    gloss_f = fold(tok.get("es") or "")
    if gloss_f in FUNCTION or gloss_f in GLOSS_SKIP or gloss_f in {"y", "de", "en", "a", "el", "la"}:
        return True
    if gloss_f.startswith("y") and gloss_f in {"y", "yel", "yla"}:
        return True
    return False


def load_lbf_verses(chapters: set[int] | None = None) -> dict[tuple[int, int], str]:
    content = LBF_MD.read_text(encoding="utf-8")
    verses: dict[tuple[int, int], str] = {}
    current_ch = None
    current_vs = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal current_vs, buffer
        if current_ch and current_vs and buffer:
            if chapters is None or current_ch in chapters:
                verses[(current_ch, current_vs)] = " ".join(buffer).strip()
        buffer = []

    for line in content.splitlines():
        ch_m = re.match(r"^##\s+Capítulo\s+(\d+)", line, re.I)
        if ch_m:
            flush()
            current_ch = int(ch_m.group(1))
            current_vs = None
            continue
        vs_m = re.match(r"^###\s+(\d+):(\d+)", line)
        if vs_m:
            flush()
            current_ch = int(vs_m.group(1))
            current_vs = int(vs_m.group(2))
            continue
        if not line.strip() or line.startswith("#") or line.startswith(">"):
            continue
        if current_ch and current_vs:
            buffer.append(line.strip())
    flush()
    return verses


def link_verse(tokens: list[dict], spanish: str) -> list[dict]:
    bundles = bundle_spanish(spanish)
    if not bundles or not tokens:
        return []

    enriched = []
    for tok in tokens:
        gf = fold(tok.get("es") or "")
        enriched.append(
            {
                "sourceTokenId": tok["sourceTokenId"],
                "gloss": tok.get("es") or "",
                "glossFold": gf,
                "function": is_function_token(tok),
                "surface": tok.get("surface") or "",
            }
        )

    n_b = len(bundles)
    assignment: list[int | None] = [None] * len(enriched)
    used: set[int] = set()
    cursor = 0

    for gi, tok in enumerate(enriched):
        if tok["function"]:
            continue
        best_bi = None
        best_score = 0
        for bi in range(cursor, n_b):
            if bi in used:
                continue
            score = gloss_score(tok["gloss"], bundles[bi])
            if score > best_score:
                best_score = score
                best_bi = bi
            if best_score >= 100:
                break
        if best_bi is None or best_score < 40:
            for bi in range(cursor, n_b):
                if bi not in used:
                    best_bi = bi
                    break
            if best_bi is None:
                best_bi = n_b - 1
        assignment[gi] = best_bi
        used.add(best_bi)
        cursor = max(cursor, best_bi)

    for gi, tok in enumerate(enriched):
        if assignment[gi] is not None:
            continue
        nxt = next((assignment[j] for j in range(gi + 1, len(enriched)) if assignment[j] is not None), None)
        prv = next((assignment[j] for j in range(gi - 1, -1, -1) if assignment[j] is not None), None)
        assignment[gi] = nxt if nxt is not None else prv if prv is not None else 0

    ids_by_bundle: list[list[str]] = [[] for _ in range(n_b)]
    for gi, bi in enumerate(assignment):
        if bi is None:
            continue
        ids_by_bundle[bi].append(enriched[gi]["sourceTokenId"])

    units = []
    for bi, bundle in enumerate(bundles):
        ids = ids_by_bundle[bi]
        if not ids:
            continue
        units.append(
            {
                "unitId": f"0:{len(units)}",
                "surface": bundle["surface"],
                "charStart": bundle["charStart"],
                "charEnd": bundle["charEnd"],
                "sourceTokenIds": ids,
                "method": "gloss-match",
            }
        )
    return units


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--chapter",
        type=int,
        action="append",
        dest="chapters",
        help="Seed only this MT chapter (repeatable). Default: all 1–12.",
    )
    args = parser.parse_args()
    mt_chapters = set(args.chapters) if args.chapters else set(range(1, 13))

    spine = json.loads(SPINE.read_text(encoding="utf-8"))
    # LBF is Protestant-numbered — load all chapters that remaps may touch
    lbf = load_lbf_verses(None)

    phrases = []
    links = []
    phrase_index = 0
    skipped = []
    for key in sorted(spine["verses"], key=lambda k: (int(k.split(":")[0]), int(k.split(":")[1]))):
        verse = spine["verses"][key]
        mt_ch, mt_vs = verse["ch"], verse["vs"]
        if mt_ch not in mt_chapters:
            continue
        prot_ch, prot_vs = mt_to_protestant(mt_ch, mt_vs)
        spanish = lbf.get((prot_ch, prot_vs))
        if not spanish:
            skipped.append(f"MT {mt_ch}:{mt_vs} → Prot {prot_ch}:{prot_vs} (no LBF)")
            continue
        tokens = verse["tokens"]
        ref = f"Daniel {prot_ch}:{prot_vs}"
        phrases.append(
            {
                "phraseIndex": phrase_index,
                "reference": ref,
                "chapter": prot_ch,
                "verse": prot_vs,
                "mtChapter": mt_ch,
                "mtVerse": mt_vs,
                "spanish": spanish,
                "tokenRows": [
                    {
                        "sourceTokenId": t["sourceTokenId"],
                        "surface": t["surface"],
                        "w": t["w"],
                        "es": t.get("es") or "",
                    }
                    for t in tokens
                ],
            }
        )
        units = link_verse(tokens, spanish)
        for i, u in enumerate(units):
            u["unitId"] = f"{phrase_index}:{i}"
        links.append(
            {
                "phraseIndex": phrase_index,
                "reference": ref,
                "status": "gloss-seed",
                "mtReference": f"Daniel {mt_ch}:{mt_vs}",
                "units": units,
            }
        )
        phrase_index += 1

    scope = (
        f"chapters {min(mt_chapters)}–{max(mt_chapters)} (Protestant refs; MT remapped)"
        if len(mt_chapters) > 1
        else f"chapter {next(iter(mt_chapters))} only"
    )
    phrases_doc = {
        "bookId": "daniel",
        "textualBasis": "LBF staging",
        "schemaVersion": 1,
        "scope": scope,
        "verseNumbering": "Protestant (MT→Prot remap for chs 3–6)",
        "phrases": phrases,
    }
    links_doc = {
        "bookId": "daniel",
        "textualBasis": "OSHB/WLC",
        "schemaVersion": 1,
        "scope": scope,
        "verseNumbering": "Protestant (MT→Prot remap for chs 3–6)",
        "notes": {
            "seed": (
                "Spanish unit → OSHB sourceTokenIds (h27… MT indices). Gloss-matched from token es "
                "with monotonic Spanish order. References use Protestant numbers for LBF. "
                "Draft seed — hand-refine before Structure."
            ),
            "mtRemap": (
                "3:31–33→4:1–3; 4:n→4:(n+3); 6:1→5:31; 6:n(n≥2)→6:(n−1)"
            ),
        },
        "stats": {
            "phrases": len(links),
            "hand": 0,
            "auto": 0,
            "gloss": len(links),
            "units": sum(len(link["units"]) for link in links),
            "chapters": sorted(mt_chapters),
            "skipped": skipped,
        },
        "links": links,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PHRASES.write_text(json.dumps(phrases_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    LINKS.write_text(json.dumps(links_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in links_doc["stats"].items() if k != "skipped"}, indent=2))
    if skipped:
        print("skipped:", skipped)
    print("wrote", PHRASES)
    print("wrote", LINKS)


if __name__ == "__main__":
    main()
