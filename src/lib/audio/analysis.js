/**
 * The DSP between the browser's analyser nodes and the visualisers.
 *
 * Everything here is plain arithmetic over plain arrays — no Web Audio, no
 * DOM — so the parts that decide how the scene *reacts* (onset detection, the
 * envelope follower, range normalisation) are unit-testable, while
 * `audio/engine.js` keeps the untestable half (an `AudioContext` and an
 * `<audio>` element).
 *
 * The unit throughout is a **frame**: one snapshot per channel, as handed over
 * by `engine.read()`.
 *
 * ```js
 * { sampleRate, fftSize, left: { spectrum, waveform }, right: { … } }
 * ```
 *
 * `spectrum` holds magnitudes in `[0,1]` (the analyser's own dB mapping,
 * rescaled), `waveform` samples in `[-1,1]`.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * What the sidebar offers as the thing driving a visualiser.
 *
 * Two *kinds* of measurement, not one list of bands, and the difference is the
 * whole ballgame:
 *
 * - **onset** — how much this slice of the mix just *changed* (`spectralFlux`).
 *   Fires once per new note or hit and is silent between them.
 * - **level** — how *loud* this slice is right now. Useful for a meter, and a
 *   trap of a default for anything meant to look rhythmic: a sustained 808 or a
 *   dense midrange is continuously loud, so a level driver sits near its
 *   ceiling all bar and barely twitches on the beat.
 *
 * **Beat** measures onsets across the *whole* spectrum, not just the low end,
 * which is what lets it find the music in a passage with no drums in it — an
 * intro of piano or synth is nothing but note onsets. **Kick** is the same
 * measurement narrowed to the low end, for when only the drums should count.
 */
export const MUSIC_DRIVERS = [
	{ value: 'beat', label: 'Beat', kind: 'onset', range: [30, 14000] },
	{ value: 'kick', label: 'Kick', kind: 'onset', range: [30, 500] },
	{ value: 'bass', label: 'Bass', kind: 'level', range: [30, 160] },
	{ value: 'mid', label: 'Mid', kind: 'level', range: [160, 2000] },
	{ value: 'treble', label: 'Treble', kind: 'level', range: [2000, 12000] }
];

export function driverSpec(value) {
	return MUSIC_DRIVERS.find((driver) => driver.value === value) ?? MUSIC_DRIVERS[0];
}

/**
 * A hit is called when the stretched driver crosses `HIT_ON`, and can't be
 * called again until it has fallen back under `HIT_OFF`.
 *
 * The gap between the two is the whole point: one threshold would fire a dozen
 * times as a single kick's envelope wobbled across it, and a scene that
 * reshuffles a dozen times per beat is a scene that reshuffles at random.
 */
const HIT_ON = 0.55;
const HIT_OFF = 0.25;

export const ATTACK_MS = 6;

/** Bin index a frequency lands in, for an FFT of `fftSize` at `sampleRate`. */
export function binForHz(hz, sampleRate, fftSize) {
	return (hz * fftSize) / (sampleRate || 44100);
}

/**
 * Mean magnitude across a frequency range — the "how loud is the bass right
 * now" number every visualiser is ultimately driven by.
 *
 * A mean rather than a peak: a peak follows whichever single bin is hottest
 * and jumps around as a note changes pitch, where the mean tracks the weight
 * of the whole band.
 */
export function bandEnergy(spectrum, { sampleRate, fftSize }, [lowHz, highHz]) {
	if (!spectrum?.length) return 0;
	const last = spectrum.length - 1;
	const lo = Math.max(0, Math.min(last, Math.round(binForHz(lowHz, sampleRate, fftSize))));
	const hi = Math.max(lo, Math.min(last, Math.round(binForHz(highHz, sampleRate, fftSize))));
	let sum = 0;
	for (let i = lo; i <= hi; i += 1) sum += spectrum[i];
	return sum / (hi - lo + 1);
}

/**
 * Magnitude at `position` (0-1) along a **logarithmic** frequency axis running
 * `minHz` to `maxHz`.
 *
 * Log, because a linear axis spends four fifths of the image on the top two
 * octaves, where there is nothing to look at — musically, the interesting span
 * is the bottom few hundred hertz, and the ear hears pitch logarithmically
 * anyway.
 *
 * `width` widens the sample to the span one region covers and takes the
 * loudest bin inside it. Without it, a scene with forty windows across would
 * be point-sampling forty of a thousand bins and dropping every transient that
 * happened to land between them.
 */
