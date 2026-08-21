# Glimmer — plan

An app for "hover-light" effects: two images of the same scene (lights **off** /
lights **on**) plus an SVG of one `<path>` per region (a window), and a control
for which regions are lit — randomly, or by cursor proximity.

## What carries over from `particle-playground`

Only the shell. Same stack, same conventions, so the two feel like siblings:

- **SvelteKit + Svelte 5 runes**, client-only (`+page.js` → `export const ssr = false`),
  no TypeScript (JSDoc + `jsconfig.json`), tabs, same `vite.config.js` runes forcing.
- **Deps to add**: `bits-ui` (Slider/Switch primitives), `@tabler/icons-svelte-runes`.
  Plus `vitest` + `jsdom` dev, with the reference's `vitest.config.js` (deliberately
  no SvelteKit plugin — it crashes vitest; tests import plain `.js` only).
- **Copied verbatim**: `src/app.css` (the whole token set + `.button` / `.control-label` /
  `.select` / `.popup` utilities + light theme block), `components/ui/{Section,Slider,
  EditableValue,SegmentedToggle,Toggle,IconButton}.svelte`, `state/theme.svelte.js`
  (new storage key `glimmer-theme`), `config/styles.js`, the app.html pre-paint theme
  script, `config/meta.json`.
- **Layout pattern**: `App.svelte` (creates the state, `display:flex; 100vw/100vh`)
  = `<Stage />` (`flex:1; overflow:hidden`) + `<aside class="sidebar">`
  (280px, `overflow-y:auto`, `padding-bottom:2rem`, border-left). Collapse is the
  reference's trick — the sidebar stays mounted and animates to `width:0` so scroll
  position survives; a floating toolbar bottom-center holds the collapse toggle.
  Sidebar content is a stack of `<Section>`s (12px 500-weight header, chevron,
  `border-top` between).
- **State pattern**: one `$state` class in `state/app.svelte.js`, handed down via
  Svelte context (`createAppState()` / `getAppState()`), exactly like `EditorState`.
  Tunables/ranges live in `config/settings.js`, never inline.

Everything below the shell is new.

## Data model

```js
scene = {
  base:   { url, naturalWidth, naturalHeight, name },   // lights off
  active: { url, naturalWidth, naturalHeight, name },   // lights on
  viewBox: { x, y, width, height },                     // from the uploaded SVG
  regions: [ { id, d, transform, centroid:{x,y}, bbox, threshold } ]
}
```

`threshold` is a per-region random number in `[0,1)`, drawn once at import — it
drives both the random mode roll and the soft-edge dither (see below).

## Rendering — one SVG, one mask

The whole scene is a single `<svg viewBox="…">` sized to fill the stage
(`preserveAspectRatio="xMidYMid meet"`), so image↔path alignment is the viewBox
mapping itself and needs no manual transform math:

```html
<svg viewBox="0 0 W H">
  <defs>
    <mask id="lit">
      {#each regions as r, i}
        <path d={r.d} transform={r.transform} fill="#fff" fill-opacity={level[i]} />
      {/each}
    </mask>
  </defs>
  <image href={base.url}   width=W height=H />
  <image href={active.url} width=W height=H mask="url(#lit)" />
</svg>
```

Why a **mask** rather than N paths each filled with a `<pattern>` of the active
image: one raster composited through a cheap mask stays flat as region count
grows, and per-region `fill-opacity` still gives independent fades. A CSS
`transition` on the mask paths' `fill-opacity` (duration from a sidebar control)
makes windows fade instead of snapping.

Cursor → viewBox coordinates uses the browser's own
`svg.getScreenCTM().inverse()`, so it stays correct under any fit/letterboxing.

## Geometry — parsed in plain JS, not measured from the DOM

`lib/svg/` does the import work, all DOM-free and unit-tested (the reference's
"keep logic in plain `.js`" rule):

