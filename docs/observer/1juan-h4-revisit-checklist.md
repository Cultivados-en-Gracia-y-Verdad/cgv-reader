# 1 Juan — Observer H4 revisit checklist

Source: Arquitecto Step 0 (skeleton `(4)`, 2026-07-28 02:51).  
Progress: `data/lbf/nt/1juan-progress-filled-2026-07-27.json`  
Import: `~/Downloads/cgv-reader-1juan-progress-h4-fixes-pass3-2026-07-28.json`

**Pass 4 applied** — import  
`~/Downloads/cgv-reader-1juan-progress-h4-fixes-pass4-2026-07-28.json`  
Hard-refresh → **Generate** → `/estructura`.

---

## Pass 4 (skeleton 5 leftovers)

| Status | Issue | Fix |
|---|---|---|
| [x] | 3:1 *porque* as H3; *conoce* only in `+` | Fake root `3:1:13` removed; real finite `3:1:19` γινώσκει = root; `3:1:23` ἔγνω = reason |
| [x] | 2:21 *he escrito porque no conozcan* | Root span = *No les he escrito*; ὅτι lines as content |
| [x] | 5:2–3 *mandamientos* | ποιῶμεν → *hacemos*; merged; 5:3 reason → *conocemos* |
| [x] | 3:12 duplicate *asesinó* | Split: narrative vs rhetorical question |
| [x] | 5:16 *digo* | Merged into *Hay pecado…; no digo* |
| [x] | 5:17 *hay pecado* | Merged into *Toda injusticia es pecado y hay…* |

---

## Pass 3 (Arquitecto blockers from skeleton 4)

| Status | Ref / H4 | Fix |
|---|---|---|
| [x] | 3:1 *porque no lo conoció* | Demoted → reason of *el mundo no nos conoce*; γινώσκει/ἔγνω anchors |
| [x] | 3:9 *pecado* | ποιεῖ → *practica*; full span |
| [x] | 4:16 *él* | Deleted elided μένει fragment |
| [x] | 2:16 *mundo* | Final ἐστίν merged into reason frame |
| [x] | 2:19 *nosotros* | μεμενήκεισαν → *permanecido*; purpose → under *Salieron* |
| [x] | 2:23–24 *Padre* / *principio* | Merged; μενέτω/μενεῖτε → *permanezca* / *permanecerán* |
| [x] | 2:27 *necesidad* | ἔχετε → *tienen*; merged into *no tienen necesidad* |
| [x] | 3:2 *Dios, y todavía* | ἐσμεν → *somos*; trimmed *somos hijos de Dios* |
| [x] | 3:14 *Nosotros* | οἴδαμεν → *sabemos*; full *Nosotros sabemos que…* |
| [x] | 3:22 *agrada* | Merged into reason *porque guardamos…* |
| [x] | 3:23–24 *otros* | ἀγαπῶμεν → *amemos*; merged; content under mandamiento |
| [x] | 4:12 *Dios* / *nosotros* | τεθέαται → *visto*; merged *en nosotros*; condition → permanece |
| [x] | 4:14–15 *visto* | One root *hemos visto y testificamos* + ὅτι content |
| [x] | 4:19 *Nosotros* | ἀγαπῶμεν → *amamos* |
| [x] | 5:10 *mentiroso* | πεποίηκεν → *hecho*; full *lo ha hecho mentiroso* |
| [x] | 5:12 *vida* | final ἔχει → *tiene* |
| [x] | 5:18 *toca* / 5:19 *maligno* | Merged into parent units; κεῖται → *yace* |

---

## Pass 2 (still good)

Writing-purpose trajectory: `1:3 · 1:4 · 2:1 · 2:26 · 5:13`.  
Prior fragment fixes: 2:1 *cosas*, tropiezo/va/eso/mismo/todo/seremos/él (3:17).

---

## Afterward

1. Import pass3 JSON.
2. Hard-refresh Reader (alignment reload).
3. **Generate** → new skeleton.
4. `/estructura` — expect far fewer single-token H4s; short verbs (*sabemos*, *sepan*) may remain OK.
