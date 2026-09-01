/**
 * A small framework for interactive demos and tools: a pan/zoom canvas on the
 * left, a collapsible control panel on the right, and the set of controls that
 * panel is built from.
 *
 * Drop this folder into any Svelte 5 project's components directory and import
 * from here. See `docs/` for the guide, the API reference and the recipes.
 *
 *     import { Editor, Section, Slider } from './components/editor/index.js';
 *
 * Peer dependencies: `bits-ui` and `@tabler/icons-svelte-runes`.
 */

// ── Shell ──
export { default as Editor } from './Editor.svelte';
export { default as Canvas } from './Canvas.svelte';
export { default as Sidebar } from './Sidebar.svelte';
export { default as Toolbar } from './Toolbar.svelte';

// ── Panel controls ──
export { default as Section } from './ui/Section.svelte';
export { default as Slider } from './ui/Slider.svelte';
export { default as Toggle } from './ui/Toggle.svelte';
export { default as Select } from './ui/Select.svelte';
export { default as SegmentedToggle } from './ui/SegmentedToggle.svelte';
export { default as EditableValue } from './ui/EditableValue.svelte';
export { default as Button } from './ui/Button.svelte';
export { default as IconButton } from './ui/IconButton.svelte';
export { default as InfoTip } from './ui/InfoTip.svelte';

// ── State ──
export {
	EditorState,
	EDITOR_DEFAULTS,
	createEditorState,
	setEditorState,
	getEditorState
} from './state/editor.svelte.js';
export { ThemeState, themeBootScript } from './state/theme.svelte.js';

// ── Coordinate maths ──
export {
	IDENTITY_TRANSFORM,
	clampZoom,
	computeFitTransform,
	contentCssTransform,
	contentToScreen,
	contentTransformAttr,
	panForZoom,
	screenToContent
} from './utils/transform.js';

// ── Formatting helpers for Slider's formatValue/parseValue ──
export { formatPercent, parsePercent, formatMs, formatPx } from './utils/format.js';