export function sampleSpectrum(
	spectrum,
	position,
	{ sampleRate, fftSize, minHz = 40, maxHz = 12000, width = 0 }
) {
	if (!spectrum?.length) return 0;
	const hzAt = (t) => minHz * Math.pow(maxHz / minHz, clamp01(t));
	const last = spectrum.length - 1;
	const lo = Math.max(0, Math.floor(binForHz(hzAt(position - width / 2), sampleRate, fftSize)));
	const hi = Math.min(last, Math.ceil(binForHz(hzAt(position + width / 2), sampleRate, fftSize)));
	let peak = 0;
	for (let i = Math.min(lo, last); i <= hi; i += 1) if (spectrum[i] > peak) peak = spectrum[i];
	return peak;
}

/**
 * **Spectral flux**: the sum of how much each bin got *louder* since the last
 * frame, over a frequency range. The standard onset detector, and the reason
 * the scene can land on a beat at all.
 *
 * Only rises count. A kick is a bin full of energy appearing where there was
 * less a moment ago; the 808 note *sustaining* underneath it contributes
 * nothing, because it isn't changing. That asymmetry is what separates "a hit
 * just happened" from "this passage is loud", and only the first of those looks
 * like a beat.
 *
 * Averaged over the bins it covers, so the number means the same thing whatever
 * range it is asked about.
 */
export function spectralFlux(spectrum, previous, { sampleRate, fftSize }, [lowHz, highHz]) {
	if (!spectrum?.length || !previous?.length) return 0;
	const last = spectrum.length - 1;
	const lo = Math.max(0, Math.min(last, Math.round(binForHz(lowHz, sampleRate, fftSize))));
	const hi = Math.max(lo, Math.min(last, Math.round(binForHz(highHz, sampleRate, fftSize))));
	let sum = 0;
	for (let i = lo; i <= hi; i += 1) {
		const rise = spectrum[i] - (previous[i] ?? 0);
		if (rise > 0) sum += rise;
	}
	return sum / (hi - lo + 1);
}

/**
 * Linearly interpolated sample at `position` (0-1) through a time-domain
 * buffer, optionally through a window of it starting at `offset`.
 *
 * The window is what `findTrigger` is for — see below.
 */
export function waveformAt(waveform, position, { offset = 0, length = 0 } = {}) {
	if (!waveform?.length) return 0;
	const start = Math.max(0, Math.min(waveform.length - 1, Math.floor(offset)));
	const span = Math.max(2, Math.min(length > 0 ? length : waveform.length, waveform.length - start));
	const t = start + clamp01(position) * (span - 1);
	const i = Math.floor(t);
	const next = Math.min(waveform.length - 1, i + 1);
	return waveform[i] + (waveform[next] - waveform[i]) * (t - i);
}

/**
 * Index of the first upward zero crossing — where a real oscilloscope starts
 * drawing.
 *
 * Without it the trace is redrawn from an arbitrary point in the wave sixty
 * times a second, and a steady tone reads as noise sliding across the image
 * rather than as a wave standing still. Triggering pins the picture to the
 * signal's own phase, which is the whole reason a scope looks like a scope.
 *
 * Falls back to 0 when there is no crossing to find (silence, or a buffer
 * entirely on one side of zero), which is the same picture the untriggered
 * version would have drawn.
 */
export function findTrigger(waveform, searchLength = 0) {
	if (!waveform?.length) return 0;
	const limit = Math.min(waveform.length - 1, searchLength > 0 ? searchLength : waveform.length - 1);
	for (let i = 0; i < limit; i += 1) {
		if (waveform[i] <= 0 && waveform[i + 1] > 0) return i;
	}
	return 0;
}

/** Root-mean-square of a time-domain buffer — the level a VU meter shows. */
export function rms(waveform) {
	if (!waveform?.length) return 0;
	let sum = 0;
	for (let i = 0; i < waveform.length; i += 1) sum += waveform[i] * waveform[i];
	return Math.sqrt(sum / waveform.length);
}

/**
 * An envelope follower: chases a rising signal at one rate and a falling one
 * at another.
 *
 * Asymmetry is the whole point. Attack near zero lets a kick hit the scene on
 * the frame it arrives; a long release then lets the light bleed away instead
 * of snapping off between beats, which is what makes the scene read as
 * *breathing* with the track rather than flickering at it.
 *
 * Exponential rather than a fixed per-frame fraction, for the reason
 * `interactive.js` gives: identical behaviour at 60 Hz and 144 Hz.
 */
