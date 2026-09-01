import { getContext, setContext } from 'svelte';
import {
	clampZoom,
	computeFitTransform,
	contentCssTransform,
	contentToScreen,
	contentTransformAttr,
	panForZoom,
	screenToContent
} from '../utils/transform.js';

const EDITOR_KEY = Symbol('editor-state');

/** @typedef {import('../utils/transform.js').Bounds} Bounds */

/** Tunables. Pass overrides to `<Editor>` or to `createEditorState()`. */
export const EDITOR_DEFAULTS = {
	/** Breathing room, in px, left around the content when the view is fit. */
	fitPadding: 40,
	minZoom: 0.1,
	maxZoom: 8,
	/** Multiplier per zoomIn()/zoomOut() step. */
	zoomStep: 1.25,
	/** Zoom per pixel of ctrl/⌘-wheel travel, as an exponent. */
	zoomSensitivity: 0.01,
	/**
	 * Per-event wheel travel is clamped to this before it is used. A trackpad
	 * sends a stream of small deltas, but one notch of a mouse wheel arrives as
	 * a single ~100px event — unclamped, that one notch would multiply the zoom
	 * by e, throwing the subject clean off screen. Clamped, a notch is ~1.5x.
	 */
	maxWheelDelta: 40,
	/** A press only becomes a pan past this much movement — anything shorter
	 *  stays a click, so dragging the canvas never fires `onCanvasClick`. */
	panClickThresholdPx: 4
};

/**
 * Everything the editor shell knows: how the content is framed on screen, and
 * whether the sidebar is showing.
 *
 * The view is a *fit-to-viewport base* with the user's pan/zoom layered on
 * top. Keeping those two apart is what makes "reset" a one-liner (drop the
 * user's layer) and what keeps the content framed sensibly when the window
 * resizes mid-session — the base recomputes, the user's zoom rides along.
 */
export class EditorState {
	/** @type {boolean} */
	sidebarOpen = $state(true);

	/** Content bounds in content space, or null before anything is loaded.
	 *  @type {Bounds | null} */
	content = $state(null);

	/** Canvas element size in px, written by <Canvas>. */
	viewportWidth = $state(0);
	viewportHeight = $state(0);

	/** The user's zoom on top of the fit — 1 means "exactly fit". */
	zoom = $state(1);
	panX = $state(0);
	panY = $state(0);

	/** Pointer position in content space, or null while it is off the canvas.
	 *  @type {{ x: number, y: number } | null} */
	pointer = $state(null);

	/** True only once a press has moved past the pan threshold. */
	panning = $state(false);

	/** Space is held: the canvas shows a grab cursor. Set by <Editor>'s
	 *  keyboard handling, read by <Canvas> — nothing else depends on it. */
	spaceHeld = $state(false);

	options = $state({ ...EDITOR_DEFAULTS });

	constructor(options = {}) {
		this.options = { ...EDITOR_DEFAULTS, ...options };
	}

	/** Content bounds with a safe stand-in, so coordinate maths never sees null. */
	bounds = $derived(this.content ?? { x: 0, y: 0, width: 1, height: 1 });

	/** Fit-to-viewport, before the user's pan/zoom. */
	baseTransform = $derived(
		computeFitTransform(
			this.viewportWidth,
			this.viewportHeight,
			this.content,
			this.options.fitPadding
		)
	);

	/** What actually draws: the fit with the user's layer applied.
	 *  @type {import('../utils/transform.js').Transform} */
	transform = $derived({
		scale: this.baseTransform.scale * this.zoom,
		offsetX: this.baseTransform.offsetX + this.panX,
		offsetY: this.baseTransform.offsetY + this.panY
	});

	/** Ready-made `transform` attribute for a `<g>` holding content-space paths. */
	svgTransform = $derived(contentTransformAttr(this.transform, this.bounds));

	/** The same mapping as a CSS transform, for HTML content layers. */
	cssTransform = $derived(contentCssTransform(this.transform, this.bounds));

	/** Content-space units per viewport pixel — useful for keeping a hairline
	 *  or a hit radius a constant size on screen at any zoom. */
	unitsPerPixel = $derived(this.transform.scale === 0 ? 1 : 1 / this.transform.scale);

	/** Drop the user's pan/zoom, refitting the content to the viewport. */
	resetView() {
		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
	}

	panBy(dx, dy) {
		this.panX += dx;
		this.panY += dy;
	}

	/**
	 * Set the zoom factor, keeping the content point currently under `anchor`
	 * pinned in place. Without an anchor it zooms about the viewport centre.
	 *
	 * @param {number} next desired zoom factor (clamped to min/max)
	 * @param {{ x: number, y: number }} [anchor] viewport px, relative to the canvas
	 */
	setZoom(next, anchor) {
		const clamped = clampZoom(next, this.options.minZoom, this.options.maxZoom);
		if (clamped === this.zoom) return;

		const point = anchor ?? { x: this.viewportWidth / 2, y: this.viewportHeight / 2 };
		const { panX, panY } = panForZoom(point, this.transform, this.baseTransform, clamped);

		this.panX = panX;
		this.panY = panY;
		this.zoom = clamped;
	}

	/** @param {number} factor @param {{ x: number, y: number }} [anchor] */
	zoomBy(factor, anchor) {
		this.setZoom(this.zoom * factor, anchor);
	}

	zoomIn(anchor) {
		this.zoomBy(this.options.zoomStep, anchor);
	}

	zoomOut(anchor) {
		this.zoomBy(1 / this.options.zoomStep, anchor);
	}

	toggleSidebar() {
		this.sidebarOpen = !this.sidebarOpen;
	}

	/** Viewport px (relative to the canvas) → content space. */
	toContent(x, y) {
		return screenToContent({ x, y }, this.transform, this.bounds);
	}

	/** Content space → viewport px (relative to the canvas). */
	toScreen(point) {
		return contentToScreen(point, this.transform, this.bounds);
	}
}

/**
 * Create the state and publish it on context. `<Editor>` does this for you —
 * call it yourself only if you want to own the instance in a parent component
 * (and then pass it in as `<Editor {state}>`).
 *
 * @param {Partial<typeof EDITOR_DEFAULTS>} [options]
 */
export function createEditorState(options) {
	const state = new EditorState(options);
	setContext(EDITOR_KEY, state);
	return state;
}

/** Publish an existing instance on context. */
export function setEditorState(state) {
	setContext(EDITOR_KEY, state);
	return state;
}

/**
 * Read the editor state from any component rendered inside `<Editor>` — a
 * sidebar section, a toolbar button, your canvas content. This is the escape
 * hatch for anything the props don't cover: current zoom, the pointer in
 * content coordinates, programmatic view changes.
 *
 * @returns {EditorState}
 */
export function getEditorState() {
	const state = getContext(EDITOR_KEY);
	if (!state) {
		throw new Error(
			'getEditorState() was called outside an <Editor>. Render the component inside the editor, or pass the state down as a prop.'
		);
	}
	return state;
}
