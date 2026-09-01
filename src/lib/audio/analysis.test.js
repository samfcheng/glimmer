import { describe, expect, it } from 'vitest';
import {
	bandEnergy,
	createAnalysis,
	createFollower,
	createNormalizer,
	createRangeNormalizer,
	driverSpec,
	findTrigger,
	mixDown,
	peaksFromChannels,
	rms,
	sampleSpectrum,
	spectralFlux,
	waveformAt
} from './analysis.js';
import { createRng } from '../light/rng.js';

const spec = { sampleRate: 44100, fftSize: 2048 };

/** A spectrum with a single hot bin, everything else silent. */
function spike(bins, index, value = 1) {
	const spectrum = new Float32Array(bins);
	spectrum[index] = value;
	return spectrum;
}

describe('bandEnergy', () => {
	it('picks up energy inside the band and ignores it outside', () => {
		// ~1076 Hz sits in the mid band and well clear of bass.
		const spectrum = spike(1024, 50);
		expect(bandEnergy(spectrum, spec, driverSpec('mid').range)).toBeGreaterThan(0);
		expect(bandEnergy(spectrum, spec, driverSpec('bass').range)).toBe(0);
	});

	it('averages rather than sums, so a wide band is not inherently louder', () => {
		const flat = new Float32Array(1024).fill(0.5);
		expect(bandEnergy(flat, spec, driverSpec('bass').range)).toBeCloseTo(0.5, 6);
		expect(bandEnergy(flat, spec, driverSpec('treble').range)).toBeCloseTo(0.5, 6);
	});

	it('survives an empty or missing spectrum', () => {
		expect(bandEnergy(null, spec, [20, 200])).toBe(0);
		expect(bandEnergy(new Float32Array(0), spec, [20, 200])).toBe(0);
	});

	it('clamps a band that runs past the top bin', () => {
		const spectrum = new Float32Array(16).fill(1);
		expect(bandEnergy(spectrum, spec, [20, 20000])).toBe(1);
	});
});

describe('sampleSpectrum', () => {
	it('is logarithmic — half way across is the geometric mean of the ends', () => {
		const bins = 1024;
		const hzAtMiddle = Math.sqrt(40 * 12000);
		const bin = Math.round((hzAtMiddle * spec.fftSize) / spec.sampleRate);
		const found = sampleSpectrum(spike(bins, bin), 0.5, { ...spec, minHz: 40, maxHz: 12000 });
		expect(found).toBe(1);
	});

	it('takes the loudest bin across the width it is given', () => {
		const bins = 1024;
		const options = { ...spec, minHz: 40, maxHz: 12000 };
		const spectrum = spike(bins, 60);
		const narrow = sampleSpectrum(spectrum, 0.9, options);
		const wide = sampleSpectrum(spectrum, 0.9, { ...options, width: 2 });
		expect(narrow).toBe(0);
		expect(wide).toBe(1);
	});

	it('clamps a position beyond either end instead of reading off the array', () => {
		const spectrum = new Float32Array(64).fill(0.5);
		expect(sampleSpectrum(spectrum, -5, { ...spec })).toBe(0.5);
		expect(sampleSpectrum(spectrum, 5, { ...spec })).toBe(0.5);
	});
});

describe('waveformAt', () => {
	const wave = Float32Array.from([0, 1, 0, -1]);

	it('hits the samples at the ends exactly', () => {
		expect(waveformAt(wave, 0)).toBe(0);
		expect(waveformAt(wave, 1)).toBe(-1);
	});

	it('interpolates between samples', () => {
		expect(waveformAt(wave, 1 / 6)).toBeCloseTo(0.5, 9);
	});

	it('is 0 with nothing to read', () => {
		expect(waveformAt(null, 0.5)).toBe(0);
	});
});

describe('rms', () => {
	it('is the amplitude of a square wave', () => {
		expect(rms(Float32Array.from([1, -1, 1, -1]))).toBe(1);
	});

	it('is 0 for silence', () => {
		expect(rms(new Float32Array(8))).toBe(0);
	});
});

