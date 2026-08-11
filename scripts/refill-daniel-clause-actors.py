#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Refill empty Quién actúa subjects for Daniel (verse-wide, not span-bound).

Structure only counts a clause as actor-observed when ``subjectSpan`` is non-empty.
The Mark fill required the subject inside the clause ``selectedSpan``, so VS
narrative subjects («Respondió el rey…») and subjects on a sibling fragment were
dropped. The UI allows tapping any word in the verse — this matches that.

Only fills empty ``subjectSpan``; never overwrites an existing pick.
Does not change clause spans.

Usage:
    python3 scripts/refill-daniel-clause-actors.py
    python3 scripts/refill-daniel-clause-actors.py \\
      --also data/lbf/ot/cgv-reader-daniel-progress-2026-08-05-merged.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOKENS = ROOT.parent / "cgv-data" / "interlinears" / "OT" / "daniel.tokens.jsonl"
ALIGN = ROOT / "data" / "lbf" / "ot" / "daniel.alignment.json"
LBF_MD = ROOT / "data" / "lbf" / "ot" / "daniel.md"
DEFAULT_PROGRESS = ROOT / "data" / "lbf" / "ot" / "daniel-progress-filled.json"
TOKEN_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’-]*")
ARTICLE = {"el", "la", "los", "las", "un", "una"}
PREP = {"de", "del", "a", "al", "en", "con", "por", "para", "ante", "sobre", "sin"}


