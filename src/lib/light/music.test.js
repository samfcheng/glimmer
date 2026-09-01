import { describe, expect, it } from 'vitest';
import { fillCoordinate, musicLevels, MUSIC_VISUALS } from './music.js';

/**
 * A layout of normalised points, in the shape `animationLayout` produces.
 *
 * Thresholds are a fixed permutation rather than the index order: a real
 * import's rolls have nothing to do with where a window sits, and a layout
 * where they correlate with position would hide exactly the dithering these
 * tests are checking for.
 */
const layoutOf = (points, aspect = 1) => ({
	aspect,
	points: points.map(([nx, ny], i) => ({
		nx,
		ny,
		threshold: (((i * 37 + 11) % points.length) + 0.5) / points.length
	}))
});

/** A grid of `n × n` regions with evenly spread thresholds. */
function grid(n) {
	const points = [];
	for (let y = 0; y < n; y += 1) {
		for (let x = 0; x < n; x += 1) points.push([x / (n - 1), y / (n - 1)]);
	}
	return layoutOf(points);
}

/** One `createAnalysis().step()` result, faked flat. */
function reading({
	left = 0,
	right = left,
	mono = (left + right) / 2,
	spectrum = 0,
	waveform = 0,
	bins = 256,
	samples = 64
} = {}) {
	const flat = (length, value) => new Float32Array(length).fill(value);
	return {
		sampleRate: 44100,
		fftSize: 2048,
		energy: { left, right, mono },
		spectrum: {
			left: flat(bins, spectrum),
			right: flat(bins, spectrum),
			mono: flat(bins, spectrum)
		},
		waveform: {
			left: flat(samples, waveform),
			right: flat(samples, waveform),
			mono: flat(samples, waveform)
		},
		spectrumFloor: 0,
		spectrumScale: 1,
		waveGain: 1,
		rms: { left: 0, right: 0 }
	};
}

const lit = (levels) => levels.filter(Boolean).length;

describe('fillCoordinate', () => {
	const layout = grid(3);
	const at = (nx, ny, direction) => fillCoordinate({ nx, ny }, layout, direction);

	it('fills up from the bottom by default', () => {
		expect(at(0.5, 1, 'up')).toBe(0);
		expect(at(0.5, 0, 'up')).toBe(1);
	});

	it('inverts for the opposite direction', () => {
		expect(at(0.2, 0.7, 'down')).toBeCloseTo(1 - at(0.2, 0.7, 'up'), 9);
		expect(at(0.2, 0.7, 'left')).toBeCloseTo(1 - at(0.2, 0.7, 'right'), 9);
	});

	it('measures radially from the middle out to the corner', () => {
		expect(at(0.5, 0.5, 'out')).toBe(0);
		expect(at(1, 1, 'out')).toBeCloseTo(1, 9);
	});

	it('reaches every corner at once, whatever the aspect ratio', () => {
		const wide = { aspect: 3, points: [] };
		const corners = [
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1]
		].map(([nx, ny]) => fillCoordinate({ nx, ny }, wide, 'out'));
		expect(new Set(corners.map((v) => v.toFixed(9))).size).toBe(1);
	});

	it('stays inside 0-1', () => {
		for (const direction of ['up', 'down', 'left', 'right', 'out', 'in']) {
			for (const point of grid(4).points) {
				const u = fillCoordinate(point, grid(4), direction);
				expect(u).toBeGreaterThanOrEqual(0);
				expect(u).toBeLessThanOrEqual(1);
			}
		}
	});
});

