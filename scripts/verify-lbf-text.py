#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Hard gate on an LBF book: text integrity + Spanish-side alignment coverage.

Nothing downstream (Observer clause spans, Compiler skeleton, Arquitecto naming,
Escriba commentary) may be trusted until this passes. Daniel is the cautionary
case: the whole pipeline ran on a self-declared «borrador preliminar» whose
alignment covered only 70% of the Spanish words. Because clause ``selectedSpan``
is cut against Spanish word indices, the uncovered 30% put span boundaries in
arbitrary places, which surfaced far downstream as 23% of manual Scripture lines
ending on a dangling connector, 64 overlapping units, and 194 lost words.

Checks, in order of severity:

HARD (fail the gate)
  1. structure    — expected verse count per chapter, no gaps, no empty verses
  2. corruption   — `-os` relocation (``fueron os traid``), truncated stems
  3. accents      — unaccented preterite / future verb forms
  4. capitals     — sentence-internal capitals that are not proper nouns
  5. alignment    — every LBF Spanish word covered by >=1 alignment record

DEBT (fail unless --allow-redraft-debt)
  6. translation base — Reina-Valera markers surviving in a file that declares
     OSHB as its source. These require a translator, not a script.

Usage:
    python3 scripts/verify-lbf-text.py                     # daniel, everything
    python3 scripts/verify-lbf-text.py --allow-redraft-debt
    python3 scripts/verify-lbf-text.py --book daniel --testament ot
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

EXPECTED_VERSES = {
    "daniel": {1: 21, 2: 49, 3: 30, 4: 37, 5: 31, 6: 28,
               7: 28, 8: 27, 9: 27, 10: 21, 11: 45, 12: 13},
}

# Words that legitimately carry a capital mid-sentence.
PROPER = set("""
Daniel Dios Señor Jehová Nabucodonosor Babel Babilonia Jerusalén Jerusalem Judá Judea Joacim Israel
Aspenaz Ananías Misael Azarías Beltsasar Belsasar Sadrac Mesac Abed-nego Sinar Ciro Darío Asuero
Assuero Media Medos Medo Persia Persas Persa Grecia Javán Miguel Gabriel Susán Ulai Hidekel Hiddekel
Tigris Edom Moab Ammón Egipto Etiopía Libia Caldea Altísimo Elam Jeremías Moisés Leví Mesías Sion
Sión Príncipe Mauzim Aquestas Anciano Hijo Escritura Ley Dura Uphaz Ufaz Arioch Arioc Tarsis Quitim
Rey Juez Santo Verbo Nombre Viviente
""".split())

# stem -> intended word, for the `-os` relocation bug
TRUNCATED_STEMS = {
    "traid": "traídos", "judi": "judíos", "levantol": "levantólos", "señori": "señoríos",
    "est": "estos", "haral": "harálos", "navi": "navíos", "impi": "impíos",
}

# Standalone `os` that is a real 2nd-person-plural pronoun.
LEGIT_OS_NEXT = {
    "postraréis", "postréis", "libre", "sea", "digo", "mando", "manda", "hago",
    "traiga", "dé", "daré", "diré", "hablaré",
}

NEEDS_ACCENT = {
    "levantara": "levantará", "levantaran": "levantarán", "tornara": "tornará",
    "tornaran": "tornarán", "quitaran": "quitarán", "acosto": "acostó",
    "mostrara": "mostrará", "dara": "dará", "daran": "darán", "hara": "hará",
    "haran": "harán", "sera": "será", "seran": "serán", "vendra": "vendrá",
    "vendran": "vendrán", "estara": "estará", "pondra": "pondrá", "volvera": "volverá",
    "volveran": "volverán", "saldra": "saldrá", "tendra": "tendrá", "podra": "podrá",
    "entendera": "entenderá", "declarara": "declarará", "edificara": "edificará",
    "destruira": "destruirá", "reinara": "reinará", "hablo": "habló",
    "respondio": "respondió", "entro": "entró", "salio": "salió", "llego": "llegó",
    "penso": "pensó", "miro": "miró", "parecia": "parecía", "veia": "veía",
    "declaro": "declaró", "pregunte": "pregunté", "hirio": "hirió", "levanto": "levantó",
}
# Forms that are also valid unaccented words; only flag in these contexts.
CONTEXTUAL = {"hacia": ("fuerte", "grande"), "mando": (), "hallo": (), "quedo": (), "tomo": ()}

