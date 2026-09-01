# Glimmer

Hover-light effects for images. Upload two shots of one scene — lights **off**
and lights **on** — plus an SVG with one path per region (a window), and Glimmer
composites the lit image through those regions.

Five modes:

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
- **Music** — drop in an audio file and the scene is lit by it. Four
  visualisers, and they read stereo: see [Music](#music) below.
- **Animation** — a sequence of steps played in order, stacked like layers. Add
  a step, pick what it does and how long it lasts, drag rows to reorder, and
  open a row for its own settings panel. The timeline starts fully dark and each
  step transitions from whatever the last one left behind, so the sequence reads
  as one continuous choreography. See [Animations](#animations) below.

## Music

Drop an audio file anywhere on the stage (or pick one in the sidebar — there is
a bundled clip to try) and the windows follow it. **Space** plays and pauses.
Four visualisers:

| | |
|---|---|
| **Pulse** | Random mode with the music holding the Lit Chance slider — windows scatter on as the track swells |
| **Level** | a VU meter drawn in windows: the scene fills along an axis as the track gets louder |
| **Spectrum** | a bar graph across the image — x picks a frequency, height is how loud it is |
| **Scope** | an oscilloscope traced through the windows, the waveform itself drawn in light |

**Stereo** is one idea applied to all four: wherever a visualiser needs a
number from the audio it takes the left channel's on the left of the image and
the right channel's on the right. A wide mix visibly spreads out, a hard-panned
hit lights one side, and a mono file draws a symmetric picture with nothing
special-cased. Spectrum splits its two channels by **mirroring** the frequency
axis — bass in the middle, treble running out to both edges.

Pulse and Level are **driven by** one number off the audio, and which one is
the difference between a scene that reacts to the song and a scene that reacts
to the *beat*. Two kinds of measurement:

- **Beat** (the default) and **Kick** measure how much the mix just
  **changed** — the standard onset detector. A hit is a burst of energy
  arriving where there was less a moment ago, so these fire once per event and
  are silent between them. Beat listens across the whole spectrum, which is
  what lets it find the music in a passage with no drums in it: an intro of
  piano or synth is nothing but note onsets. Kick is the same measurement
  narrowed to the low end, for when only the drums should count.
- **Bass / Mid / Treble** measure how **loud** that slice of the mix is right
  now. Good for a Level meter, a trap for anything meant to look rhythmic: a
  sustained 808 or a dense midrange is continuously loud, so the scene sits
  near its ceiling all bar and barely twitches on the beat.

**Decay** is how long the light takes to fall away after a hit: short is a
strobe on the beat, long is a slow breath. The rise is always immediate, since
there is no musical reason to want a slow one.

Pulse also carries **Reshuffle** (on by default), which draws a new scatter of
windows on every hit. Turned off, each window is judged against a single roll
fixed when the SVG was imported, so the same windows light in every bar of the
song — a settled look, but a static one.

There is no sensitivity or gain to dial. The level is **stretched to whatever
range the track has actually been using lately** — the mean and spread of the
last few seconds, so roughly the quietest tenth reads as dark and the loudest
tenth as fully lit, on any file, and a quiet intro doesn't leave the drop
permanently pinned at the top.

**Softness** dithers whichever edge the visualiser draws — the meter's front,
a bar's top, the scope's line — against each window's own fixed roll, the same
trick the interactive circle and the wavefront use, so the edge settles into a
scatter rather than shimmering.

The scrubber doubles as the clip's waveform, and the two bars under it are a
left/right input meter — so a scene that looks dead tells you whether it is the
audio or the settings.

## Animations

Nine of the thirteen steps are **transitions** — the same machinery with a
different sort order, each running **On** or **Off**:

| | |
|---|---|
| **Fade** | every window picks its own moment at random |
| **Wipe** | a straight edge sweeping at any angle |
| **Split** | two edges at once, in from the sides or out from the middle |
| **Ripple** | rings spreading out from a point, or closing in on it |
| **Spiral** | a sweep rotating around a point, wound outwards by *Turns* |
| **Rain** | columns falling top-down, each with its own head start |
| **Typewriter** | row by row, left to right — optionally snaking back |
| **Weave** | rows sweeping in from alternating sides — left, right, left… |
| **Bloom** | starts at a few windows and spreads to whatever is nearest |
| **Blinds** | parallel stripes filling at once, all the same way |

Every one of them carries **Scatter**, which blends its geometric order toward
each window's own fixed random number: at 0 a wipe is a ruler-straight edge, and
turned up the same wipe frays into a scattered front that stays frayed the same
way frame after frame. **Easing** shapes how the wavefront travels (the
per-window cross-fade is Appearance's *Fade*, which is a separate thing).

The other four **sustain** for the length of the step rather than transitioning:

| | |
|---|---|
| **Hold** | keeps the scene exactly as it was — the pause between two moves |
| **Twinkle** | random churn; can replace the scene, sparkle on top of it, or blink lit windows off |
| **Chase** | a lit band travelling across and repeating |
| **Strobe** | everything pulses, optionally only the windows already lit |

Transport sits at the top of the Animation section and in the floating toolbar;
**Space** plays and pauses, and the loop icon beside it decides whether the
sequence repeats or stops at the end. The bar under it is both a timeline — one
segment per step, sized by its share of the total — and a scrubber. Opening a step's panel
scrubs to its first frame and pauses, so you are editing what you can see.

A fresh session opens on a single Fade step — add more with the **+** on the
section header. Controls that need explaining carry a small **ⓘ**; hover it.

**Export** records one full pass of the sequence to video — mp4 where the
browser's encoder supports it, webm otherwise. It runs in real time, so a
six-second sequence takes six seconds to record.

The Regions section carries a **Padding** slider: it grows every region
outwards in the mask by a few screen pixels, closing both the hairline seam
where two regions share an edge and any real gaps between them.

Debug overlays (region outlines — red when dark, blue when lit, at an
adjustable width — and the interactive circle) live in the sidebar's Debug
section.

Keyboard: **R** refits the view, **Space** plays/pauses in Animation and Music modes (and
elsewhere, held + drag, pans), **⌘/Ctrl + \\** collapses the sidebar. Collapsing hides the toolbar too, leaving a chrome-free stage —
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
drag them straight onto the canvas. An audio file dropped on the canvas loads
into music mode and starts playing.

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
