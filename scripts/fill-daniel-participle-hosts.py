#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed Daniel Hebrew participle subject hosts (Who do they ride with?).

Hebrew participles have no Greek case, so Structure treats them like nominatives
and expects ``participle-subjects:v1`` entries. This script fills them from:

1. Clause-actor ``subjectSpan`` when the participle’s Spanish word sits in that
   clause’s ``selectedSpan``
2. Else nearest agreeing OSHB noun (prefer before the participle, else after)
3. Else nearest Spanish content word / tonic pronoun in the clause or verse
   (prefer before, else after — Aramaic *ʿānēh* / “Respondió el rey…” patterns)

Usage:
    python3 scripts/fill-daniel-participle-hosts.py
    python3 scripts/fill-daniel-participle-hosts.py --progress data/lbf/ot/daniel-progress-filled.json
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
TOKENS = ROOT.parent / "cgv-data" / "interlinears" / "OT" / "daniel.tokens.jsonl"
ALIGN = ROOT / "data" / "lbf" / "ot" / "daniel.alignment.json"
LBF_MD = ROOT / "data" / "lbf" / "ot" / "daniel.md"
DEFAULT_PROGRESS = ROOT / "data" / "lbf" / "ot" / "daniel-progress-filled.json"

TOKEN_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’-]*")

SUBJECT_BAN = {
    "se", "me", "te", "le", "les", "lo", "la", "los", "las",
    "de", "del", "al", "a", "en", "con", "por", "para", "y", "o", "e",
    "no", "ni", "su", "sus", "mi", "mis", "tu", "tus", "el", "un", "una",
    "que", "como", "más", "muy", "ya", "así", "entonces", "después",
    "antes", "hasta", "desde", "sobre", "entre", "sin",
    # Narrative speech/perception verbs — never subject hosts
    "respondio", "respondieron", "hablo", "hablaron", "dijo", "dijeron",
    "veia", "vieron", "vido", "clamaba", "clamo", "conoce", "revela",
    "sirven", "adoran", "mora", "descendia", "publica", "vi", "fue", "es", "era",
    # Weak / non-subject leftovers
    "tan", "he", "aqui", "asi", "pues", "mas", "vez", "fin",
    "este", "esta", "esto", "estos", "estas", "ese", "esa", "eso",
}

ARTICLE = {"el", "la", "los", "las", "un", "una"}
PREP = {
    "de", "del", "a", "al", "en", "con", "por", "para", "ante", "bajo",
    "desde", "hacia", "sobre", "sin", "segun", "tras", "entre",
}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def is_tonic_pronoun(word: str) -> bool:
    """Él / Ella / Ellos / Ellas — fold('Él')=='el' would otherwise hit SUBJECT_BAN."""
    f = fold(word)
    if f in {"ella", "ellos", "ellas", "yo", "nosotros", "nosotras", "usted", "ustedes"}:
        return True
    if f == "el" and any(c in word for c in "Éé"):
        return True
    return False


def is_subject_ban(word: str) -> bool:
    if is_tonic_pronoun(word):
        return False
    return fold(word) in SUBJECT_BAN


def is_prepositional_object(words: list[str], idx: int) -> bool:
    if idx <= 0:
        return False
    prev = fold(words[idx - 1])
    if prev in PREP:
        return True
    if prev in ARTICLE and idx >= 2 and fold(words[idx - 2]) in PREP:
        return True
    # de mi cabeza / en su casa
    poss = {"mi", "mis", "tu", "tus", "su", "sus", "nuestro", "nuestra", "nuestros", "nuestras"}
    if prev in poss and idx >= 2 and fold(words[idx - 2]) in PREP:
        return True
    return False


def is_capitalized_name(word: str) -> bool:
    return bool(word) and word[0].isupper() and not is_tonic_pronoun(word)


def host_span_ids(ch: int, vs: int, words: list[str], end_idx: int) -> list[str]:
    start = end_idx
    if end_idx > 0 and fold(words[end_idx - 1]) in ARTICLE and not is_tonic_pronoun(words[end_idx - 1]):
        start = end_idx - 1
    return [f"{ch}:{vs}:{i}" for i in range(start, end_idx + 1)]


