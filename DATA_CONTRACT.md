# cgv-reader Data Contract

Status: normative  
Canonical architecture: `Biblia-LBF/docs/architecture/CGV_DATA_ARCHITECTURE.md`

## Purpose

`cgv-reader` owns the Reader, Observer, and Compiler applications. It is a read-only consumer of published `cgv-data` datasets. It does not author, approve, repair, align, or publish LBF.

## Owned data

- Application source code and UI assets.
- Dataset loading, validation, and caching code.
- App-only configuration and feature flags.
- User-created observations, notes, compiler gatherings, and local progress.
- Test fixtures that are minimal, clearly labeled, and not mistaken for canonical Scripture data.

## Input contract

- Production builds consume a pinned, immutable `cgv-data` version.
- Development may use a sibling `cgv-data` checkout or configured path, read-only.
- Reader, Observer, and Compiler must use the same version-aware data loader.
- Alignment views consume the alignment published with the selected LBF version.
- Unsupported schema versions fail clearly rather than being guessed or silently converted.
- Dataset provenance and version must be inspectable in diagnostics.

## Output contract

User work is separate from Scripture distribution data. Saved progress must identify:

- its own progress schema version;
- the dataset ID and version it was created against;
- stable verse or token IDs when referring to Scripture;
- migration behavior when a newer dataset version is selected.

User progress must never be committed into `cgv-data` or `Biblia-LBF`.

## Prohibited content and behavior

- Canonical or hand-maintained LBF text.
- Canonical or hand-maintained LBF alignment.
- Translation approval or review truth.
- Scripts that rebuild, repair, or author LBF alignment.
- Book-specific Scripture repair scripts.
- Direct writes to `cgv-data` or `Biblia-LBF`.
- Production dependence on unversioned local files.

Temporary migration code must be labeled, time-bounded, covered by parity tests, and removed when migration is complete.

## Pull-request gate

CI must reject new canonical-looking LBF data outside approved fixtures, direct writes to data repositories, bypasses of the shared loader, and production builds without a pinned dataset version.