def load_fdmp():
    spec = importlib.util.spec_from_file_location(
        "fdmp", ROOT / "scripts" / "fill-daniel-mark-progress.py"
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


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


def load_words() -> dict[tuple[int, int], list[str]]:
    text = LBF_MD.read_text(encoding="utf-8")
    out: dict[tuple[int, int], list[str]] = {}
    for m in re.finditer(r"^### (\d+):(\d+)\n\n(.*)$", text, re.M):
        out[(int(m.group(1)), int(m.group(2)))] = TOKEN_RE.findall(m.group(3))
    return out


def load_morph() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in TOKENS.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        ch, vs = mt_to_protestant(int(row["ch"]), int(row["vs"]))
        out[f"{ch}:{vs}:{int(row['w'])}"] = row.get("morph") or ""
    return out


def is_prepositional(fdmp, words: list[str], idx: int) -> bool:
    if idx <= 0:
        return False
    prev = fdmp.fold(words[idx - 1])
    if prev in PREP:
        return True
    if prev in ARTICLE and idx >= 2 and fdmp.fold(words[idx - 2]) in PREP:
        return True
    poss = {"mi", "mis", "tu", "tus", "su", "sus"}
    if prev in poss and idx >= 2 and fdmp.fold(words[idx - 2]) in PREP:
        return True
    return False


def is_capitalized_name(fdmp, word: str) -> bool:
    return bool(word) and word[0].isupper() and fdmp.fold(word) not in {"y", "o", "e", "he"}


def pick_subject_verse(
    fdmp, words: list[str], verb_idx: int, morph: str, span_idxs: list[int] | None = None
) -> list[int]:
    """Prefer actors inside the clause span (banner text), then near the verb in the verse."""
    n = len(words)
    if not n or verb_idx < 0:
        return []
    folded = [fdmp.fold(w) for w in words]
    person, _ = fdmp.person_number(morph)
    span_set = set(span_idxs or [])

    def nearest(phrases: list[str], lo: int, hi: int, *, after_boost: bool) -> list[int] | None:
        best: list[int] | None = None
        best_dist = 10**9
        if hi <= lo:
            return None
        for phrase in phrases:
            for prefer_end in (True, False):
                hit = fdmp.find_phrase_span(folded, phrase, lo, hi, prefer_end=prefer_end)
                if not hit or not fdmp.subject_ok(words, hit):
                    continue
                if hit[0] > 0 and folded[hit[0] - 1] in {"de", "del"}:
                    continue
                if folded[hit[0]] in PREP:
                    continue
                # If we have a clause span, prefer hits that touch it
                if span_set and not (set(hit) & span_set) and after_boost is False:
                    # still allow — verse fallback passes after_boost True only for near-verb windows
                    pass
                dist = min(abs(j - verb_idx) for j in hit)
                if hit[0] > verb_idx:
                    dist -= 0.25
                if span_set and set(hit) <= span_set:
                    dist -= 2.0
                elif span_set and set(hit) & span_set:
                    dist -= 1.0
                if dist < best_dist:
                    best_dist = dist
                    best = hit
        return best

    # Pronouns when morphology is 1st/2nd — only if overt in the verse
    if person == "1":
        hit = nearest(["nosotros", "nosotras", "yo"], 0, n, after_boost=True)
        if hit:
            return hit
    if person == "2":
        hit = nearest(["ustedes", "tú", "usted", "vosotros"], 0, n, after_boost=True)
        if hit:
            return hit

    # 1) Known actors / names inside the clause span (matches banner text).
    # Prefer the earliest overt actor in the span — mega-clause rows often park
    # the finite at the end («…que he levantado») while Quién actúa is the
    # opener («Respondió Nabucodonosor»).
    if span_idxs:
        slo, shi = min(span_idxs), max(span_idxs) + 1
        earliest: list[int] | None = None
        earliest_at = 10**9
        for phrase in fdmp.ACTOR_PHRASES:
            hit = fdmp.find_phrase_span(folded, phrase, slo, shi, prefer_end=False)
            if not hit or not fdmp.subject_ok(words, hit):
                continue
            if hit[0] > 0 and folded[hit[0] - 1] in {"de", "del"}:
                continue
            if hit[0] < earliest_at:
                earliest_at = hit[0]
                earliest = hit
        if earliest:
            return earliest
        for i in range(slo, shi):
            if i not in span_set:
                continue
            if is_prepositional(fdmp, words, i):
                continue
            if not is_capitalized_name(fdmp, words[i]):
                continue
            if fdmp.fold(words[i]) in fdmp.SUBJECT_BAN:
                continue
            start = i
            if i > 0 and folded[i - 1] in ARTICLE:
                start = i - 1
            cand = list(range(start, i + 1))
            if fdmp.subject_ok(words, cand):
                return cand

    # 2) Verse-wide near the finite’s Spanish word
    before_lo, before_hi = 0, verb_idx
    after_lo, after_hi = verb_idx + 1, min(n, verb_idx + 9)
    hit = nearest(fdmp.ACTOR_PHRASES, before_lo, before_hi, after_boost=True)
    if hit:
        return hit
    hit = nearest(fdmp.ACTOR_PHRASES, after_lo, after_hi, after_boost=True)
    if hit:
        return hit

    for idxs in (
        list(range(verb_idx - 1, max(-1, verb_idx - 8), -1)),
        list(range(verb_idx + 1, min(n, verb_idx + 9))),
    ):
        for i in idxs:
            if is_prepositional(fdmp, words, i):
                continue
            if not is_capitalized_name(fdmp, words[i]):
                continue
            if fdmp.fold(words[i]) in fdmp.SUBJECT_BAN:
                continue
            start = i
            if i > 0 and folded[i - 1] in ARTICLE:
                start = i - 1
            cand = list(range(start, i + 1))
            if fdmp.subject_ok(words, cand):
                return cand

    SAFE_AFTER = {
        "rey", "reina", "angel", "dios", "señor", "altisimo",
        "vigilante", "santo", "pueblo", "bestia", "cuerno", "carnero",
    }
    for i in range(verb_idx + 1, min(n, verb_idx + 5)):
        if folded[i] not in SAFE_AFTER:
            continue
        if is_prepositional(fdmp, words, i):
            continue
        start = i
        if i > 0 and folded[i - 1] in ARTICLE:
            start = i - 1
        cand = list(range(start, i + 1))
        if fdmp.subject_ok(words, cand):
            return cand
    return []


def refill(path: Path, fdmp, words_by_verse, morph_by_tid, word_by_token) -> None:
    doc = json.loads(path.read_text(encoding="utf-8"))
    data = doc["data"]
    slug = "daniel"
    actors_key = f"the-reader:spanish-clause-builder:{slug}:clause-actors:v1"
    clause_key = f"the-reader:spanish-clause-builder:{slug}:v3"
    actors: dict = dict(data.get(actors_key) or {})
    clauses: dict = data.get(clause_key) or {}
    mood = set(data.get(f"roots:{slug}:brick2:mood:imperativeCandidates") or [])
    mood |= set(data.get(f"roots:{slug}:brick2c:mood:statementCandidates") or [])
    mood |= set(data.get(f"roots:{slug}:brick1b:nominalClauseHeads") or [])

    filled = kept = skipped = 0
    for cid in sorted(mood, key=lambda x: tuple(map(int, x.split(":")))):
        if cid not in clauses or not (clauses[cid].get("selectedSpan") or []):
            continue
        row = dict(actors.get(cid) or {"subjectSpan": [], "verbSpan": [], "objectSpan": []})
        if row.get("subjectSpan"):
            kept += 1
            continue
        ch, vs, tok = map(int, cid.split(":"))
        words = words_by_verse.get((ch, vs), [])
        if not words:
            skipped += 1
            continue
        verb_idx = word_by_token.get((ch, vs, tok))
        if verb_idx is None:
            span = clauses[cid].get("selectedSpan") or []
            verb_idx = int(span[-1].split(":")[2]) if span else 0
        verb_idx = max(0, min(int(verb_idx), len(words) - 1))
        span_idxs = [
            int(x.split(":")[2])
            for x in (clauses[cid].get("selectedSpan") or [])
            if isinstance(x, str) and x.count(":") == 2
        ]
        idxs = pick_subject_verse(
            fdmp, words, verb_idx, morph_by_tid.get(cid, ""), span_idxs=span_idxs
        )
        idxs = [j for j in idxs if j != verb_idx]
        if not idxs:
            skipped += 1
            actors[cid] = row
            continue
        row["subjectSpan"] = [f"{ch}:{vs}:{j}" for j in idxs]
        if not row.get("verbSpan"):
            row["verbSpan"] = [f"{ch}:{vs}:{verb_idx}"]
        actors[cid] = row
        filled += 1

    data[actors_key] = actors
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    doc["exportedAt"] = now
    notes = doc.setdefault("fillNotes", {})
    if isinstance(notes, dict):
        notes["actorRefill"] = {
            "script": "scripts/refill-daniel-clause-actors.py",
            "filledEmptySubjects": filled,
            "keptExistingSubjects": kept,
            "stillEmpty": skipped,
            "at": now,
        }
        notes["actorsWithSubject"] = sum(1 for a in actors.values() if a.get("subjectSpan"))
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{path}: filled={filled} kept={kept} stillEmpty={skipped}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--progress", type=Path, default=DEFAULT_PROGRESS)
    ap.add_argument("--also", type=Path, action="append", default=[])
    args = ap.parse_args()

    fdmp = load_fdmp()
    words_by_verse = load_words()
    morph_by_tid = load_morph()
    word_by_token: dict[tuple[int, int, int], int] = {}
    for rec in json.loads(ALIGN.read_text(encoding="utf-8"))["records"]:
        word_by_token[(rec["chapter"], rec["verse"], rec["token"])] = int(rec["lbfWordIndex"])

    refill(args.progress, fdmp, words_by_verse, morph_by_tid, word_by_token)
    for extra in args.also:
        refill(extra, fdmp, words_by_verse, morph_by_tid, word_by_token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
