import { describe, expect, it } from 'vitest';
import { createRng } from './rng.js';
import { randomLevels, rollRegions } from './random.js';
import { easeToward, interactiveLevels, levelsMatch } from './interactive.js';

const regionsAt = (...points) =>
	points.map(([x, y], i) => ({ centroid: { x, y }, threshold: (i + 1) / (points.length + 1) }));

describe('createRng', () => {
	it('is deterministic for a seed', () => {
		const a = createRng(42);
		const b = createRng(42);
		expect([a(), a(), a()]).toEqual([b(), b(), b()]);
	});

	it('differs between seeds', () => {
		expect(createRng(1)()).not.toBe(createRng(2)());
	});

	it('stays in [0, 1)', () => {
		const rng = createRng(7);
		for (let i = 0; i < 500; i += 1) {
			const value = rng();
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
	});
});

describe('random mode', () => {
	it('rolls one value per region, reproducibly from the seed', () => {
		expect(rollRegions(5, 99)).toEqual(rollRegions(5, 99));
		expect(rollRegions(5, 99)).toHaveLength(5);
	});

	it('lights nothing at 0 and everything at 1', () => {
		const rolls = rollRegions(50, 3);
		expect(randomLevels(rolls, 0).every((v) => v === 0)).toBe(true);
		expect(randomLevels(rolls, 1).every((v) => v === 1)).toBe(true);
	});

	it('only ever adds windows as lit chance rises', () => {
		const rolls = rollRegions(200, 11);
		const low = randomLevels(rolls, 0.3);
		const high = randomLevels(rolls, 0.6);
		expect(low.every((level, i) => level <= high[i])).toBe(true);
		expect(high.filter(Boolean).length).toBeGreaterThan(low.filter(Boolean).length);
	});

	it('lands near the requested share over many regions', () => {
		const lit = randomLevels(rollRegions(2000, 5), 0.25).filter(Boolean).length;
		expect(lit / 2000).toBeGreaterThan(0.2);
		expect(lit / 2000).toBeLessThan(0.3);
	});
});

describe('easeToward', () => {
	it('snaps when there is no previous position', () => {
		expect(easeToward(null, { x: 3, y: 4 }, 0.2, 0.016)).toEqual({ x: 3, y: 4 });
	});

	it('snaps at zero lag', () => {
		expect(easeToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, 0.016)).toEqual({ x: 10, y: 0 });
	});

	it('closes ~63% of the gap over one time constant', () => {
		const next = easeToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5, 0.5);
		expect(next.x).toBeCloseTo(63.2, 0);
	});

	it('lands in the same place regardless of frame rate', () => {
		let slow = { x: 0, y: 0 };
		let fast = { x: 0, y: 0 };
		const target = { x: 100, y: 0 };
		for (let i = 0; i < 30; i += 1) slow = easeToward(slow, target, 0.2, 1 / 30);
		for (let i = 0; i < 120; i += 1) fast = easeToward(fast, target, 0.2, 1 / 120);
		expect(fast.x).toBeCloseTo(slow.x, 6);
	});

	it('approaches without overshooting', () => {
		let position = { x: 0, y: 0 };
		for (let i = 0; i < 200; i += 1) position = easeToward(position, { x: 10, y: 0 }, 0.1, 0.016);
		expect(position.x).toBeLessThanOrEqual(10);
		expect(position.x).toBeCloseTo(10, 3);
	});
});

describe('interactiveLevels', () => {
	const regions = regionsAt([0, 0], [5, 0], [20, 0]);

	it('is a hard cut-off with no smoothing', () => {
		expect(interactiveLevels(regions, { x: 0, y: 0 }, 10, 0)).toEqual([1, 1, 0]);
	});

	it('lights nothing without a cursor position', () => {
		expect(interactiveLevels(regions, null, 10, 0)).toEqual([0, 0, 0]);
	});

	it('lights nothing at zero radius', () => {
		expect(interactiveLevels(regions, { x: 0, y: 0 }, 0, 0.5)).toEqual([0, 0, 0]);
	});

	it('keeps the core lit and the outside dark when smoothing', () => {
		// radius 10, smoothing 0.5 -> band from 5 to 10; region at 0 is core,
		// region at 20 is outside, region at 5 sits exactly at the band edge.
		const levels = interactiveLevels(regions, { x: 0, y: 0 }, 10, 0.5);
		expect(levels[0]).toBe(1);
		expect(levels[2]).toBe(0);
	});

	it('decides band regions by their own threshold', () => {
		// One region, distance 7.5 -> depth 0.5 into a band spanning 5..10.
		const shallow = [{ centroid: { x: 7.5, y: 0 }, threshold: 0.9 }];
		const deep = [{ centroid: { x: 7.5, y: 0 }, threshold: 0.1 }];
		expect(interactiveLevels(shallow, { x: 0, y: 0 }, 10, 0.5)).toEqual([0]);
		expect(interactiveLevels(deep, { x: 0, y: 0 }, 10, 0.5)).toEqual([1]);
	});

	it('is stable frame to frame for a stationary circle', () => {
		const many = Array.from({ length: 100 }, (_, i) => ({
			centroid: { x: i * 0.2, y: 0 },
			threshold: (i * 37) % 100 / 100
		}));
		const first = interactiveLevels(many, { x: 0, y: 0 }, 10, 1);
		const second = interactiveLevels(many, { x: 0, y: 0 }, 10, 1);
		expect(levelsMatch(first, second)).toBe(true);
	});

	it('re-rolls every call when twinkling', () => {
		const many = Array.from({ length: 100 }, (_, i) => ({
			centroid: { x: i * 0.1, y: 0 },
			threshold: 0.5
		}));
		const first = interactiveLevels(many, { x: 0, y: 0 }, 10, 1, { twinkle: true });
		const second = interactiveLevels(many, { x: 0, y: 0 }, 10, 1, { twinkle: true });
		expect(levelsMatch(first, second)).toBe(false);
	});

	it('lights strictly more as the smoothing band shrinks the dither zone', () => {
		const many = Array.from({ length: 200 }, (_, i) => ({
			centroid: { x: (i / 200) * 10, y: 0 },
			threshold: ((i * 61) % 200) / 200
		}));
		const soft = interactiveLevels(many, { x: 0, y: 0 }, 10, 1).filter(Boolean).length;
		const hard = interactiveLevels(many, { x: 0, y: 0 }, 10, 0).filter(Boolean).length;
		expect(hard).toBeGreaterThan(soft);
	});
});

describe('levelsMatch', () => {
	it('compares element-wise', () => {
		expect(levelsMatch([1, 0], [1, 0])).toBe(true);
		expect(levelsMatch([1, 0], [1, 1])).toBe(false);
		expect(levelsMatch([1], [1, 0])).toBe(false);
		expect(levelsMatch(null, [1])).toBe(false);
	});
});
