import { describe, expect, it } from 'vitest';
import { computeFitTransform, frameToScreen, screenToFrame } from './transform.js';

const frame = { x: 0, y: 0, width: 200, height: 100 };

describe('computeFitTransform', () => {
	it('fits by the tighter axis and centres', () => {
		const t = computeFitTransform(400, 400, frame);
		expect(t.scale).toBe(2);
		expect(t.offsetX).toBe(0);
		expect(t.offsetY).toBe(100);
	});

	it('leaves the requested padding clear', () => {
		const t = computeFitTransform(400, 400, frame, 40);
		expect(t.scale).toBe(1.6);
		expect(t.offsetX).toBe(40);
	});

	it('degrades to identity with nothing to fit', () => {
		expect(computeFitTransform(400, 400, null)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
		expect(computeFitTransform(0, 0, frame)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
	});
});

describe('frame <-> screen', () => {
	it('round-trips a point', () => {
		const t = computeFitTransform(400, 400, frame, 40);
		const point = { x: 37, y: 61 };
		const back = screenToFrame(frameToScreen(point, t, frame), t, frame);
		expect(back.x).toBeCloseTo(point.x, 9);
		expect(back.y).toBeCloseTo(point.y, 9);
	});

	it('accounts for a viewBox origin offset', () => {
		const offsetFrame = { x: 100, y: 50, width: 200, height: 100 };
		const t = computeFitTransform(400, 400, offsetFrame);
		expect(frameToScreen({ x: 100, y: 50 }, t, offsetFrame)).toEqual({ x: 0, y: 100 });
	});
});
