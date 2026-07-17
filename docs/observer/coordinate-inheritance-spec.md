# Coordinate Inheritance — Addition to the Clause Flow

Addendum to `skeleton-telos-spec.md`. Found while reviewing the real Titus skeleton: a genuine
hole in the Q1/Q2/Q3 design, not a bug in what's built — the three questions were never built
to handle this case, and need a check added before them.

## The gap

ἵνα τὰ λείποντα ἐπιδιορθώσῃ καὶ καταστήσῃς κατὰ πόλιν πρεσβυτέρους (Titus 1:5) — one ἵνα,
governing two coordinated subjunctive verbs, joined by plain καί. "Set right what was
unfinished" and "appoint elders in every town" are not two separate purposes — the second is
simply the second half of the same purpose clause, riding on the same ἵνα as the first.

Q1/Q2/Q3 only test whether a clause is dependent on its own terms — does it itself open with a
describing word, a content-verb, or a frame-particle. "Appoint elders" opens with plain καί,
which is none of those three things by itself, so all three questions correctly get answered
"no" for it in isolation — and it lands as an independent root. That's not a mistake in how the
questions were answered; it's a hole in what the questions were built to catch. Nothing
currently asks "is this clause simply riding alongside an already-dependent clause, sharing its
subordination, rather than being independent or dependent on its own terms?"

This will recur constantly, not just here — coordinated verbs sharing one ἵνα, one ὅτι, one εἰ,
joined by καί/δέ/ἤ, are common throughout the New Testament. Worth fixing at the root rather
than patching individual clauses by hand each time it comes up.

## The fix: a zeroth question, asked before Q1

Before Q1/Q2/Q3, ask: Is this clause joined by a plain coordinating word (καί, δέ, ἤ) to the
clause immediately before it, where that clause is already marked dependent?

- If yes: this clause inherits the previous clause's relation and parent wholesale — same
  relation type (description / content / frame), same `frameType` if applicable, same
  attachment point. Q1/Q2/Q3 are not asked at all for this clause; there's nothing to test,
  since it isn't making an independent grammatical claim of its own.
- If no: proceed to Q1/Q2/Q3 exactly as before. Most clauses will answer "no" here and fall
  through normally — this check only fires for the specific coordinate-sharing pattern.

Important boundary: this only applies when the immediately preceding clause is already
dependent. A plain καί joining two independent root clauses is ordinary coordination between
two separate assertions (itself an interesting connective-sequence data point, per the
root-clause-connectives work already flagged as a later phase) — it does not mean the second
one should inherit anything. Inheritance only fires when what's being coordinated is itself
already a subordinate clause sharing one dependency marker across multiple verbs.

## Immediate data fix needed

In the current Titus export: clause `1:5:12` ("καὶ καταστήσῃς κατὰ πόλιν πρεσβυτέρους" — "and
appoint elders in every town") is currently marked as an independent root clause. It should
instead inherit from `1:5:10` (the ἵνα purpose clause, "so that you would set right what was
unfinished"), which is itself attached to `1:5:3` ("I left you in Crete") with
`frameType: "purpose"`. Once fixed, `1:5:12` should carry the same `frameType: "purpose"` and
the same attachment to `1:5:3`, not stand alone at indent 0.

This also means the root-clause count (currently 28) should drop by at least one once this
check is implemented and run across the whole book — likely more, since this pattern isn't
unique to 1:5.
