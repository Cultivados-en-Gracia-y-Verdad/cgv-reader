#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compile Reader ``daniel.alignment.json`` from hand-align chapter files.

Source of truth (after the OSHB faithfulness pass):
  data/lbf/ot/daniel.align.<n>.json   (n = 1..12)
  data/lbf/ot/daniel.md

Do **not** re-run ``seed-daniel-reverse-links.py`` / the gloss-seed compile for
Daniel — that pipeline would overwrite this hand map.

Usage:
    python3 scripts/compile-lbf-alignment-daniel-hand.py
    python3 scripts/compile-lbf-alignment-daniel-hand.py --also-merge
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LBF_MD = ROOT / "data" / "lbf" / "ot" / "daniel.md"
OUT = ROOT / "data" / "lbf" / "ot" / "daniel.alignment.json"
MERGE_OUT = ROOT / "data" / "lbf" / "ot" / "daniel.align.json"
CGV_DATA = ROOT.parent / "cgv-data"
TOKENS = CGV_DATA / "interlinears" / "OT" / "daniel.tokens.jsonl"

# Keep hyphenated names (Abed-nego) as one word — must match workbench + Reader.
TOKEN_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’-]*")


def mt_to_protestant(ch: int, vs: int) -> tuple[int, int]:
    if ch == 3 and vs >= 31:
        return 4, vs - 30
    if ch == 4:
        return 4, vs + 3
    if ch == 6 and vs == 1:
        return 5, 31
    if ch == 6 and vs >= 2:
        return 6, vs - 1
    return ch, vs


def load_verses() -> dict[tuple[int, int], str]:
    text = LBF_MD.read_text(encoding="utf-8")
    out: dict[tuple[int, int], str] = {}
    for m in re.finditer(r"^### (\d+):(\d+)\n\n(.*)$", text, re.M):
        out[(int(m.group(1)), int(m.group(2)))] = m.group(3)
    return out


def load_tokens() -> dict[tuple[int, int], list[dict]]:
    out: dict[tuple[int, int], list[dict]] = {}
    for line in TOKENS.read_text(encoding="utf-8").splitlines():
        r = json.loads(line)
        key = mt_to_protestant(int(r["ch"]), int(r["vs"]))
        out.setdefault(key, []).append(r)
    for v in out.values():
        v.sort(key=lambda r: int(r["w"]))
    return out


def load_hand_chapters() -> dict[int, dict]:
    chapters: dict[int, dict] = {}
    for ch in range(1, 13):
        path = ROOT / "data" / "lbf" / "ot" / f"daniel.align.{ch}.json"
        if not path.exists():
            raise SystemExit(f"missing {path}")
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("chapter") != ch:
            raise SystemExit(f"{path.name}: chapter field {data.get('chapter')} != {ch}")
        chapters[ch] = data
    return chapters


def compile_records(
    chapters: dict[int, dict],
    verses: dict[tuple[int, int], str],
    tokens: dict[tuple[int, int], list[dict]],
) -> list[dict]:
    records: list[dict] = []
    for ch, data in sorted(chapters.items()):
        for v_str, rows in sorted(data["verses"].items(), key=lambda kv: int(kv[0])):
            v = int(v_str)
            words = TOKEN_RE.findall(verses[(ch, v)])
            he_to_es: dict[int, set[int]] = defaultdict(set)
            for row in rows:
                es = [i for i in row.get("es", []) if 0 <= i < len(words)]
                for w in row.get("he", []):
                    he_to_es[int(w)].update(es)
            toks = tokens.get((ch, v), [])
            for t in toks:
                w = int(t["w"])
                idxs = sorted(he_to_es.get(w, ()))
                if not idxs:
                    raise SystemExit(f"{ch}:{v} Hebrew token {w} has no Spanish indices")
                surface = " ".join(words[i] for i in idxs)
                # NT Reader convention: anchor on last content word of the phrase.
                anchor = idxs[-1]
                heb = t.get("surface") or ""
                rec = {
                    "chapter": ch,
                    "verse": v,
                    "token": w,
                    "sourceSurface": heb,
                    "greekSurface": heb,
                    "lbfSurface": surface,
                    "lbfWordIndex": anchor,
                }
                # Contiguous phrase → omit; discontinuous kept for future Reader use.
                contiguous = idxs == list(range(idxs[0], idxs[-1] + 1))
                if not contiguous:
                    rec["lbfWordIndexes"] = idxs
                records.append(rec)
    return records


