#!/usr/bin/env python3
"""DEPRECATED for Daniel production — use compile-lbf-alignment-daniel-hand.py.

This script rebuilds ``daniel.alignment.json`` from the gloss-seed reverse-links
pipeline. Running it would overwrite the hand alignment. Kept only for
historical / emergency recovery.

Production path:
    python3 scripts/compile-lbf-alignment-daniel-hand.py --also-merge
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERR = ROOT.parent / "herramientas" / "cgv-translator" / "translations" / "oshb-spine" / "daniel"
SPINE = HERR / "daniel-oshb-spine.json"
LINKS = HERR / "daniel-reverse-links.json"
LBF_MD = ROOT / "data/lbf/ot/daniel.md"
OUT = ROOT / "data/lbf/ot/daniel.alignment.json"
CGV_DATA = ROOT.parent / "cgv-data"
TOKENS = CGV_DATA / "interlinears/OT/daniel.tokens.jsonl"

WORD_PATTERN = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+", re.UNICODE)

_VERBAL_FIRST = {
    "esta", "estan", "estoy", "estamos", "esteis",
    "es", "son", "soy", "somos", "sois", "sea", "sean",
    "ser", "sera", "seran", "fue", "fueron", "fui", "era", "eran",
    "hay", "habra", "vino", "vinieron", "dijo", "dijeron", "dio",
    "hubo", "habia", "puso", "busco", "estuvo", "estuvieron",
}


def norm(value: str) -> str:
    value = value.lower().strip()
    value = "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", value)


def tokenize(text: str) -> list[str]:
    return [m.group(0) for m in WORD_PATTERN.finditer(text) if re.search(r"[\wáéíóúüñÁÉÍÓÚÜÑ]", m.group(0))]


def load_lbf_verses() -> dict[tuple[int, int], str]:
    content = LBF_MD.read_text(encoding="utf-8")
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


def parse_ref(reference: str) -> tuple[int, int]:
    match = re.search(r"(\d+):(\d+)\s*$", reference)
    if not match:
        raise ValueError(f"Bad reference: {reference}")
    return int(match.group(1)), int(match.group(2))


def unit_word_index(verse_words: list[str], surface: str, cursor: int) -> tuple[int, int]:
    parts = tokenize(surface)
    if not parts:
        return cursor, cursor
    want = [norm(p) for p in parts]
    prefer_first = want[0] in _VERBAL_FIRST

    def anchor_at(start: int) -> int:
        if prefer_first:
            return start
        return start + len(parts) - 1

    for start in range(cursor, len(verse_words) - len(parts) + 1):
        window = [norm(w) for w in verse_words[start : start + len(parts)]]
        if window == want:
            return anchor_at(start), start + len(parts)
    for start in range(0, len(verse_words) - len(parts) + 1):
        window = [norm(w) for w in verse_words[start : start + len(parts)]]
        if window == want:
            return anchor_at(start), max(cursor, start + len(parts))
    raise ValueError(f"Could not find unit {surface!r} in verse words from {cursor}")


def main() -> None:
    spine = json.loads(SPINE.read_text(encoding="utf-8"))
    links_doc = json.loads(LINKS.read_text(encoding="utf-8"))

    token_meta: dict[str, tuple[int, int, int, str]] = {}
    for verse in spine["verses"].values():
        ch, vs = verse["ch"], verse["vs"]
        for tok in verse["tokens"]:
            token_meta[tok["sourceTokenId"]] = (ch, vs, int(tok["w"]), tok.get("surface") or "")

    lbf = load_lbf_verses()
    records: dict[tuple[int, int, int], dict] = {}
    warnings: list[str] = []
    units_applied = 0

    by_verse: dict[tuple[int, int], list[dict]] = {}
    for link in links_doc["links"]:
        ref = parse_ref(link["reference"])
        by_verse.setdefault(ref, []).append(link)

    for (chapter, verse), verse_links in sorted(by_verse.items()):
        verse_links.sort(key=lambda item: item["phraseIndex"])
        verse_text = lbf.get((chapter, verse), "")
        words = tokenize(verse_text)
        if not words:
            warnings.append(f"{chapter}:{verse}: no LBF text")
            continue
        cursor = 0
        for link in verse_links:
            for unit in link["units"]:
                surface = unit["surface"].strip()
                try:
                    anchor, cursor = unit_word_index(words, surface, cursor)
                except ValueError as err:
                    warnings.append(f"{chapter}:{verse}: {err}")
                    continue
                for source_id in unit["sourceTokenIds"]:
                    meta = token_meta.get(source_id)
                    if not meta:
                        warnings.append(f"{chapter}:{verse}: unknown {source_id}")
                        continue
                    _ch, _vs, w, heb = meta
                    records[(chapter, verse, w)] = {
                        "chapter": chapter,
                        "verse": verse,
                        "token": w,
                        "sourceSurface": heb,
                        "greekSurface": heb,  # compat with NT LbfAlignmentRecord
                        "lbfSurface": surface,
                        "lbfWordIndex": anchor,
                    }
                units_applied += 1

    out_records = sorted(records.values(), key=lambda r: (r["chapter"], r["verse"], r["token"]))
    book_total = spine["stats"]["tokens"]

    by_ch: dict[int, int] = {}
    for r in out_records:
        by_ch[r["chapter"]] = by_ch.get(r["chapter"], 0) + 1

    payload = {
        "meta": {
            "book": "daniel",
            "spanish": "LBF",
            "hebrewSpine": "OSHB/WLC",
            "verseNumbering": "Protestant (alignment chapter/verse; OSHB ids keep MT)",
            "scope": links_doc.get("scope") or "full book",
            "note": (
                "Compiled from oshb-spine reverse-links via w/oshbIndex. "
                "Gloss-seed draft for full book — hand-refine before Structure. "
                "MT→Prot remap applied in seed for chs 3–6. "
                "Re-run compile-lbf-alignment-daniel.py after link edits. "
                "Do not hand-edit this JSON for linked verses."
            ),
            "coverage": f"{len(out_records)}/{book_total}",
            "alignedTokens": len(out_records),
            "totalTokensBook": book_total,
            "alignedByChapter": {str(k): by_ch[k] for k in sorted(by_ch)},
            "repairs": {
                "unitsApplied": units_applied,
                "warnings": len(warnings),
            },
        },
        "records": out_records,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"Coverage {len(out_records)}/{book_total} ({len(out_records) / book_total:.1%})")
    print(f"Units applied={units_applied} warnings={len(warnings)}")
    for warning in warnings[:40]:
        print(f"  WARN {warning}")
    if len(warnings) > 40:
        print(f"  ... {len(warnings) - 40} more")


if __name__ == "__main__":
    import sys

    if "--force-gloss-seed" not in sys.argv:
        print(
            "REFUSING: gloss-seed compile would overwrite hand alignment.\n"
            "Use:  python3 scripts/compile-lbf-alignment-daniel-hand.py --also-merge\n"
            "Or pass --force-gloss-seed to run this legacy pipeline anyway.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    sys.argv = [a for a in sys.argv if a != "--force-gloss-seed"]
    main()
