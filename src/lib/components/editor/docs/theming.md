# Theming

Everything the editor draws is coloured from CSS custom properties defined in
`editor.css`. Every one is prefixed `--editor-`, and every utility class
`.editor-`, so the folder can land in a project that already has its own
`--color-text` or `.button` without either side clobbering the other.

## Overriding tokens

Redefine the ones you care about *after* `editor.css` loads. A `:root` rule in
your own global stylesheet is the usual place:

```css
:root {
  --editor-color-accent: #ff7a45;
  --editor-color-panel: #1b1b1f;
  --editor-radius-sm: 3px;
  --editor-font-sans: 'Inter', system-ui, sans-serif;
}
```

Because they're inherited custom properties, a rule on any ancestor scopes the
override to that subtree — handy for two editors on one page, or for keeping a
tool dark inside an otherwise light app:

```svelte
<div style="--editor-color-accent: #22c55e">
  <Editor …/>
</div>
```

## The tokens

### Surfaces

| Token | Used for |
| --- | --- |
| `--editor-color-bg` | The canvas behind your content. |
| `--editor-color-panel` | Sidebar, toolbar, tooltips, popups. |
| `--editor-color-panel-border` | Section rules, panel edges, the switch's off state. |

### Text

| Token | Used for |
| --- | --- |
| `--editor-color-text` | Control labels and values. |
| `--editor-color-text-muted` | Icons at rest, empty-state copy. |
| `--editor-color-text-dim` | Inactive segments, hints. |
| `--editor-color-heading` | Section titles. |

### Accents

| Token | Used for |
| --- | --- |
| `--editor-color-accent` | Active toggles, focus rings, the drop target. |
| `--editor-color-accent-text` | Text/icons sitting on the accent. |
| `--editor-color-danger` | Destructive affordances (`<Button danger>`). |

### Control internals

`--editor-color-input-bg`, `--editor-color-track`, `--editor-color-track-fill`,
`--editor-color-thumb`, `--editor-color-thumb-shadow`,
`--editor-color-toggle-group-bg`, `--editor-color-toggle-active-bg`,
`--editor-color-hover`, `--editor-color-shadow`.

`--editor-color-thumb-shadow` is transparent in dark mode and a real shadow in
light — it's what keeps a white slider thumb visible against a near-white panel.

### Metrics

`--editor-radius-sm|md|lg`, `--editor-space-xs|sm|md|lg`, `--editor-font-sans`,
`--editor-font-size`, `--editor-control-font-size`.

### Motion

`--editor-section-duration` (0.18s) and `--editor-sidebar-duration` (0.2s). Set
either to `0s` for instant, no-motion chrome. Section height animation relies on
`interpolate-size: allow-keywords`; where a browser doesn't support that, the
section still opens and closes, it just snaps.

Everything already respects `prefers-reduced-motion: reduce`.

## Light and dark

The dark palette lives on `:root`; the light one overrides it under
`[data-theme='light']`. That's a plain attribute selector rather than
`:root[data-theme=…]`, so it works on `<html>` for whole-page theming *and* on
any wrapper for a single-editor override.

`ThemeState` drives the `<html>` case:

```svelte
<script>
  import { SegmentedToggle, ThemeState } from '$lib/components/editor/index.js';
  const theme = new ThemeState({ storageKey: 'my-tool-theme' });
</script>

<SegmentedToggle
  label="Theme"
  value={theme.value}
  onValueChange={(v) => theme.set(v)}
  options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
/>
```

Options: `storageKey` (pass `null` to not persist), `initial` (`'dark'`), and
`followSystem` (default `true` — start from `prefers-color-scheme` when nothing
is stored). It's SSR-safe: reading `localStorage` is guarded, and a blocked
cookie store degrades to not persisting rather than throwing.

The theme is a *device preference*, not part of what the user is editing, so it
lives outside `EditorState` and never rides along with a document import/export.

### Avoiding the flash

The preference is only applied once your bundle runs, so a saved light theme
flashes dark during load. Fix it with an inline script in your document head,
ahead of the bundle — `themeBootScript()` generates one for the same key:

```html
<head>
  <script>
    try {
      var t = localStorage.getItem('my-tool-theme');
      if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    } catch (e) {}
  </script>
</head>
```

## Utility classes

Declared once in `editor.css` so a new panel section reaches for a class instead
of writing another near-identical block of scoped CSS.

| Class | |
| --- | --- |
| `.editor-button` | Full-width control button. `<Button>` is the component form. |
| `.editor-button-row` | Flex row that splits its buttons evenly. |
| `.editor-control-label` | Matches the label a `Slider` renders above itself, so a hand-rolled control group lines up with the built-in ones. |
| `.editor-hint` | Small print under a control. |
| `.editor-popup` / `-header` / `-body` | A floating panel anchored beside the sidebar. Positioning is yours to set inline — only you know what it's anchored to. |

Hover on the buttons is a uniform opacity fade rather than a background swap:
these controls sit on several differently-tinted surfaces, and a background
change read inconsistently across them.

## The scoped reset

`editor.css` sets `box-sizing: border-box` on `.editor` and its descendants
only, and sets no `body` or `*` rules at all. A drop-in component has no
business resetting the host page, so the rules stop at the editor's subtree.