describe('createFollower', () => {
	it('rises at the attack rate and falls at the release rate', () => {
		const follower = createFollower();
		// One time constant closes ~63% of the gap.
		follower.step(1, 0.02, 20, 1000);
		expect(follower.value).toBeCloseTo(1 - Math.exp(-1), 6);
	});

	it('is asymmetric — a short attack and a long release', () => {
		const fast = createFollower();
		const slow = createFollower();
		fast.step(1, 0.02, 10, 1000);
		slow.step(1, 0.02, 1000, 10);
		expect(fast.value).toBeGreaterThan(slow.value);

		fast.reset(1);
		slow.reset(1);
		fast.step(0, 0.02, 10, 1000);
		slow.step(0, 0.02, 1000, 10);
		expect(fast.value).toBeGreaterThan(slow.value); // fast has the long release
	});

	it('snaps to the target with a zero time constant', () => {
		const follower = createFollower();
		expect(follower.step(0.7, 0.02, 0, 0)).toBe(0.7);
	});

	it("holds on the loop's first frame, which has no length to measure", () => {
		const follower = createFollower(0.4);
		expect(follower.step(1, 0, 0, 0)).toBe(0.4);
	});

	it('holds still on a zero-length frame', () => {
		const follower = createFollower(0.4);
		expect(follower.step(1, 0, 50, 50)).toBe(0.4);
	});

	it('is frame-rate independent — same wall time, same value', () => {
		const sixty = createFollower();
		const oneTwenty = createFollower();
		for (let i = 0; i < 60; i += 1) sixty.step(1, 1 / 60, 200, 200);
		for (let i = 0; i < 120; i += 1) oneTwenty.step(1, 1 / 120, 200, 200);
		expect(oneTwenty.value).toBeCloseTo(sixty.value, 3);
	});
});

describe('createRangeNormalizer', () => {
	/** Feeds `seconds` of a signal at 60fps and returns the last reading. */
	const settle = (range, sample, seconds = 10) => {
		let out = 0;
		const frames = Math.round(seconds * 60);
		for (let i = 0; i < frames; i += 1) out = range.apply(sample(i), 1 / 60);
		return out;
	};

	it('stretches the range the signal is using onto the whole 0-1', () => {
		const range = createRangeNormalizer();
		// A dB-mapped mix that never goes near zero — the case peak
		// normalisation got wrong, compressing it into the top third.
		settle(range, (i) => 0.55 + 0.25 * (i % 2), 20);
		expect(range.apply(0.55, 1 / 60)).toBeLessThan(0.2);
		expect(range.apply(0.8, 1 / 60)).toBeGreaterThan(0.8);
	});

	// The failure that prompted the move from min/max to quantiles: a dense
	// midrange sits near its maximum almost all the time and dips briefly. Min
	// and max are outliers, so the floor got set by a rare dip and the value
	// lived near the ceiling — a scene that was simply always lit.
	it('is not fooled by a signal that spends most of its time near the top', () => {
		const range = createRangeNormalizer();
		// Nineteen frames near 0.8, one brief dip to 0.2 — the shape of a dense
		// midrange, and the shape that made min/max tracking read as always lit.
		settle(range, (i) => (i % 20 === 0 ? 0.2 : 0.8 + 0.02 * Math.sin(i)), 30);
		expect(range.apply(0.8, 1 / 60)).toBeLessThan(0.85);
		expect(range.low).toBeGreaterThan(0.4); // the rare dip did not set the floor
	});

	// The behaviour the quantiles are for, stated the way it is felt: about a
	// tenth of the signal should bottom out and about a tenth should max out.
	// Asserted over the *outputs* rather than the estimates, because the
	// estimates jitter around their equilibrium and the outputs are what the
	// scene actually shows.
	it('bottoms out on about a tenth of the signal and maxes out on about a tenth', () => {
		const range = createRangeNormalizer();
		const rng = createRng(12345);
		let dark = 0;
		let full = 0;
		const frames = 60 * 60;
		for (let i = 0; i < frames; i += 1) {
			const out = range.apply(rng(), 1 / 60);
			if (i < 60 * 10) continue; // let it settle before counting
			if (out === 0) dark += 1;
			if (out === 1) full += 1;
		}
		const counted = frames - 60 * 10;
		expect(dark / counted).toBeGreaterThan(0.04);
		expect(dark / counted).toBeLessThan(0.2);
		expect(full / counted).toBeGreaterThan(0.04);
		expect(full / counted).toBeLessThan(0.2);
	});

	it('reads silence as 0, however long it goes on', () => {
		const range = createRangeNormalizer();
		expect(settle(range, () => 0, 30)).toBe(0);
		expect(range.low).toBe(0);
	});

	it('reads a signal with no dynamics as no movement', () => {
		const range = createRangeNormalizer();
		expect(settle(range, () => 0.5, 20)).toBeLessThan(0.1);
	});

	it('follows the track when its range moves', () => {
		const range = createRangeNormalizer();
		settle(range, (i) => 0.1 + 0.05 * (i % 2), 20); // a quiet intro
		// The drop arrives an order of magnitude louder; within a few seconds the
		// quiet passage is the new floor rather than the whole picture.
		settle(range, (i) => 0.6 + 0.3 * (i % 2), 20);
		expect(range.apply(0.9, 1 / 60)).toBeGreaterThan(0.8);
		expect(range.apply(0.6, 1 / 60)).toBeLessThan(0.3);
	});

	it('resets', () => {
		const range = createRangeNormalizer();
		range.apply(0.8, 1 / 60);
		range.reset();
		expect(range.low).toBe(0);
		expect(range.high).toBe(0);
	});
});