describe('musicLevels', () => {
	it('returns nothing for a scene with no regions', () => {
		expect(musicLevels('pulse', { aspect: 1, points: [] }, reading())).toEqual([]);
		expect(musicLevels('pulse', null, reading())).toEqual([]);
	});

	it('falls back to Pulse for an unknown visual', () => {
		const layout = grid(4);
		const analysis = reading({ left: 1 });
		expect(musicLevels('nonsense', layout, analysis)).toEqual(musicLevels('pulse', layout, analysis));
	});

	it('gives every visual a level of exactly 0 or 1 per region', () => {
		const layout = grid(4);
		for (const { value } of MUSIC_VISUALS) {
			const levels = musicLevels(value, layout, reading({ left: 0.5, spectrum: 0.5, waveform: 0.2 }), {
				softness: 0.4
			});
			expect(levels.length).toBe(layout.points.length);
			for (const level of levels) expect(level === 0 || level === 1).toBe(true);
		}
	});
});

describe('pulse', () => {
	const layout = grid(5);

	it('lights more windows the louder it gets', () => {
		const quiet = lit(musicLevels('pulse', layout, reading({ left: 0.2 })));
		const loud = lit(musicLevels('pulse', layout, reading({ left: 0.8 })));
		expect(loud).toBeGreaterThan(quiet);
	});

	it('goes fully dark in silence and fully lit at the top', () => {
		expect(lit(musicLevels('pulse', layout, reading({ left: 0 })))).toBe(0);
		expect(lit(musicLevels('pulse', layout, reading({ left: 1 })))).toBe(layout.points.length);
	});

	it("keeps `base` alight through a silent passage", () => {
		const levels = musicLevels('pulse', layout, reading({ left: 0 }), { base: 0.5 });
		expect(lit(levels)).toBeGreaterThan(0);
		expect(lit(levels)).toBeLessThan(layout.points.length);
	});

	it('only ever adds windows as it swells — the lit set grows, it does not reshuffle', () => {
		const quiet = musicLevels('pulse', layout, reading({ left: 0.3 }));
		const loud = musicLevels('pulse', layout, reading({ left: 0.7 }));
		for (let i = 0; i < quiet.length; i += 1) if (quiet[i]) expect(loud[i]).toBe(1);
	});

	it('holds a scatter still while the light fades, and moves it on the next hit', () => {
		const analysis = reading({ left: 0.5 });
		const first = musicLevels('pulse', layout, analysis, { churn: true, seed: 4 });
		const same = musicLevels('pulse', layout, analysis, { churn: true, seed: 4 });
		const next = musicLevels('pulse', layout, analysis, { churn: true, seed: 5 });
		expect(same).toEqual(first);
		expect(next).not.toEqual(first);
	});

	it('lights a different set of windows each hit, rather than the same favourites', () => {
		// Which windows are lit at all, across ten hits. With churn off every hit
		// lights the same low-rolling windows and this set stays small.
		const analysis = reading({ left: 0.3 });
		const everLit = (churn) => {
			const seen = new Set();
			for (let seed = 0; seed < 10; seed += 1) {
				musicLevels('pulse', layout, analysis, { churn, seed }).forEach((level, i) => {
					if (level) seen.add(i);
				});
			}
			return seen.size;
		};
		expect(everLit(true)).toBeGreaterThan(everLit(false));
	});

	it('still swells with the music while churning', () => {
		const quiet = lit(musicLevels('pulse', layout, reading({ left: 0.2 }), { churn: true, seed: 3 }));
		const loud = lit(musicLevels('pulse', layout, reading({ left: 0.8 }), { churn: true, seed: 3 }));
		expect(loud).toBeGreaterThan(quiet);
	});

	it('leans the picture toward the louder channel in stereo', () => {
		const analysis = reading({ left: 0.9, right: 0.05 });
		const levels = musicLevels('pulse', layout, analysis, { stereo: true });
		const leftHalf = layout.points.filter((p, i) => p.nx < 0.5 && levels[i]).length;
		const rightHalf = layout.points.filter((p, i) => p.nx > 0.5 && levels[i]).length;
		expect(leftHalf).toBeGreaterThan(rightHalf);
	});

	it('is symmetric with stereo off, however hard the mix is panned', () => {
		const analysis = reading({ left: 0.9, right: 0.05 });
		const levels = musicLevels('pulse', layout, analysis, { stereo: false });
		const mirrored = musicLevels(
			'pulse',
			{ ...layout, points: layout.points.map((p) => ({ ...p, nx: 1 - p.nx })) },
			analysis,
			{ stereo: false }
		);
		expect(mirrored).toEqual(levels);
	});
});

