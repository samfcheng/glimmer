import { describe, expect, it } from 'vitest';
import {
	ANIMATION_KINDS,
	animationLayout,
	arrivalsFor,
	createStep,
	ease,
	hash01,
	kindSpec,
	normalizeStep,
	normalizeSteps,
	sequenceLevels,
	sequenceStarts,
	stepEnd,
	stepLevels,
	stepOffsets,
	timelineAt,
	totalDuration,
	DEFAULT_SEQUENCE
} from './animation.js';

/** A 4x4 grid of regions in an 80x80 frame, with evenly spread thresholds. */
function grid(size = 4) {
	const regions = [];
	for (let row = 0; row < size; row += 1) {
		for (let column = 0; column < size; column += 1) {
			const index = row * size + column;
			regions.push({
				id: `r${index}`,
				centroid: { x: column * 20 + 10, y: row * 20 + 10 },
				threshold: index / (size * size)
			});
		}
	}
	return regions;
}

const layoutOf = (regions = grid()) =>
	animationLayout(regions, { x: 0, y: 0, width: 80, height: 80 });

const step = (overrides) => normalizeStep(overrides);

describe('ease', () => {
	it('pins both ends whatever the curve', () => {
		for (const { value } of [{ value: 'linear' }, { value: 'in' }, { value: 'out' }, { value: 'inOut' }]) {
			expect(ease(value, 0)).toBe(0);
			expect(ease(value, 1)).toBe(1);
		}
	});

	it('clamps out-of-range progress', () => {
		expect(ease('linear', -2)).toBe(0);
		expect(ease('linear', 5)).toBe(1);
	});

	it('leads and lags around the midpoint', () => {
		expect(ease('in', 0.5)).toBeLessThan(0.5);
		expect(ease('out', 0.5)).toBeGreaterThan(0.5);
		expect(ease('inOut', 0.5)).toBeCloseTo(0.5);
	});

	it('falls back to linear for an unknown name', () => {
		expect(ease('nonsense', 0.3)).toBeCloseTo(0.3);
	});
});

describe('hash01', () => {
	it('is stable for the same inputs and spread over [0,1)', () => {
		expect(hash01(3, 9)).toBe(hash01(3, 9));
		const values = Array.from({ length: 200 }, (_, i) => hash01(i, 1));
		expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...values)).toBeLessThan(1);
		expect(new Set(values).size).toBeGreaterThan(190);
	});

	it('separates the two arguments', () => {
		expect(hash01(1, 2)).not.toBe(hash01(2, 1));
	});
});

describe('animationLayout', () => {
	it('normalises centroids against the frame and carries its aspect', () => {
		const layout = animationLayout(grid(2), { x: 0, y: 0, width: 80, height: 40 });
		expect(layout.aspect).toBe(2);
		expect(layout.points[0]).toEqual({ nx: 10 / 80, ny: 10 / 40, threshold: 0 });
	});

	it('survives an empty scene', () => {
		expect(animationLayout([], null).points).toEqual([]);
	});
});

describe('normalizeStep', () => {
	it('fills a bare step out with the kind defaults', () => {
		const filled = step({ kind: 'wipe' });
		expect(filled.options.angle).toBe(kindSpec('wipe').options.angle);
		expect(filled.durationMs).toBe(kindSpec('wipe').durationMs);
		expect(filled.direction).toBe('on');
	});

	it('falls back to Fade for an unknown kind, so an old demo file still plays', () => {
		expect(step({ kind: 'teleport' }).kind).toBe('fade');
	});

	it('drops options the kind does not have', () => {
		expect(step({ kind: 'wipe', options: { angle: 30, nonsense: 9 } }).options).toEqual({ angle: 30 });
	});

	it('keeps an existing id so re-normalising does not churn list keys', () => {
		expect(step({ id: 'step-99', kind: 'fade' }).id).toBe('step-99');
		expect(createStep().id).not.toBe(createStep().id);
	});

	it('clamps and rejects nonsense values', () => {
		expect(step({ kind: 'fade', durationMs: -5 }).durationMs).toBe(0);
		expect(step({ kind: 'fade', durationMs: 'soon' }).durationMs).toBe(kindSpec('fade').durationMs);
		expect(step({ kind: 'fade', scatter: 4 }).scatter).toBe(1);
		expect(step({ kind: 'fade', easing: 'bouncy' }).easing).toBe('inOut');
		expect(step({ kind: 'fade', direction: 'sideways' }).direction).toBe('on');
	});

	it('treats anything that is not an array as an empty sequence', () => {
		expect(normalizeSteps(null)).toEqual([]);
		expect(normalizeSteps({ kind: 'fade' })).toEqual([]);
	});
});