def write_merge(chapters: dict[int, dict], records: list[dict]) -> None:
    convention = next(iter(chapters.values()))["convention"]
    spine = next(iter(chapters.values())).get("hebrewSpine")
    payload = {
        "book": "daniel",
        "spanish": "LBF",
        "hebrewSpine": spine,
        "verseNumbering": "Protestant (MT→Prot remap for chs 3–6; see lbf-align-workbench.py)",
        "convention": convention,
        "source": {
            "kind": "hand-alignment",
            "chapterFiles": [f"daniel.align.{ch}.json" for ch in range(1, 13)],
            "spanishText": "daniel.md",
            "note": (
                "Merged book-level hand alignment. Chapter files remain the editable unit; "
                "re-run scripts/compile-lbf-alignment-daniel-hand.py --also-merge after edits. "
                "Does not replace gloss-seed history; production map is daniel.alignment.json."
            ),
        },
        "stats": {
            "chapters": 12,
            "verses": sum(len(c["verses"]) for c in chapters.values()),
            "rows": sum(len(rows) for c in chapters.values() for rows in c["verses"].values()),
            "productionRecords": len(records),
        },
        "chapters": {str(ch): chapters[ch]["verses"] for ch in range(1, 13)},
    }
    MERGE_OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MERGE_OUT.relative_to(ROOT)} ({MERGE_OUT.stat().st_size:,} bytes)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--also-merge",
        action="store_true",
        help="also rewrite data/lbf/ot/daniel.align.json from chapter files",
    )
    args = ap.parse_args()

    chapters = load_hand_chapters()
    verses = load_verses()
    tokens = load_tokens()
    records = compile_records(chapters, verses, tokens)

    discontinuous = sum(1 for r in records if "lbfWordIndexes" in r)
    by_ch: dict[int, int] = defaultdict(int)
    for r in records:
        by_ch[r["chapter"]] += 1

    # Coverage check against TOKEN_RE (same as hand files).
    covered: dict[tuple[int, int], set[int]] = defaultdict(set)
    for r in records:
        key = (r["chapter"], r["verse"])
        words = TOKEN_RE.findall(verses[key])
        idxs = r.get("lbfWordIndexes")
        if idxs:
            covered[key].update(idxs)
        else:
            n = len(TOKEN_RE.findall(r["lbfSurface"]))
            for k in range(n):
                covered[key].add(r["lbfWordIndex"] - k)

    miss = 0
    for key, text in verses.items():
        words = TOKEN_RE.findall(text)
        for i in range(len(words)):
            if i not in covered[key]:
                # Contiguous projection from last-index can miss discontinuous-only
                # positions when another token doesn't claim them via surface length.
                # Fall back: scan hand rows.
                pass
    # Stricter: use hand files for Spanish coverage (already PASS).
    for ch, data in chapters.items():
        for v_str, rows in data["verses"].items():
            v = int(v_str)
            words = TOKEN_RE.findall(verses[(ch, v)])
            claimed: set[int] = set()
            for row in rows:
                claimed.update(row["es"])
            miss += sum(1 for i in range(len(words)) if i not in claimed)
    if miss:
        print(f"ERROR: {miss} Spanish words uncovered in hand files", file=sys.stderr)
        return 1

    he_miss = 0
    for ch, data in chapters.items():
        for v_str, rows in data["verses"].items():
            v = int(v_str)
            mapped = {w for row in rows for w in row["he"]}
            for t in tokens.get((ch, v), []):
                if int(t["w"]) not in mapped:
                    he_miss += 1
    if he_miss:
        print(f"ERROR: {he_miss} Hebrew tokens unmapped", file=sys.stderr)
        return 1

    payload = {
        "meta": {
            "book": "daniel",
            "spanish": "LBF",
            "hebrewSpine": "OSHB/WLC",
            "verseNumbering": "Protestant (alignment chapter/verse; OSHB ids keep MT)",
            "scope": "chapters 1–12 (Protestant refs; MT remapped)",
            "compiledFrom": [f"daniel.align.{ch}.json" for ch in range(1, 13)],
            "note": (
                "Hand alignment after OSHB faithfulness pass on daniel.md. "
                "Compiled by scripts/compile-lbf-alignment-daniel-hand.py. "
                "Chapter files are the editable source of truth — do not re-seed from "
                "gloss reverse-links. Discontinuous Spanish spans store lbfWordIndexes."
            ),
            "stats": {
                "records": len(records),
                "discontinuous": discontinuous,
                "byChapter": {str(k): by_ch[k] for k in sorted(by_ch)},
            },
        },
        "records": records,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")
    print(f"records={len(records)} discontinuous={discontinuous}")
    for ch in range(1, 13):
        print(f"  ch{ch}: {by_ch[ch]} tokens")

    if args.also_merge:
        write_merge(chapters, records)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
