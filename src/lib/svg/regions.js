/**
 * SVG document → the app's region list.
 *
 * A "region" is one toggleable area (a window): its original path data, the
 * flattened ancestor transform, and the geometry the lighting needs.
 */

import { applyMatrix, IDENTITY, isIdentity, matrixToString, multiply, parseTransform } from './matrix.js';
import { boundsOf, centroidOf, flattenPath } from './path-data.js';
import { SHAPE_SELECTOR, shapeToPathData } from './shapes.js';

/** Subtrees that define reusable/clipping content rather than drawn content. */
const NON_RENDERED = new Set(['defs', 'clippath', 'mask', 'symbol', 'marker', 'pattern']);

const localName = (element) => element.tagName.toLowerCase().replace(/^.*:/, '');

/**
 * Parses SVG source into `{ viewBox, regions, warnings }`.
 *
 * `random` is injectable so tests can pin the per-region dither thresholds;
 * the app leaves it as `Math.random`.
 */
export function parseSvgRegions(source, { random = Math.random } = {}) {
	const warnings = [];
	const doc = new DOMParser().parseFromString(source, 'image/svg+xml');

	if (doc.querySelector('parsererror')) {
		throw new Error("That doesn't parse as SVG — check the markup and try again.");
	}
	const root = doc.documentElement;
	if (!root || localName(root) !== 'svg') {
		throw new Error('No <svg> element found in that file.');
	}

	const regions = [];
	let skipped = 0;

	walk(root, IDENTITY, (element, matrix) => {
		const d = shapeToPathData(element);
		if (!d.trim()) {
			skipped += 1;
			return;
		}
		const subpaths = flattenPath(d);
		const localBounds = boundsOf(subpaths);
		const localCentroid = centroidOf(subpaths);
		if (!localBounds || !localCentroid || (localBounds.width === 0 && localBounds.height === 0)) {
			skipped += 1;
			return;
		}

		// Bounds are transformed by mapping the local box's four corners, so a
		// rotated or skewed ancestor still yields a correct axis-aligned box.
		const centroid = applyMatrix(matrix, localCentroid);
		const bounds = transformBounds(matrix, localBounds);

		regions.push({
			id: `region-${regions.length}`,
			label: element.getAttribute('id') || element.getAttribute('data-name') || null,
			d,
			transform: isIdentity(matrix) ? null : matrixToString(matrix),
			centroid,
			bounds,
			// Fixed per region, drawn once at import. Random mode compares it to
			// nothing (it has its own rolls); the interactive mode's soft edge
			// compares against it so each window crosses the falloff band at its
			// own depth — a stable dither instead of a 60fps flicker.
			threshold: random()
		});
	});

	if (regions.length === 0) {
		throw new Error('No shapes found in that SVG — expected one path per region.');
	}
	if (skipped > 0) {
		warnings.push(`Skipped ${skipped} shape${skipped === 1 ? '' : 's'} with no drawable area.`);
	}

	// A `width`/`height` pair defines a user space just as well as a viewBox
	// does, so only the last-resort guess is worth warning about.
	const viewBox = readViewBox(root);
	if (!viewBox) {
		warnings.push('That SVG has no viewBox — using the bounding box of its shapes instead.');
	}

	return { viewBox: viewBox ?? unionBounds(regions), regions, warnings };
}

/**
 * Depth-first walk in document order, accumulating transforms. Shape elements
 * are visited via `onShape`; a shape carrying its own children (it can't) is
 * not descended into.
 */
function walk(element, parentMatrix, onShape) {
	for (const child of element.children) {
		const name = localName(child);
		if (NON_RENDERED.has(name)) continue;
		if (child.getAttribute('display') === 'none') continue;

		const matrix = multiply(parentMatrix, parseTransform(child.getAttribute('transform')));

		if (matchesShape(child)) {
			onShape(child, matrix);
			continue;
		}
		// A nested <svg> re-establishes a viewport we don't attempt to resolve;
		// descending anyway keeps its shapes rather than dropping them silently.
		walk(child, matrix, onShape);
	}
}

function matchesShape(element) {
	return SHAPE_SELECTOR.split(', ').includes(localName(element));
}

function transformBounds(matrix, bounds) {
	const corners = [
		{ x: bounds.x, y: bounds.y },
		{ x: bounds.x + bounds.width, y: bounds.y },
		{ x: bounds.x, y: bounds.y + bounds.height },
		{ x: bounds.x + bounds.width, y: bounds.y + bounds.height }
	].map((point) => applyMatrix(matrix, point));

	const xs = corners.map((p) => p.x);
	const ys = corners.map((p) => p.y);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

function readViewBox(root) {
	const attr = root.getAttribute('viewBox');
	if (attr) {
		const parts = attr
			.split(/[\s,]+/)
			.map((token) => parseFloat(token))
			.filter((n) => !Number.isNaN(n));
		if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
			return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
		}
	}
	// No viewBox: plain width/height attributes still define a coordinate space.
	const width = parseFloat(root.getAttribute('width'));
	const height = parseFloat(root.getAttribute('height'));
	if (width > 0 && height > 0) return { x: 0, y: 0, width, height };
	return null;
}

function unionBounds(regions) {
	const minX = Math.min(...regions.map((r) => r.bounds.x));
	const minY = Math.min(...regions.map((r) => r.bounds.y));
	const maxX = Math.max(...regions.map((r) => r.bounds.x + r.bounds.width));
	const maxY = Math.max(...regions.map((r) => r.bounds.y + r.bounds.height));
	return { x: minX, y: minY, width: maxX - minX || 1, height: maxY - minY || 1 };
}
