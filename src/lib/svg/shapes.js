/**
 * Basic-shape → path-data conversion.
 *
 * Hand-drawn region files aren't always all `<path>` — exporters keep a square
 * window as a `<rect>` and a porthole as a `<circle>`. Converting them up front
 * means the rest of the app only ever deals with path data, and a region is a
 * region regardless of which element it arrived as.
 */

const num = (element, name, fallback = 0) => {
	const value = parseFloat(element.getAttribute(name));
	return Number.isNaN(value) ? fallback : value;
};

/** Shape elements we turn into regions, in the order they appear in the file. */
export const SHAPE_SELECTOR = 'path, rect, circle, ellipse, polygon, polyline';

export function shapeToPathData(element) {
	switch (element.tagName.toLowerCase().replace(/^.*:/, '')) {
		case 'path':
			return element.getAttribute('d') || '';
		case 'rect':
			return rectToPath(element);
		case 'circle': {
			const r = num(element, 'r');
			return r > 0 ? ellipseToPath(num(element, 'cx'), num(element, 'cy'), r, r) : '';
		}
		case 'ellipse': {
			const rx = num(element, 'rx');
			const ry = num(element, 'ry');
			return rx > 0 && ry > 0 ? ellipseToPath(num(element, 'cx'), num(element, 'cy'), rx, ry) : '';
		}
		case 'polygon':
			return pointsToPath(element.getAttribute('points'), true);
		case 'polyline':
			return pointsToPath(element.getAttribute('points'), false);
		default:
			return '';
	}
}

function rectToPath(element) {
	const x = num(element, 'x');
	const y = num(element, 'y');
	const width = num(element, 'width');
	const height = num(element, 'height');
	if (width <= 0 || height <= 0) return '';

	// Per spec, a missing rx mirrors ry (and vice versa), and both clamp to half
	// the corresponding side.
	const hasRx = element.hasAttribute('rx');
	const hasRy = element.hasAttribute('ry');
	let rx = hasRx ? num(element, 'rx') : hasRy ? num(element, 'ry') : 0;
	let ry = hasRy ? num(element, 'ry') : rx;
	rx = Math.min(Math.abs(rx), width / 2);
	ry = Math.min(Math.abs(ry), height / 2);

	if (rx === 0 || ry === 0) {
		return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
	}
	return (
		`M${x + rx} ${y}` +
		`H${x + width - rx}` +
		`A${rx} ${ry} 0 0 1 ${x + width} ${y + ry}` +
		`V${y + height - ry}` +
		`A${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height}` +
		`H${x + rx}` +
		`A${rx} ${ry} 0 0 1 ${x} ${y + height - ry}` +
		`V${y + ry}` +
		`A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
	);
}

/** Two half-arcs — a single 360° arc is degenerate (start point == end point). */
function ellipseToPath(cx, cy, rx, ry) {
	return (
		`M${cx - rx} ${cy}` +
		`A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}` +
		`A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
	);
}

function pointsToPath(points, close) {
	const numbers = (points || '')
		.split(/[\s,]+/)
		.map((token) => parseFloat(token))
		.filter((n) => !Number.isNaN(n));
	if (numbers.length < 4) return '';
	let d = `M${numbers[0]} ${numbers[1]}`;
	for (let i = 2; i + 1 < numbers.length; i += 2) d += `L${numbers[i]} ${numbers[i + 1]}`;
	return close ? `${d}Z` : d;
}