describe('timelineAt', () => {
	const steps = normalizeSteps([
		{ kind: 'fade', durationMs: 1000 },
		{ kind: 'hold', durationMs: 500 },
		{ kind: 'wipe', durationMs: 1500 }
	]);

	it('sums the durations', () => {
		expect(totalDuration(steps)).toBe(3000);
		expect(stepOffsets(steps)).toEqual([0, 1000, 1500]);
	});

	it('finds the step and its progress', () => {
		expect(timelineAt(steps, 0)).toMatchObject({ index: 0, progress: 0 });
		expect(timelineAt(steps, 500)).toMatchObject({ index: 0, progress: 0.5 });
		// A boundary belongs to the step starting there, not the one ending.
		expect(timelineAt(steps, 1000)).toMatchObject({ index: 1, progress: 0 });
		expect(timelineAt(steps, 2250)).toMatchObject({ index: 2, progress: 0.5 });
	});

	it('wraps when looping, including from a negative clock', () => {
		expect(timelineAt(steps, 3200)).toMatchObject({ index: 0, progress: 0.2 });
		expect(timelineAt(steps, -200)).toMatchObject({ index: 2 });
	});

	it('holds on the last frame when not looping', () => {
		expect(timelineAt(steps, 99999, false)).toMatchObject({ index: 2, progress: 1 });
		expect(timelineAt(steps, -5, false)).toMatchObject({ index: 0, progress: 0 });
	});

	it('reports nothing for an empty or zero-length sequence', () => {
		expect(timelineAt([], 10)).toBeNull();
		expect(timelineAt(normalizeSteps([{ kind: 'fade', durationMs: 0 }]), 10)).toBeNull();
	});
});

