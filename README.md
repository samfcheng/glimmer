# Glimmer

Hover-light effects for images. Upload two shots of one scene — lights **off**
and lights **on** — plus an SVG with one path per region (a window), and Glimmer
composites the lit image through those regions.

Two modes:

- **Random** — a scatter of lit regions. Click the image (or hit Scramble) to
  reshuffle; the Lit Chance slider controls how many are on. Switch on Animate
  and it re-scrambles on a delay of your choosing.
- **Interactive** — a circle follows the cursor, lighting the regions it covers.
  Radius, Responsiveness (how much the circle lags), and Smoothing (a soft,
  scattered edge instead of a hard cut-off) are in the sidebar.
- **Waves** — a lit band travels across the scene: down, up, left, right, or
  radially in or out from a centre point you can drag off the middle of the
  image. Speed, Wavelength (gap between crests), Band (how much of each wave is
  lit), and Softness are in the sidebar.

The Regions section carries a **Padding** slider: it grows every region
outwards in the mask by a few screen pixels, closing both the hairline seam
where two regions share an edge and any real gaps between them.

Debug overlays (region outlines — red when dark, blue when lit, at an
adjustable width — and the interactive circle) live in the sidebar's Debug
section.

Keyboard: **R** refits the view, **⌘/Ctrl + \\** collapses the sidebar, **Space**
+ drag pans. Collapsing hides the toolbar too, leaving a chrome-free stage —
**⌘/Ctrl + \\** brings both back.

## Demos

With nothing loaded, the sidebar offers a **Demos** section — one button per
bundled scene, ready to go. `?demo=<slug>` in the address bar opens straight
into one with the sidebar collapsed (**⌘/Ctrl + \\** brings it back), e.g.
`/?demo=transamerica_pyramid`.

A demo is a folder in `static/demos/<slug>/` holding `default.png`,
`active.png`, `paths.svg`, and a `settings.json` of just the settings that
differ from the defaults — plus a line in `src/lib/config/demos.js`, since
static files can't be listed at runtime.

## Getting started

```sh
npm install
npm run dev
```

Then drop a default image, an active image, and an SVG into the sidebar — or
drag them straight onto the canvas.

## Commands

```sh
npm run dev      # dev server
npm test         # unit tests
npm run build    # production build (also the compile check)
```

See `docs/contributing.md` for the codebase tour and `PLAN.md` for the design
decisions behind it.

## Notes

- `particle-playground/` is a read-only copy of a sibling project, kept for
  reference; it is git-ignored and not part of the build.
