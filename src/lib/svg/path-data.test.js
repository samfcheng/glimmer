import { describe, expect, it } from 'vitest';
import { boundsOf, centroidOf, flattenPath, tokenizePath } from './path-data.js';

const near = (value, expected, tolerance = 0.05) => Math.abs(value - expected) <= tolerance;

describe('tokenizePath', () => {
	it('splits commands regardless of separator style', () => {
		expect(tokenizePath('M0,0L10 10')).toEqual([
			{ command: 'M', args: [0, 0] },
			{ command: 'L', args: [10, 10] }
		]);
	});

	it('reads negative numbers with no separator before the minus', () => {
		expect(tokenizePath('M10-5L-3-2')).toEqual([
			{ command: 'M', args: [10, -5] },
			{ command: 'L', args: [-3, -2] }
		]);
	});

	it('reads exponent notation', () => {
		expect(tokenizePath('M1e2 2.5e-1')).toEqual([{ command: 'M', args: [100, 0.25] }]);
	});

	it('splits repeated argument groups into one step each', () => {
		expect(tokenizePath('L1 1 2 2 3 3')).toHaveLength(3);
	});

	it('treats extra pairs after a moveto as linetos', () => {
		expect(tokenizePath('M0 0 5 5').map((s) => s.command)).toEqual(['M', 'L']);
	});
});

describe('flattenPath', () => {
	it('closes a subpath back to its start', () => {
		const [points] = flattenPath('M0 0H10V10H0Z');
		expect(points.at(-1)).toEqual({ x: 0, y: 0 });
	});

	it('handles relative commands', () => {
		const [points] = flattenPath('m5 5 h10 v10 h-10 z');
		expect(boundsOf([points])).toEqual({ x: 5, y: 5, width: 10, height: 10 });
	});

	it('returns one entry per subpath', () => {
		expect(flattenPath('M0 0H1V1Z M5 5H6V6Z')).toHaveLength(2);
	});

	it('flattens a cubic within tolerance of the true curve', () => {
		// Symmetric cubic peaking at y = -0.75 at t = 0.5.
		const [points] = flattenPath('M0 0C0 -1 1 -1 1 0');
		const lowest = Math.min(...points.map((p) => p.y));
		expect(near(lowest, -0.75, 0.02)).toBe(true);
	});

	it('mirrors the previous control point for S', () => {
		const explicit = flattenPath('M0 0C0 -1 1 -1 1 0C1 1 2 1 2 0');
		const smooth = flattenPath('M0 0C0 -1 1 -1 1 0S2 1 2 0');
		expect(boundsOf(smooth)).toEqual(boundsOf(explicit));
	});

	it('traces an arc through its far side', () => {
		// Half-circle of radius 5 sweeping below the axis.
		const bounds = boundsOf(flattenPath('M0 0A5 5 0 0 1 10 0'));
		expect(near(bounds.width, 10, 0.1)).toBe(true);
		expect(near(bounds.height, 5, 0.1)).toBe(true);
	});

	it('scales up radii too small to span the endpoints', () => {
		const bounds = boundsOf(flattenPath('M0 0A1 1 0 0 1 10 0'));
		expect(near(bounds.width, 10, 0.1)).toBe(true);
		expect(Number.isNaN(bounds.height)).toBe(false);
	});

	it('ignores a malformed tail rather than dropping the whole path', () => {
		expect(flattenPath('M0 0H10V10H0Z L')).toHaveLength(1);
	});
});

describe('centroidOf', () => {
	it('finds the centre of a square', () => {
		expect(centroidOf(flattenPath('M0 0H10V10H0Z'))).toEqual({ x: 5, y: 5 });
	});

	it('is winding-independent', () => {
		const clockwise = centroidOf(flattenPath('M0 0H10V10H0Z'));
		const counter = centroidOf(flattenPath('M0 0V10H10V0Z'));
		expect(counter.x).toBeCloseTo(clockwise.x, 6);
		expect(counter.y).toBeCloseTo(clockwise.y, 6);
	});

	it('pulls toward the mass of an L-shape, unlike a bbox centre', () => {
		// L occupying the left column and bottom row of a 10x10 box.
		const centroid = centroidOf(flattenPath('M0 0H4V6H10V10H0Z'));
		const bbox = boundsOf(flattenPath('M0 0H4V6H10V10H0Z'));
		const bboxCentre = { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
		expect(centroid.x).toBeLessThan(bboxCentre.x);
		expect(centroid.y).toBeGreaterThan(bboxCentre.y);
	});

	it('falls back to the bbox centre for a zero-area shape', () => {
		expect(centroidOf(flattenPath('M0 0H10'))).toEqual({ x: 5, y: 0 });
	});

	it('returns null when there is nothing to measure', () => {
		expect(centroidOf([])).toBe(null);
	});
});
