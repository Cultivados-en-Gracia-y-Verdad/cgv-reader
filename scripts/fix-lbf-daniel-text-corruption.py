#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mechanical repair of LBF Daniel text corruption. Zero interpretation.

Three defect classes, all introduced downstream of translation:

1. `-os` relocation. A word-final ``-os`` was severed from its stem and
   re-emitted as a standalone token *before* the word, producing forms like
   ``fueron os traid`` (= ``fueron traídos``) and ``los os judi``
   (= ``los judíos``). 14 sites. Six other standalone ``os`` tokens in the
   book (3:5, 3:15 x2, 4:1, 6:25) are legitimate 2nd-person pronouns and are
   left untouched.
2. Clitic relocation — the same bug with reflexive / object pronouns:
   ``Fuése`` -> ``Se Fue``, ``Levántate`` -> ``te Levanta``,
   ``Levantaráse`` -> ``Se Levantara``. The stem keeps its original capital and
   loses its accent, which is why these also show up as capitalization noise.
   7 sites, restored to modern proclitic order.
3. Internal capitalization and orthography: ``ni Caldeo``, ``Assuero``.
4. Missing accents on preterite / future verbs: ``quitaran``, ``se tornara``,
   ``se acosto``, ``me declaro``.

Each edit is asserted to match exactly once in its verse, so the script fails
loudly rather than silently mangling text. Idempotent: re-running is a no-op.

NOT fixed here (needs a translator, not a script) — reported instead:
  * 4:10 ``Aquestas las visiones de mi cabeza`` is missing its verb.
  * Chapters 2-12 remain Reina-Valera derived while the file header claims OSHB
    as source. That is redraft work; see verify-lbf-text.py for the debt count.

Usage:
    python3 scripts/fix-lbf-daniel-text-corruption.py [--dry-run]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

LBF = Path(__file__).resolve().parent.parent / "data" / "lbf" / "ot" / "daniel.md"

# (verse, old, new, why)
FIXES: list[tuple[str, str, str, str]] = [
    # --- 1. `-os` relocation -------------------------------------------------
    ("2:35", "y os levantol el viento", "y levantólos el viento", "os-relocation"),
    ("3:8", "denunciaron de los os judi", "denunciaron de los judíos", "os-relocation"),
    ("3:12", "Hay unos varones os judi", "Hay unos varones judíos", "os-relocation"),
    ("3:13", "fueron os traid estos varones", "fueron traídos estos varones", "os-relocation"),
    ("5:3", "fueron os traid los vasos", "fueron traídos los vasos", "os-relocation"),
    ("5:15", "fueron os traid delante de mí", "fueron traídos delante de mí", "os-relocation"),
    ("6:13", "de la cautividad de los os judi", "de la cautividad de los judíos", "os-relocation"),
    ("6:18", "fueron os traid delante de él", "fueron traídos delante de él", "os-relocation"),
    ("6:24", "fueron os traid aquellos hombres", "fueron traídos aquellos hombres", "os-relocation"),
    ("7:27", "todos los os señori le servirán", "todos los señoríos le servirán", "os-relocation"),
    ("8:23", "del imperio de os est,", "del imperio de estos,", "os-relocation"),
    ("11:39", "y os haral enseñorear", "y harálos enseñorear", "os-relocation"),
    ("11:40", "y muchos os navi;", "y muchos navíos;", "os-relocation"),
    ("12:10", "mas los os impi obrarán impíamente, y ninguno de los os impi entenderá",
     "mas los impíos obrarán impíamente, y ninguno de los impíos entenderá", "os-relocation"),
    # --- 2. clitic relocation ------------------------------------------------
    # Same bug class as (1), with reflexive/object pronouns instead of `-os`:
    # ``Fuése`` -> ``Se Fue``, ``Levántate`` -> ``te Levanta``. The stem keeps its
    # original capital and loses its accent. Restored to modern proclitic order,
    # which is where the OSHB redraft is heading anyway.
    ("2:17", "Se Fue luego Daniel", "Se fue luego Daniel", "clitic-relocation"),
    ("3:4", "se Manda a vosotros", "se manda a vosotros", "clitic-relocation"),
    ("5:12", "se Llame pues ahora a Daniel", "Llámese pues ahora a Daniel", "clitic-relocation"),
    ("6:12", "Se Llegaron luego", "Se llegaron luego", "clitic-relocation"),
    ("6:18", "Se Fue luego el rey", "Se fue luego el rey", "clitic-relocation"),
    ("7:5", "te Levanta, traga carne mucha", "Levántate, traga carne mucha", "clitic-relocation"),
    ("11:3", "Se Levantara luego un rey valiente", "Se levantará luego un rey valiente",
     "clitic-relocation"),
    # --- 3. internal capitalization -----------------------------------------
    ("2:10", "ni Caldeo.", "ni caldeo.", "capitalization"),
    ("4:10", "me Parecia que veía", "me parecía que veía", "capitalization+accent"),
    ("7:16", "Me Llegue a uno", "Me llegué a uno", "capitalization+accent"),
    ("9:1", "de Darío hijo de Assuero", "de Darío hijo de Asuero", "orthography"),
    # --- 4. missing accents --------------------------------------------------
    ("3:1", "la levanto en el campo de Dura", "la levantó en el campo de Dura", "accent"),
    ("4:11", "y se hacia fuerte", "y se hacía fuerte", "accent"),
    ("6:10", "se entro en su casa", "se entró en su casa", "accent"),
    ("6:18", "y se acosto ayuno", "y se acostó ayuno", "accent"),
    ("7:16", "le pregunte la verdad", "le pregunté la verdad", "accent"),
    ("7:16", "Y me hablo, y me declaro la interpretación",
     "Y me habló, y me declaró la interpretación", "accent"),
    ("7:26", "le quitaran su señorío", "le quitarán su señorío", "accent"),
    ("8:7", "e lo hirio, y quebró", "e lo hirió, y quebró", "accent"),
    ("8:23", "se levantara un rey altivo", "se levantará un rey altivo", "accent"),
    ("9:25", "se tornara a edificar", "se tornará a edificar", "accent"),
    ("11:5", "Y se hara fuerte el rey", "Y se hará fuerte el rey", "accent"),
    ("11:17", "y le dara una hija", "y le dará una hija", "accent"),
    ("11:28", "Y se volvera a su tierra con grande riqueza",
     "Y se volverá a su tierra con grande riqueza", "accent"),
    ("11:28", "hará pues, y se volvera a su tierra.",
     "hará pues, y se volverá a su tierra.", "accent"),
]