def pick_spanish_host(
    words: list[str],
    preferred: list[int],
    *,
    names_only: bool = False,
    skip_prep_objects: bool = True,
    skip_indexes: set[int] | None = None,
) -> int | None:
    skip = skip_indexes or set()
    for idx in preferred:
        if idx < 0 or idx >= len(words) or idx in skip:
            continue
        if is_subject_ban(words[idx]):
            continue
        if names_only and not is_capitalized_name(words[idx]):
            continue
        if skip_prep_objects and is_prepositional_object(words, idx):
            continue
        return idx
    return None


def is_proper_noun_morph(morph: str) -> bool:
    parts = morph.split("/")
    for part in reversed(parts):
        raw = part[1:] if part[:1] in "HA" else part
        if raw.startswith("Np") or raw == "Np":
            return True
    return False


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


def verb_core(morph: str) -> str | None:
    parts = morph.split("/")
    for part in reversed(parts):
        if re.match(r"^[HA]V", part):
            return part[1:]
        if part.startswith("V") and len(part) >= 3:
            return part
    m = re.search(r"[HA]?(V[A-Za-z0-9]+)", morph)
    return m.group(1) if m else None


def is_participle(morph: str) -> bool:
    core = verb_core(morph)
    return bool(core and len(core) >= 3 and core[2] == "r")


def participle_gn(morph: str) -> tuple[str | None, str | None]:
    core = verb_core(morph)
    if not core or len(core) < 4:
        return None, None
    rest = core[3:]
    gender = number = None
    i = 0
    if i < len(rest) and rest[i] in "mfbc":
        gender = {"m": "M", "f": "F", "b": "C", "c": "C"}[rest[i]]
        i += 1
    if i < len(rest) and rest[i] in "spd":
        number = "S" if rest[i] == "s" else "P"
    return gender, number


def noun_gn(morph: str) -> tuple[str | None, str | None] | None:
    """Return (gender, number) for OSHB noun/pronoun/adjective morph, else None."""
    parts = morph.split("/")
    for part in reversed(parts):
        raw = part[1:] if part[:1] in "HA" else part
        if not raw or raw[0] not in "NPA":  # noun / pronoun / adjective
            continue
        kind = raw[0]
        body = raw[1:]
        gender = number = None
        if kind == "P":
            # Pp3ms / Pf3fp — personal pronoun (not noun class c/g/p)
            if body[:1] == "p":
                body = body[1:]
            if body[:1].isdigit():
                body = body[1:]
            if body[:1] in "mfbc":
                gender = {"m": "M", "f": "F", "b": "C", "c": "C"}[body[0]]
                body = body[1:]
            if body[:1] in "spd":
                number = "S" if body[0] == "s" else "P"
        else:
            # Ncmsa / Aafpa / … optional noun class c/g/p before gender
            i = 0
            if i < len(body) and body[i] in "cgp":
                # Bare proper noun "Np" — no gender/number encoded
                if kind == "N" and body[i] == "p" and i + 1 >= len(body):
                    return "C", None
                i += 1
            if i < len(body) and body[i] in "mfbc":
                gender = {"m": "M", "f": "F", "b": "C", "c": "C"}[body[i]]
                i += 1
            if i < len(body) and body[i] in "spd":
                number = "S" if body[i] == "s" else "P"
        if gender or number:
            return gender, number
    return None


def load_lbf_words() -> dict[tuple[int, int], list[str]]:
    text = LBF_MD.read_text(encoding="utf-8")
    out: dict[tuple[int, int], list[str]] = {}
    for m in re.finditer(r"^### (\d+):(\d+)\n\n(.*)$", text, re.M):
        out[(int(m.group(1)), int(m.group(2)))] = TOKEN_RE.findall(m.group(3))
    return out