export function createFollower(initial = 0) {
	let value = initial;
	return {
		get value() {
			return value;
		},
		reset(to = 0) {
			value = to;
		},
		step(target, dt, attackMs, releaseMs) {
			// A frame of no length is the loop's very first one (`frameDelta`
			// yields 0 with nothing to measure against); nothing has had time to
			// move, so the envelope holds rather than jumping to the target.
			if (!(dt > 0)) return value;
			const tau = (target > value ? attackMs : releaseMs) / 1000;
			if (!(tau > 0)) value = target;
			else value += (target - value) * (1 - Math.exp(-dt / tau));
			return value;
		}
	};
}

/**
 * The control that makes the whole mode work: maps the range the signal has
 * *actually been using lately* onto the full 0-1.
 *
 * It tracks an exponentially-weighted **mean and deviation** of the driver and
 * calls `mean ± spread × sd` the range — with the default `spread` of 1.3 that
 * is about the tenth and ninetieth percentile of the recent signal, so the
 * quietest tenth reads as dark and the loudest tenth as fully lit.
 *
 * Three versions of this were wrong before this one, and each failed in a way
 * worth recognising on screen:
 *
 * - **Dividing by a peak.** The analyser's magnitudes are dB-mapped, so a
 *   mastered mix wanders around 0.55-0.80 and never goes near zero. Peak
 *   normalisation turns that into 0.69-1.0, and a building whose lit share only
 *   moves through the top third of its range reads as barely reacting.
 * - **Tracking the running min and max.** Min and max are *outliers*, and real
 *   signals are not symmetric. A dense midrange spends almost all its time near
 *   its maximum and dips briefly, so the floor got set by a dip that happens
 *   once every few seconds and the value sat near the ceiling the rest of the
 *   time — a scene permanently lit.
 * - **Tracking quantiles directly.** Right answer, unusable convergence. A
 *   tenth-percentile estimator moves toward its equilibrium at a tenth of its
 *   step size, so on the same top-heavy signal the floor took over a minute to
 *   find its level, and a minute is the whole song.
 *
 * Mean and deviation have neither problem. They converge in one `halfLife`
 * whatever the distribution's shape, a lone outlier moves them by a bounded
 * fraction, and skew costs accuracy rather than correctness — the range comes
 * out a little wide on lopsided material, which is invisible, instead of
 * collapsing onto an extreme, which is not.
 *
 * `minSpan` is the guard for the degenerate case: a signal with no dynamics at
 * all has a deviation near zero, and without a floor on the span every speck of
 * noise between the bounds would be blown up into a light show. Holding it open
 * means a signal that genuinely isn't moving produces a picture that genuinely
 * isn't moving.
 */
export function createRangeNormalizer({ halfLife = 2.5, spread = 1.3, minSpan = 0.05 } = {}) {
	let mean = null;
	let variance = 0;

	// The floor is clamped at zero because these are magnitudes: letting it
	// drift negative is exactly how silence stops reading as silence, since
	// `value - low` then comes out positive with nothing playing and a dark
	// building starts to glow.
	const bounds = () => {
		const sd = Math.sqrt(Math.max(variance, 0));
		const low = Math.max(0, (mean ?? 0) - spread * sd);
		return { low, high: Math.max(low, (mean ?? 0) + spread * sd) };
	};

	/**
	 * The current mapping, without advancing it. Separate from `apply` so one
	 * range can be *learned* from one signal and *applied* to several — which is
	 * how stereo keeps its lean. Normalising each channel against its own range
	 * would rescale a quiet side straight back up to match the loud one, and a
	 * hard-panned hit would light the whole building evenly.
	 */
	const map = (value) => {
		const { low, high } = bounds();
		return clamp01((value - low) / Math.max(high - low, minSpan));
	};

	return {
		map,
		get low() {
			return bounds().low;
		},
		get high() {
			return bounds().high;
		},
		reset() {
			mean = null;
			variance = 0;
		},
		apply(value, dt) {
			// Seeded from the first sample rather than from a guess, so the range
			// starts somewhere plausible instead of walking in from an arbitrary
			// constant over the opening seconds of the track.
			if (mean === null) mean = value;
			const alpha = dt > 0 && halfLife > 0 ? 1 - Math.pow(0.5, dt / halfLife) : 0;
			const delta = value - mean;
			mean += alpha * delta;
			// The standard incremental exponentially-weighted variance.
			variance = (1 - alpha) * (variance + alpha * delta * delta);
			return map(value);
		}
	};
}

/**
 * A plain peak normaliser, still the right tool for the oscilloscope: a
 * waveform is already centred on zero and symmetric, so it wants scaling to fit
 * the frame, not its floor subtracting.
 */