describe('createNormalizer', () => {
	it('maps the loudest thing it has heard to 1', () => {
		const gain = createNormalizer({ floor: 0.1, halfLife: 10 });
		expect(gain.apply(0.4, 0)).toBe(1);
		expect(gain.apply(0.2, 0)).toBeCloseTo(0.5, 6);
	});

	it('never divides by a peak below the floor, so silence stays silent', () => {
		const gain = createNormalizer({ floor: 0.2, halfLife: 1 });
		expect(gain.apply(0.001, 0)).toBeCloseTo(0.005, 6);
	});

	it('decays its peak so a quiet passage after a loud one opens back up', () => {
		const gain = createNormalizer({ floor: 0.05, halfLife: 1 });
		gain.apply(1, 0);
		expect(gain.apply(0.5, 0)).toBeCloseTo(0.5, 6);
		expect(gain.apply(0.5, 1)).toBeCloseTo(1, 6);
	});
});

describe('spectralFlux', () => {
	const spec = { sampleRate: 44100, fftSize: 2048 };
	const range = [0, 22050]; // every bin

	it('counts only what got louder', () => {
		const previous = Float32Array.from([0.5, 0.5, 0.5, 0.5]);
		const now = Float32Array.from([0.9, 0.5, 0.1, 0.5]);
		// +0.4 on the first bin, -0.4 on the third — the fall is ignored.
		expect(spectralFlux(now, previous, spec, range)).toBeCloseTo(0.1, 6);
	});

	it('is 0 for a sustained sound, however loud — which is the whole point', () => {
		const loud = new Float32Array(16).fill(0.95);
		expect(spectralFlux(loud, loud, spec, range)).toBe(0);
	});

	it('fires on a hit arriving over a loud sustained bed', () => {
		const bed = new Float32Array(16).fill(0.8);
		const hit = new Float32Array(16).fill(0.8);
		hit[2] = 1;
		expect(spectralFlux(hit, bed, spec, range)).toBeGreaterThan(0);
	});

	it('is 0 with no previous frame to compare against', () => {
		expect(spectralFlux(new Float32Array(8).fill(1), null, spec, range)).toBe(0);
	});
});

describe('mixDown', () => {
	it('averages two channels', () => {
		const out = new Float32Array(2);
		expect(Array.from(mixDown([1, 0], [0, 1], out))).toEqual([0.5, 0.5]);
	});

	it('treats a missing channel as silence', () => {
		const out = new Float32Array(2);
		expect(Array.from(mixDown([1, 1], null, out))).toEqual([0.5, 0.5]);
	});
});

describe('peaksFromChannels', () => {
	it('takes the loudest sample in each bucket, across every channel', () => {
		const left = Float32Array.from([0, 0.5, 0, 0]);
		const right = Float32Array.from([0, 0, 0, -0.9]);
		const peaks = peaksFromChannels([left, right], 2);
		expect(peaks[0]).toBeCloseTo(0.5, 6);
		expect(peaks[1]).toBeCloseTo(0.9, 6);
	});

	it('is all zeroes with nothing decoded', () => {
		expect(Array.from(peaksFromChannels([], 3))).toEqual([0, 0, 0]);
	});
});

