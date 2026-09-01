/**
 * Music mode: the scene is lit by whatever is playing.
 *
 * Four visualisers, all of them the same two-step shape the rest of the app
 * uses — give every region a number from the geometry, compare it against a
 * number from the audio:
 *
 * | | the geometry gives | the audio gives |
 * |---|---|---|
 * | **Pulse** | each region's fixed `threshold` | a lit *share* that swells with the track |
 * | **Level** | position along a fill axis | how far the meter has filled |
 * | **Spectrum** | x → a frequency, y → a bar height | that frequency's magnitude |
 * | **Scope** | distance from a traced line | where the waveform is at that x |
 *
 * Which is why Pulse is *exactly* Random mode with the Lit Chance slider being
 * driven by the music instead of by hand, and why every one of them dithers
 * its edge against the same fixed per-region `threshold` the interactive
 * circle and the wavefront do: a window switches on at its own point and stays
 * there, so a soft edge settles instead of shimmering.
 *
 * **Stereo** is one idea applied four ways: wherever a visualiser needs one
 * number from the audio, it takes the left channel's on the left of the image
 * and the right channel's on the right, blended across. A mono file has
 * identical channels, so the same code draws a symmetric picture with nothing
 * special-cased.
 *
 * Everything here is pure and DOM-free. The stateful part of the audio — the
 * envelope follower and auto-gain — lives in `audio/analysis.js`; the frame
 * loop and the `AudioContext` live in `Stage.svelte` and `audio/engine.js`.
 */

import { sampleSpectrum, waveformAt } from '../audio/analysis.js';
import { hash01 } from './animation.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * clamp01(t);

export const MUSIC_VISUALS = [
	{ value: 'pulse', label: 'Pulse' },
	{ value: 'level', label: 'Level' },
	{ value: 'spectrum', label: 'Spectrum' },
	{ value: 'scope', label: 'Scope' }
];

/** Where a Level meter fills from. The same axes Waves travels along. */
export const MUSIC_DIRECTIONS = [
	{ value: 'up', label: 'Up from the bottom' },
	{ value: 'down', label: 'Down from the top' },
	{ value: 'right', label: 'Left to right' },
	{ value: 'left', label: 'Right to left' },
	{ value: 'out', label: 'Out from the centre' },
	{ value: 'in', label: 'In to the centre' }
];

/**
 * A region's place along the fill axis: 0 lights first, 1 lights last.
 *
 * Radial distances are aspect-corrected and normalised against the furthest
 * corner — the same reasoning as `waves.js`, so "half full" means half the
 * image whatever shape it is.
 */
export function fillCoordinate(point, layout, direction) {
	const nx = point.nx;
	const ny = point.ny;
	switch (direction) {
		case 'down':
			return ny;
		case 'right':
			return nx;
		case 'left':
			return 1 - nx;
		case 'out':
		case 'in': {
			const dx = (nx - 0.5) * layout.aspect;
			const dy = ny - 0.5;
			const max = Math.hypot(layout.aspect / 2, 0.5) || 1;
			const r = Math.min(1, Math.hypot(dx, dy) / max);
			return direction === 'in' ? 1 - r : r;
		}
		case 'up':
		default:
			return 1 - ny;
	}
}

/**
 * Where along the image a region sits for the purpose of picking a channel —
 * across the fill for a vertical meter, down it for a horizontal one, so the
 * two channels always sit *beside* each other rather than one behind the
 * other.
 */
function stereoPosition(point, direction) {
	return direction === 'left' || direction === 'right' ? point.ny : point.nx;
}

/** The audio's number for a region: one channel, the other, or a blend across the image. */
function channelValue(values, stereo, position) {
	return stereo ? lerp(values.left, values.right, position) : values.mono;
}

/**
 * The shared soft edge. `depth` is how far past the boundary a region sits,
 * measured in soft-band widths: 1 or more is solidly inside, 0 or less is out,
 * and in between the region's own fixed roll decides.
 */
function dither(depth, threshold) {
	if (depth >= 1) return 1;
	if (depth <= 0) return 0;
	return threshold < depth ? 1 : 0;
}

