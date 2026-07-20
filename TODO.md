# cgv-reader — TODO

## Open

1. **Observer: tighten clause spans so leftover words are not orphans (Fix B)**  
   Follow-up to Compiler Fix A. When Structure spans omit words that belong inside a clause, Compiler still emits them as `+` (now indented under the nearest preceding clause). Widening/saving spans in Observer is the lasting fix.

2. **List phrases that aren’t connected so none are missed**  
   Surface every unconnected `+` phrase (gaps / verbless runs not inside a clause span) in a clear checklist — generation flags and/or a Compiler panel — so writers can confirm nothing scriptural was dropped or left dangling without review.

3. **Observer: infinitive find-step (students mark first)**  
   Compiler already emits mechanical `*` notes for infinitives from MorphGNT mood N. Add an Observer brick/step so students can find/confirm infinitives before Generate, instead of C only listing them from morphology.

## Done

1. **Compiler: nest `+` phrases under the nearest preceding clause (Fix A)**  
   Unit outline walks a document-order timeline; each `+` inherits the indent of the nearest preceding `####` / `-` so phrases no longer jump to column 0 after nested notes.

2. **Compiler: infinitive data in Generate**  
   Infinitives from clause data (`infinitiveId`, morph mood N) emit as Observer-style `*` slides, attached to the clause span that contains the word (else nearest same-verse clause, else the verse’s `+` phrase).