describe('createAnalysis', () => {
	/** One `engine.read()` shaped frame, with both channels at a given level. */
	const frame = (leftLevel, rightLevel = leftLevel, bins = 64) => ({
		...spec,
		left: { spectrum: new Float32Array(bins).fill(leftLevel), waveform: new Float32Array(16).fill(leftLevel) },
		right: { spectrum: new Float32Array(bins).fill(rightLevel), waveform: new Float32Array(16).fill(rightLevel) }
	});

	/** Runs `count` frames of one signal and returns the last reading. */
	const run = (analysis, make, count, options) => {
		let out;
		for (let i = 0; i < count; i += 1) out = analysis.step(make(i), 1 / 60, options);
		return out;
	};

	it('reports silence as silence', () => {
		const analysis = createAnalysis();
		const out = run(analysis, () => frame(0), 30, { driver: 'bass' });
		expect(out.energy.mono).toBe(0);
		expect(out.rms.left).toBe(0);
	});

	it('treats a null frame (nothing loaded) as silence rather than throwing', () => {
		const analysis = createAnalysis();
		const out = analysis.step(null, 1 / 60, {});
		expect(out.energy.mono).toBe(0);
		expect(out.spectrum.mono.length).toBe(0);
	});

	// The complaint that prompted the rework: a dB-mapped mix wanders around in
	// a narrow band well clear of zero, and dividing by its peak left the scene
	// only ever moving through the top third of its range. Measured over a run
	// of the signal rather than by settling on either end of it — settling on a
	// constant is a signal with no dynamics, which correctly reads as no
	// movement and would tell us nothing.
	it('uses the full 0-1 on a signal that never goes near zero', () => {
		const analysis = createAnalysis();
		const options = { driver: 'bass', decayMs: 20 };
		const swing = (i) => frame(i % 20 < 10 ? 0.55 : 0.8);
		run(analysis, swing, 60 * 12, options);
		let lowest = 1;
		let highest = 0;
		for (let i = 0; i < 120; i += 1) {
			const level = analysis.step(swing(i), 1 / 60, options).energy.mono;
			lowest = Math.min(lowest, level);
			highest = Math.max(highest, level);
		}
		expect(lowest).toBeLessThan(0.15);
		expect(highest).toBeGreaterThan(0.85);
	});

	it('fires on an onset and stays quiet through a sustained bed', () => {
		const analysis = createAnalysis();
		const options = { driver: 'beat', decayMs: 60 };
		const bed = () => frame(0.8);
		// Establish the range with a few hits, then compare a hit against a hold.
		run(analysis, (i) => (i % 20 === 0 ? frame(1) : bed()), 120, options);
		const sustained = run(analysis, bed, 30, options).energy.mono;
		const onHit = analysis.step(frame(1), 1 / 60, options).energy.mono;
		expect(sustained).toBeLessThan(0.2);
		expect(onHit).toBeGreaterThan(sustained);
	});

	// One range, learned from the mono mix and applied to both channels. A range
	// per channel would rescale the quiet side straight back up to match the
	// loud one, and a hard-panned mix would light the building evenly.
	it('keeps the channels apart, which is what stereo visualisers read', () => {
		const analysis = createAnalysis();
		const options = { driver: 'bass', decayMs: 20 };
		const panned = (i) => frame(i % 20 < 10 ? 0.3 : 0.9, 0.1);
		run(analysis, panned, 60 * 12, options);
		const out = run(analysis, panned, 10, options);
		expect(out.energy.left).toBeGreaterThan(out.energy.right + 0.2);
		expect(out.rms.left).toBeGreaterThan(out.rms.right);
	});

	it('counts a hit each time the driver crosses, and only once per crossing', () => {
		const analysis = createAnalysis();
		const options = { driver: 'bass', decayMs: 20 };
		// Eight beats: four frames loud, twenty-six quiet.
		const beats = (i) => frame(i % 30 < 4 ? 0.9 : 0.1);
		run(analysis, beats, 60 * 10, options);
		const before = analysis.step(beats(0), 1 / 60, options).hits;
		const after = run(analysis, (i) => beats(i), 60 * 4, options).hits;
		const counted = after - before;
		// Four seconds at two beats a second — allow slack for the range
		// settling, but nowhere near the per-frame retriggering a single
		// threshold would have produced.
		expect(counted).toBeGreaterThan(4);
		expect(counted).toBeLessThan(12);
	});

	it('mixes a mono view down from the two channels', () => {
		const analysis = createAnalysis();
		const out = analysis.step(frame(1, 0), 1 / 60, {});
		expect(out.spectrum.mono[0]).toBeCloseTo(0.5, 6);
	});

	it('hands out a floor and a scale for the spectrum bars', () => {
		const analysis = createAnalysis();
		const out = run(analysis, () => frame(0.7), 60, {});
		expect(out.spectrumFloor).toBeLessThanOrEqual(0.7);
		expect(out.spectrumScale).toBeGreaterThan(0);
	});

	it('never leaves the 0-1 range', () => {
		const analysis = createAnalysis();
		for (const driver of ['beat', 'bass', 'mid', 'treble', 'full']) {
			analysis.reset();
			for (let i = 0; i < 90; i += 1) {
				const out = analysis.step(frame(Math.random(), Math.random()), 1 / 60, { driver });
				for (const channel of ['left', 'right', 'mono']) {
					expect(out.energy[channel]).toBeGreaterThanOrEqual(0);
					expect(out.energy[channel]).toBeLessThanOrEqual(1);
				}
			}
		}
	});

	it('resets its envelope, so re-entering the mode starts from silence', () => {
		const analysis = createAnalysis();
		run(analysis, () => frame(1), 60, {});
		analysis.reset();
		expect(analysis.step(frame(0), 1 / 60, { decayMs: 100 }).energy.mono).toBe(0);
	});
});

