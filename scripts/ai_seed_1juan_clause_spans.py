#!/usr/bin/env python3
"""AI-seed Observer clause spans, relation tags, and SVO actors for 1 Juan.

Preserves any existing human clause assignments / observations / actors. Fills
the rest from MorphGNT + LBF alignment, tags relations from leading-window
signals, then assigns Quién actúa / Qué hace / Sobre quién (clause-actors).

Usage:
  python3 scripts/ai_seed_1juan_clause_spans.py \\
    --progress ~/Downloads/cgv-reader-1juan-progress-….json \\
    --out ~/Downloads/cgv-reader-1juan-progress-ai-clauses.json
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MORPH = ROOT.parent / "cgv-data/morphology/MorphGNT/83-1Jn-morphgnt.txt"
TOKENS_JSONL = ROOT.parent / "cgv-data/interlinears/NT/1juan.tokens.jsonl"
LBF_MD = ROOT / "data/lbf/nt/1juan.md"
LBF_AL = ROOT / "data/lbf/nt/1juan.alignment.json"

WORD_RE = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+", re.UNICODE)
CLAUSE_KEY = "the-reader:spanish-clause-builder:1juan:v3"
OBS_KEY = "the-reader:spanish-clause-builder:1juan:statement-command-review:v1"
ACTORS_KEY = "the-reader:spanish-clause-builder:1juan:clause-actors:v1"
FINITE_KEY = "o-prototype:1juan:finite-verb-marks"

# MorphGNT case slot (index 6): N nominative, A accusative, D dative, G genitive.
# No RR: relative ὃ/ἥ maps to Spanish "que" and is not the actor.
SUBJECT_POS_PREFIXES = ("N", "RP", "RD", "RI")  # nouns/pronouns before adjectives
SUBJECT_POS_PREFIXES_SOFT = ("A",)  # adjectives only if nothing else
OBJECT_POS_PREFIXES = ("N", "A", "RP", "RD", "RI")

# Never keep these as Quién actúa (alignment noise / conjunctions / bare articles).
BAD_SUBJECT_FOLDS = {
    "porque",
    "que",
    "quien",
    "quienes",
    "cual",
    "cuales",
    "el",
    "la",
    "los",
    "las",
    "un",
    "una",
    "unos",
    "unas",
    "y",
    "e",
    "o",
    "u",
    "si",
    "sino",
    "para",
    "por",
    "de",
    "del",
    "en",
    "a",
    "al",
    "con",
    "cuando",
    "como",
    "asi",
    "tambien",
    "pues",
    "pero",
    "aunque",
    "este",
    "esta",
    "estos",
    "estas",
    "ese",
    "esa",
    "lo",
    "le",
    "les",
    # Finite/copula Spanish forms that sometimes steal the subject slot via alignment.
    "es",
    "son",
    "era",
    "eras",
    "fue",
    "fui",
    "somos",
    "sois",
    "sera",
    "seran",
    "seremos",
    "hay",
    "esta",  # está folded without accent → overlaps "esta"; keep out of subject-only
    "estan",
    "estoy",
    "estamos",
    "he",
    "ha",
    "han",
    "hemos",
    "habeis",
}

LEADING_WINDOW = 4
BEGINNING_TOKEN_CAP = 12

# Mirror clause-signals.ts FRAME_PARTICLES (+ καθώς → time, common in 1 John).
FRAME_PARTICLES = {
    "ινα": "purpose",
    "οπως": "purpose",
    "γαρ": "reason",
    "διοτι": "reason",
    "ει": "condition",
    "εαν": "condition",
    "οτε": "time",
    "ως": "time",
    "επει": "time",
    "καθως": "time",  # comparative "just as"; closest Observer frameType bucket
}
POSTPOSITIVE = {"γαρ", "δε", "ουν", "μεν", "τε"}
PLAIN_COORDINATORS = {"και", "δε", "η"}
CONTENT_VERB_LEMMAS = {
    "λεγω",
    "λαλεω",
    "διδασκω",
    "πιστευω",
    "βουλομαι",
    "θελω",
    "ομολογεω",
    "παρακαλεω",
    "επαγγελλομαι",
    "υπομιμνησκω",
    "οιδα",
    "αρνεομαι",
    "αποκαλυπτω",
    "γινωσκω",
    "επιγινωσκω",
    "ακουω",
    "βλεπω",
    "θεωρεω",
    "γευομαι",
    "γραφω",
    "μιμνησκομαι",
    "μνημονευω",
    "νοεω",
    "επισταμαι",
    "αγγελλω",
    "αναγγελλω",
    "απαγγελλω",
}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", s, flags=re.UNICODE)


def agreement_key(morph: str) -> str:
    return morph[6:9] if len(morph) >= 9 else ""


def is_imperative_morph(morph: str) -> bool:
    return bool(re.match(r"^V-[123][A-Z]{2}D", morph) or re.match(r"^V-[A-Z]{2}M-[123]", morph))


def is_frame_particle(token: dict) -> bool:
    lemma = fold(token.get("lemma", ""))
    if lemma not in FRAME_PARTICLES:
        return False
    # ὡς tagged P is preposition ("as X"), not clause opener.
    return not str(token.get("morph", "")).startswith("P")


def stands_before_finite(tokens: list[dict], token: dict, finite_id: str) -> bool:
    if fold(token.get("lemma", "")) in POSTPOSITIVE:
        return True
    verb_i = next((i for i, t in enumerate(tokens) if t["id"] == finite_id), -1)
    if verb_i < 0:
        return True
    return tokens.index(token) < verb_i


def find_leading(
    tokens: list[dict], predicate, finite_id: str | None = None
) -> dict | None:
    for token in tokens[:LEADING_WINDOW]:
        if not predicate(token):
            continue
        if finite_id and not stands_before_finite(tokens, token, finite_id):
            continue
        return token
    return None


def relative_of_connection(tokens: list[dict]) -> bool:
    rel = find_leading(tokens, lambda t: str(t.get("morph", "")).startswith("RR"))
    if not rel:
        return False
    key = agreement_key(rel.get("morph", ""))
    if not key:
        return False
    idx = tokens.index(rel)
    for token in tokens[idx + 1 :]:
        morph = str(token.get("morph", ""))
        if morph.startswith("N") and agreement_key(morph) == key:
            return True
    return False


def beginning_tokens(
    rows_by_verse: dict[tuple[int, int], list[dict]], ch: int, vs: int, start: int, end: int
) -> list[dict]:
    verse = rows_by_verse.get((ch, vs), [])
    out = [t for t in verse if start <= t["tok"] <= end][:BEGINNING_TOKEN_CAP]
    return out


def nearest_preceding(ordered_ids: list[str], fid: str) -> str | None:
    try:
        i = ordered_ids.index(fid)
    except ValueError:
        return None
    return ordered_ids[i - 1] if i > 0 else None


def guess_described_noun_span(
    fid: str,
    relative: dict,
    assignments: dict[str, dict],
    ordered_ids: list[str],
    rows_by_id: dict[str, dict],
    alignment: dict[tuple[int, int], dict[int, int]],
) -> list[str]:
    """Best-effort Spanish noun span: agreeing noun in previous clause via LBF map."""
    prev = nearest_preceding(ordered_ids, fid)
    if not prev:
        return []
    prev_asg = assignments.get(prev) or {}
    g_start = prev_asg.get("greekStartTokenId")
    g_end = prev_asg.get("greekEndTokenId")
    if not isinstance(g_start, str) or not isinstance(g_end, str):
        # Fall back to last Spanish words of previous clause.
        span = list(prev_asg.get("selectedSpan") or [])
        return span[-3:] if span else []

    pch, pvs, pstart = map(int, g_start.split(":"))
    _, _, pend = map(int, g_end.split(":"))
    key = agreement_key(relative.get("morph", ""))
    hit_tok = None
    for tok in range(pend, pstart - 1, -1):
        row = rows_by_id.get(f"{pch}:{pvs}:{tok}")
        if not row:
            continue
        morph = str(row.get("morph", ""))
        if morph.startswith("N") and (not key or agreement_key(morph) == key):
            hit_tok = tok
            break
        if hit_tok is None and morph.startswith(("N", "A", "RD", "RP")):
            # Soft fallback: last substantive-ish token.
            hit_tok = tok
            if morph.startswith("N"):
                break
    if hit_tok is None:
        span = list(prev_asg.get("selectedSpan") or [])
        return span[-2:] if span else []

    wi = alignment.get((pch, pvs), {}).get(hit_tok)
    if wi is None:
        span = list(prev_asg.get("selectedSpan") or [])
        return span[-2:] if span else []
    return [f"{pch}:{pvs}:{wi}"]


def classify_clause(
    fid: str,
    tokens: list[dict],
    lemma: str,
    ordered_ids: list[str],
    lemma_by_id: dict[str, str],
) -> dict[str, Any]:
    """Return observation dict + meta fields (_kind, _confidence, _note)."""
    finite_id = fid
    relative = find_leading(
        tokens, lambda t: str(t.get("morph", "")).startswith("RR"), finite_id
    )
    if relative:
        verb = next((t for t in tokens if t["id"] == finite_id), None)
        if verb and is_imperative_morph(str(verb.get("morph", ""))):
            return {
                "_kind": "root",
                "_confidence": "soft",
                "_note": "relative-over-imperative → independent (connective)",
                "describesNoun": "no",
                "isWhatWasExpressed": "no",
                "tellsWhenOrIf": "no",
                "describedNounSpan": [],
                "expressedParentClauseId": "",
                "whenIfParentClauseId": "",
            }
        if relative_of_connection(tokens):
            return {
                "_kind": "root",
                "_confidence": "soft",
                "_note": "relative-of-connection → independent",
                "describesNoun": "no",
                "isWhatWasExpressed": "no",
                "tellsWhenOrIf": "no",
                "describedNounSpan": [],
                "expressedParentClauseId": "",
                "whenIfParentClauseId": "",
            }
        return {
            "_kind": "describes",
            "_confidence": "confident",
            "_note": f"opens with relative {relative.get('surface')}",
            "describesNoun": "yes",
            # noun span filled by caller
            "isWhatWasExpressed": "no",
            "tellsWhenOrIf": "no",
            "expressedParentClauseId": "",
            "whenIfParentClauseId": "",
            "_relative": relative,
        }

    frame = find_leading(tokens, is_frame_particle, finite_id)
    if frame:
        parent = nearest_preceding(ordered_ids, fid)
        ftype = FRAME_PARTICLES[fold(frame["lemma"])]
        if parent:
            return {
                "_kind": "frame",
                "_confidence": "confident",
                "_note": f"opens with {frame.get('surface')} → {ftype}",
                "tellsWhenOrIf": "yes",
                "whenIfParentClauseId": parent,
                "frameType": ftype,
                "describesNoun": "no",
                "isWhatWasExpressed": "no",
                "describedNounSpan": [],
                "expressedParentClauseId": "",
            }

    oti = find_leading(tokens, lambda t: fold(t.get("lemma", "")) == "οτι", finite_id)
    if oti:
        parent = nearest_preceding(ordered_ids, fid)
        # Soft lean: content if nearby saying/knowing verb, else reason frame.
        leading_content = any(
            fold(t.get("lemma", "")) in CONTENT_VERB_LEMMAS for t in tokens[:LEADING_WINDOW]
        )
        prev_lemma = fold(lemma_by_id.get(parent or "", ""))
        prev_content = prev_lemma in CONTENT_VERB_LEMMAS
        if leading_content or prev_content:
            return {
                "_kind": "content",
                "_confidence": "soft",
                "_note": "ὅτι + nearby content verb → content",
                "describesNoun": "no",
                "isWhatWasExpressed": "yes",
                "expressedParentClauseId": parent or "",
                "tellsWhenOrIf": "no",
                "describedNounSpan": [],
                "whenIfParentClauseId": "",
            }
        return {
            "_kind": "frame",
            "_confidence": "soft",
            "_note": "ὅτι without content verb → reason",
            "describesNoun": "no",
            "isWhatWasExpressed": "no",
            "tellsWhenOrIf": "yes",
            "whenIfParentClauseId": parent or "",
            "frameType": "reason",
            "describedNounSpan": [],
            "expressedParentClauseId": "",
        }

    return {
        "_kind": "root",
        "_confidence": "confident",
        "_note": "no subordinating opener",
        "describesNoun": "no",
        "isWhatWasExpressed": "no",
        "tellsWhenOrIf": "no",
        "describedNounSpan": [],
        "expressedParentClauseId": "",
        "whenIfParentClauseId": "",
    }


def strip_meta(obs: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in obs.items() if not k.startswith("_")}


def apply_coordinate_inheritance(
    ordered_ids: list[str],
    observations: dict[str, dict],
    beginning_by_id: dict[str, list[dict]],
) -> int:
    """If bare καί/δέ/ἤ and previous is dependent, copy that relation."""
    inherited = 0
    for i, fid in enumerate(ordered_ids):
        if i == 0 or fid not in observations:
            continue
        obs = observations[fid]
        if not (
            obs.get("describesNoun") == "no"
            and obs.get("isWhatWasExpressed") == "no"
            and obs.get("tellsWhenOrIf") == "no"
        ):
            continue
        tokens = beginning_by_id.get(fid) or []
        coord = find_leading(
            tokens, lambda t: fold(t.get("lemma", "")) in PLAIN_COORDINATORS, fid
        )
        if not coord:
            continue
        # Skip if any other marker also present (already handled as non-root).
        prev = ordered_ids[i - 1]
        prev_obs = observations.get(prev) or {}
        if prev_obs.get("describesNoun") == "yes":
            observations[fid] = {
                "describesNoun": "yes",
                "describedNounSpan": list(prev_obs.get("describedNounSpan") or []),
            }
            inherited += 1
        elif prev_obs.get("isWhatWasExpressed") == "yes" and prev_obs.get("expressedParentClauseId"):
            observations[fid] = {
                "isWhatWasExpressed": "yes",
                "expressedParentClauseId": prev_obs["expressedParentClauseId"],
            }
            inherited += 1
        elif prev_obs.get("tellsWhenOrIf") == "yes" and prev_obs.get("whenIfParentClauseId"):
            observations[fid] = {
                "tellsWhenOrIf": "yes",
                "whenIfParentClauseId": prev_obs["whenIfParentClauseId"],
                **({"frameType": prev_obs["frameType"]} if prev_obs.get("frameType") else {}),
            }
            inherited += 1
    return inherited


def tokenize_spanish(text: str) -> list[dict]:
    words = []
    index = 0
    for m in WORD_RE.finditer(text):
        piece = m.group(0)
        if not re.search(r"[\wáéíóúüñÁÉÍÓÚÜÑ]", piece, re.I):
            continue
        words.append(
            {
                "id": None,  # filled by caller with ch:vs:index
                "index": index,
                "text": piece,
                "startChar": m.start(),
                "endChar": m.end(),
            }
        )
        index += 1
    return words


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


def load_morph_tokens() -> list[dict]:
    """Return tokens with ch, vs, tok (1-based in verse), morph, surface, greekId."""
    tokens = []
    verse_counts: dict[tuple[int, int], int] = defaultdict(int)
    for index, line in enumerate(MORPH.read_text(encoding="utf-8").splitlines()):
        line = line.strip()
        if not line:
            continue
        m = re.match(r"^(\d{6})\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", line)
        if not m:
            continue
        ref = m.group(1)
        ch = int(ref[2:4])
        vs = int(ref[4:6])
        verse_counts[(ch, vs)] += 1
        tok = verse_counts[(ch, vs)]
        morph = m.group(5)  # MorphGNT column order: bbccvv word lemma pos parse ...
        # Actual MorphGNT format: book-chapter-verse word lemma pos parsing ...
        # Columns after ref vary — read carefully from file.
        tokens.append(
            {
                "lineIndex": index,
                "ref": ref,
                "greekId": f"{ref}-{index}",
                "ch": ch,
                "vs": vs,
                "tok": tok,
                "raw": line,
            }
        )
    return tokens


def parse_morphgnt_line(line: str) -> dict | None:
    # Format: BBCCVV word lemma pos parsing ...
    parts = line.split()
    if len(parts) < 5 or not re.match(r"^\d{6}$", parts[0]):
        return None
    return {
        "ref": parts[0],
        "surface": parts[1],
        "lemma": parts[2],
        "pos": parts[3],
        "parsing": parts[4],
    }


def load_morph_rich() -> list[dict]:
    tokens = []
    verse_counts: dict[tuple[int, int], int] = defaultdict(int)
    for index, line in enumerate(MORPH.read_text(encoding="utf-8").splitlines()):
        parsed = parse_morphgnt_line(line.strip())
        if not parsed:
            continue
        ref = parsed["ref"]
        ch = int(ref[2:4])
        vs = int(ref[4:6])
        verse_counts[(ch, vs)] += 1
        tok = verse_counts[(ch, vs)]
        morph = parsed["parsing"] if parsed["pos"].startswith("V") else parsed["pos"]
        # Prefer full morph string like MorphGNT V-… from pos+parsing join used in tokens.jsonl
        full_morph = parsed["pos"] if len(parsed["pos"]) > 2 else f"{parsed['pos']}-{parsed['parsing']}"
        # In this file, column 3 is often the morph code already (V-3PAI-S--)
        # Inspect: parts[3] may be morph. Use tokens.jsonl instead for reliability.
        tokens.append(
            {
                "lineIndex": index,
                "ref": ref,
                "greekId": f"{ref}-{index}",
                "ch": ch,
                "vs": vs,
                "tok": tok,
                "surface": parsed["surface"],
                "lemma": parsed["lemma"],
                "pos": parsed["pos"],
                "parsing": parsed["parsing"],
                "morph": parsed["pos"] if parsed["pos"].startswith("V-") else parsed["parsing"],
            }
        )
    return tokens


def load_finites_from_tokens_jsonl() -> tuple[list[dict], dict[tuple[int, int], int], list[dict]]:
    """Use cgv-data tokens.jsonl — has reliable morph codes."""
    path = TOKENS_JSONL
    finites = []
    all_toks: dict[tuple[int, int], int] = defaultdict(int)
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        ch, vs, tok = int(row["ch"]), int(row["vs"]), int(row["tok"])
        all_toks[(ch, vs)] = max(all_toks[(ch, vs)], tok)
        morph = row.get("morph") or ""
        tid = f"{ch}:{vs}:{tok}"
        rich = {**row, "ch": ch, "vs": vs, "tok": tok, "morph": morph, "id": tid}
        rows.append(rich)
        if re.match(r"^V-[123]", morph):
            finites.append(
                {
                    "ch": ch,
                    "vs": vs,
                    "tok": tok,
                    "id": tid,
                    "surface": row.get("surface", ""),
                    "morph": morph,
                    "lemma": row.get("lemma", ""),
                }
            )
    return finites, all_toks, rows


def load_alignment() -> dict[tuple[int, int], dict[int, int]]:
    data = json.loads(LBF_AL.read_text(encoding="utf-8"))
    by: dict[tuple[int, int], dict[int, int]] = defaultdict(dict)
    for r in data.get("records", []):
        by[(r["chapter"], r["verse"])][r["token"]] = r["lbfWordIndex"]
    return by


def greek_id_to_alignment(progress_finite_marks: list[str], morph_tokens: list[dict]) -> set[str]:
    """Map Brick-1 greekIds to ch:vs:tok alignment ids."""
    # Rebuild map from morph file line order (same as Reader).
    verse_counts: dict[str, int] = defaultdict(int)
    g2a: dict[str, str] = {}
    for index, line in enumerate(MORPH.read_text(encoding="utf-8").splitlines()):
        m = re.match(r"^(\d{6})\s+", line.strip())
        if not m:
            continue
        ref = m.group(1)
        ch = int(ref[2:4])
        vs = int(ref[4:6])
        key = f"{ch}:{vs}"
        verse_counts[key] += 1
        tok = verse_counts[key]
        g2a[f"{ref}-{index}"] = f"{ch}:{vs}:{tok}"
    out = set()
    for gid in progress_finite_marks:
        aid = g2a.get(gid)
        if aid:
            out.add(aid)
    return out


# Clause-initial subordinators: when found between two finites, they open the
# *following* clause (γράφω… ὅτι ἀφέωνται → ὅτι belongs with ἀφέωνται).
NEXT_CLAUSE_OPENERS = set(FRAME_PARTICLES) | {"οτι"}


def propose_ranges(
    finites: list[dict],
    verse_len: dict[tuple[int, int], int],
    rows_by_verse: dict[tuple[int, int], list[dict]] | None = None,
) -> dict[str, tuple[int, int, int, int]]:
    """finiteVerbId → (ch, vs, startTok, endTok).

    Contiguous non-overlapping partition per verse. Postverbal material stays
    with this verb, except a clause-opener (ὅτι/ἵνα/ἐάν/…) before the next
    finite is peeled onto that next clause so dependents open with their marker.
    """
    by_verse: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for f in finites:
        by_verse[(f["ch"], f["vs"])].append(f)

    ranges = {}
    for (ch, vs), verbs in by_verse.items():
        verbs = sorted(verbs, key=lambda x: x["tok"])
        n = verse_len.get((ch, vs), verbs[-1]["tok"] if verbs else 0)
        verse_toks = {t["tok"]: t for t in (rows_by_verse or {}).get((ch, vs), [])}
        cursor = 1
        for i, verb in enumerate(verbs):
            end = n if i == len(verbs) - 1 else verbs[i + 1]["tok"] - 1
            # Peel the earliest next-clause opener after this finite onto the next clause.
            if i < len(verbs) - 1:
                next_verb_tok = verbs[i + 1]["tok"]
                for tok in range(verb["tok"] + 1, next_verb_tok):
                    row = verse_toks.get(tok)
                    if not row:
                        continue
                    if fold(row.get("lemma", "")) in NEXT_CLAUSE_OPENERS:
                        # Relatives (ὅς) are morph RR, not in NEXT_CLAUSE_OPENERS;
                        # particles/conjunctions peel here.
                        if is_frame_particle(row) or fold(row.get("lemma", "")) == "οτι":
                            end = tok - 1
                            break
                    if str(row.get("morph", "")).startswith("RR"):
                        end = tok - 1
                        break
            end = max(end, verb["tok"])
            start = min(cursor, verb["tok"])
            ranges[verb["id"]] = (ch, vs, start, end)
            cursor = end + 1
    return ranges


def spanish_span_from_greek(
    ch: int,
    vs: int,
    start: int,
    end: int,
    words: list[dict],
    align: dict[int, int],
    token_records: dict[int, dict] | None = None,
) -> list[str]:
    """Greek → Spanish, matching Reader deriveSpanishSpanFromGreekRange."""
    indexes = []
    for tok in range(start, end + 1):
        wi = align.get(tok)
        if wi is not None:
            indexes.append(wi)
    if not indexes or not words:
        return []
    low, high = min(indexes), max(indexes)
    # Phrase expansion (la cual, etc.) when alignment surfaces are available.
    if token_records:
        verse_texts = [w["text"] for w in words]
        for tok in range(start, end + 1):
            rec = token_records.get(tok) or {}
            surface = rec.get("lbfSurface") or ""
            anchor = rec.get("lbfWordIndex")
            if anchor is None or not surface:
                continue
            parts = [fold(p) for p in surface.split() if fold(p)]
            if len(parts) < 2:
                continue
            anchor_norm = fold(verse_texts[anchor]) if 0 <= anchor < len(verse_texts) else ""
            if anchor_norm not in parts:
                continue
            part_at = parts.index(anchor_norm)
            phrase_start = anchor - part_at
            phrase_end = phrase_start + len(parts) - 1
            if 0 <= phrase_start and phrase_end < len(verse_texts):
                if all(fold(verse_texts[phrase_start + i]) == parts[i] for i in range(len(parts))):
                    low = min(low, phrase_start)
                    high = max(high, phrase_end)
        if low > 0:
            head = fold(verse_texts[low])
            prev = fold(verse_texts[low - 1])
            if head in {"cual", "cuales", "quien", "quienes", "que"} and prev in {
                "la",
                "el",
                "los",
                "las",
                "a",
                "lo",
            }:
                low -= 1
    low = max(0, min(low, len(words) - 1))
    high = max(0, min(high, len(words) - 1))
    return [f"{ch}:{vs}:{i}" for i in range(low, high + 1)]


def seed_observations(
    assignments: dict[str, dict],
    rows: list[dict],
    alignment: dict[tuple[int, int], dict[int, int]],
    existing_obs: dict[str, dict],
    replace_existing: bool,
) -> tuple[dict[str, dict], dict[str, Any]]:
    rows_by_verse: dict[tuple[int, int], list[dict]] = defaultdict(list)
    rows_by_id: dict[str, dict] = {}
    lemma_by_id: dict[str, str] = {}
    for r in rows:
        rows_by_verse[(r["ch"], r["vs"])].append(r)
        rows_by_id[r["id"]] = r
        lemma_by_id[r["id"]] = r.get("lemma", "")

    ordered_ids = sorted(assignments.keys(), key=lambda x: tuple(map(int, x.split(":"))))
    observations: dict[str, dict] = {}
    beginning_by_id: dict[str, list[dict]] = {}
    kinds: Counter[str] = Counter()
    confidence: Counter[str] = Counter()
    notes: list[str] = []

    for fid in ordered_ids:
        asg = assignments[fid]
        if not replace_existing and fid in existing_obs:
            observations[fid] = dict(existing_obs[fid])
            kinds["preservedHuman"] += 1
            # Still need beginning tokens for inheritance walk.
            g0, g1 = asg.get("greekStartTokenId"), asg.get("greekEndTokenId")
            if isinstance(g0, str) and isinstance(g1, str):
                ch, vs, start = map(int, g0.split(":"))
                _, _, end = map(int, g1.split(":"))
                beginning_by_id[fid] = beginning_tokens(rows_by_verse, ch, vs, start, end)
            continue

        g0 = asg.get("greekStartTokenId")
        g1 = asg.get("greekEndTokenId")
        if not isinstance(g0, str) or not isinstance(g1, str):
            kinds["skippedNoGreek"] += 1
            continue
        ch, vs, start = map(int, g0.split(":"))
        _, _, end = map(int, g1.split(":"))
        tokens = beginning_tokens(rows_by_verse, ch, vs, start, end)
        beginning_by_id[fid] = tokens
        lemma = lemma_by_id.get(fid, "")
        raw = classify_clause(fid, tokens, lemma, ordered_ids, lemma_by_id)
        if raw.get("_kind") == "describes":
            rel = raw.pop("_relative", None)
            noun = guess_described_noun_span(
                fid, rel or {}, assignments, ordered_ids, rows_by_id, alignment
            )
            if not noun:
                # Hanging / discourse-opening relatives (e.g. 1 Jn 1:1 Ὃ ἦν…) —
                # no recoverable antecedent → provisional independent for the tree.
                raw = {
                    "_kind": "root",
                    "_confidence": "soft",
                    "_note": "relative without recoverable antecedent → provisional independent",
                    "describesNoun": "no",
                    "isWhatWasExpressed": "no",
                    "tellsWhenOrIf": "no",
                    "describedNounSpan": [],
                    "expressedParentClauseId": "",
                    "whenIfParentClauseId": "",
                }
            else:
                raw["describedNounSpan"] = noun
        kinds[str(raw.get("_kind"))] += 1
        confidence[str(raw.get("_confidence"))] += 1
        if raw.get("_note"):
            notes.append(f"{fid}: {raw['_note']}")
        observations[fid] = strip_meta(raw)

    inherited = apply_coordinate_inheritance(ordered_ids, observations, beginning_by_id)
    # Re-count kinds after inheritance for dependents that changed.
    final_kinds: Counter[str] = Counter()
    for fid, obs in observations.items():
        if obs.get("describesNoun") == "yes":
            final_kinds["describes"] += 1
        elif obs.get("isWhatWasExpressed") == "yes":
            final_kinds["content"] += 1
        elif obs.get("tellsWhenOrIf") == "yes":
            final_kinds["frame"] += 1
        elif (
            obs.get("describesNoun") == "no"
            and obs.get("isWhatWasExpressed") == "no"
            and obs.get("tellsWhenOrIf") == "no"
        ):
            final_kinds["root"] += 1
        else:
            final_kinds["partial"] += 1

    stats = {
        "tagged": len(observations),
        "kinds": dict(final_kinds),
        "seedConfidence": dict(confidence),
        "coordinateInherited": inherited,
        "preservedHumanObservations": kinds.get("preservedHuman", 0),
        "sampleNotes": notes[:12],
    }
    return (
        dict(sorted(observations.items(), key=lambda kv: tuple(map(int, kv[0].split(":"))))),
        stats,
    )


def morph_case(morph: str) -> str | None:
    if len(morph) > 6 and morph[0] in "NAR":
        return morph[6]
    return None


def morph_person_number(morph: str) -> tuple[str | None, str | None]:
    """Finite MorphGNT: V-1PAI-S-- → person '1', number 'S'."""
    if not morph.startswith("V-") or len(morph) < 8:
        return None, None
    person = morph[2] if morph[2] in "123" else None
    number = morph[7] if morph[7] in "SP" else None
    return person, number


def greek_toks_to_spanish(
    ch: int, vs: int, toks: list[int], alignment: dict[tuple[int, int], dict[int, int]]
) -> list[str]:
    indexes = []
    align = alignment.get((ch, vs), {})
    for tok in toks:
        wi = align.get(tok)
        if wi is not None:
            indexes.append(wi)
    if not indexes:
        return []
    low, high = min(indexes), max(indexes)
    return [f"{ch}:{vs}:{i}" for i in range(low, high + 1)]


def expand_with_article(verse_toks: dict[int, dict], head_tok: int) -> list[int]:
    """Include immediately preceding agreeing article."""
    head = verse_toks.get(head_tok)
    if not head:
        return [head_tok]
    out = [head_tok]
    prev = verse_toks.get(head_tok - 1)
    if prev and str(prev.get("morph", "")).startswith("RA"):
        if morph_case(prev["morph"]) == morph_case(head.get("morph", "")):
            out.insert(0, head_tok - 1)
    return out


PREFERRED_SUBJECT_LEMMAS = {
    "θεος",
    "ιησους",
    "χριστος",
    "πνευμα",
    "πατηρ",
    "υιος",
    "κυριος",
    "κοσμος",
    "ημεις",
    "υμεις",
    "εγω",
    "συ",
    "αυτος",
    "τις",
    "πας",
    "αγαπη",
    "ζωη",
    "φως",
    "σκοτια",
    "αληθεια",
    "αμαρτια",
}


def subject_score(row: dict, verb_tok: int) -> tuple[int, int]:
    """Higher is better; then closer before the verb."""
    lemma = fold(row.get("lemma", ""))
    morph = str(row.get("morph", ""))
    score = 0
    if lemma in PREFERRED_SUBJECT_LEMMAS:
        score += 50
    if morph.startswith("RP"):
        score += 40
    elif morph.startswith("N"):
        score += 30
    elif morph.startswith("RD"):
        score += 10
    elif morph.startswith("A"):
        score += 5
    # Prefer preverbal.
    dist = verb_tok - row["tok"]
    if dist > 0:
        score += 3
    return (score, -abs(dist))


def pick_head_token(
    verse_toks: dict[int, dict],
    start: int,
    end: int,
    verb_tok: int,
    want_cases: set[str],
    pos_prefixes: tuple[str, ...],
    prefer_before_verb: bool,
    score_fn=None,
) -> int | None:
    candidates: list[int] = []
    for tok in range(start, end + 1):
        row = verse_toks.get(tok)
        if not row or tok == verb_tok:
            continue
        morph = str(row.get("morph", ""))
        if not any(morph.startswith(p) for p in pos_prefixes):
            continue
        if morph.startswith("RA"):
            continue
        case = morph_case(morph)
        if case not in want_cases:
            continue
        candidates.append(tok)
    if not candidates:
        return None
    if score_fn:
        return max(candidates, key=lambda t: score_fn(verse_toks[t], verb_tok))
    before = [t for t in candidates if t < verb_tok]
    after = [t for t in candidates if t > verb_tok]
    if prefer_before_verb and before:
        return before[-1]
    if before:
        return before[-1]
    if after:
        return after[0]
    return None


def spanish_pronoun_in_ids(
    candidate_ids: list[str], person: str | None, number: str | None, word_text: dict[str, str]
) -> list[str]:
    """If Spanish already has an explicit subject pronoun among ids, use it."""
    targets: set[str] = set()
    if person == "1" and number == "P":
        targets = {"nosotros", "yo"}
    elif person == "1" and number == "S":
        targets = {"yo", "nosotros"}
    elif person == "2" and number == "P":
        targets = {"ustedes", "vosotros"}
    elif person == "2" and number == "S":
        targets = {"tú", "usted"}
    elif person == "3" and number == "P":
        targets = {"ellos", "ellas"}
    elif person == "3":
        targets = {"él", "ella", "dios"}
    folded_targets = {fold(t) for t in targets}
    hits = [wid for wid in candidate_ids if fold(word_text.get(wid, "")) in folded_targets]
    return hits[:1]


def is_good_subject_span(span: list[str], word_text: dict[str, str]) -> bool:
    if not span:
        return False
    folds = [fold(word_text.get(i, "")) for i in span]
    if not any(folds):
        return False
    # Reject pure function-word spans; allow "el Dios" / "la vida" if a content word remains.
    content = [f for f in folds if f and f not in BAD_SUBJECT_FOLDS]
    return bool(content)


def trim_subject_articles(span: list[str], word_text: dict[str, str]) -> list[str]:
    """Keep articles only when a content word is also in the span."""
    if not span:
        return span
    content_ids = [i for i in span if fold(word_text.get(i, "")) not in BAD_SUBJECT_FOLDS]
    if not content_ids:
        return []
    # Prefer contiguous run covering article+noun when article precedes content.
    low = min(int(i.split(":")[-1]) for i in span if i in content_ids or fold(word_text.get(i, "")) in {"el", "la", "los", "las"})
    # Simpler: drop leading/trailing pure function words.
    out = list(span)
    while out and fold(word_text.get(out[0], "")) in BAD_SUBJECT_FOLDS and not is_good_subject_span(out[1:], word_text):
        out = out[1:]
    while out and fold(word_text.get(out[-1], "")) in BAD_SUBJECT_FOLDS and len(out) > 1:
        # keep trailing only if sole content already present earlier
        if is_good_subject_span(out[:-1], word_text):
            out = out[:-1]
        else:
            break
    # If still only function words, empty.
    return out if is_good_subject_span(out, word_text) else content_ids[:1]


def seed_actors(
    assignments: dict[str, dict],
    rows: list[dict],
    alignment: dict[tuple[int, int], dict[int, int]],
    verses: dict[tuple[int, int], str],
    existing_actors: dict[str, dict],
    replace_existing: bool,
) -> tuple[dict[str, dict], dict[str, Any]]:
    rows_by_verse: dict[tuple[int, int], list[dict]] = defaultdict(list)
    rows_by_id: dict[str, dict] = {}
    for r in rows:
        rows_by_verse[(r["ch"], r["vs"])].append(r)
        rows_by_id[r["id"]] = r

    word_text: dict[str, str] = {}
    words_by_verse: dict[tuple[int, int], list[str]] = defaultdict(list)
    for (ch, vs), text in verses.items():
        for w in tokenize_spanish(text):
            wid = f"{ch}:{vs}:{w['index']}"
            word_text[wid] = w["text"]
            words_by_verse[(ch, vs)].append(wid)

    # Discourse defaults: first explicit nosotros / ustedes / Dios word ids in the book.
    book_ids = [wid for (ch, vs) in sorted(words_by_verse) for wid in words_by_verse[(ch, vs)]]
    default_nosotros = spanish_pronoun_in_ids(book_ids, "1", "P", word_text)
    default_ustedes = spanish_pronoun_in_ids(book_ids, "2", "P", word_text)
    default_dios = next((wid for wid in book_ids if fold(word_text.get(wid, "")) == "dios"), None)
    default_dios_span = [default_dios] if default_dios else []

    ordered_ids = sorted(assignments.keys(), key=lambda x: tuple(map(int, x.split(":"))))
    actors: dict[str, dict] = {}
    stats = Counter()
    last_subject: list[str] = []
    last_by_pn: dict[tuple[str, str], list[str]] = {}

    for fid in ordered_ids:
        prior = existing_actors.get(fid) or {}
        if (
            not replace_existing
            and prior.get("subjectSpan")
            and is_good_subject_span(list(prior.get("subjectSpan") or []), word_text)
        ):
            row = {
                "subjectSpan": list(prior.get("subjectSpan") or []),
                "verbSpan": list(prior.get("verbSpan") or []),
                "objectSpan": list(prior.get("objectSpan") or []),
            }
            actors[fid] = row
            last_subject = row["subjectSpan"]
            stats["preservedHuman"] += 1
            continue

        asg = assignments[fid]
        g0, g1 = asg.get("greekStartTokenId"), asg.get("greekEndTokenId")
        ch, vs, verb_tok = map(int, fid.split(":"))
        if isinstance(g0, str) and isinstance(g1, str):
            _, _, start = map(int, g0.split(":"))
            _, _, end = map(int, g1.split(":"))
        else:
            start = end = verb_tok

        verse_toks = {t["tok"]: t for t in rows_by_verse.get((ch, vs), [])}
        verb_row = rows_by_id.get(fid) or {}
        person, number = morph_person_number(str(verb_row.get("morph", "")))
        pn = (person or "?", number or "?")

        verb_span = greek_toks_to_spanish(ch, vs, [verb_tok], alignment)
        if not verb_span:
            sel = list(asg.get("selectedSpan") or [])
            verb_span = sel[:1]

        subject_span: list[str] = []
        source = "empty"
        subj_tok: int | None = None

        # 1st/2nd person: prefer pronoun / same-person carry before random nominatives
        # (vocatives and nearby nouns often sit in the Greek range).
        if person in {"1", "2"}:
            trial = spanish_pronoun_in_ids(
                list(asg.get("selectedSpan") or []) + words_by_verse.get((ch, vs), []),
                person,
                number,
                word_text,
            )
            if is_good_subject_span(trial, word_text):
                subject_span = trial
                source = "spanish-pronoun"
            elif pn in last_by_pn and is_good_subject_span(last_by_pn[pn], word_text):
                carried = last_by_pn[pn]
                carried_fold = fold(word_text.get(carried[0], "")) if carried else ""
                if carried_fold in {"yo", "nosotros", "ustedes", "vosotros", "tu", "usted", "dios"}:
                    subject_span = list(carried)
                    source = "carried-pn"
            if not subject_span:
                trial = default_nosotros if person == "1" else default_ustedes
                if is_good_subject_span(trial, word_text):
                    subject_span = trial
                    source = "default-person"

        if not subject_span:
            subj_tok = pick_head_token(
                verse_toks,
                start,
                end,
                verb_tok,
                {"N"},
                SUBJECT_POS_PREFIXES,
                True,
                score_fn=subject_score,
            )
            if subj_tok is None:
                subj_tok = pick_head_token(
                    verse_toks,
                    start,
                    end,
                    verb_tok,
                    {"N"},
                    SUBJECT_POS_PREFIXES_SOFT,
                    True,
                    score_fn=subject_score,
                )
            if subj_tok is not None:
                trial = trim_subject_articles(
                    greek_toks_to_spanish(
                        ch, vs, expand_with_article(verse_toks, subj_tok), alignment
                    ),
                    word_text,
                )
                if is_good_subject_span(trial, word_text):
                    subject_span = trial
                    source = "nominative"

        if not subject_span:
            trial = spanish_pronoun_in_ids(
                list(asg.get("selectedSpan") or []) + words_by_verse.get((ch, vs), []),
                person,
                number,
                word_text,
            )
            if is_good_subject_span(trial, word_text):
                subject_span = trial
                source = "spanish-pronoun"

        if not subject_span and pn in last_by_pn and is_good_subject_span(last_by_pn[pn], word_text):
            subject_span = list(last_by_pn[pn])
            source = "carried-pn"
        if not subject_span and is_good_subject_span(last_subject, word_text):
            subject_span = list(last_subject)
            source = "carried"
        if not subject_span:
            trial = []
            if person == "1":
                trial = default_nosotros
                source = "default-nosotros"
            elif person == "2":
                trial = default_ustedes
                source = "default-ustedes"
            if is_good_subject_span(trial, word_text):
                subject_span = trial
            else:
                source = "empty"

        if not subject_span:
            for wid in asg.get("selectedSpan") or []:
                if wid in verb_span:
                    continue
                if fold(word_text.get(wid, "")) in BAD_SUBJECT_FOLDS:
                    continue
                subject_span = [wid]
                source = "span-content"
                break

        obj_tok = pick_head_token(
            verse_toks, start, end, verb_tok, {"A", "D"}, OBJECT_POS_PREFIXES, False
        )
        if obj_tok is not None and obj_tok == subj_tok:
            obj_tok = pick_head_token(
                verse_toks, max(verb_tok, start), end, verb_tok, {"A", "D"}, OBJECT_POS_PREFIXES, False
            )
        object_span: list[str] = []
        if obj_tok is not None:
            object_span = greek_toks_to_spanish(
                ch, vs, expand_with_article(verse_toks, obj_tok), alignment
            )
            if set(object_span) & set(subject_span) or set(object_span) <= set(verb_span):
                object_span = []

        actors[fid] = {
            "subjectSpan": subject_span,
            "verbSpan": verb_span,
            "objectSpan": object_span,
        }
        if is_good_subject_span(subject_span, word_text):
            last_subject = subject_span
            last_by_pn[pn] = subject_span
        stats["seeded"] += 1
        stats[f"subj:{source}"] += 1
        stats["withObject" if object_span else "noObject"] += 1

    with_subj = sum(1 for a in actors.values() if a.get("subjectSpan"))
    with_verb = sum(1 for a in actors.values() if a.get("verbSpan"))
    return (
        dict(sorted(actors.items(), key=lambda kv: tuple(map(int, kv[0].split(":"))))),
        {
            "total": len(actors),
            "withSubject": with_subj,
            "withVerb": with_verb,
            "detail": dict(stats),
        },
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--progress", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument(
        "--replace-existing",
        action="store_true",
        help="Overwrite human clauses/observations/actors too (default: preserve them)",
    )
    args = ap.parse_args()

    bundle = json.loads(args.progress.read_text(encoding="utf-8"))
    data = bundle.setdefault("data", {})
    existing = dict(data.get(CLAUSE_KEY) or {})
    existing_obs = dict(data.get(OBS_KEY) or {})
    existing_actors = dict(data.get(ACTORS_KEY) or {})
    finite_marks = list(data.get(FINITE_KEY) or [])

    finites, verse_len, rows = load_finites_from_tokens_jsonl()
    # Prefer Brick-1 marks when present (student confirmed set).
    if finite_marks:
        marked_ids = greek_id_to_alignment(finite_marks, [])
        if marked_ids:
            finites = [f for f in finites if f["id"] in marked_ids]

    verses = load_lbf_verses()
    alignment = load_alignment()
    rows_by_verse: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for r in rows:
        rows_by_verse[(r["ch"], r["vs"])].append(r)
    ranges = propose_ranges(finites, verse_len, rows_by_verse)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    seeded = 0
    preserved = 0
    skipped_empty = 0
    assignments: dict[str, dict] = {}

    for fid, (ch, vs, start, end) in sorted(
        ranges.items(), key=lambda kv: tuple(map(int, kv[0].split(":")))
    ):
        if not args.replace_existing and fid in existing:
            continue
        text = verses.get((ch, vs), "")
        words = tokenize_spanish(text)
        for w in words:
            w["id"] = f"{ch}:{vs}:{w['index']}"
        span = spanish_span_from_greek(ch, vs, start, end, words, alignment.get((ch, vs), {}))
        if not span:
            if words:
                span = [w["id"] for w in words]
            else:
                skipped_empty += 1
                continue
        assignments[fid] = {
            "finiteVerbId": fid,
            "selectedSpan": span,
            "greekStartTokenId": f"{ch}:{vs}:{start}",
            "greekEndTokenId": f"{ch}:{vs}:{end}",
            "greekConfirmedAt": now,
        }
        seeded += 1

    if not args.replace_existing:
        for fid, val in existing.items():
            if not isinstance(val.get("selectedSpan"), list) or not val["selectedSpan"]:
                continue
            clean = {
                "finiteVerbId": val.get("finiteVerbId", fid),
                "selectedSpan": [x for x in val["selectedSpan"] if isinstance(x, str)],
            }
            if isinstance(val.get("greekStartTokenId"), str):
                clean["greekStartTokenId"] = val["greekStartTokenId"]
            if isinstance(val.get("greekEndTokenId"), str):
                clean["greekEndTokenId"] = val["greekEndTokenId"]
            if isinstance(val.get("greekConfirmedAt"), str):
                clean["greekConfirmedAt"] = val["greekConfirmedAt"]
            # Prefer AI greek bounds when human clause lacked them.
            if "greekStartTokenId" not in clean and fid in ranges:
                ch, vs, start, end = ranges[fid]
                clean["greekStartTokenId"] = f"{ch}:{vs}:{start}"
                clean["greekEndTokenId"] = f"{ch}:{vs}:{end}"
                clean["greekConfirmedAt"] = now
            assignments[fid] = clean
            preserved += 1

    # Ensure every assignment has greek bounds for tagging.
    for fid, asg in list(assignments.items()):
        if "greekStartTokenId" not in asg and fid in ranges:
            ch, vs, start, end = ranges[fid]
            asg["greekStartTokenId"] = f"{ch}:{vs}:{start}"
            asg["greekEndTokenId"] = f"{ch}:{vs}:{end}"
            asg["greekConfirmedAt"] = now

    data[CLAUSE_KEY] = dict(
        sorted(assignments.items(), key=lambda kv: tuple(map(int, kv[0].split(":"))))
    )

    observations, obs_stats = seed_observations(
        data[CLAUSE_KEY], rows, alignment, existing_obs, args.replace_existing
    )
    data[OBS_KEY] = observations

    # Always rebuild actors on seed runs (no hand-tuned 1 Juan actors yet).
    # --replace-existing still controls clause spans / relation tags.
    actors, actor_stats = seed_actors(
        data[CLAUSE_KEY],
        rows,
        alignment,
        verses,
        existing_actors,
        replace_existing=True,
    )
    data[ACTORS_KEY] = actors

    bundle["exportedAt"] = now
    bundle["book"] = "1juan"
    bundle["source"] = "cgv-reader"
    bundle["schema"] = 1
    bundle["meta"] = {
        "aiClauseSeed": {
            "seeded": seeded,
            "preservedHuman": preserved,
            "totalClauses": len(assignments),
            "finitesUsed": len(finites),
            "skippedEmpty": skipped_empty,
            "observations": obs_stats,
            "actors": actor_stats,
            "note": (
                "Draft spans + relation tags + SVO actors. Subjects from Greek "
                "nominatives (else Spanish pronoun / carried prior actor). "
                "Review Quién actúa in Structure; re-export when happy."
            ),
        }
    }

    args.out.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(bundle["meta"]["aiClauseSeed"], indent=2, ensure_ascii=False))
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
