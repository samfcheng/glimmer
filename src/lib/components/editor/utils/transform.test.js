import { describe, expect, it } from 'vitest';
import {
	clampZoom,
	computeFitTransform,
	contentCssTransform,
	contentToScreen,
	contentTransformAttr,
	panForZoom,
	screenToContent
} from './transform.js';

const SQUARE = { x: 0, y: 0, width: 100, height: 100 };

describe('computeFitTransform', () => {
	it('fits the limiting axis and centres on the other', () => {
		// A 100x100 square in a 400x200 viewport: height is the constraint.
		const t = computeFitTransform(400, 200, SQUARE);
		expect(t.scale).toBe(2);
		expect(t.offsetX).toBe(100); // (400 - 200) / 2
		expect(t.offsetY).toBe(0);
	});

	it('keeps the padding clear on every side', () => {
		const t = computeFitTransform(400, 200, SQUARE, 20);
		expect(t.scale).toBe(1.6); // (200 - 40) / 100
		expect(t.offsetY).toBe(20);
	});

	it('falls back to identity rather than NaN on degenerate input', () => {
		// First layout pass, or nothing loaded yet — callers shouldn't have to guard.
		for (const args of [
			[0, 0, SQUARE],
			[400, 200, null],
			[400, 200, { x: 0, y: 0, width: 0, height: 0 }]
		]) {
			expect(computeFitTransform(...args)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
		}
	});
});

describe('screenToContent / contentToScreen', () => {
	const transform = { scale: 2, offsetX: 100, offsetY: 0 };

	it('round-trips a point', () => {
		const point = { x: 37, y: 64 };
		const back = screenToContent(contentToScreen(point, transform, SQUARE), transform, SQUARE);
		expect(back.x).toBeCloseTo(point.x);
		expect(back.y).toBeCloseTo(point.y);
	});

	it('accounts for bounds that do not start at the origin', () => {
		// The viewBox offset has to be subtracted, or every mapped point is
		// shifted by the origin — the bug that slides overlays off their target.
		const shifted = { x: 50, y: 50, width: 100, height: 100 };
		expect(contentToScreen({ x: 50, y: 50 }, transform, shifted)).toEqual({ x: 100, y: 0 });
	});
});

describe('transform strings', () => {
	it('emits an SVG attribute that composes offset, scale and origin', () => {
		expect(contentTransformAttr({ scale: 2, offsetX: 10, offsetY: 5 }, { x: 3, y: 4 })).toBe(
			'translate(10 5) scale(2) translate(-3 -4)'
		);
	});

	it('emits the same mapping in CSS units', () => {
		expect(contentCssTransform({ scale: 2, offsetX: 10, offsetY: 5 }, { x: 3, y: 4 })).toBe(
			'translate(10px, 5px) scale(2) translate(-3px, -4px)'
		);
	});
});

describe('clampZoom', () => {
	it('holds the zoom inside its range', () => {
		expect(clampZoom(0.01, 0.1, 8)).toBe(0.1);
		expect(clampZoom(99, 0.1, 8)).toBe(8);
		expect(clampZoom(1.5, 0.1, 8)).toBe(1.5);
	});
});

describe('panForZoom', () => {
	// The whole point of anchored zoom: whatever content pixel sits under the
	// cursor before the zoom must still sit under it afterwards. Checked by
	// mapping the anchor back to content space on both sides of the change.
	const base = computeFitTransform(400, 200, SQUARE); // scale 2, offsetX 100

	function contentUnder(anchor, zoom, pan) {
		const scale = base.scale * zoom;
		return {
			x: (anchor.x - (base.offsetX + pan.panX)) / scale,
			y: (anchor.y - (base.offsetY + pan.panY)) / scale
		};
	}

	it('pins the point under the anchor across a zoom in', () => {
		const anchor = { x: 250, y: 60 };
		const before = contentUnder(anchor, 1, { panX: 0, panY: 0 });

		const current = { scale: base.scale, offsetX: base.offsetX, offsetY: base.offsetY };
		const after = panForZoom(anchor, current, base, 3);

		const now = contentUnder(anchor, 3, after);
		expect(now.x).toBeCloseTo(before.x);
		expect(now.y).toBeCloseTo(before.y);
	});

	it('pins it across a zoom out from an already-panned view', () => {
		const anchor = { x: 120, y: 180 };
		const pan = { panX: -60, panY: 25 };
		const zoom = 2.5;
		const current = {
			scale: base.scale * zoom,
			offsetX: base.offsetX + pan.panX,
			offsetY: base.offsetY + pan.panY
		};
		const before = contentUnder(anchor, zoom, pan);

		const after = panForZoom(anchor, current, base, 0.8);
		const now = contentUnder(anchor, 0.8, after);
		expect(now.x).toBeCloseTo(before.x);
		expect(now.y).toBeCloseTo(before.y);
	});

	it('leaves the centre alone when the anchor is the centre of an unpanned fit', () => {
		const anchor = { x: 200, y: 100 };
		const current = { scale: base.scale, offsetX: base.offsetX, offsetY: base.offsetY };
		const after = panForZoom(anchor, current, base, 2);
		// The content centre is already at the viewport centre, so pinning it
		// there means pan stays symmetric about the fit — no drift.
		expect(after.panX).toBeCloseTo(-100);
		expect(after.panY).toBeCloseTo(-100);
	});
});
