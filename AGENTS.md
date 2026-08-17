# CGV Reader — agent entry point

Read [`DATA_CONTRACT.md`](DATA_CONTRACT.md) before changing any data, import,
export, alignment, translation, approval, or dataset-loading code.

If a request conflicts with `DATA_CONTRACT.md`, stop and explain the conflict.
Do not work around it.

Never move, copy, regenerate, synchronize, or delete canonical data unless the
task explicitly names the source repository, destination repository, migration
phase, and validation procedure.

When uncertain which copy is authoritative, stop. Do not choose by timestamp,
file size, apparent completeness, or Git history alone.

## What this repository is

This is a **consumer application** — Reader, Observer and Compiler. It does not
author, approve, repair, align or publish LBF.

- Editable truth for LBF lives in `Biblia-LBF`.
- Published artifacts come from `cgv-data`.
- This repository owns application code, the data loader, and the user's own
  observations, notes and progress.

Canonical architecture: `Biblia-LBF/docs/architecture/CGV_DATA_ARCHITECTURE.md`.

## Hard rules

- Never add or modify canonical LBF text or alignment here.
- Never add Scripture repair, alignment generation, or publishing scripts.
- Read Scripture only through the shared version-aware `cgv-data` loader.
- Production builds consume a **pinned, immutable** dataset version. Development
  may use a sibling `cgv-data` checkout, read-only.
- Never write into `cgv-data` or `Biblia-LBF` from this repository.
- User progress stays here and is never committed into a data repository.
- Test fixtures are allowed when they are clearly labelled and minimal — under a
  `fixtures/` directory and no larger than 64 KiB. Above that it is a data copy
  wearing a fixture label.
- Unsupported dataset schema versions fail loudly. Never guess, never silently
  convert.

## Read before acting (manual production)

1. **[`WORKFLOW.md`](WORKFLOW.md)** — the universal production standard.
   Authority, markers, hierarchy, content rules, verification gates, release.
   Never book-specific.
2. **`specs/{libro}.md`** — the specification for the book you are working on.
3. **`manifests/{libro}.json`** — its machine-readable contract.

If a rule you need is not in one of those three, it is not a rule yet. Ask; do
not invent it.

## The four things that matter most

- **A script and a reading are two different witnesses. Neither is the gate
  alone.** If they disagree, the verdict is blocked. Never report a script PASS
  as a verdict.
- **No agent verifies its own claims.** Verification always belongs to a
  different agent than authorship.
- **Authority is enforced, not requested.** `scripts/check-authority.py` diffs
  before/after and fails any change outside your clearance. You do not get to
  explain yourself.
- **A manual is not complete because an AI says so.** It is complete when it
  satisfies its specification and passes every required gate. Default status is
  NOT RELEASED.

## Talk through reports, not through the manuscript

Write to `reports/{libro}/`. Read the reports, not the whole book. If you are
handed a whole book and your input should be a list of references, ask for the
list.

Every finding quotes text and gives a reference. Zero findings is a claim that
needs its own evidence — say what you checked and how.

## Commands

```bash
python3 scripts/check-data-contract.py
python3 scripts/run-manual-checks.py --manual <manual.md> --lbf <source.md> --book <libro>
python3 scripts/check-authority.py --before <a.md> --after <b.md> --agent <agent>
python3 scripts/release-gate.py --manifest manifests/<libro>.json
```

`check-data-contract.py` is read-only. It fails on any violation that is not
already listed in `.data-contract-baseline.json` — the problems that existed when
the check was introduced. That baseline is large on purpose: this repository
currently holds canonical data and repair scripts that belong elsewhere. Shrink
the list; never grow it.

Do not edit data to make a check pass. If a check is wrong, fix the check and say
so in the pull request.