# Reported, never auto-edited.
NEEDS_TRANSLATOR = [
    ("4:10", "«Aquestas las visiones de mi cabeza» — falta el verbo (RV: «Aquestas fueron las visiones»)."),
    ("9:2-9:20", "el Nombre divino aparece como «Jehová» en 8 versículos de ch9 y como "
                 "«Señor» en el resto del libro — decide una política y aplícala en todo el libro."),
]

VERSE_RE = re.compile(r"^### (\d+:\d+)\n\n(.+)$", re.M)


def load_verses(text: str) -> dict[str, tuple[int, int]]:
    """Map verse ref -> (start, end) offsets of its text in the file."""
    return {m.group(1): (m.start(2), m.end(2)) for m in VERSE_RE.finditer(text)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    text = LBF.read_text()
    verses = load_verses(text)

    applied, already, failed = [], [], []

    for ref, old, new, why in FIXES:
        if ref not in verses:
            failed.append((ref, old, "verse not found"))
            continue
        s, e = verses[ref]
        body = text[s:e]
        if old in body:
            if body.count(old) != 1:
                failed.append((ref, old, f"matches {body.count(old)}x, expected 1"))
                continue
            text = text[:s] + body.replace(old, new) + text[e:]
            verses = load_verses(text)  # offsets shift
            applied.append((ref, old, new, why))
        elif new in body:
            already.append((ref, why))
        else:
            failed.append((ref, old, "neither old nor new text present"))

    print(f"applied {len(applied)} fixes · {len(already)} already correct · {len(failed)} FAILED\n")
    by_why: dict[str, int] = {}
    for ref, old, new, why in applied:
        by_why[why] = by_why.get(why, 0) + 1
        print(f"  {ref:>6}  [{why}]")
        print(f"          - {old}")
        print(f"          + {new}")
    if by_why:
        print("\n  totals:", ", ".join(f"{k}={v}" for k, v in sorted(by_why.items())))

    if failed:
        print("\nFAILED (no change written):")
        for ref, old, reason in failed:
            print(f"  {ref:>6}  {reason}: {old!r}")

    if NEEDS_TRANSLATOR:
        print("\nrequires a translator (not changed):")
        for ref, note in NEEDS_TRANSLATOR:
            print(f"  {ref:>6}  {note}")

    if failed:
        return 1
    if applied and not args.dry_run:
        LBF.write_text(text)
        print(f"\nwrote {LBF}")
    elif args.dry_run:
        print("\n--dry-run: nothing written")
    else:
        print("\nno changes needed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
