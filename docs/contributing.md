# Contributing / codebase guide

A fast on-ramp for anyone (human or model) picking up Glimmer.

## What the app is

A browser tool for "hover-light" effects. You give it two images of one scene —
one with the lights **off**, one with them **on** — plus an SVG holding one path
per toggleable region (a window). The app composites the lit image through those
regions, and a mode decides which are lit: **Random** (scatter, click to
scramble) or **Interactive** (a circle chases the cursor).

SvelteKit + Svelte 5 **runes**, client-rendered (`+page.js` sets `ssr = false`),
plain JS with JSDoc — no TypeScript.

The shell (sidebar layout, `app.css` tokens, `components/ui/*`, theme handling)
is lifted from the sibling `particle-playground` project so the two feel alike.
Everything below the shell is Glimmer's own.

## Run / test / build

```bash
npm run dev     # vite dev server
npm test        # vitest run (68 tests)
npm run build   # the real "does it compile?" gate for .svelte files
```

- There is **no** `svelte-check`; `npm run build` is the compile gate.
- **Vitest deliberately skips the SvelteKit vite plugin** (it crashes vitest at
  startup) — see `vitest.config.js`. Tests therefore only import plain logic:
  `svg/`, `light/`, `geometry/`, `utils/`. They do **not** import `.svelte`
  components or `*.svelte.js` runes modules. Keep testable logic in plain `.js`
  so it stays covered. The environment is `jsdom` because the SVG importer needs
  `DOMParser`.

## The data model

A **region** is one toggleable area. `svg/regions.js` produces them:

```js
{ id, label, d, transform, centroid: {x, y}, bounds, threshold }
```

- `d` is the **original** path data, never rewritten.
- `transform` is every ancestor `<g transform>` flattened into one matrix
  string (or `null` when there is nothing to apply). It goes straight onto the
  rendered element, which is why `d` can stay untouched.
- `centroid` is already in root coordinates — the matrix has been applied.
- `threshold` is a random number in `[0,1)` fixed at import. It is what makes
  the interactive mode's soft edge hold still (see below).

Alongside them, `AppState.frame` is the coordinate space everything lives in:
the SVG's `viewBox` when there is one, otherwise the base image's own pixels so
a lone image still previews.

## Coordinate systems (learn these)

- **frame space** — viewBox units. Region geometry, the circle's centre, and
  its radius are all stored here.
- **screen space** — CSS px inside the stage container.

`geometry/transform.js` converts. The view transform is a fit-to-container base
(`computeFitTransform`, with `settings.fitPaddingPx` of breathing room) times
the user's `zoomFactor`/`panX`/`panY`, so resetting the view (**R**) is just
clearing the latter.

The radius slider is a **share of frame width**, not an absolute — so it means
the same thing whatever size image is loaded (`AppState.radius` does the
conversion).

## Rendering (`components/stage/Scene.svelte`)

One `<svg>` per stage, holding the base `<image>`, then the active `<image>`
composited through a `<mask>` of the region paths at per-region `fill-opacity`.

Two decisions worth not undoing:

- **One image through one mask**, rather than a path per region each filled with
  its own copy of the image: cost stays flat as the region count climbs, while
  per-region `fill-opacity` still gives each window its own state and its own
  CSS fade.
- **The view transform is applied *inside* the mask and inside the masked
  group — never on the element carrying `mask=`.** Whether an element's own
  transform also transforms its mask is a detail browsers have disagreed on;
  keeping both sides in the SVG's root coordinates makes the question moot, so
  pan and zoom can't slide the lights off their windows.

Mask paths are filled pure white, so mask luminance depends only on the alpha
`fill-opacity` sets — no colour-space question.

`Scene` renders nothing until all three pieces are in (`AppState.hasScene`) —
a base image with no regions over it just looks broken, so the stage shows the
next-step prompt instead.

**Debug outlines** (`app.showPaths`) draw a stroked copy of every region above
the lit layer: red when dark, blue when lit, at `app.pathWidth`. They carry
`vector-effect="non-scaling-stroke"`, which is the whole point — the stroke
holds its width in *screen* px at any zoom, so it stays a legible hairline
while getting thinner relative to the image as you zoom in.

## Lighting (`light/`)

Both modes produce the same thing: `AppState.levels`, a level per region,
index-aligned with `app.regions`. It is `$state.raw` because it is replaced
wholesale (every frame, in interactive mode) and never mutated in place.

**Random** (`light/random.js`) — each region gets a roll from the current seed;
lit when the roll is under Lit Chance. Rolls stay fixed until the next scramble
(a new seed), so the slider reads as a *density* control: raising it lights more
windows instead of reshuffling which ones are on. `Stage.svelte` keeps this in
step with a plain `$effect`.

Random's auto-scramble is a plain `setInterval` — the pattern only has to
change on a beat, so it needs no frame loop.

**Interactive** (`light/interactive.js`) — a `requestAnimationFrame` loop in
`Stage.svelte`, alive only while that mode is showing:

1. `easeToward(circle, cursor, tau, dt)` — the exponential form, *not* a fixed
   per-frame fraction, so the lag feels identical at 60 Hz and 144 Hz.
2. `interactiveLevels(...)` — lit inside the radius; `smoothing` carves a
   falloff band in from the rim where a region is lit only if its depth into
   the band clears **its own `threshold`**. Because that number is fixed at
   import, each window switches on at its own depth as the circle sweeps over
   and then stays on — a settled scatter. `twinkle` draws a fresh number every
   frame instead, turning the same band into a shimmer.
3. `levelsMatch` skips the state write when nothing changed, so a still cursor
   doesn't re-render every region 60 times a second.

