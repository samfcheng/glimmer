/**
 * Mapping between *content space* — whatever coordinate system your scene is
 * authored in (an SVG viewBox, an image's pixels, a grid of cells) — and
 * *viewport pixels*, the space of the canvas element on screen.
 *
 * A view transform is `{ scale, offsetX, offsetY }`, applied in that order:
 *
 *     viewport = (content - bounds.origin) * scale + offset
 *
 * Content bounds are `{ x, y, width, height }`. The origin subtraction is what
 * lets a viewBox that does not start at 0,0 still land correctly.
 */

/** @typedef {{ x: number, y: number, width: number, height: number }} Bounds */
/** @typedef {{ scale: number, offsetX: number, offsetY: number }} Transform */

/** @type {Transform} */
export const IDENTITY_TRANSFORM = { scale: 1, offsetX: 0, offsetY: 0 };

/**
 * "Contain fit": the largest scale that fits `bounds` inside the viewport,
 * centred, with `padding` px kept clear on every side.
 *
 * Returns the identity transform for a degenerate input (no bounds yet, a
 * zero-width container during first layout) so callers never have to guard.
 *
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {Bounds | null | undefined} bounds
 * @param {number} [padding]
 * @returns {Transform}
 */
export function computeFitTransform(viewportW, viewportH, bounds, padding = 0) {
	if (!bounds || !bounds.width || !bounds.height || !viewportW || !viewportH) {
		return IDENTITY_TRANSFORM;
	}
	const availableW = Math.max(1, viewportW - padding * 2);
	const availableH = Math.max(1, viewportH - padding * 2);
	const scale = Math.min(availableW / bounds.width, availableH / bounds.height);
	return {
		scale,
		offsetX: (viewportW - bounds.width * scale) / 2,
		offsetY: (viewportH - bounds.height * scale) / 2
	};
}

/**
 * Content point → viewport pixels.
 *
 * @param {{ x: number, y: number }} point
 * @param {Transform} transform
 * @param {Bounds} bounds
 */
export function contentToScreen(point, transform, bounds) {
	return {
		x: (point.x - bounds.x) * transform.scale + transform.offsetX,
		y: (point.y - bounds.y) * transform.scale + transform.offsetY
	};
}

/**
 * Viewport pixels → content point. `point` must already be relative to the
 * canvas element's top-left, not the page.
 *
 * @param {{ x: number, y: number }} point
 * @param {Transform} transform
 * @param {Bounds} bounds
 */
export function screenToContent(point, transform, bounds) {
	return {
		x: (point.x - transform.offsetX) / transform.scale + bounds.x,
		y: (point.y - transform.offsetY) / transform.scale + bounds.y
	};
}

/**
 * The SVG `transform` attribute that puts content-space geometry where the
 * view says it goes. Put it on a `<g>` wrapping your paths and author them in
 * plain content coordinates.
 *
 * @param {Transform} transform
 * @param {Bounds} bounds
 */
export function contentTransformAttr(transform, bounds) {
	return `translate(${transform.offsetX} ${transform.offsetY}) scale(${transform.scale}) translate(${-bounds.x} ${-bounds.y})`;
}

/**
 * The same mapping as a CSS `transform`, for laying out HTML in content space.
 * Pair it with `transform-origin: 0 0` on the element you apply it to.
 *
 * @param {Transform} transform
 * @param {Bounds} bounds
 */
export function contentCssTransform(transform, bounds) {
	return `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.scale}) translate(${-bounds.x}px, ${-bounds.y}px)`;
}

/**
 * Clamp a zoom factor into the allowed range.
 *
 * @param {number} zoom
 * @param {number} min
 * @param {number} max
 */
export function clampZoom(zoom, min, max) {
	return Math.min(max, Math.max(min, zoom));
}

/**
 * The pan that keeps the content point currently under `anchor` pinned to that
 * same pixel once the zoom changes — "zoom toward the cursor", which is the
 * difference between a view that follows your attention and one that throws
 * your subject off screen every time you scroll.
 *
 * Pure algebra, kept out of the state class so it can be checked directly:
 * feed the result back through the transform and the anchor must not move.
 *
 * @param {{ x: number, y: number }} anchor viewport px, relative to the canvas
 * @param {Transform} current the transform in effect right now
 * @param {Transform} base the fit-to-viewport transform, before user zoom
 * @param {number} nextZoom the zoom factor being moved to
 * @returns {{ panX: number, panY: number }}
 */
export function panForZoom(anchor, current, base, nextZoom) {
	const anchorX = (anchor.x - current.offsetX) / current.scale;
	const anchorY = (anchor.y - current.offsetY) / current.scale;
	const nextScale = base.scale * nextZoom;
	return {
		panX: anchor.x - anchorX * nextScale - base.offsetX,
		panY: anchor.y - anchorY * nextScale - base.offsetY
	};
}