describe('level', () => {
	const layout = grid(5);

	it('fills from the bottom as the track gets louder', () => {
		const half = musicLevels('level', layout, reading({ left: 0.5 }), { direction: 'up', softness: 0 });
		const bottom = layout.points.filter((p, i) => p.ny === 1 && half[i]).length;
		const top = layout.points.filter((p, i) => p.ny === 0 && half[i]).length;
		expect(bottom).toBe(5);
		expect(top).toBe(0);
	});

	it('is dark in silence and full at the top, soft edge or not', () => {
		for (const softness of [0, 0.5, 1]) {
			expect(lit(musicLevels('level', layout, reading({ left: 0 }), { softness }))).toBe(0);
			expect(lit(musicLevels('level', layout, reading({ left: 1 }), { softness }))).toBe(
				layout.points.length
			);
		}
	});

	it('splits the two channels across the meter', () => {
		const levels = musicLevels('level', layout, reading({ left: 0.9, right: 0.05 }), {
			direction: 'up',
			stereo: true,
			softness: 0
		});
		const leftColumn = layout.points.filter((p, i) => p.nx === 0 && levels[i]).length;
		const rightColumn = layout.points.filter((p, i) => p.nx === 1 && levels[i]).length;
		expect(leftColumn).toBeGreaterThan(rightColumn);
	});

	it('splits them across the other axis when the meter runs horizontally', () => {
		const levels = musicLevels('level', layout, reading({ left: 0.9, right: 0.05 }), {
			direction: 'right',
			stereo: true,
			softness: 0
		});
		const topRow = layout.points.filter((p, i) => p.ny === 0 && levels[i]).length;
		const bottomRow = layout.points.filter((p, i) => p.ny === 1 && levels[i]).length;
		expect(topRow).toBeGreaterThan(bottomRow);
	});

	it('grows monotonically with the level', () => {
		let previous = -1;
		for (const energy of [0, 0.25, 0.5, 0.75, 1]) {
			const count = lit(musicLevels('level', layout, reading({ left: energy }), { softness: 0 }));
			expect(count).toBeGreaterThanOrEqual(previous);
			previous = count;
		}
	});
});

describe('spectrum', () => {
	const layout = grid(6);

	it('draws bars up from the bottom — a loud frequency lights its whole column', () => {
		const levels = musicLevels('spectrum', layout, reading({ spectrum: 1 }), { softness: 0 });
		expect(lit(levels)).toBe(layout.points.length);
	});

	it('is dark when nothing is playing', () => {
		expect(lit(musicLevels('spectrum', layout, reading({ spectrum: 0 }), { softness: 0.5 }))).toBe(0);
	});

	it('lights the bottom of a column before the top', () => {
		const levels = musicLevels('spectrum', layout, reading({ spectrum: 0.3 }), { softness: 0 });
		const byRow = new Map();
		layout.points.forEach((p, i) => byRow.set(p.ny, (byRow.get(p.ny) ?? 0) + levels[i]));
		const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]);
		// Rows are top-to-bottom, so lit counts should never fall as we descend.
		for (let i = 1; i < rows.length; i += 1) expect(rows[i][1]).toBeGreaterThanOrEqual(rows[i - 1][1]);
	});

	it('reads one channel per half when mirrored in stereo', () => {
		const analysis = reading({ spectrum: 0 });
		analysis.spectrum.left = new Float32Array(256).fill(1);
		const levels = musicLevels('spectrum', layout, analysis, {
			mirror: true,
			stereo: true,
			softness: 0
		});
		const leftHalf = layout.points.filter((p, i) => p.nx < 0.5 && levels[i]).length;
		const rightHalf = layout.points.filter((p, i) => p.nx > 0.5 && levels[i]).length;
		expect(leftHalf).toBeGreaterThan(0);
		expect(rightHalf).toBe(0);
	});

	it('shows the mix when it is not mirrored, whatever the channels are doing', () => {
		const analysis = reading({ spectrum: 0 });
		analysis.spectrum.left = new Float32Array(256).fill(1);
		const levels = musicLevels('spectrum', layout, analysis, { mirror: false, stereo: true });
		expect(lit(levels)).toBe(0); // mono is the average, and the right channel is silent
	});
});