describe('findTrigger', () => {
	it('finds the first upward zero crossing', () => {
		expect(findTrigger(Float32Array.from([0.5, 0.2, -0.3, -0.1, 0.4, 0.9]))).toBe(3);
	});

	it('ignores a downward crossing', () => {
		expect(findTrigger(Float32Array.from([0.5, -0.5, -0.6]))).toBe(0);
	});

	it('falls back to the start when there is no crossing to find', () => {
		expect(findTrigger(new Float32Array(8))).toBe(0);
		expect(findTrigger(Float32Array.from([1, 1, 1]))).toBe(0);
		expect(findTrigger(null)).toBe(0);
	});

	it('only looks as far as it is told to', () => {
		const wave = Float32Array.from([1, 1, 1, -1, 1]);
		expect(findTrigger(wave)).toBe(3);
		expect(findTrigger(wave, 2)).toBe(0);
	});
});

describe('waveformAt through a window', () => {
	const wave = Float32Array.from([0, 0, 0, 0, 1, 0.5, 0, -1]);

	it('reads from the offset it is given', () => {
		expect(waveformAt(wave, 0, { offset: 4, length: 4 })).toBe(1);
		expect(waveformAt(wave, 1, { offset: 4, length: 4 })).toBe(-1);
	});

	it('reads the whole buffer by default', () => {
		expect(waveformAt(wave, 0)).toBe(0);
		expect(waveformAt(wave, 1)).toBe(-1);
	});

	it('clamps a window that runs off the end', () => {
		expect(waveformAt(wave, 1, { offset: 6, length: 100 })).toBe(-1);
		expect(waveformAt(wave, 0.5, { offset: 99, length: 4 })).toBe(-1);
	});
});

describe('createAnalysis scope window', () => {
	it('reports a trigger and a span for the oscilloscope', () => {
		const analysis = createAnalysis();
		const waveform = new Float32Array(32);
		for (let i = 0; i < 32; i += 1) waveform[i] = Math.sin((i / 32) * Math.PI * 4);
		const out = analysis.step(
			{ ...spec, left: { spectrum: new Float32Array(8), waveform }, right: { spectrum: new Float32Array(8), waveform } },
			1 / 60,
			{}
		);
		expect(out.scope.length).toBe(16);
		expect(out.scope.offset).toBeGreaterThanOrEqual(0);
		expect(out.scope.offset).toBeLessThan(16);
	});
});