describe('arrivalsFor', () => {
	const layout = layoutOf();

	it('gives every transition a full [0,1] spread', () => {
		for (const kind of ANIMATION_KINDS.filter((k) => !k.sustained)) {
			const arrivals = arrivalsFor(step({ kind: kind.value, scatter: 0 }), layout);
			expect(Math.min(...arrivals), kind.value).toBeCloseTo(0);
			expect(Math.max(...arrivals), kind.value).toBeCloseTo(1, 1);
		}
	});

	it('has none for the sustained kinds', () => {
		for (const kind of ANIMATION_KINDS.filter((k) => k.sustained)) {
			expect(arrivalsFor(step({ kind: kind.value }), layout)).toBeNull();
		}
	});

	it('orders a downward wipe by row and a rightward one by column', () => {
		const down = arrivalsFor(step({ kind: 'wipe', scatter: 0, options: { angle: 90 } }), layout);
		expect(down[0]).toBeLessThan(down[12]); // top row before bottom row
		expect(down[0]).toBeCloseTo(down[3]); // same row, same moment

		const right = arrivalsFor(step({ kind: 'wipe', scatter: 0, options: { angle: 0 } }), layout);
		expect(right[0]).toBeLessThan(right[3]);
		expect(right[0]).toBeCloseTo(right[12]);
	});

	it('starts a split at the edges and reverses when it starts at the middle', () => {
		const edges = arrivalsFor(step({ kind: 'split', scatter: 0, options: { from: 'edges' } }), layout);
		const middle = arrivalsFor(step({ kind: 'split', scatter: 0, options: { from: 'centre' } }), layout);
		expect(edges[0]).toBeLessThan(edges[4]); // top row lights before the second row
		expect(middle[0]).toBeGreaterThan(middle[4]);
	});

	it('turns a ripple inside out', () => {
		const out = arrivalsFor(step({ kind: 'ripple', scatter: 0 }), layout);
		const inward = arrivalsFor(
			step({ kind: 'ripple', scatter: 0, options: { direction: 'in' } }),
			layout
		);
		// The corner is furthest from the centre, so it goes last outwards and first inwards.
		expect(out[0]).toBeGreaterThan(out[5]);
		expect(inward[0]).toBeLessThan(inward[5]);
	});

	it('sweeps weave rows in from alternating sides', () => {
		const arrivals = arrivalsFor(
			step({ kind: 'weave', scatter: 0, options: { rows: 4, stagger: 0 } }),
			layout
		);
		// Row 0 runs left to right, row 1 right to left.
		expect(arrivals[0]).toBeLessThan(arrivals[3]);
		expect(arrivals[4]).toBeGreaterThan(arrivals[7]);
		// With no stagger every row sweeps at once, so both rows span the step.
		expect(arrivals[0]).toBeCloseTo(arrivals[7]);
	});

	it('separates weave rows as stagger rises, reaching a row at a time at 1', () => {
		const rowSpan = (stagger) => {
			const arrivals = arrivalsFor(
				step({ kind: 'weave', scatter: 0, options: { rows: 4, stagger } }),
				layout
			);
			return { firstRowLast: Math.max(...arrivals.slice(0, 4)), secondRowFirst: Math.min(...arrivals.slice(4, 8)) };
		};
		// At 0 the rows overlap completely; at 1 the second waits for the first.
		expect(rowSpan(0).secondRowFirst).toBeLessThan(rowSpan(0).firstRowLast);
		expect(rowSpan(1).secondRowFirst).toBeGreaterThan(rowSpan(1).firstRowLast);
	});

	it('flips which side the weave starts from', () => {
		const fromLeft = arrivalsFor(
			step({ kind: 'weave', scatter: 0, options: { rows: 4, stagger: 0, start: 'left' } }),
			layout
		);
		const fromRight = arrivalsFor(
			step({ kind: 'weave', scatter: 0, options: { rows: 4, stagger: 0, start: 'right' } }),
			layout
		);
		expect(fromRight[0]).toBeCloseTo(1 - fromLeft[0]);
	});

	it('reverses alternate rows when the typewriter snakes back', () => {
		const plain = arrivalsFor(
			step({ kind: 'typewriter', scatter: 0, options: { rows: 4, serpentine: false } }),
			layout
		);
		const snake = arrivalsFor(
			step({ kind: 'typewriter', scatter: 0, options: { rows: 4, serpentine: true } }),
			layout
		);
		expect(plain[4]).toBeLessThan(plain[7]); // second row still runs left to right
		expect(snake[4]).toBeGreaterThan(snake[7]); // …and now right to left
	});

	it('blooms outward from its seeds', () => {
		const arrivals = arrivalsFor(step({ kind: 'bloom', scatter: 0, options: { seeds: 1 } }), layout);
		// The single seed is the lowest-threshold region, which this grid puts first.
		expect(arrivals[0]).toBe(0);
		expect(arrivals[15]).toBeCloseTo(1);
	});

	it('blends toward the region thresholds as scatter rises, and matches Fade at 1', () => {
		const crisp = arrivalsFor(step({ kind: 'wipe', scatter: 0 }), layout);
		const frayed = arrivalsFor(step({ kind: 'wipe', scatter: 0.5 }), layout);
		const scattered = arrivalsFor(step({ kind: 'wipe', scatter: 1 }), layout);
		expect(frayed[3]).toBeCloseTo(crisp[3] * 0.5 + layout.points[3].threshold * 0.5);
		expect(scattered).toEqual(layout.points.map((p) => p.threshold));
	});

	it('leaves Fade alone, since its order is already the thresholds', () => {
		const plain = arrivalsFor(step({ kind: 'fade', scatter: 0 }), layout);
		const scattered = arrivalsFor(step({ kind: 'fade', scatter: 1 }), layout);
		expect(scattered).toEqual(plain);
	});
});

