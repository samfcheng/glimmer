/**
 * SVG path-data parsing and flattening — pure JS, no DOM.
 *
 * The app never rewrites a region's `d`: it renders the original string and
 * only needs geometry to answer "where is this region's centre?". So the job
 * here is to turn `d` into polylines accurate enough for an area centroid,
 * which is why curves are flattened rather than kept exact.
 */

import { settings } from '../config/settings.js';

const COMMAND_RE = /[MmLlHhVvCcSsQqTtAaZz]/;

/**
 * Splits a `d` string into `{ command, args }` steps. Tolerant of the shapes
 * real exporters emit: comma or whitespace separators, no separator before a
 * minus sign, exponent notation, and implicit repeated commands (`M x y x y`
 * continuing as a lineto, per spec).
 */
export function tokenizePath(d) {
	const steps = [];
	let i = 0;
	let command = null;
	let args = [];

	const flush = () => {
		if (command) steps.push({ command, args });
		args = [];
	};

	while (i < d.length) {
		const char = d[i];
		if (COMMAND_RE.test(char)) {
			flush();
			command = char;
			i += 1;
			continue;
		}
		if (char === ',' || char === ' ' || char === '\t' || char === '\n' || char === '\r') {
			i += 1;
			continue;
		}
		const number = readNumber(d, i);
		if (number === null) {
			i += 1; // unrecognised byte — skip rather than abort the whole path
			continue;
		}
		args.push(number.value);
		i = number.end;
	}
	flush();

	return expandImplicitCommands(steps);
}

function readNumber(text, start) {
	let i = start;
	if (text[i] === '+' || text[i] === '-') i += 1;
	let sawDigit = false;
	while (i < text.length && text[i] >= '0' && text[i] <= '9') {
		i += 1;
		sawDigit = true;
	}
	if (text[i] === '.') {
		i += 1;
		while (i < text.length && text[i] >= '0' && text[i] <= '9') {
			i += 1;
			sawDigit = true;
		}
	}
	if (!sawDigit) return null;
	if (text[i] === 'e' || text[i] === 'E') {
		let j = i + 1;
		if (text[j] === '+' || text[j] === '-') j += 1;
		let sawExpDigit = false;
		while (j < text.length && text[j] >= '0' && text[j] <= '9') {
			j += 1;
			sawExpDigit = true;
		}
		if (sawExpDigit) i = j;
	}
	const value = parseFloat(text.slice(start, i));
	if (Number.isNaN(value)) return null;
	return { value, end: i };
}

/** Arity of each command's argument group. */
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Splits multi-group steps into one step per group, applying the spec's
 * implicit-command rule: extra coordinate pairs after a moveto are linetos.
 */
function expandImplicitCommands(steps) {
	const out = [];
	for (const step of steps) {
		const upper = step.command.toUpperCase();
		const arity = ARITY[upper];
		if (arity === 0) {
			out.push({ command: step.command, args: [] });
			continue;
		}
		if (arity === undefined || step.args.length < arity) continue;
		for (let i = 0; i + arity <= step.args.length; i += arity) {
			let command = step.command;
			if (i > 0 && upper === 'M') command = step.command === 'M' ? 'L' : 'l';
			out.push({ command, args: step.args.slice(i, i + arity) });
		}
	}
	return out;
}

/**
 * Flattens `d` into closed polylines — one per subpath, each an array of
 * `{x, y}`. Open subpaths are returned as-is; the centroid treats every
 * subpath as implicitly closed, which is what a region outline means.
 */
