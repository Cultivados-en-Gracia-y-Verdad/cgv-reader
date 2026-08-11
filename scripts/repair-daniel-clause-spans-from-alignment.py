#!/usr/bin/env python3
"""Rebuild Daniel Clause Builder selectedSpan from canonical LBF + alignment."""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRESS = ROOT / "data/lbf/ot/daniel-progress-filled.json"
LBF = ROOT.parent / "cgv-data/bibles/LBF/daniel.lbf.md"
ALIGNMENT = ROOT.parent / "cgv-data/bibles/LBF/alignments/daniel.alignment.json"
REPORT = ROOT / "reports/daniel-clause-span-alignment-repair.yaml"

CLAUSES_KEY = "the-reader:spanish-clause-builder:daniel:v3"
ACTORS_KEY = "the-reader:spanish-clause-builder:daniel:clause-actors:v1"

WORD_RE = re.compile(
    r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’\-]*|[^\s\wÁÉÍÓÚÜÑáéíóúüñ]+",
    re.UNICODE,
)


def word_tokens(text: str) -> list[dict]:
    words = []
    for match in WORD_RE.finditer(text):
        token = match.group(0)
        if not re.search(r"[\wÁÉÍÓÚÜÑáéíóúüñ]", token, re.UNICODE):
            continue
        words.append({"text": token, "start": match.start(), "end": match.end(), "index": len(words)})
    return words


def load_lbf() -> dict[str, dict]:
    out = {}
    for line in LBF.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^Daniel\s+(\d+):(\d+)\s+(.+?)\s*$", line)
        if not match:
            continue
        ch, vs, text = int(match.group(1)), int(match.group(2)), match.group(3)
        out[f"Daniel {ch}:{vs}"] = {"chapter": ch, "verse": vs, "text": text, "words": word_tokens(text)}
    return out


def source_token_number(source_id: str) -> int | None:
    match = re.match(r"^h\d{2}\d{3}\d{3}(\d{3})$", source_id)
    return int(match.group(1)) if match else None


def alignment_maps(lbf: dict[str, dict]) -> tuple[dict[tuple[int, int], dict[int, set[int]]], dict[tuple[int, int], int]]:
    data = json.loads(ALIGNMENT.read_text(encoding="utf-8"))
    token_words: dict[tuple[int, int], dict[int, set[int]]] = {}
    max_token: dict[tuple[int, int], int] = {}
    for link in data.get("links", []):
        verse = lbf.get(link.get("reference"))
        if not verse:
            continue
        ch, vs = verse["chapter"], verse["verse"]
        key = (ch, vs)
        words = verse["words"]
        token_words.setdefault(key, {})
        for unit in link.get("units", []):
            indexes = [
                word["index"]
                for word in words
                if word["start"] < unit.get("charEnd", -1) and word["end"] > unit.get("charStart", -1)
            ]
            for source_id in unit.get("sourceTokenIds", []):
                token = source_token_number(source_id)
                if token is None:
                    continue
                max_token[key] = max(max_token.get(key, 0), token)
                token_words[key].setdefault(token, set()).update(indexes)
    return token_words, max_token


def parse_clause_id(clause_id: str) -> tuple[int, int, int]:
    ch, vs, token = clause_id.split(":")
    return int(ch), int(vs), int(token)


def span_ids(ch: int, vs: int, lo: int, hi: int) -> list[str]:
    return [f"{ch}:{vs}:{index}" for index in range(lo, hi + 1)] if hi >= lo else []


def count_overlaps(clauses: dict) -> int:
    counts: dict[str, int] = {}
    for entry in clauses.values():
        for word_id in entry.get("selectedSpan", []):
            counts[word_id] = counts.get(word_id, 0) + 1
    return sum(count - 1 for count in counts.values() if count > 1)


