#!/usr/bin/env python3
"""Fill Daniel Observer Mark + Structure workshop layers from OSHB + LBF.

Token / clause ids use Protestant ch:vs:w (Reader OT spine).

Fills:
  - Mark bricks (finite / imperative / statement / participle)
  - Clause spans (draft, one per finite)
  - Clause actors SVO (heuristic subject/object + verb span)
  - Book definitions, thread, contrasts, H3 pressure/breaks

IMPORTANT: answering Q1–Q3 as all "no" makes every finite an independent root in the
app (correct behavior). After fill, run:

  python3 scripts/repair-daniel-clause-roots.py \\
    --progress ~/Downloads/cgv-reader-daniel-progress-filled-….json

Or pass --repair to this script to retag fragments/subordinators in the same run.

  python3 scripts/fill-daniel-mark-progress.py
  python3 scripts/fill-daniel-mark-progress.py --repair \\
    --also ~/Downloads/cgv-reader-daniel-progress-filled-2026-08-03.json
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
DEFAULT_OUT = ROOT / "data" / "lbf" / "ot" / "daniel-progress-filled.json"

# Keep hyphenated names (Abed-nego) as one word — matches hand-align / Reader.
WORD_PATTERN = re.compile(
    r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’\-]*|[^\s\wÁÉÍÓÚÜÑáéíóúüñ]+",
    re.UNICODE,
)

# Longest-first actor phrases for Spanish subject / receptor matching.
ACTOR_PHRASES: list[str] = [
    "nabucodonosor rey de babel",
    "hijo del hombre",
    "el hijo del hombre",
    "el jefe de los eunucos",
    "el rey de babel",
    "el rey de persia",
    "el rey de judá",
    "el altísimo",
    "dios del cielo",
    "el dios del cielo",
    "nabucodonosor",
    "belsasar",
    "beltsasar",
    "darío",
    "ciro",
    "daniel",
    "ananías",
    "misael",
    "azarías",
    "sadrac",
    "mesac",
    "abed-nego",
    "abed nego",
    "aspenaz",
    "gabriel",
    "miguel",
    "joacim",
    "el señor",
    "el mayordomo",
    "los sabios",
    "los caldeos",
    "los magos",
    "el pueblo",
    "su dios",
    "dios",
    "el rey",
    "el ángel",
    "nosotros",
    "vosotros",
    "ellos",
    "ellas",
    "yo",
    "tú",
]

OBJECT_STOP = {
    "y",
    "pero",
    "mas",
    "entonces",
    "así",
    "porque",
    "pues",
    "cuando",
    "si",
    "que",
    "para",
    "como",
}

# Never accept these alone (or as head) as Quién actúa.
SUBJECT_BAN = {
    "se",
    "me",
    "te",
    "le",
    "les",
    "lo",
    "la",
    "los",
    "las",
    "de",
    "del",
    "al",
    "a",
    "en",
    "con",
    "por",
    "para",
    "y",
    "o",
    "no",
    "ni",
    "su",
    "sus",
    "mi",
    "mis",
    "tu",
    "tus",
    "el",
    "un",
    "una",
    "que",
    "como",
    "más",
    "muy",
    "ya",
    "así",
    "entonces",
    "después",
    "antes",
    "hasta",
    "desde",
    "sobre",
    "entre",
    "sin",
    "e",
    "cual",
    "cuales",
    "parte",
    "partes",
    "rey",  # alone — require "el rey"
}

# Light verb-ish endings for snapping verbSpan when alignment is off.
VERBISH = re.compile(
    r"(?:ó|ió|yó|aron|ieron|aba|ía|ían|ará|erá|iría|ando|iendo|ado|ido|"
    r"imos|aste|ieron|uese|iese|ad|ed|id)$",
    re.I,
)


def fold(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


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


def verb_type(morph: str) -> str | None:
    core = verb_core(morph)
    return core[2] if core and len(core) >= 3 else None


def is_finite(morph: str) -> bool:
    t = verb_type(morph)
    if not t or t in {"r", "c", "a"}:
        return False
    core = verb_core(morph)
    return bool(core and re.search(r"[123]", core[3:]))


def is_participle(morph: str) -> bool:
    return verb_type(morph) == "r"


def is_imperative(morph: str) -> bool:
    return verb_type(morph) == "v" and is_finite(morph)


def person_number(morph: str) -> tuple[str | None, str | None]:
    core = verb_core(morph)
    if not core or len(core) < 4:
        return None, None
    rest = core[3:]
    m = re.search(r"([123])", rest)
    person = m.group(1) if m else None
    number = "P" if re.search(r"[p]$|[mp]$|[fp]$|[cp]$", rest) else "S"
    if "p" in rest[1:] or rest.endswith("p"):
        number = "P"
    return person, number


def tokenize(text: str) -> list[str]:
    return [
        m.group(0)
        for m in WORD_PATTERN.finditer(text)
        if re.search(r"[\wáéíóúüñÁÉÍÓÚÜÑ]", m.group(0))
    ]


def load_lbf_verses() -> dict[tuple[int, int], list[str]]:
    content = LBF_MD.read_text(encoding="utf-8")
    verses: dict[tuple[int, int], list[str]] = {}
    chapter = verse = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal chapter, verse, buffer
        if chapter and verse and buffer:
            verses[(chapter, verse)] = tokenize(" ".join(buffer))
        buffer = []

    for line in content.splitlines():
        ch = re.match(r"^##\s+Capítulo\s+(\d+)", line, re.I)
        if ch:
            flush()
            chapter = int(ch.group(1))
            verse = None
            continue
        vs = re.match(r"^###\s+(\d+):(\d+)", line)
        if vs:
            flush()
            chapter = int(vs.group(1))
            verse = int(vs.group(2))
            continue
        if not line.strip() or line.startswith("#") or line.startswith(">"):
            continue
        if chapter and verse:
            buffer.append(line.strip())
    flush()
    return verses


def load_lbf_verse_text() -> dict[str, str]:
    content = LBF_MD.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    chapter = verse = None
    buffer: list[str] = []

    def flush() -> None:
        nonlocal chapter, verse, buffer
        if chapter and verse and buffer:
            out[f"{chapter}:{verse}"] = " ".join(buffer)
        buffer = []

    for line in content.splitlines():
        ch = re.match(r"^##\s+Capítulo\s+(\d+)", line, re.I)
        if ch:
            flush()
            chapter = int(ch.group(1))
            verse = None
            continue
        vs = re.match(r"^###\s+(\d+):(\d+)", line)
        if vs:
            flush()
            chapter = int(vs.group(1))
            verse = int(vs.group(2))
            continue
        if not line.strip() or line.startswith("#") or line.startswith(">"):
            continue
        if chapter and verse:
            buffer.append(line.strip())
    flush()
    return out


def uniq(ids: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for i in ids:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def find_phrase_span(
    folded_words: list[str], phrase: str, lo: int, hi: int, prefer_end: bool
) -> list[int] | None:
    parts = [fold(p) for p in phrase.split()]
    if not parts or hi <= lo:
        return None
    n = len(parts)
    starts = range(hi - n, lo - 1, -1) if prefer_end else range(lo, hi - n + 1)
    for i in starts:
        if i < lo:
            continue
        if folded_words[i : i + n] == parts:
            return list(range(i, i + n))
    return None


def subject_ok(words: list[str], idxs: list[int]) -> bool:
    if not idxs:
        return False
    folded_parts = [fold(words[i]) for i in idxs]
    head = folded_parts[-1]
    # Allow "el rey" / "su dios" while banning bare clitics/prepositions
    if len(folded_parts) == 1 and head in SUBJECT_BAN:
        return False
    if all(p in SUBJECT_BAN for p in folded_parts):
        return False
    if head in {"se", "me", "te", "le", "les", "lo", "de", "del", "a", "al", "y", "o", "no", "e", "os", "ha", "he", "han"}:
        return False
    # Never treat a finite-looking Spanish word as Quién actúa
    if VERBISH.search(words[idxs[-1]]) or head in {
        "sea",
        "será",
        "serán",
        "había",
        "hay",
        "hubo",
        "fue",
        "era",
        "es",
        "son",
        "dijo",
        "vino",
        "dio",
        "hizo",
        "puso",
        "reino",
        "parte",
    }:
        return False
    return True


def snap_verb_idx(words: list[str], anchor: int, span_lo: int, span_hi: int) -> int:
    """Prefer a verb-looking Spanish word in the clause span nearest the anchor."""
    if span_lo > span_hi:
        return anchor
    known = {
        "dijo",
        "dice",
        "habló",
        "vino",
        "fue",
        "era",
        "es",
        "son",
        "hay",
        "hubo",
        "dio",
        "puso",
        "hizo",
        "vió",
        "vio",
        "respondió",
        "mandó",
        "envió",
        "llamó",
        "halló",
        "entendió",
        "buscó",
        "temo",
        "prueba",
        "entregó",
        "sitió",
        "asignó",
        "escuchó",
        "probó",
        "quitaba",
        "daba",
        "trajo",
        "preguntó",
        "llevó",
        "contaminaría",
        "contaminara",
        "estuvieron",
        "estaba",
        "estaban",
        "será",
        "serán",
        "haré",
        "hará",
        "vieron",
        "vean",
        "comed",
        "bebamos",
        "comamos",
    }
    best = None
    best_dist = 10**9
    for i in range(span_lo, span_hi + 1):
        w = fold(words[i])
        if w in known or VERBISH.search(words[i]):
            dist = abs(i - anchor)
            if dist < best_dist:
                best_dist = dist
                best = i
    if best is not None:
        return best
    return min(max(anchor, span_lo), span_hi)


def pick_subject(
    words: list[str], verb_idx: int, span_lo: int, span_hi: int, morph: str
) -> list[int]:
    """Return word indices for subject — nearest actor to the verb (before or after)."""
    folded = [fold(w) for w in words]
    person, _number = person_number(morph)

    before_lo, before_hi = span_lo, verb_idx
    # Include the verb index as exclusive end; allow subject words immediately before it.
    after_lo, after_hi = verb_idx + 1, min(span_hi + 1, verb_idx + 10)

    def nearest(phrases: list[str]) -> list[int] | None:
        best: list[int] | None = None
        best_dist = 10**9
        for lo, hi, pref in ((before_lo, before_hi, True), (after_lo, after_hi, False)):
            for phrase in phrases:
                hit = find_phrase_span(folded, phrase, lo, hi, prefer_end=pref)
                if not hit or not subject_ok(words, hit):
                    continue
                # distance from verb to nearest edge of phrase
                dist = min(abs(j - verb_idx) for j in hit)
                # slight preference for after-verb when tied (VS narrative: vino Nabucodonosor)
                if hit[0] > verb_idx:
                    dist -= 0.25
                if dist < best_dist:
                    best_dist = dist
                    best = hit
        return best

    if person == "1":
        return nearest(["nosotros", "yo"]) or []
    if person == "2":
        return nearest(["vosotros", "tú", "ustedes"]) or []

    hit = nearest(ACTOR_PHRASES)
    if hit:
        return hit

    # Fallback: determiner + content word immediately before the verb
    i = verb_idx - 1
    while i >= span_lo and fold(words[i]) in {"el", "la", "los", "las", "un", "una"}:
        i -= 1
    if i >= span_lo and fold(words[i]) not in SUBJECT_BAN | OBJECT_STOP:
        start = i
        if start - 1 >= span_lo and fold(words[start - 1]) in {
            "el",
            "la",
            "los",
            "las",
            "un",
            "una",
        }:
            start -= 1
        cand = list(range(start, verb_idx))
        if subject_ok(words, cand):
            return cand
    return []


def pick_object(
    words: list[str], verb_idx: int, span_hi: int, subject_idxs: list[int]
) -> list[int]:
    """Return word indices after the verb for object / receptor."""
    if verb_idx >= span_hi:
        return []
    folded = [fold(w) for w in words]
    lo = verb_idx + 1
    hi = span_hi + 1
    subj = set(subject_idxs)

    for i in range(lo, hi):
        if i in subj:
            continue
        if folded[i] in {"a", "al"}:
            for phrase in ACTOR_PHRASES:
                hit = find_phrase_span(folded, phrase, i + 1, hi, prefer_end=False)
                if hit and not (set(hit) & subj):
                    return [i, *hit] if folded[i] == "a" else hit
            end = min(i + 4, hi)
            cand = [j for j in range(i, end) if j not in subj]
            if cand:
                return cand

    for phrase in ACTOR_PHRASES:
        hit = find_phrase_span(folded, phrase, lo, hi, prefer_end=False)
        if hit and not (set(hit) & subj):
            return hit

    # Optional slot — prefer empty over a noisy NP guess
    return []


def snippet(text: str, max_len: int = 140) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def build_definitions(verse_text: dict[str, str]) -> list[dict]:
    seeds: list[tuple[str, list[str], str, list[tuple[str, str, str]]]] = [
        (
            "dios",
            ["señor", "altísimo", "cielo"],
            "En Daniel, Dios / el Dios del cielo es quien da reinos, revela misterios y juzga a los reyes; no es un dios de Babel entre muchos.",
            [
                ("2:28", "equative", "Hay un Dios en el cielo, el cual revela los misterios"),
                ("2:47", "equative", "Ciertamente que vuestro Dios es Dios de dioses"),
                ("1:9", "use", "Y Dios dio a Daniel misericordia"),
                ("1:17", "use", "Dios les dio conocimiento y entendimiento"),
                ("6:26", "use", "él es el Dios viviente, y permanece para siempre"),
            ],
        ),
        (
            "reino",
            ["reinado", "reyes", "poder"],
            "Reino nombra el dominio que Dios da y quita a los reyes de la tierra, y el reino eterno que no será destruido.",
            [
                ("2:21", "use", "él muda los tiempos y las edades; quita reyes, y pone reyes"),
                ("2:44", "use", "el Dios del cielo levantará un reino que no será jamás destruido"),
                ("4:17", "use", "el Altísimo tiene dominio en el reino de los hombres"),
                ("7:14", "use", "su dominio es dominio eterno, que no pasará"),
                ("7:27", "use", "el reino y el dominio… será dado al pueblo de los santos"),
            ],
        ),
        (
            "sueño",
            ["sueños", "visión", "visiones"],
            "Sueño / visión es el medio por el cual Dios revela lo que ha de venir; exige interpretación que solo Dios da.",
            [
                ("2:1", "use", "Nabucodonosor soñó sueños, y su espíritu se angustió"),
                ("2:28", "use", "él ha hecho saber al rey Nabucodonosor lo que ha de acontecer"),
                ("4:5", "use", "vi un sueño que me espantó"),
                ("7:1", "use", "Daniel tuvo un sueño y visiones de su cabeza"),
                ("2:19", "use", "Entonces el secreto fue revelado a Daniel en visión de noche"),
            ],
        ),
        (
            "interpretación",
            ["secreto", "misterio", "misterios"],
            "Interpretación es la explicación del sueño/secreto que los sabios de Babel no pueden dar y que Dios revela a Daniel.",
            [
                ("2:5", "use", "me daréis a conocer el sueño y su interpretación"),
                ("2:27", "contrast", "El secreto que el rey demanda, ni sabios… lo pueden declarar"),
                ("2:30", "use", "no por… sabiduría… sino para que… sepas la interpretación"),
                ("5:15", "contrast", "los sabios… no han podido mostrar la interpretación"),
                ("5:26", "use", "Esta es la interpretación del asunto"),
            ],
        ),
        (
            "sabios",
            ["sabiduría", "magos", "caldeos", "encantadores"],
            "Los sabios de Babel representan la sabiduría de la corte que falla ante el secreto de Dios; la sabiduría verdadera es don de Dios a Daniel.",
            [
                ("1:17", "use", "Dios les dio conocimiento y entendimiento… y sabiduría"),
                ("1:20", "contrast", "diez veces superiores a todos los magos y encantadores"),
                ("2:12", "use", "mandó… que matasen a todos los sabios de Babel"),
                ("2:27", "contrast", "ni sabios, magos, ni… pueden declarar al rey"),
                ("5:8", "contrast", "no pudieron… leer la escritura ni hacer saber… la interpretación"),
            ],
        ),
        (
            "imagen",
            ["estatua", "oro", "hierro", "barro"],
            "La imagen del sueño (y la de oro en ch. 3) concentra reinos humanos y el desafío de adorar lo que no es Dios.",
            [
                ("2:31", "use", "una grande imagen… su apariencia era terrible"),
                ("2:32", "contrast", "la cabeza… de oro fino; el pecho… de plata"),
                ("2:33", "contrast", "sus piernas de hierro; sus pies… hierro y… barro"),
                ("3:1", "use", "el rey Nabucodonosor hizo una imagen de oro"),
                ("3:18", "contrast", "no serviremos a tus dioses, ni adoraremos la imagen"),
            ],
        ),
        (
            "fuego",
            ["horno", "llama"],
            "El fuego del horno es la prueba donde el rey exige adoración y Dios libró a sus siervos en medio de la llama.",
            [
                ("3:6", "use", "será echado dentro de un horno de fuego ardiendo"),
                ("3:17", "use", "nuestro Dios… puede librarnos del horno de fuego"),
                ("3:25", "use", "he aquí yo veo cuatro varones sueltos… en medio del fuego"),
                ("3:27", "use", "ni el cabello… se había quemado"),
            ],
        ),
        (
            "leones",
            ["foso", "fosa"],
            "Los leones marcan la sentencia de la corte meda contra la oración a Dios; Dios cierra la boca de los leones.",
            [
                ("6:7", "use", "cualquiera que pidiere… sea echado en el foso de los leones"),
                ("6:16", "use", "fue echado en el foso de los leones"),
                ("6:22", "use", "mi Dios envió su ángel, el cual cerró la boca de los leones"),
                ("6:24", "contrast", "fueron echados… los hombres que habían acusado… y los leones se apoderaron de ellos"),
            ],
        ),
    ]

    terms: list[dict] = []
    for seed, related, working, curated in seeds:
        hits = []
        for vk, kind, note in curated:
            text = verse_text.get(vk, "")
            hits.append(
                {
                    "id": f"hit:{seed}:{vk}:{kind[:2]}",
                    "verseKey": vk,
                    "kind": kind,
                    "snippet": snippet(text) if text else note,
                    "note": note,
                    "confirmed": True,
                }
            )
        # Extra automatic uses from verse scan (cap)
        needle = fold(seed)
        auto = 0
        for vk, text in sorted(
            verse_text.items(), key=lambda kv: tuple(map(int, kv[0].split(":")))
        ):
            if any(h["verseKey"] == vk for h in hits):
                continue
            if needle in fold(text):
                hits.append(
                    {
                        "id": f"hit:{seed}:{vk}:use",
                        "verseKey": vk,
                        "kind": "use",
                        "snippet": snippet(text),
                        "confirmed": True,
                    }
                )
                auto += 1
                if auto >= 4:
                    break
        terms.append(
            {
                "id": f"term:{seed}:filled",
                "seed": seed,
                "relatedConfirmed": related,
                "hits": hits,
                "workingDefinition": working,
            }
        )
    return terms


def build_thread() -> dict:
    steps = [
        {
            "id": "step:manual:1:1:filled",
            "label": "Exile court",
            "verseKey": "1:1",
            "source": "manual",
            "evidence": "Nabucodonosor sitia Jerusalén; jóvenes en Babel",
        },
        {
            "id": "step:manual:1:8:filled",
            "label": "Resolve",
            "verseKey": "1:8",
            "source": "manual",
            "evidence": "Daniel puso en su corazón no contaminarse",
        },
        {
            "id": "step:opens:2:1:filled",
            "label": "Dream crisis",
            "verseKey": "2:1",
            "source": "opens",
            "evidence": "sueño del rey; sabios condenados",
        },
        {
            "id": "step:opens:2:19:filled",
            "label": "Mystery given",
            "verseKey": "2:19",
            "source": "opens",
            "evidence": "secreto revelado a Daniel en visión",
        },
        {
            "id": "step:manual:2:44:filled",
            "label": "Kingdom not destroyed",
            "verseKey": "2:44",
            "source": "manual",
            "evidence": "Dios del cielo levantará un reino eterno",
        },
        {
            "id": "step:opens:3:1:filled",
            "label": "Image / furnace",
            "verseKey": "3:1",
            "source": "opens",
            "evidence": "imagen de oro; horno de fuego",
        },
        {
            "id": "step:opens:4:1:filled",
            "label": "Tree / humbling",
            "verseKey": "4:1",
            "source": "opens",
            "evidence": "Nabucodonosor humillado hasta conocer al Altísimo",
        },
        {
            "id": "step:opens:5:1:filled",
            "label": "Writing on the wall",
            "verseKey": "5:1",
            "source": "opens",
            "evidence": "Belsasar; mene tequel ufarsin",
        },
        {
            "id": "step:opens:6:1:filled",
            "label": "Lions",
            "verseKey": "6:1",
            "source": "opens",
            "evidence": "decreto contra la oración; foso de leones",
        },
        {
            "id": "step:opens:7:1:filled",
            "label": "Beasts / saints",
            "verseKey": "7:1",
            "source": "opens",
            "evidence": "cuatro bestias; dominio al Hijo del hombre / santos",
        },
        {
            "id": "step:opens:9:1:filled",
            "label": "Seventy weeks",
            "verseKey": "9:1",
            "source": "opens",
            "evidence": "oración de Daniel; setenta semanas",
        },
        {
            "id": "step:opens:10:1:filled",
            "label": "Final conflict",
            "verseKey": "10:1",
            "source": "opens",
            "evidence": "visión del hombre vestido de lino; príncipes",
        },
        {
            "id": "step:opens:12:1:filled",
            "label": "End sealed",
            "verseKey": "12:1",
            "source": "opens",
            "evidence": "tiempo de angustia; sellar el libro",
        },
    ]
    return {"steps": steps}


def build_contrasts() -> dict:
    items = [
        {"id": "contrast:1:8:filled", "verseKey": "1:8", "poleA": "manjares del rey", "poleB": "no contaminarse"},
        {"id": "contrast:1:20:filled", "verseKey": "1:20", "poleA": "Daniel y compañeros", "poleB": "magos y encantadores"},
        {"id": "contrast:2:27:filled", "verseKey": "2:27", "poleA": "sabios de Babel", "poleB": "Dios en el cielo"},
        {"id": "contrast:2:32:filled", "verseKey": "2:32", "poleA": "oro", "poleB": "barro"},
        {"id": "contrast:2:44:filled", "verseKey": "2:44", "poleA": "reinos de hombres", "poleB": "reino que no será destruido"},
        {"id": "contrast:3:18:filled", "verseKey": "3:18", "poleA": "imagen de oro", "poleB": "servir a Dios"},
        {"id": "contrast:3:25:filled", "verseKey": "3:25", "poleA": "horno de fuego", "poleB": "librados en medio"},
        {"id": "contrast:4:17:filled", "verseKey": "4:17", "poleA": "soberbia del rey", "poleB": "dominio del Altísimo"},
        {"id": "contrast:5:23:filled", "verseKey": "5:23", "poleA": "vasos de la casa de Dios", "poleB": "dioses de oro y plata"},
        {"id": "contrast:6:10:filled", "verseKey": "6:10", "poleA": "decreto del rey", "poleB": "oración a Dios"},
        {"id": "contrast:6:22:filled", "verseKey": "6:22", "poleA": "leones", "poleB": "ángel cerró su boca"},
        {"id": "contrast:7:14:filled", "verseKey": "7:14", "poleA": "bestias", "poleB": "dominio eterno"},
        {"id": "contrast:7:27:filled", "verseKey": "7:27", "poleA": "cuerno / reyes", "poleB": "pueblo de los santos"},
        {"id": "contrast:12:2:filled", "verseKey": "12:2", "poleA": "despertar a vida eterna", "poleB": "despertar a vergüenza"},
    ]
    return {"items": items}


def first_finite_in_verse(
    finite_rows: list[tuple[int, int, int, str]], ch: int, vs: int
) -> str | None:
    for c, v, tok, _ in finite_rows:
        if c == ch and v == vs:
            return f"{c}:{v}:{tok}"
    return None


def build_h3_flow(finite_rows: list[tuple[int, int, int, str]]) -> dict:
    """Chapter / crisis seams as H2 starts + pressure (tension into next stretch)."""
    seams = [
        (1, 8),  # resolve
        (2, 1),  # dream
        (2, 19),  # revelation
        (3, 1),  # image
        (4, 1),  # tree (Protestant)
        (5, 1),  # writing
        (6, 1),  # lions
        (7, 1),  # beasts
        (8, 1),  # ram/goat
        (9, 1),  # seventy weeks
        (10, 1),  # final vision
        (12, 1),  # end
    ]
    pressure_seams = [
        (1, 8),
        (2, 12),
        (3, 6),
        (3, 15),
        (4, 31),
        (5, 5),
        (6, 7),
        (7, 8),
        (9, 20),
        (12, 1),
    ]
    labels = {
        (1, 8): "Daniel-puso-en-su-corazon",
        (2, 1): "sueno-del-rey",
        (2, 19): "secreto-revelado",
        (3, 1): "imagen-de-oro",
        (4, 1): "arbol-y-humillacion",
        (5, 1): "escritura-en-la-pared",
        (6, 1): "foso-de-los-leones",
        (7, 1): "cuatro-bestias",
        (8, 1): "carnero-y-macho-cabrío",
        (9, 1): "setenta-semanas",
        (10, 1): "vision-final",
        (12, 1): "tiempo-del-fin",
    }

    breaks: list[str] = []
    labels_map: dict[str, str] = {}
    for ch, vs in seams:
        fid = first_finite_in_verse(finite_rows, ch, vs)
        if not fid:
            continue
        breaks.append(fid)
        if (ch, vs) in labels:
            labels_map[fid] = labels[(ch, vs)]

    pressure: list[str] = []
    for ch, vs in pressure_seams:
        fid = first_finite_in_verse(finite_rows, ch, vs)
        if fid:
            pressure.append(fid)

    return {
        "breaksAfter": uniq(breaks),
        "ignoredSuggestions": [],
        "labels": labels_map,
        "pressureAfter": uniq(pressure),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--also",
        type=Path,
        action="append",
        default=[],
        help="Extra output path(s) (e.g. Downloads copy)",
    )
    parser.add_argument(
        "--repair",
        action="store_true",
        help="After fill, retag Q1–Q3 + clip exclusive spans "
        "(scripts/repair-daniel-clause-roots.py; keeps all clause rows)",
    )
    args = parser.parse_args()

    align_doc = json.loads(ALIGN.read_text(encoding="utf-8"))
    word_by_token: dict[tuple[int, int, int], int] = {}
    for rec in align_doc["records"]:
        word_by_token[(rec["chapter"], rec["verse"], rec["token"])] = int(rec["lbfWordIndex"])

    lbf_words = load_lbf_verses()
    verse_text = load_lbf_verse_text()

    finite: list[str] = []
    imperative: list[str] = []
    statement: list[str] = []
    participle: list[str] = []
    finite_rows: list[tuple[int, int, int, str]] = []
    unclear_participles: list[str] = []

    for line in TOKENS.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        morph = row.get("morph") or ""
        ch, vs = mt_to_protestant(int(row["ch"]), int(row["vs"]))
        w = int(row["w"])
        tid = f"{ch}:{vs}:{w}"

        if is_participle(morph):
            participle.append(tid)
            # Hebrew: no Greek case — always needs host pick (documented as unclear-morph class)
            unclear_participles.append(tid)
            continue
        if not is_finite(morph):
            continue
        finite.append(tid)
        finite_rows.append((ch, vs, w, morph))
        if is_imperative(morph):
            imperative.append(tid)
        else:
            statement.append(tid)

    finite = uniq(finite)
    imperative = uniq(imperative)
    statement = uniq(statement)
    participle = uniq(participle)
    unclear_participles = uniq(unclear_participles)

    by_verse: dict[tuple[int, int], list[tuple[int, str]]] = defaultdict(list)
    for ch, vs, tok, morph in finite_rows:
        by_verse[(ch, vs)].append((tok, morph))

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    clauses: dict[str, dict] = {}
    observations: dict[str, dict] = {}
    actors: dict[str, dict] = {}
    subject_filled = object_filled = 0

    for (ch, vs), rows in sorted(by_verse.items()):
        rows = sorted(rows, key=lambda r: r[0])
        words = lbf_words.get((ch, vs), [])
        n_words = len(words)
        if n_words == 0:
            continue

        anchors: list[int] = []
        for tok, _morph in rows:
            idx = word_by_token.get((ch, vs, tok))
            if idx is None:
                idx = min(n_words - 1, max(0, tok - 1))
            anchors.append(min(max(0, idx), n_words - 1))

        for i in range(1, len(anchors)):
            if anchors[i] < anchors[i - 1]:
                anchors[i] = anchors[i - 1]

        # Assign finites to Spanish verb-looking words in reading order (alignment
        # anchors are often on nouns like «Dios» for Hebrew wayyiqtols).
        verb_slots: list[int] = []
        known_verbs = {
            "dijo",
            "dice",
            "habló",
            "vino",
            "fue",
            "era",
            "es",
            "son",
            "hay",
            "hubo",
            "dio",
            "puso",
            "hizo",
            "vió",
            "vio",
            "respondió",
            "mandó",
            "envió",
            "llamó",
            "halló",
            "entendió",
            "buscó",
            "temo",
            "prueba",
            "entregó",
            "sitió",
            "asignó",
            "escuchó",
            "probó",
            "quitaba",
            "daba",
            "trajo",
            "preguntó",
            "llevó",
            "contaminaría",
            "contaminara",
            "estuvieron",
            "estaba",
            "estaban",
            "será",
            "serán",
            "haré",
            "hará",
            "vieron",
            "vean",
            "comed",
            "bebamos",
            "comamos",
            "soñó",
            "revelado",
            "reveló",
        }
        for wi, w in enumerate(words):
            if fold(w) in known_verbs or VERBISH.search(w):
                verb_slots.append(wi)

        assigned_verbs: list[int] = []
        slot_i = 0
        for i, (_tok, _morph) in enumerate(rows):
            if slot_i < len(verb_slots):
                assigned_verbs.append(verb_slots[slot_i])
                slot_i += 1
            else:
                assigned_verbs.append(snap_verb_idx(words, anchors[i], 0, n_words - 1))

        for i, ((tok, morph), verb_idx) in enumerate(zip(rows, assigned_verbs)):
            prev_v = assigned_verbs[i - 1] if i else -1
            next_v = assigned_verbs[i + 1] if i + 1 < len(assigned_verbs) else n_words
            start = prev_v + 1 if i else 0
            end = next_v - 1 if i + 1 < len(assigned_verbs) else n_words - 1
            # Always include the verb word itself
            start = min(start, verb_idx)
            end = max(end, verb_idx)
            if start > end:
                start = end
            clause_id = f"{ch}:{vs}:{tok}"
            span = [f"{ch}:{vs}:{wi}" for wi in range(start, end + 1)]
            verb_word = f"{ch}:{vs}:{verb_idx}"

            subj_idxs = pick_subject(words, verb_idx, start, end, morph)
            obj_idxs = pick_object(words, verb_idx, end, subj_idxs)
            span_set = set(range(start, end + 1))
            subj_idxs = [j for j in subj_idxs if j in span_set and j != verb_idx]
            obj_idxs = [
                j for j in obj_idxs if j in span_set and j != verb_idx and j not in subj_idxs
            ]

            subject_span = [f"{ch}:{vs}:{j}" for j in subj_idxs]
            object_span = [f"{ch}:{vs}:{j}" for j in obj_idxs]
            if subject_span:
                subject_filled += 1
            if object_span:
                object_filled += 1

            clauses[clause_id] = {
                "finiteVerbId": clause_id,
                "selectedSpan": span,
                "greekStartTokenId": f"{ch}:{vs}:{tok}",
                "greekEndTokenId": f"{ch}:{vs}:{tok}",
                "greekConfirmedAt": now,
            }
            observations[clause_id] = {
                "describesNoun": "no",
                "isWhatWasExpressed": "no",
                "tellsWhenOrIf": "no",
                "describedNounSpan": [],
                "expressedParentClauseId": "",
                "whenIfParentClauseId": "",
            }
            actors[clause_id] = {
                "subjectSpan": subject_span,
                "verbSpan": [verb_word] if verb_word in span else ([span[-1]] if span else []),
                "objectSpan": object_span,
            }

    definitions = build_definitions(verse_text)
    thread = build_thread()
    contrasts = build_contrasts()
    h3_flow = build_h3_flow(finite_rows)

    slug = "daniel"
    data = {
        "the-reader:daniel:notes": [],
        f"o-prototype:{slug}:finite-verb-marks": finite,
        f"roots:{slug}:brick1b:nominalClauseHeads": [],
        f"roots:{slug}:brick2:mood:imperativeCandidates": imperative,
        f"roots:{slug}:brick2c:mood:statementCandidates": statement,
        f"roots:{slug}:brick3:mood:subjunctiveCandidates": [],
        f"roots:{slug}:brick3c:mood:optativeCandidates": [],
        f"roots:{slug}:brick2b:commandRecipients": [],
        f"roots:{slug}:brick3:dependentThoughtIntroducers": [],
        f"roots:{slug}:brick4:participleCandidates": participle,
        f"the-reader:spanish-clause-builder:{slug}:v3": clauses,
        f"the-reader:spanish-clause-builder:{slug}:statement-command-review:v1": observations,
        f"the-reader:spanish-clause-builder:{slug}:clause-actors:v1": actors,
        f"the-reader:spanish-clause-builder:{slug}:participles:v1": {},
        f"the-reader:spanish-clause-builder:{slug}:participle-subjects:v1": {},
        f"the-reader:spanish-clause-builder:{slug}:h3-flow:v1": h3_flow,
        f"the-reader:spanish-clause-builder:{slug}:contrasts:v1": contrasts,
        f"the-reader:spanish-clause-builder:{slug}:book-definitions:v1": {"terms": definitions},
        f"the-reader:spanish-clause-builder:{slug}:book-thread:v1": thread,
    }

    bundle = {
        "schema": 1,
        "book": "daniel",
        "exportedAt": now,
        "data": data,
        "source": "cgv-reader",
        "fillNotes": {
            "method": "OSHB morph + LBF alignment workshop fill (scripts/fill-daniel-mark-progress.py)",
            "tokenIdScheme": "Protestant ch:vs:w",
            "finite": len(finite),
            "imperative": len(imperative),
            "statement": len(statement),
            "participle": len(participle),
            "clauses": len(clauses),
            "actorsWithSubject": subject_filled,
            "actorsWithObject": object_filled,
            "definitionTerms": len(definitions),
            "threadSteps": len(thread["steps"]),
            "contrasts": len(contrasts["items"]),
            "h3Breaks": len(h3_flow["breaksAfter"]),
            "h3Pressure": len(h3_flow["pressureAfter"]),
            "hebrewParticiplesNeedHostPick": len(unclear_participles),
            "note": (
                "Mark bricks match OSHB finite/imperative/participle. "
                "SVO subjects/objects are Spanish-span heuristics (actor phrases + morph person) — "
                "review in Observer; 1st/2nd person often leave subject empty (implicit). "
                "Hebrew participles have no Greek case → UI: pick who they ride with "
                f"({len(unclear_participles)} tokens). "
                "Definitions / thread / contrasts / H3 pressure are workshop seeds for "
                "Movement tension + convergence signals — not auto themes. "
                "WARNING: raw fill answers Q1–Q3 as all-no (= every finite is an independent root). "
                "Run with --repair (or scripts/repair-daniel-clause-roots.py) before Compiler/Arquitecto."
            ),
        },
    }

    if args.repair:
        import importlib.util

        repair_path = ROOT / "scripts" / "repair-daniel-clause-roots.py"
        spec = importlib.util.spec_from_file_location("repair_daniel_roots", repair_path)
        assert spec and spec.loader
        repair_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(repair_mod)
        bundle = repair_mod.repair(bundle, lbf_words)

    outs = [args.out, *args.also]
    for out in outs:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("wrote", out)
    print(json.dumps(bundle["fillNotes"], indent=2))


if __name__ == "__main__":
    main()
