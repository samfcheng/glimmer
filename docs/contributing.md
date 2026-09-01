# Contributing / codebase guide

A fast on-ramp for anyone (human or model) picking up Glimmer.

## What the app is

A browser tool for "hover-light" effects. You give it two images of one scene —
one with the lights **off**, one with them **on** — plus an SVG holding one path
per toggleable region (a window). The app composites the lit image through those
regions, and a mode decides which are lit: **Random** (scatter, click to
scramble), **Interactive** (a circle chases the cursor), **Waves** (a lit band
travels across), **Music** (the scene is lit by an audio file), or **Animation**
(a sequence of steps, played in order).

SvelteKit + Svelte 5 **runes**, client-rendered (`+page.js` sets `ssr = false`),
plain JS with JSDoc — no TypeScript.

The shell (sidebar layout, `app.css` tokens, `components/ui/*`, theme handling)
is lifted from the sibling `particle-playground` project so the two feel alike.
Everything below the shell is Glimmer's own.

## Run / test / build

```bash
npm run dev     # vite dev server
npm test        # vitest run (252 tests)
npm run build   # the real "does it compile?" gate for .svelte files
```

- There is **no** `svelte-check`; `npm run build` is the compile gate.
- **Vitest deliberately skips the SvelteKit vite plugin** (it crashes vitest at
  startup) — see `vitest.config.js`. Tests therefore only import plain logic:
  `svg/`, `light/`, `audio/analysis.js`, `geometry/`, `utils/`. They do **not** import `.svelte`
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
  per-region `opacity` still gives each window its own state and its own CSS
  fade.
- **The view transform is applied *inside* the mask and inside the masked
  group — never on the element carrying `mask=`.** Whether an element's own
  transform also transforms its mask is a detail browsers have disagreed on;
  keeping both sides in the SVG's root coordinates makes the question moot, so
  pan and zoom can't slide the lights off their windows.

Mask paths are filled pure white, so mask luminance depends only on the alpha
the opacity sets — no colour-space question.

**Region padding** (`app.regionPaddingPx`) grows each mask path by a white
`vector-effect="non-scaling-stroke"` stroke of twice that width, so only its
outer half lands outside the path. Some of it is on by default because two
regions sharing an edge each cover roughly half of the boundary pixel, and half
composited over half is 75%, not 100% — an unlit seam of base image along every
shared edge. Growing both sides past the seam fills it, and *screen* px keeps
the fix the same size as the artefact at any zoom and on an SVG of any scale.
Turned up, it also closes real gutters between regions. The level rides on
`opacity` rather than `fill-opacity` precisely because of this stroke: element
opacity composites fill and stroke as one group, so a half-lit region has no
brighter rim where the stroke's inner half doubles up on the fill.

`Scene` renders nothing until all three pieces are in (`AppState.hasScene`) —
a base image with no regions over it just looks broken, so the stage shows the
next-step prompt instead.

**Debug outlines** (`app.showPaths`) draw a stroked copy of every region above
the lit layer: red when dark, blue when lit, at `app.pathWidth`. They carry
`vector-effect="non-scaling-stroke"`, which is the whole point — the stroke
holds its width in *screen* px at any zoom, so it stays a legible hairline
while getting thinner relative to the image as you zoom in.

## Lighting (`light/`)

Every mode produces the same thing: `AppState.levels`, a level per region,
index-aligned with `app.regions`. It is `$state.raw` because it is replaced
wholesale (every frame, in the four animated modes) and never mutated in
place.

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

**Music** (`light/music.js` + `audio/`) — the scene is lit by a playing audio
file. Four layers, split along the line the rest of the codebase draws between
pure logic, browser APIs, and reactive state:

```
audio/engine.js       AudioContext, <audio>, two analyser nodes   (untestable)
audio/analysis.js     onsets, band energy, range, envelope, triggering (pure)
light/music.js        the four visualisers                        (pure)
state/audio.svelte.js the loaded track and its transport          (runes)
```

The graph is `<audio> → MediaElementSource → upmix → { destination, beat
analyser, splitter → analyser L / analyser R }`. The **upmix** node is not
decoration: a channel
splitter interprets its channels *discretely*, so a mono file would leave the
second output silent — passing through a node that asks for exactly two speaker
channels duplicates mono into both first, which is what lets the stereo
visualisers degrade to a symmetric picture with nothing special-cased.