describe('scope', () => {
	const layout = grid(7);

	it('traces a flat line across the middle for a silent signal', () => {
		const levels = musicLevels('scope', layout, reading({ waveform: 0 }), {
			stereo: false,
			softness: 0,
			thickness: 0.1
		});
		const onTheLine = layout.points.filter((p, i) => Math.abs(p.ny - 0.5) < 0.1 && levels[i]).length;
		expect(onTheLine).toBeGreaterThan(0);
		expect(layout.points.filter((p, i) => p.ny === 0 && levels[i]).length).toBe(0);
	});

	it('lifts the trace with a positive sample and drops it with a negative one', () => {
		const options = { stereo: false, softness: 0, thickness: 0.1, amplitude: 1 };
		const high = musicLevels('scope', layout, reading({ waveform: 0.8 }), options);
		const low = musicLevels('scope', layout, reading({ waveform: -0.8 }), options);
		const meanY = (levels) => {
			const ys = layout.points.filter((p, i) => levels[i]).map((p) => p.ny);
			return ys.reduce((a, b) => a + b, 0) / ys.length;
		};
		expect(meanY(high)).toBeLessThan(0.5); // screen y grows downwards
		expect(meanY(low)).toBeGreaterThan(0.5);
	});

	it('draws two traces in stereo, one per half of the frame', () => {
		const analysis = reading({ waveform: 0 });
		const levels = musicLevels('scope', layout, analysis, {
			stereo: true,
			softness: 0,
			thickness: 0.12
		});
		const topTrace = layout.points.filter((p, i) => Math.abs(p.ny - 0.25) < 0.12 && levels[i]).length;
		const bottomTrace = layout.points.filter((p, i) => Math.abs(p.ny - 0.75) < 0.12 && levels[i]).length;
		expect(topTrace).toBeGreaterThan(0);
		expect(bottomTrace).toBeGreaterThan(0);
	});

	it('lights more of the scene the thicker the trace', () => {
		const analysis = reading({ waveform: 0.3 });
		const thin = lit(musicLevels('scope', layout, analysis, { softness: 0, thickness: 0.02 }));
		const thick = lit(musicLevels('scope', layout, analysis, { softness: 0, thickness: 0.3 }));
		expect(thick).toBeGreaterThan(thin);
	});

	it('shows nothing at zero amplitude but the centre line', () => {
		const levels = musicLevels('scope', layout, reading({ waveform: 1 }), {
			stereo: false,
			softness: 0,
			thickness: 0.05,
			amplitude: 0
		});
		expect(layout.points.filter((p, i) => levels[i] && Math.abs(p.ny - 0.5) > 0.05).length).toBe(0);
	});
});

describe('softness', () => {
	const layout = grid(8);

	it('scatters the edge rather than moving it', () => {
		const analysis = reading({ left: 0.5 });
		const hard = musicLevels('level', layout, analysis, { softness: 0 });
		const soft = musicLevels('level', layout, analysis, { softness: 0.8 });
		expect(soft).not.toEqual(hard);
		// A dithered front is still roughly the same amount of light.
		expect(Math.abs(lit(soft) - lit(hard))).toBeLessThan(layout.points.length / 3);
	});

	it('is stable frame to frame — the same audio dithers the same way', () => {
		const analysis = reading({ left: 0.5 });
		expect(musicLevels('level', layout, analysis, { softness: 0.6 })).toEqual(
			musicLevels('level', layout, analysis, { softness: 0.6 })
		);
	});
});
