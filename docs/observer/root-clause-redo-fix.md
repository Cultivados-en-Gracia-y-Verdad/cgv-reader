# Missing Redo Control on Independent (Root) Clauses

Found while spot-checking the real Titus skeleton in the app.

## The bug

Clauses classified as **description**, **content**, or **frame** each have a way to revisit
and change that classification. Clauses classified as **independent/root** (all three
questions — describesNoun / isWhatWasExpressed / tellsWhenOrIf — answered "no") have **no
redo or revise control at all.** Once a clause lands as root, there is currently no way to
go back and re-answer the three questions for it.

This matters more than a normal missing-affordance bug, because **root is the default
outcome** — it's what a clause becomes when nothing else applies. If a student answers even
one of the three questions wrong, the clause silently locks in as independent with no path
to correct it. Every other outcome is revisable; the most common one currently isn't.

## Likely cause

The redo/revise control is probably conditioned on the clause having a stored `relation`
value other than root (i.e. having a `parentClauseId` or `describedNounSpan` set) — since
those are the clauses that show something to click into or reattach. A root clause has no
parent and no span, so whatever check gates the redo control's visibility likely treats "no
attachment data" as "nothing to revise," rather than as its own valid, revisable state.

## Fix

Every clause that has been reviewed — root included — needs a visible way to redo its
classification. Concretely: the redo control's visibility should be based on **"has this
clause been reviewed at all"** (i.e. all three questions have a stored answer, even if all
three are "no"), not on **"does this clause have a parent/span attached."** Clicking redo on
a root clause should reset its three stored answers and re-open Q1, exactly the same
mechanism already working for description/content/frame clauses — root clauses just need to
be included in whatever check currently excludes them.

## Scope check worth doing at the same time

The person who found this only tested it on dependent-clause classification (Q1/Q2/Q3).
Worth checking whether the same gap exists anywhere else reviewed items can end up in a
"default" or "nothing selected" state without an attachment — e.g. mood marking, or
participle sorting (an unattached substantival participle has no span or riding-clause
either) — since the same root cause (gating revise-ability on "has attachment data") could
be hiding the same bug in more than one place.