export function flattenPath(d, tolerance = settings.curveTolerance) {
	const subpaths = [];
	let current = null;
	let cx = 0;
	let cy = 0;
	let sx = 0;
	let sy = 0;
	// Reflection anchors for the smooth variants; null unless the previous
	// command was of the matching family (per spec the reflection then
	// degenerates to the current point).
	let lastCubicControl = null;
	let lastQuadControl = null;

	const start = (x, y) => {
		current = [{ x, y }];
		subpaths.push(current);
	};
	const lineTo = (x, y) => {
		if (!current) start(cx, cy);
		current.push({ x, y });
	};

	for (const { command, args } of tokenizePath(d)) {
		const relative = command === command.toLowerCase();
		const upper = command.toUpperCase();
		const ox = relative ? cx : 0;
		const oy = relative ? cy : 0;

		switch (upper) {
			case 'M': {
				cx = args[0] + ox;
				cy = args[1] + oy;
				sx = cx;
				sy = cy;
				start(cx, cy);
				lastCubicControl = lastQuadControl = null;
				break;
			}
			case 'L': {
				cx = args[0] + ox;
				cy = args[1] + oy;
				lineTo(cx, cy);
				lastCubicControl = lastQuadControl = null;
				break;
			}
			case 'H': {
				cx = args[0] + ox;
				lineTo(cx, cy);
				lastCubicControl = lastQuadControl = null;
				break;
			}
			case 'V': {
				cy = args[0] + oy;
				lineTo(cx, cy);
				lastCubicControl = lastQuadControl = null;
				break;
			}
			case 'C':
			case 'S': {
				let c1x;
				let c1y;
				let c2x;
				let c2y;
				let ex;
				let ey;
				if (upper === 'C') {
					[c1x, c1y, c2x, c2y, ex, ey] = args;
					c1x += ox;
					c1y += oy;
					c2x += ox;
					c2y += oy;
				} else {
					[c2x, c2y, ex, ey] = args;
					c2x += ox;
					c2y += oy;
					c1x = lastCubicControl ? 2 * cx - lastCubicControl.x : cx;
					c1y = lastCubicControl ? 2 * cy - lastCubicControl.y : cy;
				}
				ex += ox;
				ey += oy;
				if (!current) start(cx, cy);
				appendCubic(current, cx, cy, c1x, c1y, c2x, c2y, ex, ey, tolerance);
				lastCubicControl = { x: c2x, y: c2y };
				lastQuadControl = null;
				cx = ex;
				cy = ey;
				break;
			}
			case 'Q':
			case 'T': {
				let qx;
				let qy;
				let ex;
				let ey;
				if (upper === 'Q') {
					[qx, qy, ex, ey] = args;
					qx += ox;
					qy += oy;
				} else {
					[ex, ey] = args;
					qx = lastQuadControl ? 2 * cx - lastQuadControl.x : cx;
					qy = lastQuadControl ? 2 * cy - lastQuadControl.y : cy;
				}
				ex += ox;
				ey += oy;
				if (!current) start(cx, cy);
				// Degree-elevate to a cubic so there's one flattener to trust.
				appendCubic(
					current,
					cx,
					cy,
					cx + (2 / 3) * (qx - cx),
					cy + (2 / 3) * (qy - cy),
					ex + (2 / 3) * (qx - ex),
					ey + (2 / 3) * (qy - ey),
					ex,
					ey,
					tolerance
				);
				lastQuadControl = { x: qx, y: qy };
				lastCubicControl = null;
				cx = ex;
				cy = ey;
				break;
			}
			case 'A': {
				const [rx, ry, rotation, largeArc, sweep] = args;
				const ex = args[5] + ox;
				const ey = args[6] + oy;
				if (!current) start(cx, cy);
				appendArc(current, cx, cy, rx, ry, rotation, largeArc, sweep, ex, ey, tolerance);
				lastCubicControl = lastQuadControl = null;
				cx = ex;
				cy = ey;
				break;
			}
			case 'Z': {
				if (current && current.length > 0) current.push({ x: sx, y: sy });
				cx = sx;
				cy = sy;
				// A subsequent drawing command starts a fresh subpath at the
				// close point rather than reopening the closed one.
				current = null;
				lastCubicControl = lastQuadControl = null;
				break;
			}
		}
	}

	return subpaths.filter((points) => points.length > 1);
}

/**
 * Samples a cubic into `points`, with the step count scaled to the curve's
 * size so a tiny fillet doesn't get the same 32 segments a huge sweep does.
 */
function appendCubic(points, x0, y0, x1, y1, x2, y2, x3, y3, tolerance) {
	const hull =
		Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
	const steps = Math.max(
		1,
		Math.min(1 << settings.maxCurveDepth, Math.ceil(Math.sqrt(hull / Math.max(tolerance, 1e-6))))
	);
	for (let i = 1; i <= steps; i += 1) {
		const t = i / steps;
		const u = 1 - t;
		points.push({
			x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
			y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
		});
	}
}

