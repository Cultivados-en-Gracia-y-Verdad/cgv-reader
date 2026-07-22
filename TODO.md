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
   - **Not a UI rewrite** — Mark/Structure patterns stay; hard parts are data + ids.  
   - **Biggest cost:** migrate or reset saved progress (`finiteVerbId` / brick marks / clause spans keyed as Morph `chapter:verse:token`).  
   - **Also:** wire Robinson/TR morph into Reader (replace MorphGNT+BLE chapter files for LBF books); recompile alignment as TR-token → LBF; decide Compiler occurrences (keep Morph search vs TR data).  
   - **Path:** finish 1 Pedro on the current bridge → TR spine in Reader for LBF books → explicit Tito migrate-or-reset → later whole NT once spines exist.  
   - See `docs/observer/lbf-reverse-interlinear.md` (“Why MorphGNT stays”).

## Done

1. **Compiler: nest `+` phrases under the nearest preceding clause (Fix A)**  
   Unit outline walks a document-order timeline; each `+` inherits the indent of the nearest preceding `####` / `-` so phrases no longer jump to column 0 after nested notes.

2. **Compiler: infinitive data in Generate**  
   Infinitives from clause data (`infinitiveId`, morph mood N) emit as Observer-style `*` slides, attached to the clause span that contains the word (else nearest same-verse clause, else the verse’s `+` phrase).