**Waves** (`light/waves.js`) — its own rAF loop, on the same shape. Every
direction reduces to one problem: `waveCoordinates` gives each region a `u` in
`[0,1]` along the travel axis (radial directions measure from a centre point out
to whichever frame corner is furthest from it, so 1 always means the last region
the wave reaches — which keeps `u` inside 0-1 however far `waveCentreX/Y` drags
that point off the middle), and the band is a repeating window sliding
along `u`. `wavelength` is the gap between crests, `band` the lit share of each
one, and `softness` dithers both edges against the same fixed per-region
threshold — so the wavefront's scattered edge travels with it rather than
shimmering in place. The coordinates are `$derived`, not recomputed per frame;
only the scene and the direction change them.

Both loops take their step from `frameDelta` (`light/clock.js`), which is
extracted precisely so the stepping rules — first frame, clamped long gap,
clock running backwards — are unit-testable. A browser's rAF clock is not.

## SVG import (`svg/`)

- `path-data.js` — tokenizer + flattener for `d`. Handles every command
  (`M L H V C S Q T A Z`, absolute and relative), implicit repeated commands,
  separator-less negatives, exponent notation. Curves flatten to polylines;
  arcs go through the spec's endpoint-to-centre parametrisation. `centroidOf`
  is a signed-area centroid — a bbox centre can land *outside* an L-shaped
  region, and the whole "is this window in the circle?" test hangs off it.
- `matrix.js` — `transform` attribute parsing and composition.
- `shapes.js` — `rect`/`circle`/`ellipse`/`polygon`/`polyline` → path data, so
  the rest of the app only ever sees paths.
- `regions.js` — walks the document in order, skipping non-rendered subtrees
  (`defs`, `clipPath`, `mask`, `symbol`, `marker`, `pattern`) and
  `display="none"`, accumulating transforms as it goes. Falls back from
  `viewBox` to `width`/`height` to the union of shape bounds (warning only on
  that last guess).

Anything unparseable throws with a message the sidebar shows verbatim.

## State (`state/app.svelte.js`)

One `$state` class, handed down via Svelte context (`createAppState` /
`getAppState`). Components read and mutate it directly. There is no undo and no
persistence beyond the theme — `state/theme.svelte.js` owns that separately
because it is a device preference, not scene state.

Object URLs from uploads are revoked when replaced or cleared. Images that came
from a `File` are the only ones revoked, so a future bundled demo pointing at a
static asset URL won't be broken by it.

## Demos (`config/demos.js`)

A bundled scene lives in `static/demos/<slug>/` under fixed names —
`default.png`, `active.png`, `paths.svg`, `settings.json` — so `demos.js` only
carries a slug and a label per demo. Static assets can't be listed at runtime,
so **a new demo needs a line there as well as its folder**.

`settings.json` holds only what differs from `defaults`;
`withDefaults` (in `config/settings.js`) fills in the rest, and ignores keys
that aren't settings. `AppState.loadDemo(slug)` fetches the four files and
applies them, resetting every setting the file doesn't name — a demo describes
a whole look, so it lands the same way whatever was dialled in before it. It
reports failure through `demoError` instead of throwing, because both callers
(the Demos button and the `?demo=` deep link in `App.svelte`) carry on either
way.

Demo images go through `setImageUrl`, not `setImage`: they have no `File`, which
is exactly what stops `clearImage` revoking a static asset URL.

While no image is loaded, the sidebar shows only Demos, Images, Regions, and
Appearance — the effect sections would be settings for nothing. Appearance stays
because it carries the theme, which is a device preference rather than scene
state.

## Adding a control — the checklist

1. `config/settings.js`: the slider range, plus a starting value in `defaults`.
   Never inline a range in a component.
2. `state/app.svelte.js`: a `$state` field (and a getter if it needs deriving).
3. The relevant `components/sidebar/*Section.svelte`: the control itself, using
   the `ui/` primitives (`Slider`, `Toggle`, `SegmentedToggle`, `Section`).
4. `light/*.js`: read it in the pure function, not in the component.
5. A test in the matching `*.test.js`.

## File map

```
components/App.svelte             state + layout
components/stage/Stage.svelte     pan/zoom, pointer, the rAF loop, drag-and-drop
components/stage/Scene.svelte     the svg: images + mask + region paths
components/stage/CursorCircle.svelte  optional debug outline of the circle
components/sidebar/*              one Section per control group (incl. Demos, Debug)
components/toolbar/FloatingToolbar.svelte  scramble / reset view / collapse
components/ui/*                   primitives (Select is Glimmer's own)
config/settings.js                every range and default
config/demos.js                   the bundled demos, and where their files live
light/{random,interactive,waves}.js  the three modes, as pure functions
light/{clock,rng}.js              frame stepping, seeded RNG
svg/{regions,path-data,matrix,shapes}.js  SVG -> regions
geometry/transform.js             frame <-> screen
state/{app,theme}.svelte.js       the store, and the theme preference
```

## Gotchas

- Don't name a component prop `slot` — Svelte's legacy slot API claims that
  attribute name. `ImageSlot` takes `field` instead.
- `levels` is `$state.raw`; assign a new array, never mutate in place, or the
  scene won't update.
- **Floating controls inside the stage must carry `data-stage-ui`** (the toolbar
  does). Without it the stage starts a pan on the press and takes pointer
  capture, which retargets the following `pointerup` — and a click whose down
  and up disagree is never dispatched, so the button silently does nothing.
  Anything non-interactive floating over the stage should just be
  `pointer-events: none`.
- Keyboard: **R** refits the view, **⌘/Ctrl + \\** collapses the sidebar, and
  holding **Space** turns a drag into a pan. All of them are ignored while a
  text field has focus. Collapsing also hides the floating toolbar — the stage
  goes fully chrome-free — so **⌘/Ctrl + \\** is the only way back in.