describe('stepLevels', () => {
	const layout = layoutOf();
	const dark = layout.points.map(() => 0);
	const lit = layout.points.map(() => 1);

	it('holds the incoming state until a region arrives, then flips it', () => {
		const wipe = step({ kind: 'wipe', scatter: 0, easing: 'linear', options: { angle: 90 } });
		const arrivals = arrivalsFor(wipe, layout);
		const half = stepLevels(wipe, dark, layout, { progress: 0.5, arrivals });
		expect(half[0]).toBe(1); // top row has arrived
		expect(half[15]).toBe(0); // bottom row has not
	});

	it('turns regions off when the direction is off, from wherever they were', () => {
		const wipe = step({ kind: 'wipe', direction: 'off', scatter: 0, easing: 'linear' });
		const half = stepLevels(wipe, lit, layout, { progress: 0.5 });
		expect(half[0]).toBe(0);
		expect(half[15]).toBe(1);
	});

	it('lands every region on the target by the end, whatever it started from', () => {
		for (const kind of ANIMATION_KINDS.filter((k) => !k.sustained)) {
			const on = stepLevels(step({ kind: kind.value }), dark, layout, { progress: 1 });
			expect(on, kind.value).toEqual(lit);
			const off = stepLevels(step({ kind: kind.value, direction: 'off' }), lit, layout, {
				progress: 1
			});
			expect(off, kind.value).toEqual(dark);
		}
	});

	it('leaves the scene untouched through a Hold', () => {
		const held = stepLevels(step({ kind: 'hold' }), lit, layout, { progress: 0.5, elapsedMs: 400 });
		expect(held).toEqual(lit);
		expect(held).not.toBe(lit); // a copy, never the caller's array
	});

	it('churns a Twinkle in whichever direction its mode asks for', () => {
		const at = (mode, from) =>
			stepLevels(step({ kind: 'twinkle', options: { mode, density: 0.5, rate: 10 } }), from, layout, {
				progress: 0.5,
				elapsedMs: 500
			});
		// `add` only ever lights more; `remove` only ever puts lit ones out.
		expect(at('add', lit)).toEqual(lit);
		expect(at('remove', dark)).toEqual(dark);
		const sparkled = at('add', dark);
		expect(sparkled.some((level) => level === 1)).toBe(true);
	});

	it('redraws a Twinkle only on its own tick, not every frame', () => {
		const twinkle = step({ kind: 'twinkle', options: { rate: 2 } });
		const early = stepLevels(twinkle, dark, layout, { elapsedMs: 100 });
		const sameTick = stepLevels(twinkle, dark, layout, { elapsedMs: 400 });
		const nextTick = stepLevels(twinkle, dark, layout, { elapsedMs: 600 });
		expect(sameTick).toEqual(early);
		expect(nextTick).not.toEqual(early);
	});

	it('keeps a Strobe scoped to the lit windows when asked', () => {
		const strobe = step({
			kind: 'strobe',
			options: { scope: 'lit', rate: 1, duty: 1, smooth: false }
		});
		const from = layout.points.map((_, i) => (i % 2 === 0 ? 1 : 0));
		expect(stepLevels(strobe, from, layout, { elapsedMs: 0 })).toEqual(from);
	});

	it('pulses a Strobe on and off across its cycle', () => {
		const strobe = step({ kind: 'strobe', options: { rate: 1, duty: 0.5, smooth: false } });
		expect(stepLevels(strobe, dark, layout, { elapsedMs: 100 })[0]).toBe(1);
		expect(stepLevels(strobe, dark, layout, { elapsedMs: 700 })[0]).toBe(0);
	});

	it('moves a Chase band along without lighting everything', () => {
		const chase = step({ kind: 'chase', options: { band: 0.3, softness: 0, cycles: 1 } });
		const early = stepLevels(chase, dark, layout, { progress: 0, elapsedMs: 0 });
		const later = stepLevels(chase, dark, layout, { progress: 0.5, elapsedMs: 1500 });
		expect(early.some((level) => level === 0)).toBe(true);
		expect(later).not.toEqual(early);
	});
});