RV_MARKERS = {
    "empero": r"\bEmpero\b|\bempero\b",
    "aqueste/a": r"\baqueste\w*\b",
    "ansí": r"\bans[ií]\b",
    "hinchió": r"\bhinchi[oó]\b",
    "tierra deseable": r"\btierra deseable\b|\bmonte deseable\b",
    # accent on the vowel before the clitic is what distinguishes «levantólos»
    # from ordinary words such as «señales» / «principales»
    "enclítico (-le/-los suffix)": r"\b\w{2,}[óáé]l[eoa]s?\b",
    "2pl arcaico": r"\b(mostr[aá]is|pod[eé]is|sab[eé]is|dec[ií]dme|hac[eé]dme|prepar[aá]is)\b",
    "tamo/eras del verano": r"\btamo\b",
}
# Proper names and legitimate specialist-class glosses are not RV debt.
# (Arioch / astrólogos stay in the Spanish; they are not Reina-Valera fossils.)

VERSE_RE = re.compile(r"^### (\d+):(\d+)\n\n(.*)$", re.M)
TOKEN_RE = re.compile(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ'’-]*")


def strip_accents(s: str) -> str:
    d = unicodedata.normalize("NFD", s)
    return "".join(c for c in d if unicodedata.category(c) != "Mn")


class Gate:
    def __init__(self, book: str, testament: str):
        self.book = book
        self.path = ROOT / "data" / "lbf" / testament / f"{book}.md"
        self.align_path = ROOT / "data" / "lbf" / testament / f"{book}.alignment.json"
        self.text = self.path.read_text()
        self.verses: dict[tuple[int, int], str] = {}
        for m in VERSE_RE.finditer(self.text):
            self.verses[(int(m.group(1)), int(m.group(2)))] = m.group(3)
        self.hard: dict[str, list[str]] = defaultdict(list)
        self.debt: dict[str, list[str]] = defaultdict(list)

    # -- 1 ---------------------------------------------------------------
    def check_structure(self) -> None:
        exp = EXPECTED_VERSES.get(self.book)
        if not exp:
            self.hard["structure"].append(f"no expected verse counts registered for {self.book!r}")
            return
        for ch, n in sorted(exp.items()):
            got = sorted(v for (c, v) in self.verses if c == ch)
            if len(got) != n:
                self.hard["structure"].append(f"ch{ch}: {len(got)} verses, expected {n}")
            missing = sorted(set(range(1, n + 1)) - set(got))
            if missing:
                self.hard["structure"].append(f"ch{ch}: missing verses {missing}")
        for (c, v), t in sorted(self.verses.items()):
            if not t.strip():
                self.hard["structure"].append(f"{c}:{v} is empty")

    # -- 2 ---------------------------------------------------------------
    def check_corruption(self) -> None:
        for (c, v), t in sorted(self.verses.items()):
            for m in re.finditer(r"\bos\b\s+([\w’'-]+)", t):
                nxt = m.group(1)
                if nxt.lower() in TRUNCATED_STEMS:
                    want = TRUNCATED_STEMS[nxt.lower()]
                    self.hard["corruption"].append(
                        f"{c}:{v} «os {nxt}» -> «{want}» (-os relocation)")
                elif nxt.lower() not in LEGIT_OS_NEXT:
                    self.hard["corruption"].append(
                        f"{c}:{v} «os {nxt}» — standalone «os», verify it is a pronoun")
            for stem in TRUNCATED_STEMS:
                if re.search(rf"\b{stem}\b", t, re.I):
                    self.hard["corruption"].append(
                        f"{c}:{v} truncated stem «{stem}» -> «{TRUNCATED_STEMS[stem]}»")
            # Clitic relocation: a pronoun re-emitted before its verb, which keeps
            # the original capital and loses its accent («Fuése» -> «Se Fue»).
            # `lo/la/los/las` are excluded: they are overwhelmingly articles here.
            # The capital on the second word is the signature, so no re.I.
            for m in re.finditer(
                    r"\b([Ss]e|[Tt]e|[Mm]e|[Ll]e|[Ll]es|[Nn]os)\s+"
                    r"([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})\b", t):
                clitic, verb = m.group(1), m.group(2)
                if verb in PROPER:
                    continue
                self.hard["corruption"].append(
                    f"{c}:{v} «{clitic} {verb}» — pronombre reubicado; "
                    f"lee «{verb[0].lower() + verb[1:]}{clitic.lower()}» en el original")

    # -- 3 ---------------------------------------------------------------
    def check_accents(self) -> None:
        for (c, v), t in sorted(self.verses.items()):
            for tok in TOKEN_RE.findall(t):
                low = tok.lower()
                if low in NEEDS_ACCENT and strip_accents(low) == low:
                    self.hard["accents"].append(f"{c}:{v} «{tok}» -> «{NEEDS_ACCENT[low]}»")
            for word, nexts in CONTEXTUAL.items():
                if not nexts:
                    continue
                for nxt in nexts:
                    if re.search(rf"\b{word}\s+{nxt}\b", t):
                        self.hard["accents"].append(f"{c}:{v} «{word} {nxt}» — falta acento")

    # -- 4 ---------------------------------------------------------------
    def check_capitals(self) -> None:
        for (c, v), t in sorted(self.verses.items()):
            for m in re.finditer(r"(?<=[a-záéíóúñ,;] )([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:-[a-záéíóúñ]+)?)", t):
                w = m.group(1)
                if w not in PROPER and not w.startswith(("Abed", "Beth")):
                    self.hard["capitals"].append(f"{c}:{v} «{w}» capitalizado dentro de la oración")

    # -- 5 ---------------------------------------------------------------
    def _per_chapter_coverage(self, ch: int) -> dict[int, set[int]] | None:
        """Hand-built alignment for one chapter, if it exists.

        These files supersede the legacy gloss-seed: they index Spanish words
        directly, so a Hebrew token can claim discontinuous Spanish positions
        where word order differs — something the flat
        ``lbfSurface`` / ``lbfWordIndex`` record shape cannot express.
        """
        path = self.path.parent / f"{self.book}.align.{ch}.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        out: dict[int, set[int]] = defaultdict(set)
        for v_str, rows in data.get("verses", {}).items():
            for row in rows:
                out[int(v_str)].update(row.get("es", []))
        return out

    def check_alignment(self) -> None:
        chapters = sorted({c for (c, _v) in self.verses})
        legacy_cov: dict[tuple[int, int], set[int]] = defaultdict(set)
        legacy_meta: dict = {}
        if self.align_path.exists():
            data = json.loads(self.align_path.read_text())
            legacy_meta = data.get("meta", {})
            for r in data.get("records", []):
                key = (r.get("chapter"), r.get("verse"))
                surf = (r.get("lbfSurface") or "").strip()
                idx = r.get("lbfWordIndex")
                if not surf or idx is None:
                    continue
                n = len(TOKEN_RE.findall(surf))
                for k in range(n):
                    legacy_cov[key].add(idx - k)  # 0-based, last word of the phrase
        elif not any((self.path.parent / f"{self.book}.align.{c}.json").exists() for c in chapters):
            self.hard["alignment"].append(f"missing {self.align_path.name}")
            return

        total = uncov = partial = 0
        done: list[int] = []
        pending: list[str] = []
        worst: list[tuple[int, str]] = []
        for ch in chapters:
            hand = self._per_chapter_coverage(ch)
            ch_total = ch_uncov = 0
            for (c, v), t in sorted(self.verses.items()):
                if c != ch:
                    continue
                words = TOKEN_RE.findall(t)
                cov = hand.get(v, set()) if hand is not None else legacy_cov[(c, v)]
                miss = [i for i in range(len(words)) if i not in cov]
                ch_total += len(words)
                ch_uncov += len(miss)
                if miss:
                    partial += 1
                    worst.append((len(miss), f"{c}:{v} {len(miss)}/{len(words)} sin alinear"))
            total += ch_total
            uncov += ch_uncov
            if ch_uncov == 0 and hand is not None:
                done.append(ch)
            else:
                pct = 100.0 * (ch_total - ch_uncov) / ch_total if ch_total else 0.0
                pending.append(f"ch{ch} {pct:.0f}%")

        if uncov:
            pct = 100.0 * (total - uncov) / total if total else 0.0
            self.hard["alignment"].append(
                f"cobertura española {pct:.1f}% — {uncov} de {total} palabras sin alinear")
            self.hard["alignment"].append(
                f"{partial} de {len(self.verses)} versículos con palabras sin alinear")
            self.hard["alignment"].append("pendientes: " + ", ".join(pending))
            for _, line in sorted(worst, reverse=True)[:10]:
                self.hard["alignment"].append("  " + line)
            note = str(legacy_meta.get("note", ""))
            if "hand-refine" in note or "Gloss-seed" in note or "gloss-seed" in note:
                self.hard["alignment"].append(
                    "los capítulos pendientes siguen sobre la semilla «gloss-seed»")
        elif done:
            # Informational only — do not fail a clean hand PASS.
            print(
                f"  [info] capítulos alineados a mano al 100%: "
                f"{', '.join('ch' + str(c) for c in done)}"
            )

    # -- 6 ---------------------------------------------------------------
    def check_translation_base(self) -> None:
        header = self.text[: self.text.find("## ")]
        if "borrador preliminar" in header:
            self.debt["base"].append("el encabezado todavía dice «borrador preliminar»")
        per_ch: dict[int, int] = defaultdict(int)
        for label, pat in RV_MARKERS.items():
            hits = []
            for (c, v), t in sorted(self.verses.items()):
                for m in re.finditer(pat, t):
                    hits.append(f"{c}:{v} «{m.group(0)}»")
                    per_ch[c] += 1
            if hits:
                self.debt["base"].append(f"{label}: {len(hits)} — {', '.join(hits[:6])}"
                                         + (" …" if len(hits) > 6 else ""))
        if per_ch:
            spread = ", ".join(f"ch{c}={n}" for c, n in sorted(per_ch.items()))
            self.debt["base"].append(f"marcadores Reina-Valera por capítulo: {spread}")
        # Jehová (YHWH) and Señor (Adonai / אדני) may both appear when the source
        # uses both — that is faithfulness, not inconsistency. Only flag when a
        # single lemma is rendered both ways without a clear source split.
        # For Daniel we accept both names side by side.
        if self.book != "daniel":
            names = {n: sorted((f"{c}:{v}" for (c, v), t in self.verses.items()
                                if re.search(rf"\b{n}\b", t)),
                               key=lambda r: tuple(int(x) for x in r.split(":")))
                     for n in ("Jehová", "Señor")}
            present = {n: refs for n, refs in names.items() if refs}
            if len(present) > 1:
                detail = "; ".join(f"«{n}» en {len(refs)} ({', '.join(refs[:4])}…)"
                                   for n, refs in present.items())
                self.debt["base"].append(f"Nombre divino inconsistente: {detail}")

    # -------------------------------------------------------------------
    def run(self, allow_debt: bool) -> int:
        self.check_structure()
        self.check_corruption()
        self.check_accents()
        self.check_capitals()
        self.check_alignment()
        self.check_translation_base()

        print(f"LBF gate — {self.book} ({len(self.verses)} versículos)\n")
        order = ["structure", "corruption", "accents", "capitals", "alignment"]
        for name in order:
            items = self.hard.get(name, [])
            status = "PASS" if not items else f"FAIL ({len(items)})"
            print(f"  [{status:>9}] {name}")
            for line in items[:25]:
                print(f"              {line}")
            if len(items) > 25:
                print(f"              … {len(items) - 25} más")
        items = self.debt.get("base", [])
        print(f"  [{'DEBT' if items else 'PASS':>9}] translation base")
        for line in items:
            print(f"              {line}")

        hard_fail = any(self.hard.get(n) for n in order)
        debt_fail = bool(items) and not allow_debt
        print()
        if hard_fail:
            print("VEREDICTO: BLOQUEADO — corrige el texto y la alineación antes de Observer/Compiler.")
        elif debt_fail:
            print("VEREDICTO: BLOQUEADO por deuda de traducción "
                  "(usa --allow-redraft-debt para correr solo los controles duros).")
        else:
            print("VEREDICTO: LISTO — el texto LBF y la alineación española están limpios.")
        return 1 if (hard_fail or debt_fail) else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--book", default="daniel")
    ap.add_argument("--testament", default="ot", choices=["ot", "nt"])
    ap.add_argument("--allow-redraft-debt", action="store_true",
                    help="report Reina-Valera survivals without failing the gate")
    args = ap.parse_args()
    return Gate(args.book, args.testament).run(args.allow_redraft_debt)


if __name__ == "__main__":
    sys.exit(main())