/**
 * Elliptical arc → polyline, via the spec's endpoint-to-centre parametrisation
 * (SVG 1.1 appendix F.6). Out-of-range radii are corrected the way the spec
 * requires instead of producing NaNs.
 */
function appendArc(points, x0, y0, rx, ry, rotationDeg, largeArc, sweep, x1, y1, tolerance) {
	if (rx === 0 || ry === 0 || (x0 === x1 && y0 === y1)) {
		points.push({ x: x1, y: y1 });
		return;
	}
	rx = Math.abs(rx);
	ry = Math.abs(ry);
	const phi = (rotationDeg * Math.PI) / 180;
	const cosPhi = Math.cos(phi);
	const sinPhi = Math.sin(phi);

	const dx2 = (x0 - x1) / 2;
	const dy2 = (y0 - y1) / 2;
	const x1p = cosPhi * dx2 + sinPhi * dy2;
	const y1p = -sinPhi * dx2 + cosPhi * dy2;

	// Scale up radii that are too small to span the endpoints (spec F.6.6).
	const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
	if (lambda > 1) {
		const s = Math.sqrt(lambda);
		rx *= s;
		ry *= s;
	}

	const sign = largeArc !== sweep ? 1 : -1;
	const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
	const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
	const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));
	const cxp = (coefficient * rx * y1p) / ry;
	const cyp = (-coefficient * ry * x1p) / rx;

	const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2;
	const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2;

	const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
	let delta = angleBetween(
		(x1p - cxp) / rx,
		(y1p - cyp) / ry,
		(-x1p - cxp) / rx,
		(-y1p - cyp) / ry
	);
	if (!sweep && delta > 0) delta -= 2 * Math.PI;
	else if (sweep && delta < 0) delta += 2 * Math.PI;

	const radius = Math.max(rx, ry);
	const steps = Math.max(
		2,
		Math.min(
			512,
			Math.ceil((Math.abs(delta) / (2 * Math.PI)) * Math.max(8, Math.sqrt(radius / Math.max(tolerance, 1e-6)) * 4))
		)
	);
	for (let i = 1; i <= steps; i += 1) {
		const theta = theta1 + (delta * i) / steps;
		const cosT = Math.cos(theta);
		const sinT = Math.sin(theta);
		points.push({
			x: cx + rx * cosT * cosPhi - ry * sinT * sinPhi,
			y: cy + rx * cosT * sinPhi + ry * sinT * cosPhi
		});
	}
}

function angleBetween(ux, uy, vx, vy) {
	const dot = ux * vx + uy * vy;
	const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
	let angle = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
	if (ux * vy - uy * vx < 0) angle = -angle;
	return angle;
}

/** Axis-aligned bounds of flattened subpaths, or null if there are no points. */
export function boundsOf(subpaths) {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const points of subpaths) {
		for (const { x, y } of points) {
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}
	if (minX === Infinity) return null;
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Area centroid of flattened subpaths (every subpath treated as closed).
 *
 * The signed-area formula is used rather than a bounding-box centre because a
 * bbox centre can land *outside* an L-shaped or crescent region — and the
 * interactive mode's whole "is this window inside the circle?" test hangs off
 * this point. Signed area also means a hole drawn with opposite winding pulls
 * the centroid correctly instead of being counted twice.
 *
 * Falls back to the bbox centre for degenerate shapes (zero area: a straight
 * line, a single point), where the formula has nothing to work with.
 */
export function centroidOf(subpaths) {
	let areaSum = 0;
	let cxSum = 0;
	let cySum = 0;

	for (const points of subpaths) {
		for (let i = 0; i < points.length; i += 1) {
			const a = points[i];
			const b = points[(i + 1) % points.length];
			const cross = a.x * b.y - b.x * a.y;
			areaSum += cross;
			cxSum += (a.x + b.x) * cross;
			cySum += (a.y + b.y) * cross;
		}
	}

	if (Math.abs(areaSum) < 1e-9) {
		const bounds = boundsOf(subpaths);
		if (!bounds) return null;
		return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
	}

	return { x: cxSum / (3 * areaSum), y: cySum / (3 * areaSum) };
}
