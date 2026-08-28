# CGV Reader

**The product is The Reader.** This repo is the product home (formerly developed as `cgv-suite`).

| Piece | Role |
|-------|------|
| **Reader** | The app — ultra-clean Scripture reading + margin notes |
| **Observer** | Optional unlock — Reader-styled workshop around the text |
| **Compiler** | Teacher-only unlock — Scripture-only gathering; markdown export for Writer |
| **Writer** | Separate markdown editor (not in this repo) |

The earlier Titus research lab lives at `cgv-reader-old` (archived). Progress keys stay compatible so lab work still migrates.

## Requirements

- Node 20+
- Sibling checkout of [`cgv-data`](../cgv-data) (or set `CGV_DATA_PATH`)

## Develop

```bash
npm install
npm run dev
```

Dev server: [http://localhost:1423](http://localhost:1423)

### Automatic Reader catalog

`npm run dev` and `npm run build` run `scripts/update-reader-catalog.mjs` first. The
generator reads the configured, read-only `cgv-data` checkout and regenerates the Reader-owned
book catalog and asset lists. The whole New Testament remains available; an Old Testament book
is added automatically when `bibles/LBF/{book}.lbf.md` is published. Available Reader versions
and source-language spine support are derived from files present in that same dataset.

Run `npm run update:reader-catalog` directly to refresh the generated files, or
`npm run check:reader-catalog` to fail when they are stale. Set `CGV_DATA_PATH` when the dataset
is not the sibling `../cgv-data` checkout.

Production uses the immutable commit in `config/cgv-data-version.json`. A `repository_dispatch`
event named `cgv-data-published` may override it for one deployment by supplying
`client_payload.cgv_data_commit` as a full 40-character Git SHA. The generated commit is visible
in Reader preferences for provenance diagnostics.

## Public test site

GitHub Pages (deploys from `main`):

**https://cultivados-en-gracia-y-verdad.github.io/cgv-reader/**

Push to `main` rebuilds automatically. Manual redeploy: Actions → “Deploy Reader to GitHub Pages”.

## Observer Spanish surface

Observer uses **LBF (La Biblia Fiel)** for reverse/settled Spanish reading. Greek workstation ids stay on MorphGNT so lab progress migrates. See `docs/observer/lbf-reverse-interlinear.md`.

## Titus progress migration

This app uses the **same localStorage keys** as the archived lab (`cgv-reader-old`). Opening it in a browser that already has lab progress picks that work up automatically. You can also import a schema-1 progress JSON (Save/Load in Observer or Compiler).

## Layout

```
apps/reader/          # The Reader app (R + optional O/C)
packages/core/        # Capabilities + progress I/O
packages/observer/    # Domain extraction target
packages/compiler/    # Gathering extraction target
vendor/cgv-bible/     # NBLA / reference helpers
docs/                 # Curated product + method specs
```

## Native (later)

iOS/Android shell (Capacitor or Tauri) for drawing, highlighting, and richer note-taking — deferred until Reader’s web experience is solid.
