# Book definitions — authorial use in this book

Repeated words show that a surface **returns**. Book definitions ask a different
question: *what does this author mean by that word after the letter is read?*

Never lexicon. Never Gospel-of-John or Paul as authority for 1 John’s sense.
Never auto-written definitions (“Light = truth”).

---

## Philosophy

Every biblical author develops vocabulary inside the book. The student gathers
**use** systematically; the software proposes candidates the eye might miss.

| Ask | Do not ask |
|---|---|
| What does John mean by *luz* after five chapters? | What does φῶς mean in BDAG? |
| Where does this letter equate, contrast, or locate the term? | What does John 1 mean by light? |

Book definitions are a **prerequisite layer** before confident Movement / H2 naming.

---

## Interaction

1. **Investigate** (user-triggered) — seed from repeated-word inventory or typed surface.
2. **Propose** — related surfaces in this book + candidate definitional hits.
3. **Confirm / dismiss** — student builds a dossier; software never names the sense.
4. **Working definition** — blank student prose: what this author means in *this* letter.
5. **Reuse** — glossary of investigated terms; Movement may link when a verse is in a confirmed hit (no auto gloss).
6. **Author’s use collage** — for confirmed hits, pull the *pertinent* stretch of each
   passage in this order:
   1. **Structure clause span** that carries the seed / related surface (prefer equative
      / “andar|estar en …” signal, then tighter span);
   2. else short verse whole / sentence / window from LBF verse text.
   List them in reading order with surfaces highlighted; badge `clause` vs `verse`.
   Mirror a compact “Gathered use” next to the working-definition box. Counts by kind +
   verse chain stay as inventory chrome. Never a composed sense.

---

## Proposal kinds

Related surfaces (LBF Spanish, folded):

- Same stem / shared prefix with the seed (min length 3).
- Fixed **proposal partners** only (not themes): luz↔tinieblas, amor↔aborrece/odio, vida↔muerte, verdad↔mentira, mundo↔padre.

Definitional hit heuristics (verse text):

| Kind | Signal |
|---|---|
| `equative` | `es` / `son` near the term (e.g. Dios es luz) |
| `contrast` | Same verse co-occurs with a proposal partner |
| `use` | Term (or confirmed related surface) appears; weaker rank |
| `other` | Student-classified when confirming |

Also: “andar / estar en …” + term; writing-purpose clauses that mention the term (when available).

Rank: equative > contrast > use. Cap proposals (≈40).

---

## Storage

```text
the-reader:spanish-clause-builder:{slug}:book-definitions:v1
```

Per term: seed, confirmed related surfaces, hits (verseKey, kind, snippet, note?, confirmed), workingDefinition.

Derived proposals are not stored until the student confirms or dismisses into the dossier.

---

## Non-goals

- Auto-composed definition paragraphs
- Cross-book or Gospel sense banks
- Greek-lemma clustering (v1 is LBF Spanish)
- Compiler slide emit of definitions (Generate appendix `## Definiciones (taller)` —
  confirmed hits + student working definition; never auto-composed lexicon sense)
- Theme titles or section names from a term
