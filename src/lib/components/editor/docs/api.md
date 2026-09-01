# API reference

Everything is exported from `editor/index.js`.

---

## `<Editor>`

The shell. Creates the [`EditorState`](#editorstate), lays out the canvas and
sidebar, and binds the keyboard shortcuts.

### Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `content` | `{x, y, width, height} \| null` | `null` | Your scene's bounds in its own coordinate system. This is what "fit to view" fits. |
| `state` | `EditorState \| null` | `null` | Reuse an instance you made yourself. See [Owning the state](#owning-the-state). |
| `sidebarOpen` | `boolean` | `true` | `bind:`-able. |
| `sidebarWidth` | `number` | `280` | Pixels. |
| `sidebarSide` | `'right' \| 'left'` | `'right'` | Visual only — the canvas stays first in the tab order. |
| `fitPadding` | `number` | `40` | Px kept clear around the content when the view is fit. |
| `minZoom` / `maxZoom` | `number` | `0.1` / `8` | Multipliers on the fit scale. |

These three are only applied when you actually pass them, so a state instance
created with its own options keeps them. The other tunables have no prop — set
them on the state (see [Tunables](#tunables)).
| `autoFit` | `boolean` | `true` | Refit whenever `content`'s dimensions change. |
| `enablePan` / `enableZoom` | `boolean` | `true` | |
| `shortcuts` | `boolean` | `true` | Binds `R`, `⌘\` and space-to-grab on the window. |
| `showToolbar` | `boolean` | `true` | |
| `showResetView` | `boolean` | `true` | The ⊙ button. |
| `showZoom` | `boolean` | `false` | The `− 100% +` group. |
| `showSidebarToggle` | `boolean` | `true` | The ⇥ button. |
| `emptyMessage` | `string \| null` | `null` | Centred over the canvas whenever it is non-null — **you** decide when there's nothing to show, so pass `null` once there is. |
| `dropHint` | `string` | `'Drop a file'` | Shown while a file is dragged over the canvas. |

### Callbacks

| Prop | Signature | Notes |
| --- | --- | --- |
| `onCanvasClick` | `(point, event) => void` | `point` is in **content** coordinates. Only fires for a press that didn't turn into a drag. |
| `onPointerMove` | `(point \| null) => void` | Content coordinates; `null` when the pointer leaves. |
| `onDropFiles` | `(files, event) => void` | Supplying this is what turns file drag-and-drop on. `files` is a real array. |
| `onKeydown` | `(event) => void` | Runs *before* the built-in shortcuts. Call `event.preventDefault()` to claim a key. |

### Snippets

| Snippet | Receives | |
| --- | --- | --- |
| `canvas` | `{ editor, transform, width, height }` | **Required.** Your scene. `width`/`height` are the viewport's pixel size. |
| `sidebar` | `{ editor }` | The panel's contents. Omit it and no panel renders. |
| `toolbar` | `{ editor }` | Extra buttons, placed ahead of the built-in ones with a divider between. |

```svelte
<Editor {content} bind:sidebarOpen showZoom onCanvasClick={(p) => (focus = p)}>
  {#snippet canvas({ transform })}…{/snippet}
  {#snippet toolbar()}<IconButton title="Shuffle" onclick={shuffle}>…</IconButton>{/snippet}
  {#snippet sidebar()}<Section title="Shape">…</Section>{/snippet}
</Editor>
```

`<Editor>` fills its parent, so give that parent a height (`100dvh`, a grid
row — anything but `auto`).

---

## `EditorState`

The single source of truth for the view. Reach it three ways, in order of
convenience:

1. the `editor` field on any snippet payload;
2. `getEditorState()` from any component rendered inside `<Editor>` — context
   resolves through the render tree, so a `<WavesSection>` inside your `sidebar`
   snippet can call it;
3. `state={…}`, if the page itself needs it. See [below](#owning-the-state).

### Reactive fields

| Field | Type | |
| --- | --- | --- |
| `sidebarOpen` | `boolean` | Writable. |
| `content` | `Bounds \| null` | Pushed in from `<Editor>`'s prop. |
| `bounds` | `Bounds` | `content` with a safe stand-in, so coordinate maths never sees null. |
| `viewportWidth` / `viewportHeight` | `number` | The canvas element's size in px. |
| `zoom` | `number` | The user's factor **on top of** the fit. `1` means "exactly fit". |
| `panX` / `panY` | `number` | The user's offset in px, on top of the fit. |
| `pointer` | `{x, y} \| null` | Pointer position in content space. |
| `panning` | `boolean` | True only once a press has passed the drag threshold. |
| `spaceHeld` | `boolean` | Space is down; the canvas shows a grab cursor. |
| `baseTransform` | `Transform` | Fit-to-viewport, before the user's layer. |
| `transform` | `Transform` | What actually draws. |
| `svgTransform` | `string` | `transform` as an SVG attribute, ready for a `<g>`. |
| `cssTransform` | `string` | The same mapping as a CSS `transform`. |
| `unitsPerPixel` | `number` | Content units per screen pixel — for hairlines and hit radii that shouldn't scale. |

### Methods

| Method | |
| --- | --- |
| `resetView()` | Drop the user's pan/zoom; refit. |
| `panBy(dx, dy)` | In viewport px. |
| `setZoom(next, anchor?)` | Clamps to min/max. `anchor` is viewport px; without it, zooms about the centre. |
| `zoomBy(factor, anchor?)` | |
| `zoomIn(anchor?)` / `zoomOut(anchor?)` | By `options.zoomStep`. |
| `toggleSidebar()` | |
| `toContent(x, y)` | Viewport px → content point. |
| `toScreen(point)` | Content point → viewport px. |

Zoom is always *anchored*: the content point under the anchor stays under it.
That's what makes ⌘-scroll feel like it's zooming toward your cursor rather than
throwing your subject off screen.

### Tunables

`EDITOR_DEFAULTS` holds every knob. Override any of them when you create the
state:

```js
const editor = createEditorState({ minZoom: 0.5, maxZoom: 4, zoomSensitivity: 0.005 });
```

| Option | Default | |
| --- | --- | --- |
| `fitPadding` | `40` | Px kept clear around the content when fitting. |
| `minZoom` / `maxZoom` | `0.1` / `8` | |
| `zoomStep` | `1.25` | Multiplier per `zoomIn()` / `zoomOut()`. |
| `zoomSensitivity` | `0.01` | Zoom per pixel of ⌘-wheel travel, as an exponent. |
| `maxWheelDelta` | `40` | Per-event wheel travel is clamped to this first. A trackpad sends a stream of small deltas, but one notch of a mouse wheel arrives as a single ~100px event — unclamped, that notch multiplies the zoom by *e*. Clamped, it's about 1.5x. |
| `panClickThresholdPx` | `4` | How far a press may move and still count as a click. |

Wheel deltas are normalised to pixels first, so Firefox — which reports mouse
wheels in *lines* and page-scrolls in *pages* — pans and zooms by the same
amount per gesture as Chrome does.

### Owning the state

The page's own `<script>` runs before `<Editor>` exists, so `getEditorState()`
won't find anything there. When the page itself needs the state, make it:

```svelte
<script>
  import { Editor, EditorState } from '$lib/components/editor/index.js';
  const editor = new EditorState();
</script>

<Editor state={editor} {content}>…</Editor>

<p>Zoom is {Math.round(editor.zoom * 100)}%</p>
```

`state` is read once, on mount — it's the identity of that editor, so don't swap
it. (`createEditorState()` does the same thing *and* publishes it on context,
which is what `<Editor>` calls internally.)

---

## `<Canvas>`, `<Sidebar>`, `<Toolbar>`

`<Editor>` composes these for you. Use them directly only when you want a
different arrangement — two canvases sharing a panel, a sidebar somewhere else
in your layout. All three call `getEditorState()`, so they must render inside a
component that has created one.

**`<Canvas>`** — props: `children` (required, receives `{transform, width,
height}`), `overlay`, `emptyMessage`, `dropHint`, `ariaLabel`, `enablePan`,
`enableZoom`, `onCanvasClick`, `onPointerMove`, `onDropFiles`.

Anything clickable you render over the canvas must carry `data-editor-ui`, or a
press on it starts a pan and its click never fires. (`<Toolbar>` already does.)

**`<Sidebar>`** — props: `side`, `width`, `children`.

**`<Toolbar>`** — props: `children`, `showResetView`, `showZoom`,
`showSidebarToggle`, `sidebarSide`. It hides itself when the sidebar is closed,
so everything on it needs a keyboard or pointer equivalent too.

---

## Controls

All of them are 12px, full-width, and made for a ~280px panel.

### `<Section title info action collapsible showChevron defaultExpanded bind:expanded>`

A titled, collapsible group. Clicking anywhere in the header toggles it —
except an `action` button, which only ever force-opens it (a plain toggle there
would collapse the section out from under whatever the action just revealed).

```svelte
<Section title="Particles" info="Drawn once per frame." bind:expanded={open}>
  {#snippet action()}
    <IconButton plain title="Add" onclick={add}><IconPlus size={14} /></IconButton>
  {/snippet}
  <Slider label="Count" bind:value={count} min={0} max={500} />
</Section>
```

### `<Slider label bind:value min max step typedMax formatValue parseValue info disabled onValueChange>`

A track plus an editable number. The number can be **typed** (click it) or
**scrubbed** (drag it sideways, Figma-style).

- `formatValue: (n) => string` — how the number reads.
- `parseValue: (string) => number` — the inverse, for typed input. Return `NaN`
  to reject the edit.
- `typedMax` — clamp for *typed* values only, so the track can stay at a
  comfortable `max` while still accepting a deliberate override.

```svelte
<Slider label="Fade" bind:value={fadeMs} min={0} max={1000} step={10}
        formatValue={formatMs} />
<Slider label="Chance" bind:value={chance} min={0} max={1} step={0.01}
        formatValue={formatPercent} parseValue={parsePercent} />
```

`formatPercent`, `parsePercent`, `formatMs` and `formatPx` ship in
`utils/format.js` and are re-exported from the index.

### `<Toggle label bind:checked info disabled onCheckedChange>`

Label on the left, switch on the right.

### `<Select label bind:value options info disabled onValueChange>`

Dropdown. `options` is `[{ value, label }]` and values round-trip as-is — they
don't have to be strings. Reach for this past three or four choices.

### `<SegmentedToggle label bind:value options disabled onValueChange>`

Two or three mutually exclusive choices in a pill. Same `options` shape.

### `<Button onclick disabled danger active title>`

Full-width text button. Wrap several in `<div class="editor-button-row">` to sit
them side by side.

### `<IconButton onclick active plain title disabled>`

Square icon affordance; pass the icon as children. `plain` gives the small,
chrome-free 16px variant for section headers.

### `<InfoTip text side>`

The "i" bubble. Usually you don't render this directly — `Section`, `Slider`,
`Select` and `Toggle` all take an `info` prop that does it for you.

### `<EditableValue text onCommit onScrubStart onScrub disabled width>`

The click-to-type / drag-to-scrub number field, on its own. `<Slider>` uses it
internally; use it directly for a value that has no track.

`onScrub` receives the **total** dx since the drag began, not an increment —
snapshot your value in `onScrubStart` and recompute from it each time, so a long
drag can't accumulate rounding drift.

---

## Utilities

### `utils/transform.js`

| Function | |
| --- | --- |
| `computeFitTransform(w, h, bounds, padding?)` | Contain-fit. Returns identity for degenerate input, so callers needn't guard. |
| `contentToScreen(point, transform, bounds)` | |
| `screenToContent(point, transform, bounds)` | `point` must be relative to the canvas, not the page. |
| `contentTransformAttr(transform, bounds)` | SVG `transform` attribute. |
| `contentCssTransform(transform, bounds)` | CSS `transform`; pair with `transform-origin: 0 0`. |
| `panForZoom(anchor, current, base, nextZoom)` | The pan that pins the anchor across a zoom change. |
| `clampZoom(zoom, min, max)` | |

### `state/theme.svelte.js`

`new ThemeState({ storageKey?, initial?, followSystem? })` → `.value`, `.set(theme)`,
`.toggle()`. See [theming.md](theming.md).