def main() -> int:
    lbf = load_lbf()
    token_words, max_token = alignment_maps(lbf)
    bundle = json.loads(PROGRESS.read_text(encoding="utf-8"))
    clauses = bundle["data"][CLAUSES_KEY]
    actors = bundle["data"].setdefault(ACTORS_KEY, {})
    before = {
        "clauses": len(clauses),
        "emptySpans": sum(1 for clause in clauses.values() if not clause.get("selectedSpan")),
        "doubleClaimedWordIds": count_overlaps(clauses),
    }

    by_verse: dict[tuple[int, int], list[tuple[str, int]]] = {}
    for clause_id in clauses:
        ch, vs, token = parse_clause_id(clause_id)
        by_verse.setdefault((ch, vs), []).append((clause_id, token))

    changed = 0
    unmapped = 0
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    for key, rows in sorted(by_verse.items()):
        ch, vs = key
        verse = lbf.get(f"Daniel {ch}:{vs}")
        if not verse:
            continue
        words = verse["words"]
        rows = sorted(rows, key=lambda row: row[1])
        ranges: list[tuple[str, int, int, int, int]] = []
        for index, (clause_id, token) in enumerate(rows):
            next_token = rows[index + 1][1] if index + 1 < len(rows) else max_token.get(key, token) + 1
            start_token = 1 if index == 0 else token
            end_token = max(token, next_token - 1)
            mapped: set[int] = set()
            for source_token in range(start_token, end_token + 1):
                mapped.update(token_words.get(key, {}).get(source_token, set()))
            if not mapped:
                mapped.update(token_words.get(key, {}).get(token, set()))
            if not mapped:
                unmapped += 1
                continue
            ranges.append((clause_id, start_token, end_token, min(mapped), max(mapped)))

        assigned_hi = -1
        for index, item in enumerate(ranges):
            clause_id, start_token, end_token, lo, hi = item
            next_lo = ranges[index + 1][3] if index + 1 < len(ranges) else len(words)
            lo = max(lo, assigned_hi + 1)
            hi = min(hi, next_lo - 1)
            if hi < lo:
                anchor = min(max(lo, 0), len(words) - 1)
                lo = hi = anchor
            assigned_hi = max(assigned_hi, hi)
            selected = span_ids(ch, vs, lo, hi)
            entry = dict(clauses[clause_id])
            if (
                entry.get("selectedSpan") != selected
                or entry.get("greekStartTokenId") != f"{ch}:{vs}:{start_token}"
                or entry.get("greekEndTokenId") != f"{ch}:{vs}:{end_token}"
            ):
                changed += 1
            entry["selectedSpan"] = selected
            entry["greekStartTokenId"] = f"{ch}:{vs}:{start_token}"
            entry["greekEndTokenId"] = f"{ch}:{vs}:{end_token}"
            entry["greekConfirmedAt"] = now
            clauses[clause_id] = entry
            actor = dict(actors.get(clause_id) or {})
            actor.setdefault("subjectSpan", [])
            actor["verbSpan"] = [f"{ch}:{vs}:{min(max(lo, 0), len(words) - 1)}"]
            actor.setdefault("objectSpan", [])
            actors[clause_id] = actor

    after = {
        "clauses": len(clauses),
        "emptySpans": sum(1 for clause in clauses.values() if not clause.get("selectedSpan")),
        "doubleClaimedWordIds": count_overlaps(clauses),
    }
    bundle["data"][CLAUSES_KEY] = clauses
    bundle["data"][ACTORS_KEY] = actors
    bundle["exportedAt"] = now
    notes = dict(bundle.get("fillNotes") or {})
    notes["clauseSpanAlignmentRepair"] = {
        "script": "scripts/repair-daniel-clause-spans-from-alignment.py",
        "lbf": str(LBF),
        "alignment": str(ALIGNMENT),
        "before": before,
        "after": after,
        "changedClauseRows": changed,
        "unmappedClauseRows": unmapped,
    }
    bundle["fillNotes"] = notes

    backup = PROGRESS.with_name(f"daniel-progress-filled.pre-clause-span-alignment-repair-{datetime.now().strftime('%Y%m%dT%H%M%S')}.json")
    shutil.copy2(PROGRESS, backup)
    PROGRESS.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        "schema_version: '0.1'\n"
        "task: DANIEL_CLAUSE_SPAN_ALIGNMENT_REPAIR\n"
        f"progress: {PROGRESS}\n"
        f"backup: {backup}\n"
        f"changed_clause_rows: {changed}\n"
        f"unmapped_clause_rows: {unmapped}\n"
        f"before_empty_spans: {before['emptySpans']}\n"
        f"after_empty_spans: {after['emptySpans']}\n"
        f"before_double_claimed_word_ids: {before['doubleClaimedWordIds']}\n"
        f"after_double_claimed_word_ids: {after['doubleClaimedWordIds']}\n",
        encoding="utf-8",
    )
    print(json.dumps({"backup": str(backup), "changed": changed, "before": before, "after": after}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