Every visualiser is the same two-step shape the rest of `light/` uses: a number
from the geometry, compared against a number from the audio. Pulse is *exactly*
Random mode with the music holding the Lit Chance slider; Level compares a fill
coordinate against how far the meter has filled; Spectrum maps x to a
(logarithmic) frequency and y to a bar height; Scope compares distance from a
traced line. All four dither their edge against the same fixed per-region
`threshold` the interactive circle and the wavefront use, so a soft edge
settles instead of shimmering.

The driver chain is three steps, and the first two are where the mode lives or
dies:

```
measure (flux or band energy) → stretch to the full range → shape the envelope
```

- **Measure: onsets, not loudness.** `spectralFlux` sums how much each bin got
  *louder* since the last frame. Only rises count, which is the whole trick: a
  hit is energy appearing where there was less a moment ago, while the 808
  sustaining underneath contributes nothing because it isn't changing. Band
  *energy* cannot tell those apart, so on modern music an energy-driven scene
  sits near its ceiling all bar and barely moves on the beat. Flux gets its own
  analyser node with `smoothingTimeConstant = 0` — smoothing spreads a kick's
  10 ms rise over 50 ms and flattens the exact spike being looked for, so the
  beat gets raw data and the display analysers keep their smoothing. **Beat**
  runs flux over the whole spectrum rather than the low end, which is what lets
  it find the music in a passage with no drums: an intro of piano or synth is
  nothing but note onsets, and a low-end-only detector shows nothing at all
  through it. **Kick** is the narrowed version, kept as its own driver.
- **Stretch: a range, not a peak.** `createRangeNormalizer` tracks an
  exponentially-weighted mean and deviation and calls `mean ± 1.3σ` the range.
  Its docblock lists the three versions that came before it and how each failed,
  which is the most useful thing in this file to read before changing it — the
  short version is that peak normalisation compresses a dB-mapped mix into the
  top third of the range, min/max tracking gets its floor set by outliers on
  skewed material and reads as permanently lit, and direct quantile estimators
  are correct but converge an order of magnitude too slowly to be usable inside
  one song. The spectrum bars get the same treatment via
  `spectrumFloor`/`spectrumScale`.
- **One range, applied to every channel.** It is learned from the mono mix and
  then `map`ped onto left and right, rather than each channel normalising
  itself. A range per channel rescales a quiet side straight back up to match
  the loud one, which cancels out exactly the stereo lean the visualisers exist
  to show.
- **Shape: asymmetric, and only one half is a control.** Attack is a fixed
  `ATTACK_MS` — there is no musical reason to want a slow rise, and every
  millisecond of one is lateness you can see — so Decay is the only dial.
  Exponential, not a per-frame fraction, for the reason `interactive.js` gives.
- **The stateful audio is in one place.** Followers, ranges and the previous
  spectrum are all memories of earlier frames, so they live in
  `createAnalysis()` — which belongs to the frame-loop effect, so leaving music
  mode and coming back starts from silence rather than a stale envelope.
  `light/music.js` stays pure, and a test can drive a whole envelope by calling
  `step` in a loop with a fake clock.
- **Hits are counted, not flagged.** `createAnalysis` calls a hit when the
  stretched driver crosses `HIT_ON` and won't call another until it has fallen
  back under `HIT_OFF`; a single threshold would fire a dozen times as one
  kick's envelope wobbled across it. The crossing is tested *before* the
  envelope follower, whose whole job is to hold light after a hit and which
  would therefore drag the crossing late. It is a counter rather than a boolean
  because Pulse's Reshuffle uses it as a random seed — the scatter then lands
  somewhere new on each beat and holds still while the light fades, instead of
  churning every frame into a shimmer.
- **The scope triggers.** `findTrigger` finds the first upward zero crossing and
  the trace is drawn from there. Untriggered, the wave is redrawn from an
  arbitrary phase sixty times a second and a steady tone reads as noise sliding
  across the image. Both channels share one trigger, so a stereo pair stays in
  phase.

There is deliberately **no sensitivity or gain control**. Range normalisation is
what a gain slider was being asked to compensate for, and it does the job on any
file without being told. A panel of dials that each need dialling before the
mode looks like anything is the failure state this replaced.

Two edges are easy to get wrong and are guarded explicitly: **silence must be
dark** (a region at the very origin of a fill axis sits at u exactly 0, and
`u <= amount` would keep it lit at zero), and **full must be full** (the soft
band is dithered inward and the fill stretched by its width, or either end of
the range becomes a permanent flicker).

