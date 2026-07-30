#!/usr/bin/env python3
"""Batch Resync Spanish: keep stored Greek ranges, rewrite selectedSpan from LBF.

Mirrors apps/reader deriveSpanishSpanFromGreekRange + expandAlignedPhrases.

Usage:
  python3 scripts/resync_1juan_spanish_from_greek.py \\
    --progress ~/Downloads/cgv-reader-1juan-progress-ai-clauses.json \\
    --out ~/Downloads/cgv-reader-1juan-progress-ai-clauses.json
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LBF_MD = ROOT / "data/lbf/nt/1juan.md"
LBF_AL = ROOT / "data/lbf/nt/1juan.alignment.json"

CLAUSE_KEY = "the-reader:spanish-clause-builder:1juan:v3"
WORD_RE = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+", re.UNICODE)
RELATIVE_HEAD = {"cual", "cuales", "quien", "quienes", "que"}
BEFORE_RELATIVE = {"la", "el", "los", "las", "a", "lo"}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def tokenize_spanish(text: str) -> list[str]:
    words = []
    for m in WORD_RE.finditer(text):
        piece = m.group(0)
        if re.search(r"[\wáéíóúüñÁÉÍÓÚÜÑ]", piece, re.I):
            words.append(piece)
    return words


def load_lbf_verses() -> dict[tuple[int, int], list[str]]:
    content = LBF_MD.read_text(encoding="utf-8")
    verses: dict[tuple[int, int], list[str]] = {}
    chapter = verse = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal chapter, verse, buffer
        if chapter and verse and buffer:
            verses[(chapter, verse)] = tokenize_spanish(" ".join(buffer))
        buffer = []

    for line in content.splitlines():
        ch_h = re.match(r"^##\s+Capítulo\s+(\d+)", line, re.I)
        if ch_h:
            flush()
            chapter = int(ch_h.group(1))
            verse = None
            continue
        vs_h = re.match(r"^###\s+(\d+):(\d+)", line)
        if vs_h:
            flush()
            chapter = int(vs_h.group(1))
            verse = int(vs_h.group(2))
            continue
        if not line.strip() or line.startswith("#") or line.startswith(">"):
            continue
        if chapter and verse:
            buffer.append(line.strip())
    flush()
    return verses


def load_alignment() -> dict[tuple[int, int], dict[int, dict]]:
    data = json.loads(LBF_AL.read_text(encoding="utf-8"))
    by: dict[tuple[int, int], dict[int, dict]] = defaultdict(dict)
    for r in data.get("records", []):
        by[(r["chapter"], r["verse"])][r["token"]] = r
    return by


def expand_aligned_phrases(
    low: int,
    high: int,
    verse_words: list[str],
    token_map: dict[int, dict],
    start_token: int,
    end_token: int,
) -> tuple[int, int]:
    next_low, next_high = low, high
    for token in range(start_token, end_token + 1):
        rec = token_map.get(token)
        if not rec:
            continue
        surface = rec.get("lbfSurface") or ""
        anchor = rec.get("lbfWordIndex")
        if anchor is None:
            continue
        parts = [fold(p) for p in surface.split() if fold(p)]
        if len(parts) < 2:
            continue
        anchor_norm = fold(verse_words[anchor]) if 0 <= anchor < len(verse_words) else ""
        try:
            part_at = parts.index(anchor_norm)
        except ValueError:
            continue
        phrase_start = anchor - part_at
        phrase_end = phrase_start + len(parts) - 1
        if phrase_start < 0 or phrase_end >= len(verse_words):
            continue
        if any(fold(verse_words[phrase_start + i]) != parts[i] for i in range(len(parts))):
            continue
        next_low = min(next_low, phrase_start)
        next_high = max(next_high, phrase_end)

    if next_low < len(verse_words) and next_low > 0:
        head = fold(verse_words[next_low])
        prev = fold(verse_words[next_low - 1])
        if head in RELATIVE_HEAD and prev in BEFORE_RELATIVE:
            next_low -= 1
    return next_low, next_high


def derive_spanish_span(
    ch: int,
    vs: int,
    start_token: int,
    end_token: int,
    verse_words: list[str],
    token_map: dict[int, dict],
) -> list[str]:
    indexes: set[int] = set()
    for tok in range(start_token, end_token + 1):
        rec = token_map.get(tok)
        if rec and rec.get("lbfWordIndex") is not None:
            indexes.add(int(rec["lbfWordIndex"]))
    if not indexes or not verse_words:
        return []
    low, high = min(indexes), max(indexes)
    low, high = expand_aligned_phrases(low, high, verse_words, token_map, start_token, end_token)
    low = max(0, min(low, len(verse_words) - 1))
    high = max(0, min(high, len(verse_words) - 1))
    return [f"{ch}:{vs}:{i}" for i in range(low, high + 1)]


def same_span(a: list[str], b: list[str]) -> bool:
    return sorted(a) == sorted(b)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--progress", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    bundle = json.loads(args.progress.read_text(encoding="utf-8"))
    data = bundle.setdefault("data", {})
    assignments = dict(data.get(CLAUSE_KEY) or {})
    verses = load_lbf_verses()
    alignment = load_alignment()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    resynced = 0
    unchanged = 0
    empty_expected = 0
    still_mismatch = 0
    samples: list[str] = []

    for fid, asg in sorted(assignments.items(), key=lambda kv: tuple(map(int, kv[0].split(":")))):
        g0, g1 = asg.get("greekStartTokenId"), asg.get("greekEndTokenId")
        if not isinstance(g0, str) or not isinstance(g1, str):
            continue
        ch, vs, start = map(int, g0.split(":"))
        _, _, end = map(int, g1.split(":"))
        start, end = min(start, end), max(start, end)
        expected = derive_spanish_span(ch, vs, start, end, verses.get((ch, vs), []), alignment.get((ch, vs), {}))
        actual = [x for x in (asg.get("selectedSpan") or []) if isinstance(x, str)]
        if not expected:
            empty_expected += 1
            # Keep existing Spanish when Greek has no LBF map (TR-only / gap).
            continue
        if same_span(actual, expected):
            unchanged += 1
            continue
        asg["selectedSpan"] = expected
        asg["greekConfirmedAt"] = asg.get("greekConfirmedAt") or now
        assignments[fid] = asg
        resynced += 1
        if len(samples) < 8:
            samples.append(f"{fid}: {len(actual)} → {len(expected)}")

    # Re-audit
    for fid, asg in assignments.items():
        g0, g1 = asg.get("greekStartTokenId"), asg.get("greekEndTokenId")
        if not isinstance(g0, str) or not isinstance(g1, str):
            continue
        ch, vs, start = map(int, g0.split(":"))
        _, _, end = map(int, g1.split(":"))
        start, end = min(start, end), max(start, end)
        expected = derive_spanish_span(ch, vs, start, end, verses.get((ch, vs), []), alignment.get((ch, vs), {}))
        actual = list(asg.get("selectedSpan") or [])
        if expected and not same_span(actual, expected):
            still_mismatch += 1
        elif not expected and actual:
            # counted in empty_expected; still an audit mismatch in the UI
            pass

    data[CLAUSE_KEY] = dict(
        sorted(assignments.items(), key=lambda kv: tuple(map(int, kv[0].split(":"))))
    )
    bundle["exportedAt"] = now
    meta = bundle.setdefault("meta", {})
    meta["spanishResync"] = {
        "resynced": resynced,
        "unchanged": unchanged,
        "emptyExpectedKeptSpanish": empty_expected,
        "stillMismatchAfter": still_mismatch,
        "samples": samples,
        "note": "Greek ranges kept; selectedSpan rewritten via LBF Greek→Spanish (Reader Resync).",
    }

    args.out.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta["spanishResync"], indent=2, ensure_ascii=False))
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
