#!/usr/bin/env python3
"""Repair Daniel Mark-fill clause roots (Q1–Q3).

The fill script created one clause per OSHB finite and answered Q1–Q3 as all
"no", so the app correctly treated every finite as an independent root (~875
H3s). The app is fine; the fill claimed independence too early.

This pass keeps Mark bricks and **every clause row**, retags Structure so
mid-verse fragments / subordinators hang under a parent as content/frame, and
**clips selectedSpan** to exclusive per-finite ranges (no span union / delete).

NOTE: Leaving selectedSpan as fill produced it is unfinished packaging.
Before Arquitecto naming, the Compiler MD must PASS
scripts/verify-skeleton-h4-packaging.py. Use scripts/recut-daniel-clause-spans.py
only when commentary has not yet locked to the skeleton.

Earlier absorb+union deleted ~600 rows and bloated H4 to whole-verse claims —
do not bring that back.

  python3 scripts/repair-daniel-clause-roots.py \\
    --progress ~/Downloads/cgv-reader-daniel-progress-filled-2026-08-03.json \\
    --also data/lbf/ot/daniel-progress-filled.json
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
LBF_MD = ROOT / "data" / "lbf" / "ot" / "daniel.md"

CLAUSES_KEY = "the-reader:spanish-clause-builder:daniel:v3"
OBS_KEY = "the-reader:spanish-clause-builder:daniel:statement-command-review:v1"
ACTORS_KEY = "the-reader:spanish-clause-builder:daniel:clause-actors:v1"

WORD_PATTERN = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+", re.UNICODE)

# New independent narrative / command openings (Spanish LBF).
NEW_ROOT = re.compile(
    r"^(?:"
    r"y |e |entonces |pero |mas |más |así |asi |empero |después |despues |"
    r"luego |después de |despues de |"
    r"prueba|levánt|levant|"
    r"entiende|sella|cierra|mira|oye|habla|escribe|ve |ven |oid |oíd |"
    r"he aquí|he aqui|sucedió|sucedio|aconteció|acontecio"
    r")",
    re.I,
)

FRAME_PREFIXES: list[tuple[str, str]] = [
    ("para que", "purpose"),
    ("a fin de que", "purpose"),
    ("porque", "reason"),
    ("ya que", "reason"),
    ("por cuanto", "reason"),
    ("pues", "reason"),
    ("aunque", "condition"),
    ("si ", "condition"),
    ("cuando", "time"),
    ("mientras", "time"),
    ("después que", "time"),
    ("despues que", "time"),
    ("al cabo", "time"),
]

CONTENT_PREFIXES = (
    "que ",
    "quién ",
    "quien ",
    "quiénes ",
    "quienes ",
    "cuánto ",
    "cuanto ",
    "cómo ",
    "como ",
)

SPEECH_VERBS = {
    "dijo",
    "dice",
    "dijeron",
    "respondio",
    "respondieron",
    "hablo",
    "hablaron",
    "mando",
    "mandaron",
    "pidio",
    "pidieron",
    "pregunto",
    "preguntaron",
    "grito",
    "clamaron",
    "ordeno",
    "declamo",
    "conto",
    "anuncio",
}


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def load_lbf_verses() -> dict[tuple[int, int], list[str]]:
    verses: dict[tuple[int, int], list[str]] = {}
    ch = vs = None
    buf: list[str] = []
    for line in LBF_MD.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+(\d+)\.(\d+)\s*$", line) or re.match(
            r"^###\s+(\d+):(\d+)\s*$", line
        )
        if not m:
            m = re.match(r"^(\d+):(\d+)\s+(.*)$", line)
            if m:
                if ch is not None:
                    verses[(ch, vs)] = buf
                ch, vs = int(m.group(1)), int(m.group(2))
                rest = m.group(3).strip() if m.lastindex and m.lastindex >= 3 else ""
                buf = [w for w in WORD_PATTERN.findall(rest) if w.strip()] if rest else []
                continue
            if ch is not None and line.strip() and not line.startswith("#"):
                buf.extend(w for w in WORD_PATTERN.findall(line) if w.strip())
            continue
        if ch is not None:
            verses[(ch, vs)] = buf
        ch, vs = int(m.group(1)), int(m.group(2))
        buf = []
    if ch is not None:
        verses[(ch, vs)] = buf
    # Prefer fill-script loader if available (same tokenization as spans).
    try:
        import importlib.util

        spec = importlib.util.spec_from_file_location(
            "fill_daniel", ROOT / "scripts" / "fill-daniel-mark-progress.py"
        )
        assert spec and spec.loader
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.load_lbf_verses()
    except Exception:
        return verses


def parse_id(cid: str) -> tuple[int, int, int]:
    ch, vs, tok = cid.split(":")
    return int(ch), int(vs), int(tok)


def span_text(words: list[str], selected: list[str]) -> str:
    idxs: list[int] = []
    for wid in selected:
        parts = wid.split(":")
        if len(parts) != 3:
            continue
        idxs.append(int(parts[2]))
    idxs = sorted({i for i in idxs if 0 <= i < len(words)})
    return " ".join(words[i] for i in idxs).strip()


def span_start_idx(selected: list[str]) -> int | None:
    idxs = []
    for wid in selected:
        parts = wid.split(":")
        if len(parts) == 3:
            idxs.append(int(parts[2]))
    return min(idxs) if idxs else None


def word_count(text: str) -> int:
    return len(re.findall(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+", text, re.I))


def blank_obs() -> dict:
    return {
        "describesNoun": "no",
        "isWhatWasExpressed": "no",
        "tellsWhenOrIf": "no",
        "describedNounSpan": [],
        "expressedParentClauseId": "",
        "whenIfParentClauseId": "",
    }


def content_obs(parent: str) -> dict:
    o = blank_obs()
    o["isWhatWasExpressed"] = "yes"
    o["expressedParentClauseId"] = parent
    return o


def frame_obs(parent: str, frame_type: str) -> dict:
    o = blank_obs()
    o["tellsWhenOrIf"] = "yes"
    o["whenIfParentClauseId"] = parent
    o["frameType"] = frame_type
    return o


def root_obs() -> dict:
    return blank_obs()


def after_coordinator(text: str) -> str:
    """Spanish after a leading Y/Entonces/Pero — for frame/content detection."""
    f = fold(text).lstrip()
    raw = text.lstrip()
    for prefix in (
        "y ",
        "e ",
        "entonces ",
        "pero ",
        "mas ",
        "más ",
        "así ",
        "asi ",
        "empero ",
        "luego ",
    ):
        fp = fold(prefix)
        if f.startswith(fp):
            # slice original by folded length approximation via regex
            m = re.match(r"(?i)^(y|e|entonces|pero|mas|más|así|asi|empero|luego)\s+", raw)
            return raw[m.end() :] if m else text
    return text


def leading_frame(text: str) -> str | None:
    for candidate in (text, after_coordinator(text)):
        f = fold(candidate).lstrip()
        for prefix, ftype in FRAME_PREFIXES:
            if f.startswith(fold(prefix)):
                if prefix.strip() == "si" and not f.startswith("si "):
                    continue
                if prefix == "pues" and not (
                    f.startswith("pues ") or f.startswith("pues,") or f == "pues"
                ):
                    continue
                return ftype
    return None


def leading_content(text: str) -> bool:
    for candidate in (text, after_coordinator(text)):
        f = fold(candidate).lstrip()
        if any(f.startswith(fold(p)) for p in CONTENT_PREFIXES):
            return True
    return False


def looks_like_new_root(text: str) -> bool:
    f = fold(text).lstrip()
    if not f:
        return False
    return bool(NEW_ROOT.match(f))


def is_stub_fragment(text: str) -> bool:
    """True for chopped fill fragments, not for real narrative clauses."""
    wc = word_count(text)
    if looks_like_new_root(text) and wc >= 5:
        return False
    if wc <= 3:
        return True
    f = fold(text).lstrip()
    # Mid-phrase leftovers from finite-splitting (short only).
    stub_starts = (
        "de su ",
        "de la ",
        "de los ",
        "en su ",
        "a la ",
        "a los ",
        "la porcion",
        "nombres:",
        "nombres ",
        "por favor",
        "su espiritu",
        "el sueno y",
        "interpretacion",
        "ahora me",
        "un sueno",
        "con los ",
        "con el ",
        "ni con ",
    )
    if wc <= 10 and any(f.startswith(s) for s in stub_starts):
        return True
    # Bare verb / noun stubs seen in the Mark fill
    if wc <= 5 and not looks_like_new_root(text) and "," not in text:
        if not re.search(r"\b(el|la|los|las|un|una|yo|tu|tú|dios|rey|daniel)\b", f):
            return True
    return False


def parent_has_speech(actors: dict, parent_id: str, clauses: dict, words_by_verse: dict) -> bool:
    act = actors.get(parent_id) or {}
    verb_span = act.get("verbSpan") or []
    if not verb_span:
        # fall back to last word of parent span
        asg = clauses.get(parent_id) or {}
        verb_span = (asg.get("selectedSpan") or [])[-1:]
    for wid in verb_span:
        parts = wid.split(":")
        if len(parts) != 3:
            continue
        ch, vs, wi = int(parts[0]), int(parts[1]), int(parts[2])
        wlist = words_by_verse.get((ch, vs), [])
        if 0 <= wi < len(wlist) and fold(wlist[wi]) in SPEECH_VERBS:
            return True
    # Span-text fallback
    asg = clauses.get(parent_id) or {}
    ch, vs, _ = parse_id(parent_id)
    text = fold(span_text(words_by_verse.get((ch, vs), []), asg.get("selectedSpan") or []))
    return any(f" {v} " in f" {text} " or text.startswith(v + " ") for v in SPEECH_VERBS)


def classify(
    cid: str,
    text: str,
    selected: list[str],
    prev_in_verse: str | None,
    last_root: str | None,
    actors: dict,
    clauses: dict,
    words_by_verse: dict,
) -> tuple[dict, str]:
    """Return (observation, kind).

    kinds: root / content / content:midverse / content:stub / content:short / frame:*
    All kinds keep the clause row. Mid-verse / stub / short hang as content under
    the prior verse root (OT wayyiqtol fragments without a Spanish subordinator).
    """
    parent_fallback = prev_in_verse or last_root
    ftype = leading_frame(text)
    if ftype and parent_fallback:
        return frame_obs(parent_fallback, ftype), f"frame:{ftype}"

    if leading_content(text) and parent_fallback:
        speech_parent = parent_fallback
        if last_root and parent_has_speech(actors, last_root, clauses, words_by_verse):
            speech_parent = last_root
        return content_obs(speech_parent), "content"

    # Prefer real new-clause openings over mid-verse demotion.
    if looks_like_new_root(text) and word_count(text) >= 5:
        return root_obs(), "root"

    # Fill spans often start with a short bleed from the previous finite
    # ("de su beber y buscó…"). Promote only when the lead-in is tiny and the
    # Y/E tail looks like a new root — not every interior " y " in a list.
    m = re.search(r"(?i)(?:^|[;\s])(y|e)\s+\S", text)
    if m:
        before = text[: m.start(1)].strip(" ,;")
        tail = text[m.start(1) :].lstrip()
        if word_count(before) <= 4 and looks_like_new_root(tail) and word_count(tail) >= 5:
            return root_obs(), "root"

    start = span_start_idx(selected)
    if prev_in_verse and start is not None and start > 0:
        return content_obs(prev_in_verse), "content:midverse"

    if is_stub_fragment(text) and parent_fallback:
        return content_obs(parent_fallback), "content:stub"

    if prev_in_verse and word_count(text) <= 8:
        return content_obs(prev_in_verse), "content:short"

    return root_obs(), "root"


def ensure_nominal_heads(
    data: dict,
    words_by_verse: dict[tuple[int, int], list[str]],
    heads: list[str],
) -> list[str]:
    """Ensure Brick 1B nominal heads exist as independent clause rows (no OSHB finite)."""
    clauses: dict = data[CLAUSES_KEY]
    observations: dict = data[OBS_KEY]
    actors: dict = data.setdefault(ACTORS_KEY, {})
    nominal_key = "roots:daniel:brick1b:nominalClauseHeads"
    nominal = list(data.get(nominal_key) or [])
    added: list[str] = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    for hid in heads:
        ch, vs, tok = parse_id(hid)
        words = words_by_verse.get((ch, vs), [])
        if hid not in clauses:
            span = [f"{ch}:{vs}:{i}" for i in range(len(words))] if words else [hid]
            clauses[hid] = {
                "finiteVerbId": hid,
                "selectedSpan": span,
                "greekStartTokenId": hid,
                "greekEndTokenId": hid,
                "greekConfirmedAt": now,
            }
            added.append(hid)
        if hid not in observations:
            observations[hid] = root_obs()
        if hid not in actors:
            actors[hid] = {
                "subjectSpan": [],
                "verbSpan": [f"{ch}:{vs}:0"] if words else [hid],
                "objectSpan": [],
            }
        if hid not in nominal:
            nominal.append(hid)
    data[nominal_key] = sorted(nominal, key=parse_id)
    data[CLAUSES_KEY] = clauses
    data[OBS_KEY] = observations
    data[ACTORS_KEY] = actors
    return added


def trim_actors_to_spans(clauses: dict, actors: dict) -> int:
    trimmed = 0
    for cid, act in list(actors.items()):
        if cid not in clauses:
            actors.pop(cid, None)
            trimmed += 1
            continue
        allowed = set(clauses[cid].get("selectedSpan") or [])
        if not allowed:
            continue
        changed = False
        new_act = dict(act)
        for key in ("subjectSpan", "verbSpan", "objectSpan"):
            old = list(act.get(key) or [])
            kept = [w for w in old if w in allowed]
            if key == "verbSpan" and not kept:
                # Fall back to last span word so SVO still has a verb slot.
                span = list(clauses[cid].get("selectedSpan") or [])
                kept = [span[-1]] if span else []
            if kept != old:
                new_act[key] = kept
                changed = True
        if changed:
            actors[cid] = new_act
            trimmed += 1
    return trimmed


def repair(bundle: dict, words_by_verse: dict[tuple[int, int], list[str]]) -> dict:
    data = bundle["data"]
    clauses: dict = dict(data[CLAUSES_KEY])
    observations: dict = dict(data[OBS_KEY])
    actors: dict = dict(data.get(ACTORS_KEY) or {})

    # Soft-block nominal heads (participle predicates with no OSHB finite in verse).
    nominal_added = ensure_nominal_heads(data, words_by_verse, ["4:37:4", "11:1:7"])
    clauses = dict(data[CLAUSES_KEY])
    observations = dict(data[OBS_KEY])
    actors = dict(data.get(ACTORS_KEY) or {})

    # Reset Q1–Q3 so classification runs on a clean slate.
    for cid in list(observations):
        observations[cid] = root_obs()

    # Keep fill's native selectedSpan (Spanish-verb partitions). Do NOT re-cut by
    # Hebrew token→LBF index: alignment often lands on nouns, which chops H4 wrongly.
    # Prior absorb+union was what bloated H4; leaving fill spans fixes length.
    spans_rewritten = 0
    actors_trimmed = trim_actors_to_spans(clauses, actors)

    ordered = sorted(clauses.keys(), key=parse_id)
    kind_counts: dict[str, int] = defaultdict(int)
    last_root: str | None = None
    prev_in_verse: str | None = None
    prev_verse: tuple[int, int] | None = None

    for cid in ordered:
        ch, vs, _tok = parse_id(cid)
        if prev_verse != (ch, vs):
            prev_in_verse = None
            prev_verse = (ch, vs)

        asg = clauses[cid]
        selected = list(asg.get("selectedSpan") or [])
        text = span_text(words_by_verse.get((ch, vs), []), selected)
        obs, kind = classify(
            cid,
            text,
            selected,
            prev_in_verse,
            last_root,
            actors,
            clauses,
            words_by_verse,
        )
        observations[cid] = obs
        kind_counts[kind] += 1

        if kind == "root":
            last_root = cid
            prev_in_verse = cid
        else:
            # Dependent — verse anchor stays the prior root (or this if none yet).
            prev_in_verse = prev_in_verse or last_root or cid

    for cid in clauses:
        if cid not in observations:
            observations[cid] = root_obs()

    # Safety: parent must be earlier in book order; otherwise promote to root.
    fixed_later_parent = 0
    for cid, o in list(observations.items()):
        parent = o.get("expressedParentClauseId") or o.get("whenIfParentClauseId") or ""
        if not parent:
            continue
        if parent not in clauses or parse_id(parent) >= parse_id(cid):
            observations[cid] = root_obs()
            fixed_later_parent += 1
            kind_counts["fixed-later-parent"] += 1

    roots = sum(
        1
        for o in observations.values()
        if o.get("describesNoun") == "no"
        and o.get("isWhatWasExpressed") == "no"
        and o.get("tellsWhenOrIf") == "no"
    )
    data[CLAUSES_KEY] = clauses
    data[OBS_KEY] = observations
    data[ACTORS_KEY] = actors
    bundle["data"] = data
    bundle["exportedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    notes = dict(bundle.get("fillNotes") or {})
    notes["rootRepair"] = {
        "script": "scripts/repair-daniel-clause-roots.py",
        "verdict": (
            "App OK. Mark fill claimed every finite independent. "
            "Repair keeps all clause rows: mid-verse/stub fragments become content "
            "under the prior root. selectedSpan stays as fill produced it "
            "(Spanish-verb partitions) — no absorb/union (that bloated H4) and no "
            "Hebrew-token re-cut (alignment often misses the Spanish verb). "
            "Real subordinators stay content/frame. Expect OT 'no leading marker' "
            "warnings on demoted deps."
        ),
        "kinds": dict(kind_counts),
        "rootsAfter": roots,
        "clausesAfter": len(clauses),
        "absorbedDeleted": 0,
        "spansRewritten": spans_rewritten,
        "actorsTrimmed": actors_trimmed,
        "nominalHeadsAdded": nominal_added,
        "fixedLaterParent": fixed_later_parent,
    }
    notes.pop("softBlockFix", None)
    bundle["fillNotes"] = notes
    return bundle


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--progress",
        type=Path,
        default=Path.home()
        / "Downloads"
        / "cgv-reader-daniel-progress-filled-2026-08-03.json",
    )
    ap.add_argument(
        "--also",
        type=Path,
        nargs="*",
        default=[ROOT / "data" / "lbf" / "ot" / "daniel-progress-filled.json"],
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    words = load_lbf_verses()
    bundle = json.loads(args.progress.read_text(encoding="utf-8"))
    before_obs = bundle["data"][OBS_KEY]
    before_roots = sum(
        1
        for o in before_obs.values()
        if o.get("describesNoun") == "no"
        and o.get("isWhatWasExpressed") == "no"
        and o.get("tellsWhenOrIf") == "no"
    )
    repaired = repair(bundle, words)
    after = repaired["fillNotes"]["rootRepair"]
    print(json.dumps({"rootsBefore": before_roots, **after}, indent=2, ensure_ascii=False))
    if args.dry_run:
        return
    outs = [args.progress, *args.also]
    text = json.dumps(repaired, ensure_ascii=False, indent=2) + "\n"
    for out in outs:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")
        print("wrote", out)


if __name__ == "__main__":
    main()
