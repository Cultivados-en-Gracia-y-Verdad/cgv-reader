# cgv-reader — TODO

## Open

1. **Observer: tighten clause spans so leftover words are not orphans (Fix B)**  
   Follow-up to Compiler Fix A. When Structure spans omit words that belong inside a clause, Compiler still emits them as `+` (now indented under the nearest preceding clause). Widening/saving spans in Observer is the lasting fix.

2. **List phrases that aren’t connected so none are missed**  
   Surface every unconnected `+` phrase (gaps / verbless runs not inside a clause span) in a clear checklist — generation flags and/or a Compiler panel — so writers can confirm nothing scriptural was dropped or left dangling without review.

3. **Observer: infinitive find-step (students mark first)**  
   Compiler already emits mechanical `*` notes for infinitives from MorphGNT mood N. Add an Observer brick/step so students can find/confirm infinitives before Generate, instead of C only listing them from morphology.

4. **Observer: switch Greek spine from MorphGNT to TR (LBF books)**  
   LBF is TR-based; Translator already loads Scrivener 1894 TR spines for Tito + 1 Pedro. Reader Observer still shows MorphGNT/SBL, which creates false mismatches (e.g. TR-only Ἰησοῦ).  
   - **⚠️ Premise needs re-checking — LBF 1 Juan is eclectic, not TR-based.** It follows TR at 1:4 (*su gozo*, ὑμῶν), 1:7 (*Jesús Cristo*, +Χριστοῦ) and 5:13 (second ἵνα clause), but the **critical** text at 2:7 (*Amados* = Ἀγαπητοί, not TR Ἀδελφοί), 2:20 (*todos saben* = πάντες, not TR πάντα), 3:1 (*y lo somos* = καὶ ἐσμέν, absent in TR), 4:3 (*no confiesa a Jesús*, TR is longer) and **5:7–8 (no Comma Johanneum)**. A blanket TR spine would create new mismatches at every one of those. Audit each LBF book's base text before migrating.  
   - **Not a UI rewrite** — Mark/Structure patterns stay; hard parts are data + ids.  
   - **Biggest cost:** migrate or reset saved progress (`finiteVerbId` / brick marks / clause spans keyed as Morph `chapter:verse:token`).  
   - **Also:** wire Robinson/TR morph into Reader (replace MorphGNT+BLE chapter files for LBF books); recompile alignment as TR-token → LBF; decide Compiler occurrences (keep Morph search vs TR data).  
   - **Path:** finish 1 Pedro on the current bridge → TR spine in Reader for LBF books → explicit Tito migrate-or-reset → later whole NT once spines exist.  
   - See `docs/observer/lbf-reverse-interlinear.md` (“Why MorphGNT stays”).

5. **Reader: reading-only outline view (Version A)**  
   Add a **read-only** view in Reader that presents Scripture the same way the Current-vs-A outline tests did — for reading/teaching preview, not for editing Observer or generating manuals.  
   - **Layout:** H3 = clause id (`1 Juan 1:9:7`); H4 = independent claim; dependents nested under.  
   - **Packaging D:** condition / lead-in after `###`, before `####`, last line of package closes with `… ⤵`.  
   - **Source:** same independence + `whenIf` tree Compiler now emits (Version A in `compiler-skeleton.ts` / spec).  
   - **Not:** Writer commentary, slide rehearsal, or a second Compiler — just navigate/read the clause outline.  
   - **Tests / sketch:** `~/Downloads/1juan-H2-*-Current-vs-A.md` (1:5–2:2, 2:3–2:11, 2:12–2:17).

6. **Arquitecto: dual MD outputs (locked design)**  
   Compiler → one Version A MD. Arquitecto → **two** files after H1/H2 naming:  
   - **Outline view** (`{libro}-outline.md`) — clean H1/H2 + H3/H4 Scripture outline (log / beautiful reading view). **Escriba does not depend on it.**  
   - **Manual skeleton** — Compiler MD with H1/H2 filled — **Escriba’s** input for `>`.  
   Skill: `cgv-structure-architect` (Role + Deliverable + Boundaries). Agent: `arquitecto.md`.