Playback position is pulled from the element once per animation frame by
`AudioTrack.sync()`, not mirrored from `timeupdate` — that event fires about
four times a second, far too coarse for a moving playhead.

**Animation** (`light/animation.js`) — a sequence of steps played in order, and
the largest of the five. Its one idea is worth stating plainly, because almost
every animation in the library is the *same* animation with a different sort
order:

```js
level[i] = progress >= arrival[i] ? target : whateverItWasBefore
```

A step's **arrival order** gives each region the fraction of the step at which
it flips. Fade is arrival-by-random-number, Wipe is arrival-by-position-along-an-
axis, Ripple is arrival-by-distance-from-a-point, Spiral winds those two
together. `ORDERS` is therefore nine one-liners, and playback never learns what
any of them mean — which is why adding an animation is a change to
`animation.js` and nothing else. Four kinds aren't transitions at all (Hold,
Twinkle, Chase, Strobe); they are marked `sustained: true` and write levels
directly.

Three further decisions hold the mode up:

- **The sequence composes.** The timeline starts fully dark and each step
  transitions from whatever the last one left behind, so `Fade on → Hold → Wipe
  off` reads as one choreography rather than three clips. `sequenceStarts` folds
  the whole timeline up front — every step's end state is a pure function of its
  start state — which is what makes any moment **seekable** without having
  played the moments before it. The scrubber, a loop restart, and the video
  export all agree on a given millisecond because none of them accumulates
  anything.
- **`scatter` is one dial for organic-ness.** It blends a step's geometric order
  toward each region's own fixed import-time `threshold`, so a wipe frays into a
  scattered front and *stays* frayed the same way frame after frame. Same
  reasoning as the interactive mode's soft edge, applied to every pattern at
  once. Fade's order already *is* the threshold, so it opts out via
  `randomOrder`.
