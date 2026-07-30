#!/usr/bin/env python3
"""Compile Reader MorphGNT→LBF alignment from translator reverse links.

Source of truth: herramientas/cgv-translator/.../1john-reverse-links.json
Bridge: 1john-tr-spine.json (sourceTokenId → morphIndex; tr_only tokens skipped)

Do not hand-edit 1juan.alignment.json for verses the translator already linked.
Re-run this script after reverse-link changes.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HERR = ROOT.parent / "herramientas" / "cgv-translator" / "translations" / "tr-spine" / "1john"
SPINE = HERR / "1john-tr-spine.json"
LINKS = HERR / "1john-reverse-links.json"
PHRASES = HERR / "1john-phrases-tr.json"
LBF_MD = ROOT / "data/lbf/nt/1juan.md"
OUT = ROOT / "data/lbf/nt/1juan.alignment.json"
CGV_DATA = ROOT.parent / "cgv-data"

WORD_PATTERN = re.compile(r"[\wáéíóúüñÁÉÍÓÚÜÑ]+|[^\s\wáéíóúüñÁÉÍÓÚÜÑ]+", re.UNICODE)
INTERLINEAR_TOKEN_PATTERN = re.compile(r"(\S+?)<([^|<>]+)\|([^|<>]+)\|([^|<>]+)\|([^<>]+)>")


def norm(value: str) -> str:
    value = value.lower().strip()
    value = "".join(c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w]", "", value)


def tokenize(text: str) -> list[str]:
    return [m.group(0) for m in WORD_PATTERN.finditer(text) if re.search(r"[\wáéíóúüñÁÉÍÓÚÜÑ]", m.group(0))]


def load_lbf_verses() -> dict[tuple[int, int], str]:
    content = LBF_MD.read_text()
    verses: dict[tuple[int, int], str] = {}
    chapter = verse = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal chapter, verse, buffer
        if chapter and verse and buffer:
            verses[(chapter, verse)] = " ".join(buffer).strip()
        buffer = []

    for line in content.splitlines():
        chapter_header = re.match(r"^##\s+Capítulo\s+(\d+)", line, re.I)
        if chapter_header:
            flush()
            chapter = int(chapter_header.group(1))
            verse = None
            continue
        verse_header = re.match(r"^###\s+(\d+):(\d+)", line)
        if verse_header:
            flush()
            chapter = int(verse_header.group(1))
            verse = int(verse_header.group(2))
            continue
        if not line.strip() or line.startswith("#") or line.startswith(">"):
            continue
        if chapter and verse:
            buffer.append(line.strip())
    flush()
    return verses


def load_ble_surfaces() -> dict[tuple[int, int], list[str]]:
    out: dict[tuple[int, int], list[str]] = {}
    for path in sorted((CGV_DATA / "interlinears/NT").glob("1juan-*.interlinear.txt")):
        for line in path.read_text().splitlines():
            match = re.match(r"^1juan\s+(\d+):(\d+)\t", line, re.I)
            if not match:
                continue
            chapter, verse = int(match.group(1)), int(match.group(2))
            tab = line.find("\t")
            surfaces = []
            for token_match in INTERLINEAR_TOKEN_PATTERN.finditer(line[tab + 1 :]):
                surfaces.append(token_match.group(1))
            out[(chapter, verse)] = surfaces
    return out


def parse_ref(reference: str) -> tuple[int, int]:
    match = re.search(r"(\d+):(\d+)\s*$", reference)
    if not match:
        raise ValueError(f"Bad reference: {reference}")
    return int(match.group(1)), int(match.group(2))


_VERBAL_FIRST = {
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
    "llevo",
    "lleva",
    "llevan",
    "llevamos",
    "viva",
    "vivas",
    "vivamos",
    "vive",
    "viven",
    "vivo",
}


def unit_word_index(verse_words: list[str], surface: str, cursor: int) -> tuple[int, int]:
    """Return (anchor_index, next_cursor) for a Spanish unit surface."""
    parts = tokenize(surface)
    if not parts:
        return cursor, cursor
    want = [norm(p) for p in parts]
    prefer_first = want[0] in _VERBAL_FIRST

    def anchor_at(start: int) -> int:
        if prefer_first:
            return start
        return start + len(parts) - 1

    for start in range(cursor, len(verse_words) - len(parts) + 1):
        window = [norm(w) for w in verse_words[start : start + len(parts)]]
        if window == want:
            return anchor_at(start), start + len(parts)
    for start in range(0, len(verse_words) - len(parts) + 1):
        window = [norm(w) for w in verse_words[start : start + len(parts)]]
        if window == want:
            return anchor_at(start), max(cursor, start + len(parts))
    raise ValueError(f"Could not find unit {surface!r} in verse words from {cursor}")


def main() -> None:
    spine = json.loads(SPINE.read_text())
    links_doc = json.loads(LINKS.read_text())
    phrases = json.loads(PHRASES.read_text())
    if isinstance(phrases, dict):
        phrases = phrases.get("phrases") or phrases.get("entries") or []
    phrase_by_index = {p["phraseIndex"]: p for p in phrases}

    token_meta: dict[str, tuple[int, int, int | None, str]] = {}
    for _verse_key, verse in spine["verses"].items():
        chapter, vs = (verse["ch"], verse["vs"])
        for tok in verse["tokens"]:
            token_meta[tok["sourceTokenId"]] = (
                chapter,
                vs,
                tok.get("morphIndex"),
                tok.get("align") or "",
            )

    lbf = load_lbf_verses()
    ble = load_ble_surfaces()
    records: dict[tuple[int, int, int], dict] = {}
    warnings: list[str] = []
    tr_only_skipped = 0
    units_applied = 0

    by_verse: dict[tuple[int, int], list[dict]] = {}
    for link in links_doc["links"]:
        ref = parse_ref(link["reference"])
        by_verse.setdefault(ref, []).append(link)

    for (chapter, verse), verse_links in sorted(by_verse.items()):
        verse_links.sort(key=lambda item: item["phraseIndex"])
        verse_text = lbf.get((chapter, verse), "")
        words = tokenize(verse_text)
        if not words:
            warnings.append(f"{chapter}:{verse}: no LBF text")
            continue
        cursor = 0
        pending_tr_only: list[str] = []
        for link in verse_links:
            phrase = phrase_by_index.get(link["phraseIndex"])
            if not phrase:
                warnings.append(f"missing phrase {link['phraseIndex']}")
                continue
            for unit in link["units"]:
                surface = unit["surface"].strip()
                try:
                    anchor, cursor = unit_word_index(words, surface, cursor)
                except ValueError as err:
                    warnings.append(f"{chapter}:{verse}: {err}")
                    pending_tr_only.clear()
                    continue
                morph_tokens: list[int] = []
                for source_id in unit["sourceTokenIds"]:
                    meta = token_meta.get(source_id)
                    if not meta:
                        warnings.append(f"{chapter}:{verse}: unknown {source_id}")
                        continue
                    _ch, _vs, morph_index, align = meta
                    if morph_index is None or align == "tr_only":
                        tr_only_skipped += 1
                        continue
                    morph_tokens.append(morph_index)
                if not morph_tokens:
                    pending_tr_only.append(surface)
                    continue
                if pending_tr_only:
                    surface = " ".join(pending_tr_only + [surface])
                    try:
                        rewind = max(0, cursor - len(tokenize(surface)) - 2)
                        anchor, cursor = unit_word_index(words, surface, rewind)
                    except ValueError as err:
                        warnings.append(f"{chapter}:{verse}: combined TR-only prefix failed: {err}")
                    pending_tr_only.clear()
                surfaces = ble.get((chapter, verse), [])
                for morph_index in morph_tokens:
                    greek = surfaces[morph_index - 1] if 0 < morph_index <= len(surfaces) else "?"
                    records[(chapter, verse, morph_index)] = {
                        "chapter": chapter,
                        "verse": verse,
                        "token": morph_index,
                        "greekSurface": greek,
                        "lbfSurface": surface,
                        "lbfWordIndex": anchor,
                    }
                units_applied += 1
        if pending_tr_only:
            warnings.append(f"{chapter}:{verse}: unused TR-only surfaces {pending_tr_only}")

    # MorphGNT-only gaps with clear LBF Spanish (no TR sourceTokenId / reorder).
    # Morph 2:14 παιδία…πατέρα is not in LBF 2:14 (lives in TR/LBF 2:13 niñitos) —
    # leave tokens 1–7 unmapped; Observer should not assign Spanish spans there.
    # Morph 5:13 front-loads ἵνα εἰδῆτε… before τοῖς πιστεύουσιν; TR/LBF puts
    # the purpose clause after "que creen…" — patch Morph 4–9 to that Spanish.
    # Morph 4:16 final ⸀μένει is elided in LBF ("y Dios en él").
    # Tuple: (ch, vs, morphToken, surface[, fixedWordIndex])
    morph_only_patches = [
        # Morph Καὶ ἔστιν αὕτη… vs TR Καὶ αὕτη ἔστιν… — patch Morph ἔστιν.
        (1, 5, 2, "es"),
        (2, 19, 13, "eran"),
        # 5:13 ἵνα εἰδῆτε ὅτι ζωὴν ἔχετε αἰώνιον → para que sepan que tienen vida eterna
        (5, 13, 4, "para", 16),
        (5, 13, 5, "sepan", 18),
        (5, 13, 6, "que", 19),
        (5, 13, 7, "vida", 21),
        (5, 13, 8, "tienen", 20),
        (5, 13, 9, "eterna", 22),
        # 4:16 trailing μένει (elided) → él
        (4, 16, 33, "él", 29),
    ]
    morph_patches_applied = 0
    for patch in morph_only_patches:
        chapter, verse, morph_index, surface = patch[:4]
        fixed_index = patch[4] if len(patch) > 4 else None
        key = (chapter, verse, morph_index)
        if key in records:
            continue
        verse_text = lbf.get((chapter, verse), "")
        words = tokenize(verse_text)
        if fixed_index is not None:
            if not (0 <= fixed_index < len(words)):
                warnings.append(
                    f"{chapter}:{verse}: morph-only patch index {fixed_index} out of range"
                )
                continue
            anchor = fixed_index
        else:
            try:
                anchor, _ = unit_word_index(words, surface, 0)
            except ValueError as err:
                warnings.append(f"{chapter}:{verse}: morph-only patch failed: {err}")
                continue
        surfaces = ble.get((chapter, verse), [])
        greek = surfaces[morph_index - 1] if 0 < morph_index <= len(surfaces) else "?"
        records[key] = {
            "chapter": chapter,
            "verse": verse,
            "token": morph_index,
            "greekSurface": greek,
            "lbfSurface": surface,
            "lbfWordIndex": anchor,
        }
        morph_patches_applied += 1

    # Hand overrides: reverse-link phrase anchors sometimes land on the wrong
    # Spanish edge word (γράφω → "cosas", γινώσκομεν → "eso", μένει → "él").
    # These force finite heads onto the conjugated LBF verb so Compiler claim
    # titles / actors don't promote nouns. Applied after all other records.
    # Tuple: (ch, vs, morphToken, lbfWordIndex, lbfSurface)
    hand_overrides = [
        # 2:1 γράφω ὑμῖν ἵνα μὴ ἁμάρτητε — not "estas cosas" / "pequen"
        (2, 1, 3, 4, "estas"),
        (2, 1, 4, 3, "escribo"),
        (2, 1, 5, 2, "les"),
        (2, 1, 6, 6, "para"),
        (2, 1, 7, 8, "no"),
        (2, 1, 8, 9, "pequen"),
        # 2:10 μένει / οὐκ ἔστιν — not "hay" / "tropiezo"
        (2, 10, 9, 6, "permanece"),
        (2, 10, 10, 10, "y"),
        (2, 10, 11, 15, "causa"),
        (2, 10, 12, 13, "en"),
        (2, 10, 13, 14, "él"),
        (2, 10, 14, 11, "no"),
        (2, 10, 15, 12, "hay"),
        # 2:11 περιπατεῖ / ὑπάγει
        (2, 11, 15, 12, "anda"),
        (2, 11, 19, 20, "dónde"),
        (2, 11, 20, 21, "va"),
        # 2:18 ἐστίν / γεγόνασιν / γινώσκομεν — not "hora" / "eso"
        (2, 18, 4, 1, "es"),
        (2, 18, 15, 14, "surgido"),
        (2, 18, 16, 17, "por"),
        (2, 18, 17, 19, "sabemos"),
        # 2:25 ἐστὶν / ἐπηγγείλατο — not "mismo" / "vida"
        (2, 25, 3, 2, "es"),
        (2, 25, 4, 3, "la"),
        (2, 25, 5, 4, "promesa"),
        (2, 25, 7, 6, "él"),
        (2, 25, 8, 9, "hizo"),
        # 2:29 γινώσκετε — not "todo"
        (2, 29, 6, 6, "sepan"),
        (2, 29, 7, 7, "que"),
        (2, 29, 8, 8, "todo"),
        # 3:2 ἐσμεν / ἐσόμεθα — not "Dios"
        (3, 2, 5, 2, "somos"),
        (3, 2, 17, 21, "seremos"),
        # 3:17 μένει — not "él"
        (3, 17, 28, 22, "permanece"),
        (3, 17, 29, 27, "en"),
        (3, 17, 30, 28, "él"),
        # 1:3 ἀπαγγέλλομεν already anunciamos — keep; ensure ὑμῖν on ustedes
        (1, 3, 7, 9, "ustedes"),
        # Pass 3 — Arquitecto fragment H4s
        # 2:16 final ἐστίν — not "mundo"
        (2, 16, 22, 25, "procede"),
        (2, 16, 30, 30, "procede"),
        # 2:19 ἦσαν / μεμενήκεισαν / εἰσίν
        (2, 19, 6, 5, "eran"),
        (2, 19, 14, 15, "permanecido"),
        (2, 19, 23, 27, "son"),
        # 2:20 οἴδατε — saben
        (2, 20, 9, 9, "saben"),
        # 2:23 ἔχει (both) — tiene, not Padre
        (2, 23, 9, 7, "tiene"),
        (2, 23, 17, 16, "tiene"),
        # 2:24 μενέτω / μενεῖτε — not principio / Padre
        (2, 24, 8, 4, "permanezca"),
        (2, 24, 26, 25, "permanecerán"),
        # 2:27 ἔχετε — tienen, not necesidad
        (2, 27, 15, 15, "tienen"),
        # 3:1 γινώσκει / ἔγνω — conoce / conoció, not porque / él
        (3, 1, 19, 25, "conoce"),
        (3, 1, 23, 29, "conoció"),
        # 3:9 ποιεῖ — practica, not pecado
        (3, 9, 9, 8, "practica"),
        # 3:14 οἴδαμεν — sabemos, not Nosotros
        (3, 14, 2, 1, "sabemos"),
        # 3:22 ποιοῦμεν — hacemos, not agrada
        (3, 22, 18, 14, "hacemos"),
        # 3:23 ἀγαπῶμεν — amemos, not otros
        (3, 23, 17, 17, "amemos"),
        # 4:12 τεθέαται / ἐστιν — visto / sido, not Dios / nosotros
        (4, 12, 4, 2, "visto"),
        (4, 12, 20, 20, "sido"),
        # 4:14 τεθεάμεθα / μαρτυροῦμεν
        (4, 14, 3, 3, "visto"),
        (4, 14, 5, 5, "testificamos"),
        # 4:16 ἐγνώκαμεν / μένει (elided)
        (4, 16, 3, 3, "conocido"),
        (4, 16, 33, 29, "él"),
        # 4:19 ἀγαπῶμεν — amamos
        (4, 19, 2, 1, "amamos"),
        # 4:20 ἐστίν — es
        (4, 20, 14, 11, "es"),
        # 5:10 πεποίηκεν — hecho (before mentiroso)
        (5, 10, 19, 21, "hecho"),
        # 5:12 final ἔχει — tiene, not vida
        (5, 12, 5, 5, "tiene"),
        (5, 12, 18, 17, "tiene"),
        # 5:18 ἅπτεται — toca (keep verb, not maligno as finite)
        (5, 18, 23, 25, "toca"),
        # 5:19 κεῖται — yace, not maligno
        (5, 19, 14, 11, "yace"),
        # Pass 4 — last Arquitecto blockers
        # 3:1 οὐ / ἡμᾶς around γινώσκει
        (3, 1, 18, 23, "no"),
        (3, 1, 20, 24, "nos"),
        (3, 1, 21, 26, "porque"),
        # 2:21 ἔγραψα / οἴδατε
        (2, 21, 2, 3, "escrito"),
        (2, 21, 3, 1, "les"),
        (2, 21, 6, 6, "conozcan"),
        (2, 21, 11, 12, "conocen"),
        (2, 21, 21, 17, "procede"),
        # 5:2 ποιῶμεν — hacemos
        (5, 2, 13, 11, "amamos"),
        (5, 2, 18, 15, "hacemos"),
        # 5:3 τηρῶμεν / εἰσίν
        (5, 3, 12, 8, "guardemos"),
        (5, 3, 19, 15, "son"),
        # 5:17 ἔστιν — hay
        (5, 17, 4, 2, "es"),
        (5, 17, 6, 5, "hay"),
        # 5:16 λέγω — digo
        (5, 16, 29, 34, "digo"),
        (5, 16, 22, 27, "Hay"),
        # Participles: reverse-link object phrases → LBF verbal head (not BLE)
        # 2:9 μισῶν — not "a su hermano"
        (2, 9, 11, 9, "aborrece"),
        # 2:22 ἀρνούμενος (2nd) — not "al Padre"
        (2, 22, 20, 19, "niega"),
        # 3:15 μένουσαν — not "en él"
        (3, 15, 20, 17, "permaneciendo"),
        # 4:16 μένων — not "en el amor"
        (4, 16, 20, 19, "permanece"),
        # 4:21 ἀγαπῶν — not "a Dios"
        (4, 21, 10, 9, "ama"),
        # 5:1 γεγεννημένον — not "de él"
        (5, 1, 22, 26, "nacido"),
        # 5:4 νικήσασα — not "al mundo"
        (5, 4, 17, 18, "vencido"),
        # 5:5 νικῶν — not "al mundo"
        (5, 5, 5, 5, "vence"),
        # 5:6 ἐλθὼν — not "agua"
        (5, 6, 4, 4, "vino"),
        # 5:16 ἁμαρτάνοντα — not "un pecado"
        (5, 16, 7, 6, "pecar"),
        # 4:5 ἐκ…λαλοῦσιν — LBF «del mundo» (not «desde»); verb on hablan
        (4, 5, 2, 2, "del"),
        (4, 5, 4, 3, "mundo"),
        (4, 5, 5, 1, "son"),
        (4, 5, 8, 7, "del"),
        (4, 5, 10, 8, "mundo"),
        (4, 5, 11, 6, "hablan"),
        (4, 5, 14, 11, "mundo"),
        (4, 5, 16, 13, "escucha"),
        # 4:21 ἔχομεν / ἀγαπῶν / ἀγαπᾷ — was landing on «ama»/«también»
        # (participle demote buried the mandamiento unit under 4:20)
        (4, 21, 5, 1, "tenemos"),
        (4, 21, 4, 5, "mandamiento"),
        (4, 21, 10, 9, "ama"),
        (4, 21, 13, 12, "ame"),
        # 5:1 ἐστιν / γεγέννηται — was on «Jesús» / «de Dios»
        (5, 1, 6, 6, "es"),
        # Stamp finite on «ha», not «nacido» — participle γεγεννημένον also
        # lands on nacido and won the morph stamp → Compiler demoted 5:1:12.
        (5, 1, 12, 9, "ha"),
        (5, 1, 3, 3, "cree"),
        (5, 1, 19, 21, "ama"),
        # Pass 5 — Compiler H3/H4 peels (skeleton 20)
        # 2:6 ὀφείλει / περιεπάτησεν — phrase landed on «en él debe» / «andar»
        (2, 6, 6, 7, "debe"),
        (2, 6, 9, 11, "anduvo"),
        (2, 6, 12, 8, "andar"),
        # 3:24 μένει — phrase «permanece…ese» resolved to word *ese*
        (3, 24, 9, 6, "permanece"),
        (3, 24, 19, 19, "permanece"),
        # 4:18 τετελείωται — was on *perfeccionado*; stamp «ha» like 5:1
        (4, 18, 24, 25, "ha"),
        # 5:18 τηρεῖ — was on *Dios* (de Dios); conjugated verb is *guarda*
        (5, 18, 17, 19, "guarda"),
        (5, 18, 18, 18, "lo"),
        # Pass 6 — soft-H4 audit (skeleton 21)
        # 2:7 ἐστιν — was on *antiguo*
        (2, 7, 18, 20, "es"),
        # 2:27 ἐστιν / ἔστιν / μένετε — phrase edges *mentira* / *tal* / end
        (2, 27, 31, 36, "es"),
        (2, 27, 34, 40, "es"),
        (2, 27, 40, 47, "permanezcan"),
        (2, 27, 38, 46, "enseñó"),
        # 3:20 γινώσκει — was on *todas*
        (3, 20, 16, 13, "conoce"),
        # 3:21 ἔχομεν — was on *delante*
        (3, 21, 9, 7, "tenemos"),
        # 3:24 γινώσκομεν — was colliding with 2nd μένει on *permanece*
        (3, 24, 17, 16, "sabemos"),
        # 4:16 πεπιστεύκαμεν / ἔχει — matrix + relative object
        (4, 16, 5, 5, "creído"),
        (4, 16, 9, 10, "tiene"),
        # 5:15 2nd οἴδαμεν — was on *pedimos*
        (5, 15, 10, 12, "sabemos"),
        (5, 15, 12, 14, "tenemos"),
        # Pass 7 — skeleton 22 soft remainders
        # 2:7 λόγος — phrase on «es la palabra»; relative host needs *palabra*
        (2, 7, 20, 22, "palabra"),
        # 2:22 ἐστιν / ἀντίχριστος — mentiroso/anticristo edges
        (2, 22, 2, 1, "es"),
        (2, 22, 16, 14, "es"),
        (2, 22, 18, 16, "anticristo"),
        # 2:27 ἀληθές / ψεῦδος — actors were *alguien* / *tal*
        (2, 27, 30, 37, "verdadera"),
        (2, 27, 35, 41, "mentira"),
        (2, 27, 33, 39, "no"),
        # 5:5 ἐστιν — stamp conjugated *es*
        (5, 5, 3, 2, "es"),
        # 4:16 ἀγάπην — relative host *amor* (not *creído*)
        (4, 16, 7, 7, "amor"),
        # 4:16 ἐστίν / μένει — ἐστίν was on «y el que permanece» → demoted «Dios es amor»
        (4, 16, 17, 14, "es"),
        (4, 16, 16, 15, "amor"),
        (4, 16, 27, 23, "permanece"),
        (4, 16, 33, 29, "él"),
    ]
    hand_overrides_applied = 0
    for chapter, verse, morph_index, word_index, surface in hand_overrides:
        key = (chapter, verse, morph_index)
        verse_text = lbf.get((chapter, verse), "")
        words = tokenize(verse_text)
        if not (0 <= word_index < len(words)):
            warnings.append(
                f"{chapter}:{verse}: hand override index {word_index} out of range"
            )
            continue
        surfaces = ble.get((chapter, verse), [])
        greek = surfaces[morph_index - 1] if 0 < morph_index <= len(surfaces) else "?"
        prev = records.get(key)
        records[key] = {
            "chapter": chapter,
            "verse": verse,
            "token": morph_index,
            "greekSurface": prev["greekSurface"] if prev else greek,
            "lbfSurface": surface,
            "lbfWordIndex": word_index,
        }
        hand_overrides_applied += 1

    out_records = sorted(records.values(), key=lambda r: (r["chapter"], r["verse"], r["token"]))
    total = sum(len(v) for v in ble.values())
    payload = {
        "meta": {
            "book": "1juan",
            "spanish": "LBF",
            "greekSpine": "MorphGNT/BLE",
            "note": (
                "Compiled from translator reverse-links.json via TR spine morphIndex. "
                "TR-only tokens skipped. Morph-only gaps patched where Spanish is clear. "
                "Hand overrides retarget known bad finite anchors. "
                "Re-run compile-lbf-alignment-1juan.py after link edits."
            ),
            "coverage": f"{len(out_records)}/{total}",
            "alignedTokens": len(out_records),
            "totalTokens": total,
            "repairs": {
                "unitsApplied": units_applied,
                "trOnlySkipped": tr_only_skipped,
                "morphOnlyPatches": morph_patches_applied,
                "handOverrides": hand_overrides_applied,
                "warnings": len(warnings),
            },
        },
        "records": out_records,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {OUT}")
    print(f"Coverage {len(out_records)}/{total} ({len(out_records) / total:.1%})")
    print(f"Units applied={units_applied} tr_only skipped={tr_only_skipped} warnings={len(warnings)}")
    for warning in warnings[:30]:
        print(f"  WARN {warning}")
    if len(warnings) > 30:
        print(f"  ... {len(warnings) - 30} more")


if __name__ == "__main__":
    main()
