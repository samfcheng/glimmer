# Recipes

The patterns you'll reach for after the quick start.

---

## Drawing HTML instead of SVG

The transform maps to CSS just as well. Apply it to a wrapper with
`transform-origin: 0 0` and lay your elements out in content units:

```svelte
{#snippet canvas({ editor })}
  <div class="layer" style:transform={editor.cssTransform}>
    {#each nodes as node (node.id)}
      <div class="node" style:left="{node.x}px" style:top="{node.y}px">{node.label}</div>
    {/each}
  </div>
{/snippet}

<style>
  .layer { position: absolute; inset: 0; transform-origin: 0 0; }
  .node  { position: absolute; }
</style>
```

The catch is that text and borders scale with the zoom, which SVG's
`vector-effect="non-scaling-stroke"` avoids. For a node graph that's usually
what you want; for a diagram with labels that must stay legible, divide by
`editor.transform.scale` on the bits that shouldn't grow.

## Keeping a hairline one pixel at any zoom

In SVG, `vector-effect="non-scaling-stroke"` does it for free — the stroke stays
1px on screen however far you zoom, which is what makes outlines usable for
checking alignment. Elsewhere, `editor.unitsPerPixel` is the conversion:

```svelte
<circle r={8 * editor.unitsPerPixel} />
```

## Reading the view from your own components

Context resolves through the render tree, so any component rendered inside the
snippets can just ask for the state:

```svelte
<!-- WavesSection.svelte -->
<script>
  import { getEditorState, Section, Slider } from '../editor/index.js';
  const editor = getEditorState();
</script>

<Section title="Waves">
  <Slider label="Speed" bind:value={speed} min={0} max={2} step={0.05} />
  <p class="editor-hint">Pointer: {editor.pointer?.x.toFixed(0) ?? '—'}</p>
</Section>
```

The page's own `<script>` is the exception — it runs before `<Editor>` exists.
Use the `editor` field on the snippet payload, or own the state yourself:

```svelte
<script>
  const editor = new EditorState();
</script>
<Editor state={editor} {content}>…</Editor>
```

## Splitting the sidebar into section components

Once a panel grows past a screenful, give each section its own file and let it
own its slice of state. A section that only applies in one mode can decide that
for itself:

```svelte
<!-- sidebar/WavesSection.svelte -->
{#if app.mode === 'waves'}
  <Section title="Waves">…</Section>
{/if}
```

```svelte
{#snippet sidebar()}
  <ModeSection />
  <WavesSection />
  <AppearanceSection />
{/snippet}
```

## A frame loop that stops when nothing is moving

Tear the loop down in the effect's cleanup, and let the condition that starts it
be a dependency. An editor that idles at zero CPU is the whole point:

```js
$effect(() => {
  if (!playing) return;

  let frame = 0;
  let last = performance.now();
  const tick = (now) => {
    frame = requestAnimationFrame(tick);
    time += now - last;
    last = now;
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
});
```

## Claiming a key for yourself

`onKeydown` runs before the built-in shortcuts; `preventDefault()` stops them.
Space is the usual one to take — it's the transport in every video player:

```svelte
<Editor
  {content}
  onKeydown={(event) => {
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      playing = !playing;
    }
  }}
>
```

Nothing is lost by taking it: held space only sets the grab cursor, and a drag
pans with or without it.

The built-ins already skip keystrokes aimed at an `<input>`, `<select>`,
`<textarea>` or anything `contenteditable`, so typing in a panel field never
fires them.

## Accepting dropped files

Supplying `onDropFiles` is what turns drag-and-drop on and makes the hint
appear:

```svelte
<Editor
  {content}
  dropHint="Drop an SVG or an image"
  onDropFiles={async (files) => {
    const file = files[0];
    if (file.name.toLowerCase().endsWith('.svg')) loadSvg(await file.text());
    else if (file.type.startsWith('image/')) setImage(URL.createObjectURL(file));
  }}
>
```

Remember to `URL.revokeObjectURL` the previous blob when you replace one.

## Floating panels and the pan gesture

Anything interactive you render over the canvas needs `data-editor-ui`:

```svelte
{#snippet canvas()}
  <div class="editor-popup" data-editor-ui style="left: 40px; top: 40px">
    <div class="editor-popup-header">Presets</div>
    <div class="editor-popup-body">…</div>
  </div>
{/snippet}
```

Without it, `setPointerCapture` on the canvas retargets the following
`pointerup`, and a click whose down and up disagree is never dispatched to your
button — so the control simply stops working, with no error to explain it.

## An empty state

`emptyMessage` shows whenever it's non-null, so make it the answer to "is there
anything to look at?" rather than a constant:

```svelte
emptyMessage={
  loading ? 'Loading…'
  : !image ? 'Drop an image to get started'
  : regions.length === 0 ? 'Add an SVG of region paths'
  : null
}
```

## Deep-linking into a collapsed view

`sidebarOpen` binds, so a URL that's meant for showing the piece rather than
editing it can hide the chrome. `⌘\` brings it back:

```svelte
<script>
  let sidebarOpen = $state(true);
  onMount(() => {
    if (new URLSearchParams(location.search).has('present')) sidebarOpen = false;
  });
</script>

<Editor {content} bind:sidebarOpen>…</Editor>
```

## Two editors on one page

Each `<Editor>` creates its own state and publishes it on its own context, so
they don't interfere. Two things to watch:

- `shortcuts` binds to the **window**, so give at most one of them `shortcuts`
  and turn it off on the other (`shortcuts={false}`).
- Any `id` you mint inside SVG `<defs>` — masks, gradients, filters — is
  document-wide. Make it unique per instance:

  ```js
  const maskId = `lit-mask-${$props.id()}`;
  ```

## Composing the parts yourself

`<Editor>` is a convenience. For a different arrangement, create the state and
place the pieces yourself:

```svelte
<script>
  import { Canvas, Sidebar, Toolbar, createEditorState } from './editor/index.js';
  const editor = createEditorState({ minZoom: 0.5, maxZoom: 4 });
  $effect(() => { editor.content = bounds; });
</script>

<div class="editor my-layout">
  <header>…</header>
  <Canvas>
    {#snippet children({ transform })}…{/snippet}
    {#snippet overlay()}<Toolbar showZoom />{/snippet}
  </Canvas>
  <Sidebar width={320}>…</Sidebar>
</div>
```

Keep the `editor` class on the wrapper — that's what carries the scoped reset
and the base typography.
