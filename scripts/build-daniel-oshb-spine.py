#!/usr/bin/env python3
"""Build OSHB spine JSON for Daniel from cgv-data tokens.jsonl.

Writes: herramientas/cgv-translator/translations/oshb-spine/daniel/daniel-oshb-spine.json

sourceTokenId scheme: h27{ch:03}{vs:03}{w:03}
Structure token index = verse-local `w` (no MorphGNT bridge).
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CGV_DATA = ROOT.parent / "cgv-data"
TOKENS = CGV_DATA / "interlinears/OT/daniel.tokens.jsonl"
OUT_DIR = ROOT.parent / "herramientas" / "cgv-translator" / "translations" / "oshb-spine" / "daniel"
OUT = OUT_DIR / "daniel-oshb-spine.json"


def source_token_id(ch: int, vs: int, w: int) -> str:
    return f"h27{ch:03d}{vs:03d}{w:03d}"


def lang_from_morph(morph: str) -> str:
    if morph.startswith("A"):
        return "arc"
    return "he"


def main() -> None:
    by_verse: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for line in TOKENS.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        ch, vs, w = int(row["ch"]), int(row["vs"]), int(row["w"])
        morph = row.get("morph") or ""
        by_verse[(ch, vs)].append(
            {
                "sourceTokenId": source_token_id(ch, vs, w),
                "w": w,
                "oshbIndex": w,
                "surface": row.get("surface") or "",
                "lemma": row.get("lemma") or "",
                "morph": morph,
                "lang": lang_from_morph(morph),
                "oshbId": row.get("id") or "",
                "es": row.get("es") or "",
            }
        )

    verses: dict[str, dict] = {}
    for (ch, vs), tokens in sorted(by_verse.items()):
        tokens.sort(key=lambda t: t["w"])
        key = f"{ch}:{vs}"
        verses[key] = {"ch": ch, "vs": vs, "tokens": tokens}

    payload = {
        "bookId": "daniel",
        "textualBasis": "OSHB/WLC",
        "schemaVersion": 1,
        "sourceTokenIdScheme": "h27{ch:03}{vs:03}{w:03}",
        "notes": {
            "spine": (
                "OSHB word stream from cgv-data/interlinears/OT/daniel.tokens.jsonl. "
                "Hebrew (H…) and Aramaic (A…) share one index; language flips mid-verse at 2:4."
            )
        },
        "stats": {
            "verses": len(verses),
            "tokens": sum(len(v["tokens"]) for v in verses.values()),
            "hebrew": sum(1 for v in verses.values() for t in v["tokens"] if t["lang"] == "he"),
            "aramaic": sum(1 for v in verses.values() for t in v["tokens"] if t["lang"] == "arc"),
        },
        "verses": verses,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["stats"], indent=2))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