- **The library is data.** Each entry in `ANIMATION_KINDS` declares its own
  `controls` (`slider`/`select`/`toggle` descriptors, with `format` naming a
  display pair rather than carrying a function so a step survives the round trip
  through a demo's `settings.json`). `AnimationStepPanel.svelte` renders whatever
  the chosen kind asks for.

`normalizeStep` is the boundary for step data the same way `withDefaults` is for
the flat settings: an unknown kind falls back to Fade, unknown options are
dropped, nonsense values are clamped, and an existing `id` is kept so
re-normalising a live sequence doesn't churn the list's `{#each}` keys.

`Stage.svelte`'s loop for this mode only advances a clock — every frame is a
`sequenceLevels(timeMs)` lookup. It runs whether or not playback is going, so
editing a step's settings while paused updates the stage live.

All four animated loops take their step from `frameDelta` (`light/clock.js`), which is
extracted precisely so the stepping rules — first frame, clamped long gap,
clock running backwards — are unit-testable. A browser's rAF clock is not.

## Video export (`render/export.js`)

The stage draws with SVG; the export draws the same scene with canvas, because
`MediaRecorder` records a canvas stream and nothing else. They are two
implementations of one picture, so the places they could drift apart are
commented at the point they occur:

- Canvas has no `mask` attribute, so the mask is painted on its own canvas and
  applied to the lit image with `destination-in`.
- Region padding is a *screen* px measurement; in an export the output pixel is
  the screen pixel, so it is converted out of frame units by the same scale the
  context applies.
- Element `opacity` composites a region's fill and its padding stroke as one
  group; canvas has no equivalent, so a region caught mid-fade gets a slightly
  brighter rim. One padding-pixel wide, one `fadeMs` long, and buying it back
  would cost a full-canvas pass per distinct level.
- `approachLevels` re-implements the CSS `transition: opacity var(--fade)` that
  the stage gets for free — without it an exported Fade would snap every window
  on while the stage cross-faded them.

What the two *do* share is the part that matters: levels come from
`sequenceLevels`, the same pure function the frame loop calls. The export
replays the animation rather than re-deriving it.

Recording runs in **real time** — that is the price of the browser's own
encoder — so `settings.maxVideoSeconds` refuses a sequence long enough to look
like a hang, and the button says so.

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

## Explaining a control

`Slider`, `Toggle`, `Select` and `Section` all take an optional `info` string,
which renders a small **ⓘ** beside the label with the text behind a tooltip
(`ui/InfoTip.svelte`, on bits-ui's `Tooltip`). Prefer it to a `<p class="hint">`:
a 280px panel can only carry so much prose before the controls stop being
findable, and most explanations are read once and never again.

The tooltip is **portalled** and opens to the **left**, both because the sidebar
scrolls — `overflow-y: auto` computes `overflow-x` to `auto` as well, so anything
positioned inside the panel is clipped at its edge — and because there is nothing
but panel to the right. Its trigger stops click propagation, since the icon often
sits inside something clickable (a `Section` header toggles on click).

A `hint` paragraph is still right for one thing: saying why a control is
*disabled*, which a tooltip on a dead button can't do. `ExportSection` uses one
that way.

## Adding an animation — the checklist

All in `light/animation.js`:

1. A one-line entry in `ORDERS` (a transition) or `SUSTAINED` (something that
   runs for the step's length). Transitions return one raw number per region;
   scale doesn't matter, `arrivalsFor` normalises.
2. An entry in `ANIMATION_KINDS`: label, hint, default `durationMs`, default
   `options`, and the `controls` that edit them.
3. A test in `animation.test.js`. The "every transition spans [0,1]" and "lands
   on the target by the end" cases cover new kinds automatically; add one for
   whatever is specific about yours.

No component changes: the panel renders from `controls`, and the dropdown from
`ANIMATION_KINDS`.

## Adding a control — the checklist

1. `config/settings.js`: the slider range, plus a starting value in `defaults`.
   Never inline a range in a component.
2. `state/app.svelte.js`: a `$state` field (and a getter if it needs deriving).
3. The relevant `components/sidebar/*Section.svelte`: the control itself, using
   the `ui/` primitives (`Slider`, `Toggle`, `SegmentedToggle`, `Section`). If it
   needs explaining, pass `info="…"` rather than writing a paragraph under it —
   see below.
4. `light/*.js`: read it in the pure function, not in the component.
5. A test in the matching `*.test.js`.

## File map

```
components/App.svelte             state + layout
components/stage/Stage.svelte     pan/zoom, pointer, the rAF loop, drag-and-drop
components/stage/Scene.svelte     the svg: images + mask + region paths
components/stage/CursorCircle.svelte  optional debug outline of the circle
components/sidebar/*              one Section per control group (incl. Demos, Music, Debug)
components/toolbar/FloatingToolbar.svelte  scramble / reset view / collapse
components/ui/*                   primitives (Select is Glimmer's own)
config/settings.js                every range and default
config/demos.js                   the bundled demos and audio sample, and where their files live
light/{random,interactive,waves,music,animation}.js  the five modes, as pure functions
audio/engine.js                   AudioContext + <audio> + the analyser nodes
audio/analysis.js                 onsets, band energy, range normalising, envelope, scope trigger
render/export.js                  the animation, recorded to video via canvas
light/{clock,rng}.js              frame stepping, seeded RNG
svg/{regions,path-data,matrix,shapes}.js  SVG -> regions
geometry/transform.js             frame <-> screen
state/{app,theme,audio}.svelte.js  the store, the theme preference, the loaded track
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
- `withDefaults` **deep-clones**. `animationSteps` is a whole array of objects,
  and a shallow copy would hand every caller the same steps — the first sidebar
  edit would then rewrite `defaults` for the session.
- The animation step list's drag-to-reorder is pointer events, not HTML5
  drag-and-drop, for the reason the particle playground's layers panel gives:
  native DnD leaks a translucent row ghost and a link cursor that no browser
  lets you suppress.
- An `AudioContext` is built lazily, on the first `play()`. Created before a
  user gesture it starts suspended, and browsers log a warning about it on every
  page load whether or not audio is ever used. `createMediaElementSource` can
  only be called once per element, which is why the engine keeps one `<audio>`
  for its whole life and only swaps its `src`.
- Once the gain node exists, the `<audio>` element's own `volume` has to stay at
  1 — it gates everything reaching the source node, so the two would otherwise
  multiply. Volume and analyser smoothing set before the graph is built are held
  in the engine and applied when the nodes appear.
- Keyboard: **R** refits the view, **⌘/Ctrl + \\** collapses the sidebar, and
  holding **Space** turns a drag into a pan — except in Animation and Music
  modes, where Space is the transport instead. Nothing is given up for that: `spaceHeld` only
  ever set the grab cursor, and a drag pans in every mode with or without it. All of them are ignored while a
  text field has focus. Collapsing also hides the floating toolbar — the stage
  goes fully chrome-free — so **⌘/Ctrl + \\** is the only way back in.
