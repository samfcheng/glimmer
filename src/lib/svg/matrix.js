/**
 * 2-D affine matrices for SVG `transform` attributes, as `[a, b, c, d, e, f]`
 * (the same order SVG's own `matrix()` uses).
 *
 * Exporters routinely nest shapes under `<g transform="translate(…)">`, so a
 * region's real position is its own transform composed with every ancestor's.
 * Flattening that into one matrix lets the original `d` stay untouched — the
 * matrix rides along as the rendered element's `transform`, and the same
 * matrix maps the computed centroid into root coordinates.
 */

export const IDENTITY = [1, 0, 0, 1, 0, 0];

/** Matrix product `m1 · m2` — applying the result applies m2's effect first. */
export function multiply(m1, m2) {
	return [
		m1[0] * m2[0] + m1[2] * m2[1],
		m1[1] * m2[0] + m1[3] * m2[1],
		m1[0] * m2[2] + m1[2] * m2[3],
		m1[1] * m2[2] + m1[3] * m2[3],
		m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
		m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
	];
}

export function applyMatrix(m, point) {
	return {
		x: m[0] * point.x + m[2] * point.y + m[4],
		y: m[1] * point.x + m[3] * point.y + m[5]
	};
}

export function isIdentity(m) {
	return IDENTITY.every((value, i) => Math.abs(m[i] - value) < 1e-9);
}

export function matrixToString(m) {
	return `matrix(${m.map((n) => roundTo(n, 6)).join(' ')})`;
}

function roundTo(value, digits) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

const TRANSFORM_RE = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;

/**
 * Parses a `transform` attribute into a single matrix. Unknown functions are
 * skipped rather than throwing — a transform we don't understand should cost
 * one misplaced region, not the whole import.
 */
export function parseTransform(text) {
	if (!text) return IDENTITY;
	let result = IDENTITY;
	TRANSFORM_RE.lastIndex = 0;
	let match;
	while ((match = TRANSFORM_RE.exec(text)) !== null) {
		const args = match[2]
			.split(/[\s,]+/)
			.map((token) => parseFloat(token))
			.filter((n) => !Number.isNaN(n));
		const step = transformToMatrix(match[1], args);
		if (step) result = multiply(result, step);
	}
	return result;
}

function transformToMatrix(name, args) {
	switch (name) {
		case 'matrix':
			return args.length === 6 ? args : null;
		case 'translate':
			return args.length >= 1 ? [1, 0, 0, 1, args[0], args[1] ?? 0] : null;
		case 'scale': {
			if (args.length < 1) return null;
			const sx = args[0];
			const sy = args.length > 1 ? args[1] : sx;
			return [sx, 0, 0, sy, 0, 0];
		}
		case 'rotate': {
			if (args.length < 1) return null;
			const angle = (args[0] * Math.PI) / 180;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const rotation = [cos, sin, -sin, cos, 0, 0];
			if (args.length < 3) return rotation;
			// rotate(a, cx, cy) — rotate about a point.
			const [, cx, cy] = args;
			return multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
		}
		case 'skewX':
			return args.length >= 1 ? [1, 0, Math.tan((args[0] * Math.PI) / 180), 1, 0, 0] : null;
		case 'skewY':
			return args.length >= 1 ? [1, Math.tan((args[0] * Math.PI) / 180), 0, 1, 0, 0] : null;
		default:
			return null;
	}
}
