import { describe, expect, it } from 'vitest';
import { waveCoordinates, waveLevels } from './waves.js';

const frame = { x: 0, y: 0, width: 100, height: 100 };
const at = (...points) =>
	points.map(([x, y], i) => ({ centroid: { x, y }, threshold: (i + 1) / (points.length + 1) }));

describe('waveCoordinates', () => {
	const regions = at([50, 0], [50, 100], [0, 50], [100, 50], [50, 50]);

	it('runs 0 to 1 down the frame', () => {
		const u = waveCoordinates(regions, frame, 'down');
		expect(u[0]).toBe(0);
		expect(u[1]).toBe(1);
	});

	it('inverts for the opposite direction', () => {
		const down = waveCoordinates(regions, frame, 'down');
		const up = waveCoordinates(regions, frame, 'up');
		expect(up.map((v) => 1 - v)).toEqual(down);
	});

	it('runs left to right', () => {
		const u = waveCoordinates(regions, frame, 'right');
		expect(u[2]).toBe(0);
		expect(u[3]).toBe(1);
	});

	it('measures radially from the centre to the corner', () => {
		const u = waveCoordinates(at([50, 50], [100, 100]), frame, 'out');
		expect(u[0]).toBe(0);
		expect(u[1]).toBeCloseTo(1, 9); // the corner is exactly the max radius
	});

	it('reaches every corner at the same moment', () => {
		const corners = waveCoordinates(at([0, 0], [100, 0], [0, 100], [100, 100]), frame, 'out');
		expect(new Set(corners.map((v) => v.toFixed(9))).size).toBe(1);
	});

	it('moves the radial origin with the centre offset', () => {
		const regions = at([0, 0], [100, 100]);
		const shifted = waveCoordinates(regions, frame, 'out', { x: -0.5, y: -0.5 });
		expect(shifted[0]).toBe(0); // the centre is now the top-left corner
		expect(shifted[1]).toBeCloseTo(1, 9); // and the far corner is the furthest
	});

	it('keeps u within 0-1 however far the centre is dragged', () => {
		const regions = at([0, 0], [50, 50], [100, 100]);
		for (const centre of [
			{ x: 0, y: 0 },
			{ x: 0.5, y: -0.5 },
			{ x: 1, y: 1 },
			{ x: -1, y: 0.25 }
		]) {
			const u = waveCoordinates(regions, frame, 'out', centre);
			expect(u.every((v) => v >= 0 && v <= 1)).toBe(true);
		}
	});

	it('matches the old centre-to-corner behaviour at zero offset', () => {
		const regions = at([50, 50], [100, 100], [0, 100]);
		expect(waveCoordinates(regions, frame, 'out', { x: 0, y: 0 })).toEqual(
			waveCoordinates(regions, frame, 'out')
		);
	});

	it('ignores the centre offset for linear directions', () => {
		const regions = at([0, 0], [50, 50], [100, 100]);
		for (const direction of ['down', 'up', 'left', 'right']) {
			expect(waveCoordinates(regions, frame, direction, { x: 0.4, y: -0.3 })).toEqual(
				waveCoordinates(regions, frame, direction)
			);
		}
	});

	it('falls back to down for an unknown direction', () => {
		expect(waveCoordinates(regions, frame, 'sideways')).toEqual(
			waveCoordinates(regions, frame, 'down')
		);
	});

	it('survives a degenerate frame without NaNs', () => {
		const u = waveCoordinates(at([0, 0]), { x: 0, y: 0, width: 0, height: 0 }, 'out');
		expect(Number.isNaN(u[0])).toBe(false);
	});
});