- `path-data.js` — tokenize a `d` string, handle every command (`M L H V C S Q T A Z`,
  abs + rel), flatten curves/arcs to polylines at a fixed tolerance.
- `matrix.js` — parse an element's `transform` plus every ancestor `<g transform>`
  into one matrix. Stored per region and used for **both** rendering (`transform`
  attribute, so the original `d` is untouched) and centroid mapping.
- `regions.js` — `DOMParser` the uploaded/pasted SVG, read the `viewBox` (fallback:
  `width`/`height`, then the union bbox of the shapes), collect `<path>` plus
  `<rect>/<circle>/<ellipse>/<polygon>/<polyline>` converted to path data, and
  compute each region's **area centroid** (signed-area formula over the flattened
  polygon; falls back to bbox center if the area degenerates) — a bbox center
  would sit outside an L-shaped or concave region.

## The two modes

**Random** — every region independently on/off from a seeded RNG. Clicking the
image reseeds and re-rolls. Sidebar gets a **Lit chance** slider (a bare 50/50
isn't very expressive) and a **Reshuffle** button next to the click gesture.

**Interactive** — a circle follows the cursor; a region is lit when its centroid
is inside. A single `requestAnimationFrame` loop runs only in this mode:

1. **Ease** — `pos += (target − pos) · (1 − exp(−dt/τ))`, with `τ` from
   *Responsiveness* (0 ⇒ snap). The `exp` form keeps the lag identical at 60 and
   120 Hz instead of being frame-count-based.
2. **Light** — for each region, `t = (R − dist(centroid, pos)) / band`, where
   `band = smoothing · R`:
   - `t ≥ 1` (deeper than the band) → lit
   - `t ≤ 0` (outside R) → dark
   - inside the band → lit when `t > region.threshold`

   Using the region's **stored** threshold (not a fresh draw per frame) is the
   important choice: the edge is a stable organic dither that each window crosses
   at its own depth as the circle sweeps over it, instead of a band of pixels
   flickering at 60 fps. A "Twinkle" toggle can re-roll per frame if the noisy
   look is wanted.
3. Write the new levels into a `$state.raw` array, replaced only when something
   actually changed.

`R` is stored as a percentage of image width so it means the same thing across
image sizes. Pointer leaving the stage fades everything off.

## File map

```
src/routes/+layout.svelte   styles + meta      src/lib/state/app.svelte.js   the $state class
src/routes/+page.svelte     <App />            src/lib/state/theme.svelte.js copied
src/lib/components/App.svelte                  src/lib/config/settings.js    ranges + defaults
  stage/Stage.svelte        pointer + rAF      src/lib/config/styles.js      copied
  stage/Scene.svelte        the svg + mask     src/lib/svg/path-data.js      d parser
  stage/CursorCircle.svelte optional outline   src/lib/svg/matrix.js         transforms
  sidebar/Sidebar.svelte                       src/lib/svg/regions.js        svg -> regions
    ImagesSection.svelte    base + active      src/lib/light/random.js       seeded roll
    RegionsSection.svelte   svg upload/paste   src/lib/light/interactive.js  ease + levels
    ModeSection.svelte      mode + random ctl  src/lib/components/ui/*       copied
    InteractiveSection.svelte  radius / responsiveness / smoothing
    AppearanceSection.svelte   fade, show circle, theme
```

## Build order

1. Scaffold: deps, `app.css`, `app.html`, layout/page, copied `ui/` + theme, empty
   App/Stage/Sidebar shell — sidebar collapse and theme working against a placeholder.
2. `lib/svg/*` + vitest tests (parser, centroids, transforms, viewBox fallbacks).
3. Images + SVG upload sections; `Scene.svelte` rendering all regions lit.
4. Random mode (seeded roll, click to re-roll, lit-chance).
5. Interactive mode (rAF ease, radius/responsiveness/smoothing, dithered edge).
6. Polish: empty states, drag-and-drop onto the stage, aspect-ratio mismatch warning,
   `docs/contributing.md` in the reference's style.