export function createNormalizer({ floor = 0.08, halfLife = 6 } = {}) {
	let peak = floor;
	return {
		get peak() {
			return peak;
		},
		reset() {
			peak = floor;
		},
		apply(value, dt) {
			if (dt > 0 && halfLife > 0) peak = Math.max(floor, peak * Math.pow(0.5, dt / halfLife));
			if (value > peak) peak = value;
			return peak > 0 ? clamp01(value / peak) : 0;
		}
	};
}

/** Element-wise mean of two buffers, written into `out` to avoid a per-frame allocation. */
export function mixDown(a, b, out) {
	const n = out.length;
	for (let i = 0; i < n; i += 1) out[i] = ((a?.[i] ?? 0) + (b?.[i] ?? 0)) / 2;
	return out;
}

/**
 * Peak envelope of a decoded buffer, reduced to `count` buckets — the little
 * waveform drawn behind the scrubber.
 *
 * Max-abs per bucket rather than an average: an average of a few thousand
 * samples of music is very nearly zero, which would draw a flat line.
 */
export function peaksFromChannels(channels, count = 160) {
	const peaks = new Float32Array(count);
	const length = channels?.[0]?.length ?? 0;
	if (!length) return peaks;
	const bucket = length / count;
	for (let i = 0; i < count; i += 1) {
		const start = Math.floor(i * bucket);
		const end = Math.min(length, Math.floor((i + 1) * bucket));
		let peak = 0;
		for (const channel of channels) {
			for (let s = start; s < end; s += 1) {
				const v = Math.abs(channel[s]);
				if (v > peak) peak = v;
			}
		}
		peaks[i] = peak;
	}
	return peaks;
}

/**
 * The per-frame reduction: raw analyser output in, the numbers a visualiser
 * reads out.
 *
 * Stateful, because a follower, a range and a previous spectrum are all
 * memories of the frames before this one — but the state is entirely here, so
 * `light/music.js` stays pure and a test can drive a whole envelope by calling
 * `step` in a loop with a fake clock.
 *
 * The chain for the driver is the same three steps whichever one is chosen:
 *
 * ```
 * measure (flux or band energy) → stretch to the full range → shape the envelope
 * ```
 */