describe('waveLevels', () => {
	const regions = at([0, 0], [0, 25], [0, 50], [0, 75], [0, 100]);
	const coords = waveCoordinates(regions, frame, 'down');
	const hard = (overrides) =>
		waveLevels(coords, regions, { wavelength: 1, band: 0.4, softness: 0, ...overrides });

	it('lights the leading share of each cycle', () => {
		// band 0.4 of a single wave: u = 0 and 0.25 are inside, 0.5 and 0.75
		// are not — and u = 1 is the start of the next cycle, so it is lit too.
		expect(hard({})).toEqual([1, 1, 0, 0, 1]);
	});

	it('lights nothing at zero band and everything at full band', () => {
		expect(hard({ band: 0 }).every((v) => v === 0)).toBe(true);
		expect(hard({ band: 1 }).every((v) => v === 1)).toBe(true);
	});

	it('repeats the pattern once per wavelength', () => {
		const short = hard({ wavelength: 0.5 });
		// u = 0 and u = 0.5 sit at the same point of their cycle.
		expect(short[0]).toBe(short[2]);
	});

	it('travels: the band moves onto later regions over time', () => {
		const start = hard({ speed: 1, time: 0 });
		const later = hard({ speed: 1, time: 0.5 });
		expect(later).not.toEqual(start);
		expect(later[2]).toBe(1); // the crest has reached the middle
		expect(later[0]).toBe(0); // and left the top
	});

	it('is periodic in time at one wave per second', () => {
		expect(hard({ speed: 1, time: 3 })).toEqual(hard({ speed: 1, time: 0 }));
	});

	it('holds still at zero speed', () => {
		expect(hard({ speed: 0, time: 9 })).toEqual(hard({ speed: 0, time: 0 }));
	});

	it('keeps the band core lit when softening', () => {
		// Centre of the band (u = 0.2 of a 0.4 band) is deepest, so always lit.
		const centred = at([0, 20]);
		const levels = waveLevels(waveCoordinates(centred, frame, 'down'), centred, {
			wavelength: 1,
			band: 0.4,
			softness: 1
		});
		expect(levels).toEqual([1]);
	});

	it('decides a soft edge by the region own threshold', () => {
		// u = 0.05 -> depth 0.5 into a fully soft band of width 0.4.
		const shallow = [{ centroid: { x: 0, y: 5 }, threshold: 0.9 }];
		const deep = [{ centroid: { x: 0, y: 5 }, threshold: 0.1 }];
		const options = { wavelength: 1, band: 0.4, softness: 1 };
		expect(waveLevels(waveCoordinates(shallow, frame, 'down'), shallow, options)).toEqual([0]);
		expect(waveLevels(waveCoordinates(deep, frame, 'down'), deep, options)).toEqual([1]);
	});

	it('is stable frame to frame at a fixed time', () => {
		const many = Array.from({ length: 100 }, (_, i) => ({
			centroid: { x: 0, y: i },
			threshold: ((i * 37) % 100) / 100
		}));
		const c = waveCoordinates(many, frame, 'down');
		const options = { wavelength: 1, band: 0.5, softness: 1, time: 0.3, speed: 1 };
		expect(waveLevels(c, many, options)).toEqual(waveLevels(c, many, options));
	});

	it('rerolls every call when twinkling', () => {
		const many = Array.from({ length: 100 }, (_, i) => ({
			centroid: { x: 0, y: i },
			threshold: 0.5
		}));
		const c = waveCoordinates(many, frame, 'down');
		const options = { wavelength: 1, band: 0.9, softness: 1, twinkle: true };
		expect(waveLevels(c, many, options)).not.toEqual(waveLevels(c, many, options));
	});

	it('softening only ever removes lit regions', () => {
		const many = Array.from({ length: 200 }, (_, i) => ({
			centroid: { x: 0, y: i / 2 },
			threshold: ((i * 61) % 200) / 200
		}));
		const c = waveCoordinates(many, frame, 'down');
		const sharp = waveLevels(c, many, { wavelength: 0.3, band: 0.5, softness: 0 });
		const soft = waveLevels(c, many, { wavelength: 0.3, band: 0.5, softness: 1 });
		expect(soft.every((level, i) => level <= sharp[i])).toBe(true);
	});
});
