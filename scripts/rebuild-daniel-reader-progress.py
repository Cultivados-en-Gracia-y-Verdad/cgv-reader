#!/usr/bin/env python3
"""Rebuild Daniel Reader progress from canonical cgv-data Daniel artifacts.

Source of truth:
  - cgv-data/bibles/LBF/daniel.lbf.md
  - cgv-data/bibles/LBF/alignments/daniel.alignment.json

The Reader-local alignment JSON is a derived compatibility artifact for the
existing Observer/Compiler code. It is not treated as authoritative input.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CGV_DATA = ROOT.parent / "cgv-data"

LBF = CGV_DATA / "bibles" / "LBF" / "daniel.lbf.md"
CANONICAL_ALIGNMENT = CGV_DATA / "bibles" / "LBF" / "alignments" / "daniel.alignment.json"
TOKENS = CGV_DATA / "interlinears" / "OT" / "daniel.tokens.jsonl"

READER_ALIGNMENT = ROOT / "data" / "lbf" / "ot" / "daniel.alignment.json"
PROGRESS = ROOT / "data" / "lbf" / "ot" / "daniel-progress-filled.json"
BACKUPS = ROOT / "data" / "lbf" / "ot" / "backups"

WORD_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’\-]*", re.UNICODE)
VERBAL_FIRST = {
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
    "vino",
    "vinieron",
    "dijo",
    "dijeron",
    "dio",
    "hubo",
    "habia",
    "puso",
    "busco",
    "estuvo",
    "estuvieron",
    "sono",
    "soño",
    "respondio",
    "mando",
    "envio",
    "llamo",
}

MECHANICAL_FIELDS = [
    "finite-verb-marks",
    "nominalClauseHeads",
    "imperativeCandidates",
    "statementCandidates",
    "subjunctiveCandidates",
    "optativeCandidates",
    "participleCandidates",
    "spanish-clause-builder:v3",
    "statement-command-review:v1",
    "clause-actors:v1",
]

RESET_FIELDS: dict[str, Any] = {
    "roots:daniel:brick2b:commandRecipients": [],
    "roots:daniel:brick3:dependentThoughtIntroducers": [],
    "the-reader:spanish-clause-builder:daniel:participles:v1": {},
    "the-reader:spanish-clause-builder:daniel:participle-subjects:v1": {},
    "the-reader:spanish-clause-builder:daniel:h3-flow:v1": {
        "breaksAfter": [],
        "ignoredSuggestions": [],
        "labels": {},
        "pressureAfter": [],
    },
    "the-reader:spanish-clause-builder:daniel:contrasts:v1": {"items": []},
    "the-reader:spanish-clause-builder:daniel:book-definitions:v1": {"terms": []},
    "the-reader:spanish-clause-builder:daniel:book-thread:v1": {"steps": []},
}


def norm(value: str) -> str:
    folded = unicodedata.normalize("NFD", value.lower())
    folded = "".join(ch for ch in folded if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^\w]", "", folded)


def mt_to_protestant(chapter: int, verse: int) -> tuple[int, int]:
    if chapter == 3 and verse >= 31:
        return 4, verse - 30
    if chapter == 4:
        return 4, verse + 3
    if chapter == 6 and verse == 1:
        return 5, 31
    if chapter == 6 and verse >= 2:
        return 6, verse - 1
    return chapter, verse


def words_with_spans(text: str) -> list[dict[str, int | str]]:
    words: list[dict[str, int | str]] = []
    for match in WORD_RE.finditer(text):
        words.append(
            {
                "text": match.group(0),
                "start": match.start(),
                "end": match.end(),
                "index": len(words),
            }
        )
    return words


def load_lbf_verses() -> dict[tuple[int, int], str]:
    verses: dict[tuple[int, int], str] = {}
    for line in LBF.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^.+?\s+(\d+):(\d+)\s+(.+?)\s*$", line)
        if match:
            verses[(int(match.group(1)), int(match.group(2)))] = match.group(3).strip()
    return verses


def source_token_id(chapter: int, verse: int, token: int) -> str:
    return f"h27{chapter:03d}{verse:03d}{token:03d}"


def build_reader_alignment() -> dict[str, Any]:
    lbf = load_lbf_verses()
    links = json.loads(CANONICAL_ALIGNMENT.read_text(encoding="utf-8"))

    token_meta: dict[str, dict[str, int | str]] = {}
    for line in TOKENS.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("book") != "daniel":
            continue
        mt_chapter, mt_verse, token = int(row["ch"]), int(row["vs"]), int(row["w"])
        chapter, verse_num = mt_to_protestant(mt_chapter, mt_verse)
        token_meta[source_token_id(mt_chapter, mt_verse, token)] = {
            "chapter": chapter,
            "verse": verse_num,
            "token": token,
            "surface": row.get("surface") or "",
        }

    records: dict[tuple[int, int, int], dict[str, Any]] = {}
    warnings: list[str] = []
    units_applied = 0

    for link in links["links"]:
        ref_match = re.search(r"(\d+):(\d+)$", link["reference"])
        if not ref_match:
            warnings.append(f"bad reference {link.get('reference')}")
            continue
        chapter, verse_num = int(ref_match.group(1)), int(ref_match.group(2))
        text = lbf.get((chapter, verse_num))
        if not text:
            warnings.append(f"{chapter}:{verse_num}: missing LBF")
            continue
        words = words_with_spans(text)

        for unit in link.get("units", []):
            source_ids = unit.get("sourceTokenIds") or []
            if not source_ids:
                warnings.append(f"{chapter}:{verse_num} {unit.get('unitId')}: empty sourceTokenIds")
                continue

            char_start = int(unit["charStart"])
            char_end = int(unit["charEnd"])
            overlapping = [
                word for word in words if int(word["start"]) < char_end and int(word["end"]) > char_start
            ]

            if not overlapping:
                surface_words = [norm(part) for part in WORD_RE.findall(unit.get("surface") or "")]
                for start in range(0, max(0, len(words) - len(surface_words)) + 1):
                    window = [norm(str(word["text"])) for word in words[start : start + len(surface_words)]]
                    if window == surface_words:
                        overlapping = words[start : start + len(surface_words)]
                        break

            if not overlapping:
                warnings.append(
                    f"{chapter}:{verse_num} {unit.get('unitId')}: no Spanish word overlap"
                )
                continue

            first_word = norm(str(overlapping[0]["text"]))
            anchor = int(overlapping[0 if first_word in VERBAL_FIRST else -1]["index"])

            for source_id in source_ids:
                meta = token_meta.get(source_id)
                if not meta:
                    warnings.append(f"{chapter}:{verse_num} {unit.get('unitId')}: unknown {source_id}")
                    continue
                if meta["chapter"] != chapter or meta["verse"] != verse_num:
                    warnings.append(
                        f"{chapter}:{verse_num} {unit.get('unitId')}: cross-verse {source_id}"
                    )
                    continue
                records[(chapter, verse_num, int(meta["token"]))] = {
                    "chapter": chapter,
                    "verse": verse_num,
                    "token": int(meta["token"]),
                    "sourceSurface": meta["surface"],
                    "greekSurface": meta["surface"],
                    "lbfSurface": unit.get("surface") or "",
                    "lbfWordIndex": anchor,
                }
            units_applied += 1

    out_records = sorted(records.values(), key=lambda row: (row["chapter"], row["verse"], row["token"]))
    by_chapter: dict[str, int] = {}
    for record in out_records:
        key = str(record["chapter"])
        by_chapter[key] = by_chapter.get(key, 0) + 1

    payload = {
        "meta": {
            "book": "daniel",
            "spanish": "LBF",
            "hebrewSpine": "OSHB/WLC",
            "verseNumbering": "Protestant (alignment chapter/verse; OSHB ids keep MT)",
            "scope": links.get("scope") or "full book",
            "sourceLbf": str(LBF),
            "sourceAlignment": str(CANONICAL_ALIGNMENT),
            "note": "Derived Reader compatibility alignment from canonical cgv-data Daniel LBF alignment.",
            "coverage": f"{len(out_records)}/{len(token_meta)}",
            "alignedTokens": len(out_records),
            "totalTokensBook": len(token_meta),
            "alignedByChapter": dict(sorted(by_chapter.items(), key=lambda item: int(item[0]))),
            "repairs": {"unitsApplied": units_applied, "warnings": len(warnings)},
        },
        "records": out_records,
    }
    READER_ALIGNMENT.parent.mkdir(parents=True, exist_ok=True)
    READER_ALIGNMENT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if warnings:
        raise RuntimeError("Reader alignment rebuild warnings: " + "; ".join(warnings[:10]))
    return payload


def safe_reader_notes_from(path: Path) -> list[Any]:
    if not path.exists():
        return []
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    notes = old.get("data", {}).get("the-reader:daniel:notes")
    return notes if isinstance(notes, list) else []


def reset_human_fields(backup_path: Path) -> dict[str, Any]:
    doc = json.loads(PROGRESS.read_text(encoding="utf-8"))
    data = doc.setdefault("data", {})
    notes = safe_reader_notes_from(backup_path)
    data["the-reader:daniel:notes"] = notes
    for key, value in RESET_FIELDS.items():
        data[key] = value

    doc.setdefault("fillNotes", {})["readerJsonRebuild"] = {
        "at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "sourceLbf": str(LBF),
        "sourceAlignment": str(CANONICAL_ALIGNMENT),
        "mechanicalFieldsRebuilt": MECHANICAL_FIELDS,
        "humanFieldsPreserved": ["the-reader:daniel:notes"] if notes else [],
        "humanFieldsReset": list(RESET_FIELDS.keys()),
        "authoritativeInputs": "canonical cgv-data Daniel LBF + canonical cgv-data LBF alignment",
    }
    PROGRESS.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return doc


def token_keys() -> set[tuple[int, int, int]]:
    out: set[tuple[int, int, int]] = set()
    for line in TOKENS.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("book") != "daniel":
            continue
        chapter, verse = mt_to_protestant(int(row["ch"]), int(row["vs"]))
        out.add((chapter, verse, int(row["w"])))
    return out


def validate() -> dict[str, Any]:
    lbf = load_lbf_verses()
    expected_1_1 = (
        "En el año tercero del reino de Joacim, rey de Judá, vino Nabucodonosor, "
        "rey de Babel, a Jerusalén y la sitió."
    )
    alignment = json.loads(READER_ALIGNMENT.read_text(encoding="utf-8"))
    progress = json.loads(PROGRESS.read_text(encoding="utf-8"))
    keys = token_keys()
    word_counts = {key: len(words_with_spans(text)) for key, text in lbf.items()}
    errors: list[str] = []

    if len(lbf) != 357:
        errors.append(f"verse count {len(lbf)}")
    if lbf.get((1, 1)) != expected_1_1:
        errors.append("Daniel 1:1 mismatch")
    if not lbf.get((12, 13)):
        errors.append("Daniel 12:13 missing")

    records = alignment.get("records", [])
    if len(records) != 6035:
        errors.append(f"alignment records {len(records)}")
    for record in records:
        key = (int(record["chapter"]), int(record["verse"]), int(record["token"]))
        if key not in keys:
            errors.append(f"bad alignment token {key}")
            break
        count = word_counts.get((key[0], key[1]))
        word_index = record.get("lbfWordIndex")
        if not isinstance(word_index, int) or count is None or word_index < 0 or word_index >= count:
            errors.append(f"bad alignment word index {key}:{word_index}")
            break

    def valid_word_id(value: str) -> bool:
        match = re.match(r"^(\d+):(\d+):(\d+)$", value)
        if not match:
            return False
        chapter, verse, word = map(int, match.groups())
        count = word_counts.get((chapter, verse))
        return count is not None and 0 <= word < count

    def valid_token_id(value: str) -> bool:
        match = re.match(r"^(\d+):(\d+):(\d+)$", value)
        return bool(match and tuple(map(int, match.groups())) in keys)

    data = progress.get("data", {})
    for key, value in data.items():
        if re.search(
            r"finite-verb-marks|nominalClauseHeads|imperativeCandidates|statementCandidates|subjunctiveCandidates|optativeCandidates|participleCandidates|dependentThoughtIntroducers",
            key,
        ):
            for item in value:
                if not valid_token_id(item):
                    errors.append(f"bad token ref {key}:{item}")
                    break
        elif key.endswith(":daniel:v3"):
            for clause_id, row in value.items():
                if not valid_token_id(clause_id):
                    errors.append(f"bad clause id {clause_id}")
                    break
                for item in row.get("selectedSpan", []):
                    if not valid_word_id(item):
                        errors.append(f"bad span ref {item}")
                        break
        elif key.endswith(":clause-actors:v1"):
            for clause_id, row in value.items():
                if not valid_token_id(clause_id):
                    errors.append(f"bad actor clause id {clause_id}")
                    break
                for field in ("subjectSpan", "verbSpan", "objectSpan"):
                    for item in row.get(field, []):
                        if not valid_word_id(item):
                            errors.append(f"bad actor span {item}")
                            break

    return {
        "validation": "PASS" if not errors else "FAIL",
        "errors": errors,
        "verseCount": len(lbf),
        "alignmentRecords": len(records),
        "daniel12_13": lbf.get((12, 13)),
        "progressKeys": len(data),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--timestamp", default=None)
    args = parser.parse_args()

    timestamp = args.timestamp or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    BACKUPS.mkdir(parents=True, exist_ok=True)
    backup = BACKUPS / f"daniel-progress-filled.pre-json-rebuild-{timestamp}.json"
    alignment_backup = BACKUPS / f"daniel.alignment.pre-json-rebuild-{timestamp}.json"
    if PROGRESS.exists():
        shutil.copy2(PROGRESS, backup)
    if READER_ALIGNMENT.exists():
        shutil.copy2(READER_ALIGNMENT, alignment_backup)

    build_reader_alignment()
    subprocess.run([sys.executable, str(ROOT / "scripts" / "fill-daniel-mark-progress.py"), "--repair"], check=True)
    rebuilt = reset_human_fields(backup)
    validation = validate()

    result = {
        "progressFile": str(PROGRESS),
        "backup": str(backup),
        "alignmentBackup": str(alignment_backup),
        "mechanicalFieldsRebuilt": len(MECHANICAL_FIELDS),
        "humanFieldsPreserved": len(rebuilt["fillNotes"]["readerJsonRebuild"]["humanFieldsPreserved"]),
        "humanFieldsReset": len(rebuilt["fillNotes"]["readerJsonRebuild"]["humanFieldsReset"]),
        "staleAlignmentReferences": 0 if validation["validation"] == "PASS" else "unknown",
        "verseCount": validation["verseCount"],
        "validation": validation,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if validation["validation"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
