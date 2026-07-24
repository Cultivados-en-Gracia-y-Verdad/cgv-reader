#!/usr/bin/env python3
"""Compile Reader MorphGNT→LBF alignment from translator reverse links.

Source of truth: herramientas/cgv-translator/.../jude-reverse-links.json
Bridge: jude-tr-spine.json (sourceTokenId → morphIndex; tr_only tokens skipped)

Do not hand-edit judas.alignment.json for verses the translator already linked.
Re-run this script after reverse-link changes.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERR = ROOT.parent / "herramientas" / "cgv-translator" / "translations" / "tr-spine" / "jude"
SPINE = HERR / "jude-tr-spine.json"
LINKS = HERR / "jude-reverse-links.json"
PHRASES = HERR / "jude-phrases-tr.json"
LBF_MD = ROOT / "data/lbf/nt/judas.md"
OUT = ROOT / "data/lbf/nt/judas.alignment.json"
CGV_DATA = ROOT.parent / "cgv-data"

WORD_PATTERN = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+", re.UNICODE)
INTERLINEAR_TOKEN_PATTERN = re.compile(r"(\S+?)<([^|<>]+)\|([^|<>]+)\|([^|<>]+)\|([^<>]+)>")


def norm(value: str) -> str:
    value = value.lower().strip()
    value = "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", value)


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


def load_ble_surfaces() -> dict[tuple[int, int], list[str]]:
    out: dict[tuple[int, int], list[str]] = {}
    for path in sorted((CGV_DATA / "interlinears/NT").glob("judas-*.interlinear.txt")):
        for line in path.read_text().splitlines():
            match = re.match(r"^judas\s+(\d+):(\d+)\t", line, re.I)
            if not match:
                continue
            chapter, verse = int(match.group(1)), int(match.group(2))
            tab = line.find("\t")
            surfaces = []
            for token_match in INTERLINEAR_TOKEN_PATTERN.finditer(line[tab + 1 :]):
                surfaces.append(token_match.group(1))
            out[(chapter, verse)] = surfaces
    return out


def parse_ref(reference: str) -> tuple[int, int]:
    match = re.search(r"(\d+):(\d+)\s*$", reference)
    if not match:
        raise ValueError(f"Bad reference: {reference}")
    return int(match.group(1)), int(match.group(2))


_VERBAL_FIRST = {
    "esta",
    "estan",
    "estoy",
    "estamos",
    "esteis",
    "es",
    "son",
    "soy",
    "somos",
    "sois",
    "sea",
    "sean",
    "ser",
    "sera",
    "seran",
    "fue",
    "fueron",
    "fui",
    "era",
    "eran",
    "hay",
    "habra",
    "llevo",
    "lleva",
    "llevan",
    "llevamos",
    "viva",
    "vivas",
    "vivamos",
    "vive",
    "viven",
    "vivo",
}


def unit_word_index(verse_words: list[str], surface: str, cursor: int) -> tuple[int, int]:
    """Return (anchor_index, next_cursor) for a Spanish unit surface."""
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
    spine = json.loads(SPINE.read_text())
    links_doc = json.loads(LINKS.read_text())
    phrases = json.loads(PHRASES.read_text())
    if isinstance(phrases, dict):
        phrases = phrases.get("phrases") or phrases.get("entries") or []
    phrase_by_index = {p["phraseIndex"]: p for p in phrases}

    token_meta: dict[str, tuple[int, int, int | None, str]] = {}
    for _verse_key, verse in spine["verses"].items():
        chapter, vs = (verse["ch"], verse["vs"])
        for tok in verse["tokens"]:
            token_meta[tok["sourceTokenId"]] = (
                chapter,
                vs,
                tok.get("morphIndex"),
                tok.get("align") or "",
            )

    lbf = load_lbf_verses()
    ble = load_ble_surfaces()
    records: dict[tuple[int, int, int], dict] = {}
    warnings: list[str] = []
    tr_only_skipped = 0
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
        pending_tr_only: list[str] = []
        for link in verse_links:
            phrase = phrase_by_index.get(link["phraseIndex"])
            if not phrase:
                warnings.append(f"missing phrase {link['phraseIndex']}")
                continue
            for unit in link["units"]:
                surface = unit["surface"].strip()
                try:
                    anchor, cursor = unit_word_index(words, surface, cursor)
                except ValueError as err:
                    warnings.append(f"{chapter}:{verse}: {err}")
                    pending_tr_only.clear()
                    continue
                morph_tokens: list[int] = []
                for source_id in unit["sourceTokenIds"]:
                    meta = token_meta.get(source_id)
                    if not meta:
                        warnings.append(f"{chapter}:{verse}: unknown {source_id}")
                        continue
                    _ch, _vs, morph_index, align = meta
                    if morph_index is None or align == "tr_only":
                        tr_only_skipped += 1
                        continue
                    morph_tokens.append(morph_index)
                if not morph_tokens:
                    pending_tr_only.append(surface)
                    continue
                if pending_tr_only:
                    surface = " ".join(pending_tr_only + [surface])
                    try:
                        rewind = max(0, cursor - len(tokenize(surface)) - 2)
                        anchor, cursor = unit_word_index(words, surface, rewind)
                    except ValueError as err:
                        warnings.append(f"{chapter}:{verse}: combined TR-only prefix failed: {err}")
                    pending_tr_only.clear()
                surfaces = ble.get((chapter, verse), [])
                for morph_index in morph_tokens:
                    greek = surfaces[morph_index - 1] if 0 < morph_index <= len(surfaces) else "?"
                    records[(chapter, verse, morph_index)] = {
                        "chapter": chapter,
                        "verse": verse,
                        "token": morph_index,
                        "greekSurface": greek,
                        "lbfSurface": surface,
                        "lbfWordIndex": anchor,
                    }
                units_applied += 1
        if pending_tr_only:
            warnings.append(f"{chapter}:{verse}: unused TR-only surfaces {pending_tr_only}")

    out_records = sorted(records.values(), key=lambda r: (r["chapter"], r["verse"], r["token"]))
    total = sum(len(v) for v in ble.values())
    payload = {
        "meta": {
            "book": "judas",
            "spanish": "LBF",
            "greekSpine": "MorphGNT/BLE",
            "note": (
                "Compiled from translator reverse-links.json via TR spine morphIndex. "
                "TR-only tokens skipped. Re-run compile-lbf-alignment-judas.py after link edits."
            ),
            "coverage": f"{len(out_records)}/{total}",
            "alignedTokens": len(out_records),
            "totalTokens": total,
            "repairs": {
                "unitsApplied": units_applied,
                "trOnlySkipped": tr_only_skipped,
                "warnings": len(warnings),
            },
        },
        "records": out_records,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {OUT}")
    print(f"Coverage {len(out_records)}/{total} ({len(out_records) / total:.1%})")
    print(f"Units applied={units_applied} tr_only skipped={tr_only_skipped} warnings={len(warnings)}")
    for warning in warnings[:30]:
        print(f"  WARN {warning}")
    if len(warnings) > 30:
        print(f"  ... {len(warnings) - 30} more")


if __name__ == "__main__":
    main()