const VISUALS = {
	/**
	 * Random mode with the music holding the Lit Chance slider. `base` is the
	 * share that stays lit through a quiet passage — a building with every
	 * window dark between beats reads as broken rather than as quiet.
	 *
	 * With `churn` off, the roll each window is judged against is its own fixed
	 * import-time `threshold`, so the lit set grows and shrinks around the same
	 * windows: the ones with low rolls are lit in every bar of the song, which
	 * is a look, but a static one.
	 *
	 * With it on, the roll is redrawn from `seed` — a counter of hits, so the
	 * scatter lands somewhere new on each beat and holds there while the light
	 * fades, rather than churning every frame into a shimmer. Deterministic
	 * either way: the same seed draws the same scatter, so nothing flickers
	 * between two frames of the same hit.
	 */
	pulse: (layout, analysis, o) =>
		layout.points.map((p, i) => {
			const energy = channelValue(analysis.energy, o.stereo, p.nx);
			const cut = o.base + (1 - o.base) * energy;
			const roll = o.churn ? hash01(i, o.seed) : p.threshold;
			return roll < cut ? 1 : 0;
		}),

	/** A VU meter drawn in windows: the scene fills along an axis as the track gets louder. */
	level: (layout, analysis, o) => {
		const soft = Math.max(o.softness, 0) * 0.5;
		return layout.points.map((p) => {
			const amount = channelValue(analysis.energy, o.stereo, stereoPosition(p, o.direction));
			const u = fillCoordinate(p, layout, o.direction);
			// `amount > 0` is not redundant: the region at the very origin of the
			// axis sits at u exactly 0, and would otherwise stay lit through
			// silence on a hard edge.
			if (soft <= 0) return amount > 0 && u <= amount ? 1 : 0;
			// The band is dithered *inward* from the meter's leading edge, and
			// the fill is stretched by its width — so silence is genuinely dark
			// and a full meter is genuinely full, rather than either end of the
			// range being a permanent flicker.
			return dither((amount * (1 + soft) - u) / soft, p.threshold);
		});
	},

	/**
	 * A bar graph: x picks a frequency, y is how loud that frequency has to be
	 * for the window to light.
	 *
	 * `mirror` folds the axis so the bass sits in the middle and the treble
	 * runs out to both edges — which is what makes room for stereo, the left
	 * channel taking the left half and the right the right. Unmirrored, there
	 * is only one frequency axis to draw on, so it shows the mix.
	 */
	spectrum: (layout, analysis, o) => {
		const soft = Math.max(o.softness, 0) * 0.5;
		const count = layout.points.length || 1;
		// Roughly twice one region's share of the axis (a grid of `count` regions
		// is about `sqrt(count)` across), so neighbouring windows overlap rather
		// than each point-sampling one bin in a thousand and dropping every
		// transient that lands between them.
		const width = Math.min(0.5, 2 / Math.sqrt(count));
		return layout.points.map((p) => {
			const mirrored = o.mirror;
			const position = mirrored ? Math.abs(p.nx - 0.5) * 2 : p.nx;
			const channel = !mirrored
				? analysis.spectrum.mono
				: o.stereo
					? p.nx < 0.5
						? analysis.spectrum.left
						: analysis.spectrum.right
					: analysis.spectrum.mono;
			// Floor subtracted before scaling, not just divided by a peak: the
			// analyser's magnitudes are dB-mapped and a busy mix never gets near
			// zero, so bars that only moved through the top of the frame would be
			// bars you cannot read. Same fix as the driver's range normalisation.
			const magnitude = clamp01(
				(sampleSpectrum(channel, position, {
					sampleRate: analysis.sampleRate,
					fftSize: analysis.fftSize,
					minHz: o.minHz,
					maxHz: o.maxHz,
					width
				}) -
					analysis.spectrumFloor) *
					analysis.spectrumScale
			);
			const height = 1 - p.ny; // bars grow up from the bottom of the frame
			// As in Level: the bottom row is at height exactly 0, so a silent
			// frequency needs saying out loud or its bar never goes out.
			if (soft <= 0) return magnitude > 0 && height <= magnitude ? 1 : 0;
			return dither((magnitude * (1 + soft) - height) / soft, p.threshold);
		});
	},

	/**
	 * An oscilloscope traced through the windows: the waveform is drawn across
	 * the image and every region within `thickness` of the line lights.
	 *
	 * In stereo it is two traces stacked — left in the top half, right in the
	 * bottom — which is how a two-channel scope is conventionally read, and
	 * what makes a wide mix visibly wider than a centred one.
	 */
	scope: (layout, analysis, o) => {
		const traces = o.stereo
			? [
					{ waveform: analysis.waveform.left, centre: 0.25, span: 0.5 },
					{ waveform: analysis.waveform.right, centre: 0.75, span: 0.5 }
				]
			: [{ waveform: analysis.waveform.mono, centre: 0.5, span: 1 }];
		const soft = Math.max(o.softness, 0);
		const thickness = Math.max(o.thickness, 1e-4);

		return layout.points.map((p) => {
			let best = 0;
			for (const trace of traces) {
				const sample = clamp(
					waveformAt(trace.waveform, p.nx, analysis.scope) * analysis.waveGain * o.amplitude
				);
				// Screen y grows downwards, so a positive sample sits above the
				// trace's centre line, as it would on a scope.
				const y = trace.centre - sample * (trace.span / 2);
				const distance = Math.abs(p.ny - y);
				const level =
					soft <= 0
						? distance <= thickness
							? 1
							: 0
						: dither((thickness - distance) / (thickness * soft), p.threshold);
				if (level > best) best = level;
			}
			return best;
		});
	}
};

/**
 * Lit level per region for one frame of audio.
 *
 * `layout` is the same normalised-centroid layout the animation mode uses;
 * `analysis` is one `createAnalysis().step()` result.
 */
export function musicLevels(visual, layout, analysis, options = {}) {
	const points = layout?.points ?? [];
	if (points.length === 0) return [];
	const draw = VISUALS[visual] ?? VISUALS.pulse;
	return draw(layout, analysis, {
		stereo: true,
		base: 0,
		churn: false,
		seed: 0,
		softness: 0,
		direction: 'up',
		mirror: true,
		minHz: 40,
		maxHz: 12000,
		amplitude: 0.8,
		thickness: 0.1,
		...options
	});
}
