# Editor

A small framework for building interactive demos and tools: a pan/zoom canvas
on one side, a collapsible control panel on the other, and the set of controls
that panel is built from.

It is deliberately opinionated about the *chrome* and deliberately ignorant of
your *content*. The editor frames a coordinate space and hands you a transform;
what you draw inside it — SVG, HTML, a `<canvas>` — is entirely yours.

```
┌──────────────────────────────────────────┬────────────────┐
│                                          │  Grid       ▾  │
│                                          │  Columns   12  │
│            your content, framed          │  ▓▓▓▓▓▓░░░░░░  │
│            by the view transform         │                │
│                                          │  Shape      ▾  │
│                                          │  Form  Circle  │
│              ┌───────────────┐           │                │
│              │ ⚄  ↻ │ − 100% + │ ⊙ │ ⇥ │  │  Colour     ▸  │
│              └───────────────┘           │                │
└──────────────────────────────────────────┴────────────────┘
        canvas + floating toolbar               sidebar
```

## Installing it in a new project

1. Copy the whole `editor/` folder into your project's components directory.
   Nothing inside it imports from outside itself — no `$lib` aliases, no
   framework-specific paths — so it works wherever you drop it.
2. Install the two peer dependencies:

   ```sh
   npm i bits-ui @tabler/icons-svelte-runes
   ```

3. Import from `editor/index.js`. The stylesheet comes along with `Editor.svelte`,
   so there is nothing to add to your global CSS.

Requires **Svelte 5** in runes mode. There is no build step and no package
manifest — this is source you own, not a dependency you track.

## Ten-line version

```svelte
<script>
  import { Editor, Section, Slider } from '$lib/components/editor/index.js';

  const content = { x: 0, y: 0, width: 1000, height: 1000 };
  let radius = $state(200);
</script>

<div style="height: 100dvh">
  <Editor {content}>
    {#snippet canvas({ editor, width, height })}
      <svg {width} {height} style="position: absolute; inset: 0">
        <g transform={editor.svgTransform}>
          <circle cx="500" cy="500" r={radius} fill="tomato" />
        </g>
      </svg>
    {/snippet}

    {#snippet sidebar()}
      <Section title="Circle">
        <Slider label="Radius" bind:value={radius} min={0} max={500} />
      </Section>
    {/snippet}
  </Editor>
</div>
```

That gets you drag-to-pan, scroll-to-pan, pinch/⌘-scroll-to-zoom-at-cursor,
fit-on-load, `R` to refit, `⌘\` to hide the panel, a floating toolbar, and a
light/dark-aware control panel.

## The one idea worth understanding

Everything rests on two coordinate spaces:

- **Content space** — whatever your scene is authored in. An SVG viewBox, an
  image's pixels, a 0–1000 grid. You pick it, and you never have to leave it.
- **Viewport pixels** — the canvas element on screen.

You tell the editor your content's `bounds` (`{ x, y, width, height }`); it
gives you back a `transform` (`{ scale, offsetX, offsetY }`) that maps between
them, and keeps that transform up to date as the user pans, zooms and resizes
the window.

The transform is a **fit-to-viewport base** with the **user's pan/zoom layered
on top**. Keeping those apart is what makes "reset view" a one-liner, and what
keeps your content sensibly framed when the window resizes mid-session.

So the whole job of your canvas snippet is: put the transform on a wrapper, and
draw in content coordinates inside it.

```svelte
{#snippet canvas({ editor })}
  <g transform={editor.svgTransform}>
    <!-- everything in here is in plain content units -->
  </g>
{/snippet}
```

`editor.svgTransform` is the ready-made attribute; `contentTransformAttr(transform,
bounds)` builds the same string if you'd rather work from the raw transform.

## What's in the folder

| Path | What it is |
| --- | --- |
| `Editor.svelte` | The shell. Lays out canvas + sidebar, owns the keyboard shortcuts. |
| `Canvas.svelte` | The pan/zoom viewport: pointer, wheel and file-drop handling. |
| `Sidebar.svelte` | The collapsible panel. |
| `Toolbar.svelte` | The floating control bar inside the canvas. |
| `ui/` | The controls a panel is built from — `Section`, `Slider`, `Toggle`, `Select`, `SegmentedToggle`, `EditableValue`, `Button`, `IconButton`, `InfoTip`. |
| `state/editor.svelte.js` | `EditorState`: the view transform, the sidebar, the pointer. |
| `state/theme.svelte.js` | `ThemeState`: the light/dark preference. |
| `utils/transform.js` | The coordinate maths, as pure functions. |
| `utils/format.js` | `formatPercent` / `parsePercent` and friends, for `<Slider>`. |
| `editor.css` | Design tokens, the scoped reset, and the `.editor-*` utility classes. |

## The rest of the docs

- **[api.md](api.md)** — every component, prop and method.
- **[theming.md](theming.md)** — the tokens, dark/light, and making it look like
  your project instead of this one.
- **[recipes.md](recipes.md)** — the patterns you'll reach for second: HTML
  content, custom shortcuts, drag-and-drop, animation loops, popups, reading the
  view from your own components.

There's a full worked example in `src/routes/editor-demo/+page.svelte`, which
exercises every part of the public API.