export function createAnalysis() {
	const followers = { left: createFollower(), right: createFollower(), mono: createFollower() };
	// One range for the driver, learned from the mono mix and applied to all
	// three channels — see `map` on the normaliser for why it is not one range
	// each.
	const driverRange = createRangeNormalizer();
	const spectrumRange = createRangeNormalizer({ minSpan: 0.15 });
	const waveGainOf = createNormalizer({ floor: 0.15 });

	// Counted rather than flagged, so a consumer can use it as a seed: Pulse's
	// reshuffle wants "which hit is this" and not "did one just happen".
	let hits = 0;
	let armed = true;

	// Reused across frames: the mono mix-down and the previous spectrum are a
	// few hundred numbers each, sixty times a second.
	let monoSpectrum = null;
	let monoWaveform = null;
	let previousSpectrum = null;

	const reset = () => {
		for (const follower of Object.values(followers)) follower.reset();
		driverRange.reset();
		spectrumRange.reset();
		waveGainOf.reset();
		previousSpectrum = null;
		hits = 0;
		armed = true;
	};

	return {
		reset,
		/**
		 * @param frame  one `engine.read()` snapshot, or null when nothing is loaded
		 * @param dt     seconds since the previous frame
		 */
		step(frame, dt, { driver = 'beat', decayMs = 220 } = {}) {
			const sampleRate = frame?.sampleRate ?? 44100;
			const fftSize = frame?.fftSize ?? 2048;
			const spec = { sampleRate, fftSize };
			const bins = frame?.left?.spectrum?.length ?? 0;
			const samples = frame?.left?.waveform?.length ?? 0;
			if (!monoSpectrum || monoSpectrum.length !== bins) monoSpectrum = new Float32Array(bins);
			if (!monoWaveform || monoWaveform.length !== samples) monoWaveform = new Float32Array(samples);
			mixDown(frame?.left?.spectrum, frame?.right?.spectrum, monoSpectrum);
			mixDown(frame?.left?.waveform, frame?.right?.waveform, monoWaveform);

			const spectrum = {
				left: frame?.left?.spectrum ?? monoSpectrum,
				right: frame?.right?.spectrum ?? monoSpectrum,
				mono: monoSpectrum
			};
			const waveform = {
				left: frame?.left?.waveform ?? monoWaveform,
				right: frame?.right?.waveform ?? monoWaveform,
				mono: monoWaveform
			};

			const { kind, range } = driverSpec(driver);
			// Flux needs the previous frame of the *same* channel to subtract, and
			// keeping three copies of it to serve three channels is not worth it:
			// an onset is an event in the music, not in one speaker, so the mono
			// mix decides when a hit happened and the channels only decide how the
			// picture leans. The first frame has nothing to subtract and reads 0,
			// which is the right answer for "nothing has changed yet".
			// The unsmoothed feed when the engine offers one, so a kick's rise
			// isn't averaged away before it can be detected as a rise.
			const beatSpectrum = frame?.beat?.spectrum?.length ? frame.beat.spectrum : monoSpectrum;
			const onset = kind === 'onset' ? spectralFlux(beatSpectrum, previousSpectrum, spec, range) : 0;

			const measure = (channel) =>
				kind === 'onset'
					? // The channel's share of the mix scales the shared onset, so a
						// hit panned left still lights the left of the building harder.
						// This is what makes a stereo intro of panned piano visible as
						// movement across the scene rather than as a flat flicker.
						onset * channelShare(spectrum, channel, spec, range)
					: bandEnergy(spectrum[channel], spec, range);

			// The range is learned from the mono mix and then applied to each
			// channel, so the two sides stay on one scale and a quiet side reads
			// as quiet.
			const stretchedMono = driverRange.apply(measure('mono'), dt);

			// Called on the stretched value, before the envelope smooths it — the
			// envelope's whole job is to hold light *after* a hit, which would drag
			// the crossing late and blur the retrigger.
			if (armed && stretchedMono >= HIT_ON) {
				hits += 1;
				armed = false;
			} else if (!armed && stretchedMono <= HIT_OFF) {
				armed = true;
			}

			const energy = {};
			for (const channel of ['left', 'right', 'mono']) {
				const stretched = channel === 'mono' ? stretchedMono : driverRange.map(measure(channel));
				energy[channel] = clamp01(followers[channel].step(stretched, dt, ATTACK_MS, decayMs));
			}

			if (!previousSpectrum || previousSpectrum.length !== bins) previousSpectrum = new Float32Array(bins);
			previousSpectrum.set(beatSpectrum);

			// Spectrum bars get the same floor-and-ceiling treatment as the driver,
			// and for the same reason — bars that only ever move through the top of
			// the frame are bars you cannot read. `spectrumFloor`/`spectrumScale`
			// are handed out rather than applied, because the visualiser samples
			// individual bins and cannot be given a pre-scaled array.
			let spectrumPeak = 0;
			for (let i = 0; i < monoSpectrum.length; i += 1) {
				if (monoSpectrum[i] > spectrumPeak) spectrumPeak = monoSpectrum[i];
			}
			spectrumRange.apply(spectrumPeak, dt);

			let wavePeak = 0;
			for (let i = 0; i < monoWaveform.length; i += 1) {
				const v = Math.abs(monoWaveform[i]);
				if (v > wavePeak) wavePeak = v;
			}
			waveGainOf.apply(wavePeak, dt);

			// Half the buffer is drawn, leaving the other half as headroom for the
			// trigger to slide the window into without running off the end.
			const scopeSpan = Math.floor(samples / 2);
			const trigger = findTrigger(monoWaveform, scopeSpan);

			return {
				sampleRate,
				fftSize,
				energy,
				/** How many hits have been called since the mode was entered. */
				hits,
				spectrum,
				waveform,
				spectrumFloor: spectrumRange.low,
				spectrumScale: 1 / Math.max(spectrumRange.high - spectrumRange.low, 0.15),
				waveGain: 1 / waveGainOf.peak,
				// Where the oscilloscope starts drawing, and how much it draws.
				// Both channels share one trigger, so a stereo pair stays in phase.
				scope: { offset: trigger, length: scopeSpan },
				// Pre-envelope, pre-normalisation: a meter should show what is on
				// the wire, not what the settings have made of it.
				rms: { left: rms(waveform.left), right: rms(waveform.right) }
			};
		}
	};
}

/**
 * How much of the band's energy is in one channel, as a share of both — 0.5
 * when a hit is centred, 1 when it is hard left in the left channel.
 *
 * Doubled so a centred hit scales by 1 rather than by a half, which keeps the
 * mono and stereo pictures the same brightness.
 */
function channelShare(spectrum, channel, spec, range) {
	if (channel === 'mono') return 1;
	const here = bandEnergy(spectrum[channel], spec, range);
	const other = bandEnergy(spectrum[channel === 'left' ? 'right' : 'left'], spec, range);
	const total = here + other;
	return total > 0 ? (2 * here) / total : 1;
}
