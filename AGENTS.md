

# CGV — agent entry point

Read `DATA_CONTRACT.md` before changing any data, import, export,
alignment, translation, approval, or dataset-loading code.

If a request conflicts with `DATA_CONTRACT.md`, stop and explain the conflict.
Do not work around it.

Never move, copy, regenerate, synchronize, or delete canonical data unless
the task explicitly names the source repository, destination repository,
migration phase, and validation procedure.

When uncertain which copy is authoritative, stop. Do not choose by timestamp,
file size, apparent completeness, or Git history alone.

Loaded on every agent call. Kept deliberately small; the standards live in linked files.

## Read before acting

This repo owns the **Reader, Observer and Compiler applications** and nothing else. It is a
read-only consumer of published `cgv-data` datasets.

The production method lives in another repo and is not duplicated here:

```
herramientas/CGV-curriculo/DOCUMENT_MAP.md   who owns which rule — read first
herramientas/CGV-curriculo/WORKFLOW.md       order, ownership, artifact chain
herramientas/CGV-curriculo/STATE_MODEL.md    gates, findings, release
herramientas/CGV-curriculo/MANUAL_STANDARD.md  markers, hierarchy, clearance
```

Book-specific artifacts — spec, blocks, state, skeleton, architecture, manual, reports — live
with the course in `curriculo/{NN.Curso}/`. **Never write a stage output into this repo.**

Read `DATA_CONTRACT.md` before changing any data, import, export, alignment, translation,
approval, or dataset-loading code. If a request conflicts with it, stop and explain the conflict.

## The four things that matter most

- **A script and a reading are two different witnesses. Neither is the gate alone.** If they
  disagree, the verdict is blocked. Never report a script PASS as a verdict.
- **No agent verifies its own claims.** Verification always belongs to a different agent than
  authorship.
- **Authority is enforced, not requested.** `scripts/check-authority.py` diffs before/after and
  fails any change outside your clearance. You do not get to explain yourself.
- **A manual is not complete because an AI says so.** It is complete when it satisfies its
  specification and passes every required gate. Default status is NOT RELEASED.

## Talk through reports, not through the manuscript

Write to `reports/{libro}/`. Read the reports, not the whole book. If you are handed a whole
book and your input should be a list of references, ask for the list.

Every finding quotes text and gives a reference. Zero findings is a claim that needs its own
evidence — say what you checked and how.

## Commands

```bash
python3 scripts/run-manual-checks.py --manual <manual.md> --lbf <source.md> --book <libro>
python3 scripts/check-authority.py --before <a.md> --after <b.md> --agent <agent>
python3 scripts/release-gate.py --manifest manifests/<libro>.json
```

- This is a consumer application.
- Never add or modify canonical LBF text or alignment.
- Never add Scripture repair, alignment generation, or publishing scripts.
- Read Scripture only through the shared version-aware cgv-data loader.