7. **1 Juan restart audit (in progress)**  
   - [x] Fix progress I/O: export/import **only** the active book’s keys (was merging hardcoded Titus `PROGRESS_KEYS` into every book’s export).  
   - [x] Strip Tito keys from existing 1 Juan progress JSON files.  
   - [ ] Re-import clean 1 Juan JSON in Reader and verify counts (v3 / observations / marks).  
   - [ ] Compiler Generate for 1 Juan — Version A H3 clause-ids + D packing smoke-check.  
   - [ ] Full Observer audit (independence / whenIf parents) before Arquitecto.

8. **Observer: ὃς mis-tagged as connector at 1 Juan 3:17**  
   Compiler emits `* *Pero* (ὃς)[^conn]` in unit `1 Juan 3:17:28`. Greek is ὃς δʼ ἂν ἔχῃ — *Pero* renders **δέ**, not ὃς, and ὃς belongs with *el que*. The Spanish word and the Greek word are crossed.
   - **Scope:** the only non-ἐάν use of `[^conn]` in 1 Juan (the other 19 are all ἐάν).
   - **Why it surfaced now:** the manual's Apéndice A now defines `[^conn]` as ἐάν + subjunctive (third-class condition), so this one tag inherits a definition that does not fit it.
   - **Consider a separate tag:** ὃς ἂν + subjunctive is an indefinite relative with conditional force («cualquiera que tenga»), so it is neither a plain connector nor `[^rel]`.
   - **Fix upstream** in the observation JSON / Compiler tagging — not in the manual, where outline tags are locked.

9. **Assembly: verb-form label rename runs half-way (`part`/`inf` → `P`/`I`)**  
   Compiler emits `[^part]` / `[^inf]`; finished manuals carry `[^P]` / `[^I]` (see `curriculo/25.1Pedro/slides/manual.md`). 1 Juan was a hybrid — `[^part]` + `[^I]` — so the infinitive got renamed and the participle did not.
   - **Patched by hand** in `curriculo/20.1Juan/1-juan-manual1.31.md` (59 uses + the Apéndice B definition). Its tag set now matches 1 Pedro exactly: `I P alla conn de dioti e ei gar hina hos hote hoti kai oun rel`.
   - **Regeneration will undo it** — Compiler still emits `[^part]`, so any fresh Generate reintroduces the hybrid.
   - **Pick one canonical pair and apply it in a single place:** either Compiler emits `P`/`I` directly, or the assembly step renames both labels together.
   - Only the verb-form labels are affected; connectors stay lowercase words (`kai`, `de`, `hoti`…) in both books, and `rel` stays lowercase too.

10. **BLOCKER for #4 — `TR1894/tr1894.txt` is missing most single-letter words**  
   The Scrivener text-only file drops the article and short relatives/copulas. `Juan 1:1` reads *Ἐν ἀρχῇ ἦν λόγος, καὶ λόγος ἦν πρὸς τὸν Θεόν, καὶ Θεὸς ἦν λόγος* — **all four ὁ are gone**. `1 Juan 1:1` keeps only the capitalised `Ὃ` and loses the other three. `1 Juan 1:4` loses both `ἡ` and `ᾖ`.
   - **Scale:** 136,144 words in the file vs ~140,500 expected for the TR NT. Only **606** single-letter words survive book-wide (`ὁ` just 383, where a TR NT has thousands). Survivors skew capitalised/sentence-initial (`Ὃ`, `Ὁ`, `Ἡ`), so the loss looks positional, not random.
   - **Verified normalization-safe** (NFD-stripped comparison), so this is real data loss, not an NFC/NFD search artifact.
   - **Why it blocks #4:** switching the Reader/Observer spine to TR keyed on `chapter:verse:token` against this file would silently mis-number every token after each dropped word, and corrupt the LBF reverse-interlinear alignment.
   - **Do first:** re-extract from a clean Scrivener 1894 source and diff word counts per book before any spine migration or `HAND_TR_FIXES` work.

## Done

1. **Compiler: nest `+` phrases under the nearest preceding clause (Fix A)**  
   Unit outline walks a document-order timeline; each `+` inherits the indent of the nearest preceding `####` / `-` so phrases no longer jump to column 0 after nested notes.

2. **Compiler: infinitive data in Generate**  
   Infinitives from clause data (`infinitiveId`, morph mood N) emit as Observer-style `*` slides, attached to the clause span that contains the word (else nearest same-verse clause, else the verse’s `+` phrase).
