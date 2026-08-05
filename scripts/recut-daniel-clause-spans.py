#!/usr/bin/env python3
"""Re-cut Daniel clause spans so H4 boundaries fall before the connector.

The Mark fill partitioned each verse at Spanish verb positions, but placed the
cut *after* the connector that introduces the next clause. Two consequences in
the compiled manual:

  * ~34% of H4s end on a dangling function word (`…a Jerusalén y la`, with
    `sitió` orphaned into the next clause);
  * consecutive spans share words, so adjacent H4s repeat text.

This pass keeps every clause row and every verb. Per verse it walks the clauses
in order and moves each boundary left off the trailing connector run, then makes
the spans contiguous so the verse is covered exactly once. A span is never
trimmed past its own `verbSpan` anchor, and true nesting (one span fully inside
another) is left alone and reported.

Spans still never cross a verse. Verses with no clause at all (2:22, 2:32–33 …)
are out of scope here — they need an Observer clause, not a span move.

Default mode is `trim`, which uses only the fill's own boundaries. The `opener`
mode (cut before the word that opens the next clause) reads better in principle
but needs a trustworthy verb anchor, and neither source has one: `verbSpan` is
an SVO heuristic (1:5:16 points at "día") and the OSHB→LBF alignment often lands
on a noun (1:5:1 → "Y el rey"; 1:2:12 and 1:2:19 both → "de su dios"). Keep
`opener` for experiments only.

  python3 scripts/recut-daniel-clause-spans.py \\
    --progress ~/Downloads/cgv-reader-daniel-progress-filled-2026-08-04.json \\
    --dry-run
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CLAUSES_KEY = "the-reader:spanish-clause-builder:daniel:v3"
ACTORS_KEY = "the-reader:spanish-clause-builder:daniel:clause-actors:v1"

# Function words that must not end a clause: they introduce or lean on what
# follows. Finite verbs and participles are deliberately absent — a passive
# split like "y su ejército será | destruido" is a real clause end.
CONNECTOR_TAIL = {
    "y", "e", "o", "u", "ni", "mas", "pero", "empero", "sino",
    "que", "quien", "quienes", "cual", "cuales", "cuyo", "cuya",
    "si", "aunque", "porque", "pues", "cuando", "mientras", "como",
    "de", "del", "a", "al", "en", "con", "por", "para", "sin",
    "sobre", "entre", "desde", "hasta", "hacia", "segun", "tras",
    "el", "la", "los", "las", "lo", "un", "una", "unos", "unas",
    "le", "les", "se", "me", "te", "nos", "os",
    "mi", "mis", "tu", "tus", "su", "sus", "no",
}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def load_words_by_verse() -> dict[tuple[int, int], list[str]]:
    """Reuse the fill script's tokenizer so word indices line up with spans."""
    spec = importlib.util.spec_from_file_location(
        "fill_daniel", ROOT / "scripts" / "fill-daniel-mark-progress.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.load_lbf_verses()


def parse_id(cid: str) -> tuple[int, int, int]:
    ch, vs, tok = cid.split(":")
    return int(ch), int(vs), int(tok)


def span_indices(span: list[str]) -> list[int]:
    out: list[int] = []
    for wid in span:
        parts = wid.split(":")
        if len(parts) == 3:
            out.append(int(parts[2]))
    return sorted(set(out))


def span_text(words: list[str], indices: list[int]) -> str:
    return " ".join(words[i] for i in indices if 0 <= i < len(words)).strip()


def verb_anchor(actors: dict, cid: str, fallback: list[int]) -> int | None:
    verb_span = (actors.get(cid) or {}).get("verbSpan") or []
    idxs = span_indices(verb_span)
    if idxs:
        return idxs[-1]
    return fallback[-1] if fallback else None


# Words that genuinely open a Spanish clause. Used to find where the *next*
# clause starts instead of only shaving connectors off the previous one.
CLAUSE_OPENERS = {
    "y", "e", "pero", "mas", "empero", "sino", "entonces", "luego", "despues",
    "que", "porque", "pues", "para", "cuando", "mientras", "si", "aunque",
    "quien", "quienes", "cual", "cuales", "mas",
}


def opener_start(words: list[str], anchor: int, floor: int) -> int | None:
    """Nearest clause-opening word left of `anchor`, strictly above `floor`.

    Walks back from the verb so the connector, its clitics and its subject stay
    with the clause they belong to ("y al cabo de ellos estarían…").
    """
    for i in range(anchor, floor, -1):
        if fold(words[i]) in CLAUSE_OPENERS:
            return i
    return None


def recut_verse(
    verse_clauses: list[tuple[str, list[int]]],
    words: list[str],
    actors: dict,
    stats: dict[str, int],
    samples: list[tuple[str, str, str]],
    mode: str,
) -> dict[str, list[int]]:
    """Return new index lists keyed by clause id for one verse."""
    ordered = sorted(verse_clauses, key=lambda item: (item[1][0], item[1][-1]))

    # Leave true nesting alone: a span wholly inside an earlier span is a
    # deliberate parent/child pair, not a mis-cut sibling.
    nested: set[str] = set()
    for i, (cid, idxs) in enumerate(ordered):
        span_i = set(idxs)
        for j, (other, other_idxs) in enumerate(ordered):
            if i == j:
                continue
            if span_i < set(other_idxs):
                nested.add(cid)
                stats["nestedKept"] += 1
                break

    flat = [(cid, idxs) for cid, idxs in ordered if cid not in nested]
    result: dict[str, list[int]] = {cid: idxs for cid, idxs in ordered if cid in nested}
    if not flat:
        return result

    anchors = {cid: verb_anchor(actors, cid, idxs) for cid, idxs in flat}

    # Boundary pass: move each cut left off the trailing connector run, then
    # let the next clause start where the previous one now stops.
    starts: list[int] = []
    ends: list[int] = []
    for cid, idxs in flat:
        starts.append(idxs[0])
        ends.append(idxs[-1])

    starts[0] = 0
    ends[-1] = len(words) - 1

    for i in range(len(flat) - 1):
        cid = flat[i][0]
        anchor = anchors.get(cid)
        end = ends[i]
        floor = max(starts[i], anchor if anchor is not None else starts[i])

        next_anchor = anchors.get(flat[i + 1][0])
        opener = (
            opener_start(words, next_anchor, floor)
            if mode == "opener" and next_anchor is not None and next_anchor > floor
            else None
        )
        if opener is not None:
            new_end = opener - 1
            if new_end != end:
                stats["boundariesMovedByOpener"] += 1
                stats["wordsHandedOver"] += abs(end - new_end)
            end = new_end
        else:
            moved = 0
            while end > floor and fold(words[end]) in CONNECTOR_TAIL:
                end -= 1
                moved += 1
            if moved:
                stats["boundariesMovedByTrim"] += 1
                stats["wordsHandedOver"] += moved

        ends[i] = max(end, floor)
        starts[i + 1] = ends[i] + 1

    for i in range(len(flat) - 1):
        if starts[i + 1] <= ends[i]:
            stats["overlapsResolved"] += 1

    for i, (cid, old) in enumerate(flat):
        lo, hi = starts[i], ends[i]
        if hi < lo:
            hi = lo
            stats["degenerateGuarded"] += 1
        anchor = anchors.get(cid)
        if anchor is not None and not (lo <= anchor <= hi):
            # Never strand a clause without its verb: keep the old cut.
            result[cid] = old
            stats["anchorGuarded"] += 1
            continue
        new = list(range(lo, hi + 1))
        result[cid] = new
        if new != old and len(samples) < 12:
            samples.append((cid, span_text(words, old), span_text(words, new)))
    return result


def trim_actors_to_spans(clauses: dict, actors: dict) -> int:
    trimmed = 0
    for cid, act in list(actors.items()):
        if cid not in clauses:
            continue
        allowed = set(clauses[cid].get("selectedSpan") or [])
        if not allowed:
            continue
        new_act = dict(act)
        changed = False
        for key in ("subjectSpan", "verbSpan", "objectSpan"):
            old = list(act.get(key) or [])
            kept = [w for w in old if w in allowed]
            if key == "verbSpan" and not kept:
                span = list(clauses[cid].get("selectedSpan") or [])
                kept = [span[-1]] if span else []
            if kept != old:
                new_act[key] = kept
                changed = True
        if changed:
            actors[cid] = new_act
            trimmed += 1
    return trimmed


def dangling_count(clauses: dict, words_by_verse: dict) -> int:
    total = 0
    for cid, asg in clauses.items():
        idxs = span_indices(asg.get("selectedSpan") or [])
        if not idxs:
            continue
        ch, vs, _ = parse_id(cid)
        words = words_by_verse.get((ch, vs), [])
        last = idxs[-1]
        if last < len(words) and fold(words[last]) in CONNECTOR_TAIL:
            total += 1
    return total


def overlap_count(clauses: dict) -> int:
    owner: dict[str, int] = defaultdict(int)
    for asg in clauses.values():
        for wid in asg.get("selectedSpan") or []:
            owner[wid] += 1
    return sum(1 for n in owner.values() if n > 1)


def validate(clauses: dict, words_by_verse: dict) -> dict:
    """Coverage / integrity checks a span move must not break."""
    claimed: dict[tuple[int, int], dict[int, int]] = defaultdict(lambda: defaultdict(int))
    empties: list[str] = []
    for cid, asg in clauses.items():
        idxs = span_indices(asg.get("selectedSpan") or [])
        if not idxs:
            empties.append(cid)
            continue
        ch, vs, _ = parse_id(cid)
        for i in idxs:
            claimed[(ch, vs)][i] += 1

    uncovered_words = 0
    verses_partial: list[str] = []
    for key, words in words_by_verse.items():
        counts = claimed.get(key)
        if not counts:
            continue
        missing = [i for i in range(len(words)) if i not in counts]
        if missing:
            uncovered_words += len(missing)
            verses_partial.append(f"{key[0]}:{key[1]}")

    return {
        "emptySpans": len(empties),
        "versesWithUncoveredWords": len(verses_partial),
        "uncoveredWordsInCoveredVerses": uncovered_words,
        "versesWithNoClause": len(
            [k for k in words_by_verse if k not in claimed]
        ),
    }


def recut(bundle: dict, words_by_verse: dict, mode: str = "trim") -> tuple[dict, dict]:
    data = bundle["data"]
    clauses: dict = dict(data[CLAUSES_KEY])
    actors: dict = dict(data.get(ACTORS_KEY) or {})

    before = {
        "danglingSpans": dangling_count(clauses, words_by_verse),
        "doubleClaimedWordIds": overlap_count(clauses),
        **validate(clauses, words_by_verse),
    }

    by_verse: dict[tuple[int, int], list[tuple[str, list[int]]]] = defaultdict(list)
    for cid, asg in clauses.items():
        idxs = span_indices(asg.get("selectedSpan") or [])
        if not idxs:
            continue
        ch, vs, _ = parse_id(cid)
        by_verse[(ch, vs)].append((cid, idxs))

    stats: dict[str, int] = defaultdict(int)
    samples: list[tuple[str, str, str]] = []
    for (ch, vs), items in sorted(by_verse.items()):
        words = words_by_verse.get((ch, vs), [])
        if not words:
            stats["verseWordsMissing"] += 1
            continue
        new_spans = recut_verse(items, words, actors, stats, samples, mode)
        for cid, idxs in new_spans.items():
            asg = dict(clauses[cid])
            asg["selectedSpan"] = [f"{ch}:{vs}:{i}" for i in idxs]
            clauses[cid] = asg

    actors_trimmed = trim_actors_to_spans(clauses, actors)

    after = {
        "danglingSpans": dangling_count(clauses, words_by_verse),
        "doubleClaimedWordIds": overlap_count(clauses),
        **validate(clauses, words_by_verse),
    }

    data[CLAUSES_KEY] = clauses
    data[ACTORS_KEY] = actors
    bundle["data"] = data
    bundle["exportedAt"] = (
        datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    )

    notes = dict(bundle.get("fillNotes") or {})
    notes["spanRecut"] = {
        "script": "scripts/recut-daniel-clause-spans.py",
        "mode": mode,
        "verdict": (
            "Fill cut each verse after the connector that introduces the next "
            "clause, so H4s ended on 'y / se / de / la' and siblings shared "
            "words. Boundaries moved left off the trailing connector run and "
            "made contiguous per verse. Every clause row and every verb kept; "
            "true nesting untouched. Verses with no clause row still need an "
            "Observer clause."
        ),
        "before": before,
        "after": after,
        "actorsTrimmed": actors_trimmed,
        **{k: v for k, v in sorted(stats.items())},
    }
    bundle["fillNotes"] = notes

    report = {"before": before, "after": after, "stats": dict(sorted(stats.items())), "samples": samples}
    return bundle, report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--progress",
        type=Path,
        default=Path.home()
        / "Downloads"
        / "cgv-reader-daniel-progress-filled-2026-08-04.json",
    )
    ap.add_argument(
        "--also",
        type=Path,
        nargs="*",
        default=[ROOT / "data" / "lbf" / "ot" / "daniel-progress-filled.json"],
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--mode",
        choices=["trim", "opener"],
        default="trim",
        help="opener: cut before the word that opens the next clause; trim: only shave trailing connectors",
    )
    args = ap.parse_args()

    words_by_verse = load_words_by_verse()
    bundle = json.loads(args.progress.read_text(encoding="utf-8"))
    recut_bundle, report = recut(bundle, words_by_verse, args.mode)

    print(json.dumps({k: v for k, v in report.items() if k != "samples"}, indent=2, ensure_ascii=False))
    print("\nsample re-cuts (old → new):")
    for cid, old, new in report["samples"]:
        print(f"\n  {cid}\n    old: {old}\n    new: {new}")

    if args.dry_run:
        print("\n(dry run — nothing written)")
        return

    text = json.dumps(recut_bundle, ensure_ascii=False, indent=2) + "\n"
    for out in [args.progress, *args.also]:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print("wrote", out)


if __name__ == "__main__":
    main()