describe('the sequence', () => {
	const layout = layoutOf();

	it('starts dark and hands each step the last one’s ending', () => {
		const steps = normalizeSteps([
			{ kind: 'fade', direction: 'on', durationMs: 1000 },
			{ kind: 'hold', durationMs: 500 },
			{ kind: 'wipe', direction: 'off', durationMs: 1000 }
		]);
		const starts = sequenceStarts(steps, layout);
		expect(starts[0].every((level) => level === 0)).toBe(true);
		expect(starts[1].every((level) => level === 1)).toBe(true);
		expect(starts[2].every((level) => level === 1)).toBe(true); // the Hold changed nothing
	});

	it('ends a sustained step wherever its last frame put it', () => {
		const twinkle = step({ kind: 'twinkle', durationMs: 1000, options: { density: 1, rate: 4 } });
		expect(stepEnd(twinkle, layout.points.map(() => 0), layout).every((l) => l === 1)).toBe(true);
	});

	// A fresh session opens on one step rather than a showreel, so the default
	// is a single fade that lights the scene over its own duration.
	it('opens on a single fade that lights everything', () => {
		const steps = normalizeSteps(DEFAULT_SEQUENCE);
		expect(steps).toHaveLength(1);
		expect(steps[0]).toMatchObject({ kind: 'fade', direction: 'on' });

		const total = totalDuration(steps);
		const litAt = (t, loop = true) =>
			sequenceLevels(steps, layout, t, { loop }).reduce((sum, l) => sum + l, 0);
		expect(litAt(0)).toBeLessThan(layout.points.length);
		expect(litAt(total / 2)).toBeGreaterThan(0);
		// Measured with the loop off, because `total` is the wrap point: a
		// looping clock is already back at the opening frame by then. The last
		// region's arrival is exactly 1, so a completed step is the only place
		// it is on.
		expect(litAt(total, false)).toBe(layout.points.length);
	});

	it('is seekable: any moment is the same whether played to or jumped to', () => {
		const steps = normalizeSteps(DEFAULT_SEQUENCE);
		const starts = sequenceStarts(steps, layout);
		const arrivals = steps.map((s) => arrivalsFor(s, layout));
		for (const t of [0, 400, 900, 1500, 2100, 2200]) {
			expect(sequenceLevels(steps, layout, t)).toEqual(
				sequenceLevels(steps, layout, t, { starts, arrivals })
			);
		}
	});

	it('wraps or holds according to the loop flag', () => {
		const steps = normalizeSteps([
			...DEFAULT_SEQUENCE,
			{ kind: 'wipe', direction: 'off', durationMs: 1200 }
		]);
		const total = totalDuration(steps);
		expect(sequenceLevels(steps, layout, total + 10)).toEqual(sequenceLevels(steps, layout, 10));
		expect(sequenceLevels(steps, layout, total * 5, { loop: false })).toEqual(
			sequenceLevels(steps, layout, total, { loop: false })
		);
	});

	it('returns nothing for a scene with no regions, and darkness for no steps', () => {
		expect(sequenceLevels(normalizeSteps(DEFAULT_SEQUENCE), animationLayout([], null), 0)).toEqual([]);
		expect(sequenceLevels([], layout, 0)).toEqual(layout.points.map(() => 0));
	});
});
