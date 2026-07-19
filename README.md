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