def gn_compatible(pg: str | None, pn: str | None, ng: str | None, nn: str | None) -> bool:
    if pn and nn and pn != nn:
        return False
    if pg and ng and pg != "C" and ng != "C" and pg != ng:
        return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--progress", type=Path, default=DEFAULT_PROGRESS)
    args = ap.parse_args()

    progress = json.loads(args.progress.read_text(encoding="utf-8"))
    data = progress["data"]
    slug = "daniel"
    clause_key = f"the-reader:spanish-clause-builder:{slug}:v3"
    actors_key = f"the-reader:spanish-clause-builder:{slug}:clause-actors:v1"
    hosts_key = f"the-reader:spanish-clause-builder:{slug}:participle-subjects:v1"
    brick4_key = "roots:daniel:brick4:participleCandidates"

    clauses: dict[str, dict] = data.get(clause_key) or {}
    actors: dict[str, dict] = data.get(actors_key) or {}
    participle_ids: list[str] = list(data.get(brick4_key) or [])

    align = json.loads(ALIGN.read_text(encoding="utf-8"))
    word_by_token: dict[tuple[int, int, int], int] = {}
    for rec in align["records"]:
        word_by_token[(rec["chapter"], rec["verse"], rec["token"])] = int(rec["lbfWordIndex"])

    lbf = load_lbf_words()

    # Load OSHB tokens keyed by Protestant ref
    tokens_by_verse: dict[tuple[int, int], list[dict]] = defaultdict(list)
    morph_by_tid: dict[str, str] = {}
    for line in TOKENS.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        ch, vs = mt_to_protestant(int(row["ch"]), int(row["vs"]))
        w = int(row["w"])
        tokens_by_verse[(ch, vs)].append(row)
        morph_by_tid[f"{ch}:{vs}:{w}"] = row.get("morph") or ""
    for v in tokens_by_verse.values():
        v.sort(key=lambda r: int(r["w"]))

    # Index clauses by verse for span membership
    clauses_by_verse: dict[tuple[int, int], list[tuple[str, dict]]] = defaultdict(list)
    for cid, clause in clauses.items():
        parts = cid.split(":")
        if len(parts) != 3:
            continue
        ch, vs = int(parts[0]), int(parts[1])
        clauses_by_verse[(ch, vs)].append((cid, clause))

    hosts: dict[str, list[str]] = {}
    from_actor = from_noun = from_spanish = unresolved = 0
    unresolved_ids: list[str] = []

    for tid in participle_ids:
        ch_s, vs_s, w_s = tid.split(":")
        ch, vs, w = int(ch_s), int(vs_s), int(w_s)
        words = lbf.get((ch, vs), [])
        if not words:
            unresolved += 1
            unresolved_ids.append(tid)
            continue
        word_idx = word_by_token.get((ch, vs, w))
        if word_idx is None:
            word_idx = min(len(words) - 1, max(0, w - 1))
        word_id = f"{ch}:{vs}:{word_idx}"

        # Find clause containing this Spanish word
        host_key = f"{ch}:{vs}"
        matched_clause: str | None = None
        for cid, clause in clauses_by_verse.get((ch, vs), []):
            span = clause.get("selectedSpan") or []
            if word_id in span:
                matched_clause = cid
                host_key = cid
                break

        if host_key in hosts:
            continue  # one host span per clause/verse key

        # 1) Actor subject
        actor = actors.get(matched_clause or "", {})
        subj = [x for x in (actor.get("subjectSpan") or []) if isinstance(x, str)]
        if subj:
            hosts[host_key] = subj
            from_actor += 1
            continue

        pg, pn = participle_gn(morph_by_tid.get(tid, ""))
        verse_rows = tokens_by_verse.get((ch, vs), [])

        def try_noun_at(tw: int) -> int | None:
            row = next((r for r in verse_rows if int(r["w"]) == tw), None)
            if not row:
                return None
            gn = noun_gn(row.get("morph") or "")
            if not gn:
                return None
            ng, nn = gn
            if not gn_compatible(pg, pn, ng, nn):
                return None
            es = word_by_token.get((ch, vs, tw))
            if es is None or es >= len(words) or es == word_idx:
                return None
            if is_subject_ban(words[es]):
                return None
            return es

        span_idxs: list[int] = []
        if matched_clause:
            span_idxs = sorted(
                int(x.split(":")[2])
                for x in (clauses[matched_clause].get("selectedSpan") or [])
                if x.startswith(f"{ch}:{vs}:")
            )
        verse_idxs = list(range(len(words)))
        skip_self = {word_idx}

        def order_side(indexes: list[int], *, after: bool) -> list[int]:
            if after:
                return sorted(i for i in indexes if i > word_idx)
            return sorted((i for i in indexes if i < word_idx), reverse=True)

        # 2a) Agreeing noun/pronoun BEFORE the participle
        before_ws = sorted((int(r["w"]) for r in verse_rows if int(r["w"]) < w), reverse=True)
        best_es = None
        for tw in before_ws:
            hit = try_noun_at(tw)
            if hit is not None and not is_prepositional_object(words, hit):
                best_es = hit
                break
        if best_es is not None:
            hosts[host_key] = host_span_ids(ch, vs, words, best_es)
            from_noun += 1
            continue

        # 2b) Spanish content / tonic pronoun BEFORE (clause, then verse)
        picked = pick_spanish_host(words, order_side(span_idxs, after=False), skip_indexes=skip_self)
        if picked is None:
            picked = pick_spanish_host(words, order_side(verse_idxs, after=False), skip_indexes=skip_self)
        if picked is not None:
            hosts[host_key] = host_span_ids(ch, vs, words, picked)
            from_spanish += 1
            continue

        # Post-verbal subjects (Aramaic “Respondió Nabucodonosor / el rey…”)
        after_window = 6
        after_ws = sorted(
            int(r["w"]) for r in verse_rows if w < int(r["w"]) <= w + after_window
        )
        after_es = list(range(word_idx + 1, min(len(words), word_idx + 1 + after_window)))

        # 3a) Capitalized Spanish name just after the participle
        picked = pick_spanish_host(words, after_es, names_only=True, skip_indexes=skip_self)
        if picked is not None:
            hosts[host_key] = host_span_ids(ch, vs, words, picked)
            from_spanish += 1
            continue

        # 3b) Proper noun in a short Hebrew window after the participle
        for tw in after_ws:
            row = next((r for r in verse_rows if int(r["w"]) == tw), None)
            if not row or not is_proper_noun_morph(row.get("morph") or ""):
                continue
            hit = try_noun_at(tw)
            if hit is not None and not is_prepositional_object(words, hit):
                hosts[host_key] = host_span_ids(ch, vs, words, hit)
                from_noun += 1
                break
        if host_key in hosts:
            continue

        # 3c) Other agreeing noun in that window (skip prep objects)
        for tw in after_ws:
            hit = try_noun_at(tw)
            if hit is not None and not is_prepositional_object(words, hit):
                hosts[host_key] = host_span_ids(ch, vs, words, hit)
                from_noun += 1
                break
        if host_key in hosts:
            continue

        # 3d) Article + noun (or tonic pronoun) just after — not bare verbs
        def pick_after_np() -> int | None:
            for idx in after_es:
                if idx in skip_self or is_subject_ban(words[idx]):
                    continue
                if is_prepositional_object(words, idx):
                    continue
                if is_tonic_pronoun(words[idx]):
                    return idx
                if idx > 0 and fold(words[idx - 1]) in ARTICLE:
                    return idx
            return None

        picked = pick_after_np()
        if picked is not None:
            hosts[host_key] = host_span_ids(ch, vs, words, picked)
            from_spanish += 1
            continue

        unresolved += 1
        unresolved_ids.append(tid)

    data[hosts_key] = hosts
    notes = progress.setdefault("fillNotes", {})
    notes["hebrewParticiplesNeedHostPick"] = unresolved
    notes["participleHostFill"] = {
        "script": "scripts/fill-daniel-participle-hosts.py",
        "hostKeys": len(hosts),
        "fromActorSubject": from_actor,
        "fromAgreeingNoun": from_noun,
        "fromSpanishFallback": from_spanish,
        "unresolvedTokens": unresolved,
        "unresolvedSample": unresolved_ids[:20],
    }
    progress["exportedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    args.progress.write_text(json.dumps(progress, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.progress}")
    print(f"host keys={len(hosts)} actor={from_actor} noun={from_noun} spanish={from_spanish} unresolved={unresolved}")
    if unresolved_ids[:10]:
        print("unresolved sample:", ", ".join(unresolved_ids[:10]))
    return 0 if unresolved == 0 else 0  # heuristic seed is still success for workshop


if __name__ == "__main__":
    raise SystemExit(main())
