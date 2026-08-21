/**
 * Mapping between the scene's coordinate space ("frame" — the SVG viewBox, or
 * the base image's own pixels before one is imported) and screen pixels in the
 * stage container.
 */

/**
 * "Contain fit" transform: the largest scale that fits the frame inside the
 * container, centred, with `padding` px kept clear on every side.
 */
export function computeFitTransform(containerW, containerH, frame, padding = 0) {
	if (!frame || !frame.width || !frame.height || !containerW || !containerH) {
		return { scale: 1, offsetX: 0, offsetY: 0 };
	}
	const availableW = Math.max(1, containerW - padding * 2);
	const availableH = Math.max(1, containerH - padding * 2);
	const scale = Math.min(availableW / frame.width, availableH / frame.height);
	return {
		scale,
		offsetX: (containerW - frame.width * scale) / 2,
		offsetY: (containerH - frame.height * scale) / 2
	};
}

export function frameToScreen(point, transform, frame) {
	return {
		x: (point.x - frame.x) * transform.scale + transform.offsetX,
		y: (point.y - frame.y) * transform.scale + transform.offsetY
	};
}

export function screenToFrame(point, transform, frame) {
	return {
		x: (point.x - transform.offsetX) / transform.scale + frame.x,
		y: (point.y - transform.offsetY) / transform.scale + frame.y
	};
}

/** The `transform` attribute that puts frame-space content where the view says. */
export function frameTransformAttr(transform, frame) {
	return `translate(${transform.offsetX} ${transform.offsetY}) scale(${transform.scale}) translate(${-frame.x} ${-frame.y})`;
}
