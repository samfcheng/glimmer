/**
 * Animation mode: a sequence of steps played in order, each one lasting its
 * own duration.
 *
 * ## The one idea
 *
 * Almost every animation here is the *same* animation with a different sort
 * order. A step gives each region an **arrival** in `[0,1]` — the fraction of
 * the step at which that region flips — and playback is then nothing but
 *
 * ```js
 * level[i] = progress >= arrival[i] ? target : whateverItWasBefore
 * ```
 *
 * Fade is arrival-by-random-number, Wipe is arrival-by-position-along-an-axis,
 * Ripple is arrival-by-distance-from-a-point, Spiral winds those two together.
 * That is the whole trick: `ORDERS` below holds nine one-liners, and the
 * playback code never learns what any of them mean.
 *
 * A handful of steps aren't transitions at all (Hold, Twinkle, Chase, Strobe).
 * Those are `sustained: true` and get to write levels directly for the length
 * of the step.
 *
 * ## The sequence composes
 *
 * The timeline starts fully dark and each step transitions from whatever the
 * previous one left behind — so `Fade on -> Hold -> Wipe off` reads as one
 * continuous choreography rather than three unrelated clips. Every step's end
 * state is a pure function of its start state, which is what lets
 * `sequenceStarts` fold the whole timeline up front and makes any moment
 * seekable without having played the moments before it.
 *
 * Everything in this file is pure and DOM-free: the frame loop lives in
 * `Stage.svelte`, and the video export replays these same functions offscreen.
 */

// --- Small maths helpers ---------------------------------------------

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const frac = (v) => v - Math.floor(v);

/**
 * A stable pseudo-random number in `[0,1)` from a pair of integers.
 *
 * Deterministic and stateless, unlike the sequential `rng.js` generator:
 * "column 4's head start" and "region 12's roll on tick 30" have to give the
 * same answer whenever they are asked, in any order, so that seeking into the
 * middle of a Twinkle shows what playing up to it would have shown.
 */
export function hash01(n, salt = 0) {
	let t =
		(Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^
			Math.imul((salt | 0) + 0x165667b1, 0xc2b2ae35)) >>>
		0;
	t ^= t >>> 15;
	t = Math.imul(t, 0x2c1b3c6d) >>> 0;
	t ^= t >>> 13;
	return (t >>> 0) / 4294967296;
}

/** Rescales an array to span exactly `[0,1]`. A flat array collapses to all-zero — everything arrives at once. */
function normalize(values) {
	let min = Infinity;
	let max = -Infinity;
	for (const v of values) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	const span = max - min;
	if (!(span > 0)) return values.map(() => 0);
	return values.map((v) => (v - min) / span);
}

/**
 * Where each region sits along a line at `angle` degrees, normalised to
 * `[0,1]`. 0 degrees travels right, 90 travels down — screen convention, y
 * growing downwards, so the default 90 reads as "top to bottom".
 *
 * The x term is scaled by the frame's aspect ratio so a 45 degree wipe crosses
 * at a true 45 degrees on screen instead of being sheared by the
 * normalisation.
 */
function projection(layout, angle) {
	const radians = (angle * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return normalize(layout.points.map((p) => p.nx * layout.aspect * cos + p.ny * sin));
}

/** Aspect-corrected offset from a normalised centre point, so radial patterns stay circular on screen. */
function offsetFrom(point, layout, cx, cy) {
	return { dx: (point.nx - cx) * layout.aspect, dy: point.ny - cy };
}

// --- Easing ----------------------------------------------------------

export const EASINGS = [
	{ value: 'linear', label: 'Linear' },
	{ value: 'in', label: 'Ease in' },
	{ value: 'out', label: 'Ease out' },
	{ value: 'inOut', label: 'Ease in-out' }
];

/**
 * Eases a `[0,1]` progress value.
 *
 * Note what this eases: the rate the *wavefront* travels, not the opacity of
 * any one region. Ease-out on a wipe is a wipe that arrives fast and settles
 * its last few windows slowly. The per-region cross-fade is `fadeMs` in
 * Appearance, and the two are deliberately separate controls.
 */
export function ease(name, t) {
	const p = clamp01(t);
	switch (name) {
		case 'in':
			return p * p;
		case 'out':
			return 1 - (1 - p) * (1 - p);
		case 'inOut':
			return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
		case 'linear':
		default:
			return p;
	}
}

// --- Layout ----------------------------------------------------------

/**
 * The only geometry the animations ever see: every region's centroid as a
 * `[0,1]` fraction of the frame, plus its fixed import-time `threshold`.
 *
 * Normalised coordinates are what let a step's settings — a centre point, an
 * angle, a row count — mean the same thing on any image, and keep the order
 * functions down to one line each.
 */
export function animationLayout(regions, frame) {
	const width = frame?.width || 1;
	const height = frame?.height || 1;
	return {
		aspect: width / height,
		points: (regions ?? []).map((region) => ({
			nx: (region.centroid.x - (frame?.x ?? 0)) / width,
			ny: (region.centroid.y - (frame?.y ?? 0)) / height,
			threshold: region.threshold ?? 0.5
		}))
	};
}

// --- The order functions ---------------------------------------------
//
// Each returns one raw number per region — larger means later. The scale does
// not matter; `arrivalsFor` normalises whatever comes back.

const ORDERS = {
	/** Pure scatter: each region's own fixed threshold is its place in the queue. */
	fade: (layout) => layout.points.map((p) => p.threshold),

	/** A straight edge sweeping across at any angle. */
	wipe: (layout, o) => projection(layout, o.angle),

	/**
	 * Two edges at once — in from both sides, or out from the middle.
	 * `position` slides the meeting line off centre.
	 */
	split: (layout, o) => {
		const along = o.axis === 'x' ? (p) => p.nx : (p) => p.ny;
		const sign = o.from === 'centre' ? 1 : -1;
		return layout.points.map((p) => sign * Math.abs(along(p) - o.position));
	},

	/** Concentric rings leaving a point, or closing in on it. */
	ripple: (layout, o) => {
		const sign = o.direction === 'in' ? -1 : 1;
		return layout.points.map((p) => {
			const { dx, dy } = offsetFrom(p, layout, o.centreX, o.centreY);
			return sign * Math.hypot(dx, dy);
		});
	},

	/**
	 * A radar sweep that also travels outwards. `turns` is how much of the
	 * arrival order the radius accounts for: at 0 it is a pure rotating sweep,
	 * higher values wind it into a spiral. The seam where the angle wraps is
	 * the sweep line itself, and is meant to be visible.
	 */
	spiral: (layout, o) => {
		const radii = layout.points.map((p) => {
			const { dx, dy } = offsetFrom(p, layout, o.centreX, o.centreY);
			return Math.hypot(dx, dy);
		});
		const maxRadius = Math.max(...radii, 1e-6);
		return layout.points.map((p, i) => {
			const { dx, dy } = offsetFrom(p, layout, o.centreX, o.centreY);
			const turn = frac(Math.atan2(dy, dx) / TAU + 1);
			return (o.direction === 'ccw' ? 1 - turn : turn) + o.turns * (radii[i] / maxRadius);
		});
	},

	/**
	 * Columns falling top-down, each starting at its own moment. `stagger` is
	 * how far apart those moments are: at 0 every column falls together (a
	 * plain downward wipe), turned up they break into independent streaks.
	 */
	rain: (layout, o) => {
		const columns = Math.max(1, Math.round(o.columns));
		return layout.points.map((p) => {
			const column = Math.min(columns - 1, Math.floor(clamp01(p.nx) * columns));
			return p.ny + hash01(column, 7) * o.stagger * 2;
		});
	},

	/**
	 * Row by row, each row filled left to right — the scene writes itself out
	 * like a line of text. `serpentine` turns every other row around, so the
	 * fill snakes back instead of jumping to the left margin.
	 */
	typewriter: (layout, o) => {
		const rows = Math.max(1, Math.round(o.rows));
		return layout.points.map((p) => {
			const row = Math.min(rows - 1, Math.floor(clamp01(p.ny) * rows));
			const across = o.serpentine && row % 2 === 1 ? 1 - p.nx : p.nx;
			return row + across;
		});
	},

	/**
	 * Rows sweeping in from alternating sides — the first from the left, the
	 * second from the right, and so on down the frame.
	 *
	 * `stagger` is what separates this from Typewriter: at 0 every row sweeps at
	 * once and the scene closes like a zip, and at 1 each row waits for the one
	 * above to finish, which is the same shape as a serpentine Typewriter. The
	 * interesting settings are the ones in between.
	 */
	weave: (layout, o) => {
		const rows = Math.max(1, Math.round(o.rows));
		const flip = o.start === 'right' ? 1 : 0;
		return layout.points.map((p) => {
			const row = Math.min(rows - 1, Math.floor(clamp01(p.ny) * rows));
			const across = (row + flip) % 2 === 1 ? 1 - p.nx : p.nx;
			return across + row * o.stagger;
		});
	},

	/**
	 * Contagion: a few regions go first and it spreads to whatever is nearest,
	 * so the light grows as organic blobs rather than a geometric front.
	 *
	 * The seeds are the regions with the lowest thresholds — already random,
	 * already fixed at import — so a scene blooms the same way every loop
	 * without the step having to carry a seed of its own.
	 */
	bloom: (layout, o) => {
		const count = Math.min(layout.points.length, Math.max(1, Math.round(o.seeds)));
		const seeds = layout.points
			.map((p, i) => ({ i, threshold: p.threshold }))
			.sort((a, b) => a.threshold - b.threshold)
			.slice(0, count)
			.map(({ i }) => layout.points[i]);

		return layout.points.map((p) => {
			let nearest = Infinity;
			for (const seed of seeds) {
				const distance = Math.hypot((p.nx - seed.nx) * layout.aspect, p.ny - seed.ny);
				if (distance < nearest) nearest = distance;
			}
			return nearest;
		});
	},

	/**
	 * Parallel stripes that all fill at once, each in the same direction —
	 * venetian blinds opening. `bands` is how many stripes span the frame.
	 */
	blinds: (layout, o) => {
		const along = projection(layout, o.angle);
		const bands = Math.max(1, Math.round(o.bands));
		// The 0.9999 keeps the region sitting exactly at u = 1 inside the last
		// band instead of wrapping to 0 and arriving first.
		return along.map((u) => frac(u * bands * 0.9999));
	}
};

// --- The sustained kinds ---------------------------------------------
//
// These are not transitions, so they write levels directly. All four are pure
// functions of elapsed time — no accumulated state — which is what keeps a
// seek into the middle of one honest.

/** A travelling band, dithered at its edges against each region's fixed threshold — the same settled scatter Waves mode uses. */
function chaseLevels(layout, options, progress) {
	const along = projection(layout, options.angle);
	const cycle = Math.max(options.wavelength, 1e-6);
	const lit = clamp01(options.band);
	const soft = clamp01(options.softness) * (lit / 2);

	return along.map((u, i) => {
		const position = frac(u / cycle - progress * options.cycles);
		if (position >= lit) return 0;
		if (soft <= 0) return 1;
		const depth = Math.min(position, lit - position) / soft;
		return depth >= 1 || layout.points[i].threshold < depth ? 1 : 0;
	});
}

const SUSTAINED = {
	/** Changes nothing — the pause between two moves. */
	hold: (from) => from.slice(),

	/**
	 * Random churn. `rate` is how many times a second the roll is redrawn;
	 * between redraws the pattern holds, so it reads as a scatter of windows
	 * switching rather than a 60fps shimmer.
	 *
	 * `mode` decides what it churns against: `set` ignores the incoming state,
	 * `add` sparkles extra windows on over it, `remove` blinks lit ones off.
	 */
	twinkle: (from, layout, options, elapsed) => {
		const tick = Math.floor(elapsed * Math.max(options.rate, 0.01));
		return layout.points.map((_, i) => {
			const roll = hash01(i, tick);
			if (options.mode === 'add') return from[i] > 0 || roll < options.density ? 1 : 0;
			if (options.mode === 'remove') return from[i] > 0 && roll >= options.density ? 1 : 0;
			return roll < options.density ? 1 : 0;
		});
	},

	/** A band that travels across and repeats — `cycles` full passes over the step. */
	chase: (from, layout, options, elapsed, progress) => chaseLevels(layout, options, progress),

	/**
	 * Everything pulses together. `scope: 'lit'` pulses only the windows that
	 * were already on, so a strobe can punctuate a scene without erasing it.
	 */
	strobe: (from, layout, options, elapsed) => {
		const position = frac(elapsed * Math.max(options.rate, 0.01));
		const level = options.smooth
			? 0.5 - 0.5 * Math.cos(TAU * position)
			: position < clamp01(options.duty)
				? 1
				: 0;
		return layout.points.map((_, i) =>
			options.scope === 'lit' ? (from[i] > 0 ? level : 0) : level
		);
	}
};

// --- The library -----------------------------------------------------
//
// One entry per animation. `controls` is read by the sidebar panel, so adding
// an animation is a change to this file and nothing else.

const slider = (key, label, min, max, step, format) => ({
	key,
	label,
	type: 'slider',
	min,
	max,
	step,
	format
});
const select = (key, label, options) => ({ key, label, type: 'select', options });
const toggle = (key, label, hint = '') => ({ key, label, type: 'toggle', hint });

export const ANIMATION_KINDS = [
	{
		value: 'fade',
		label: 'Fade',
		hint: 'Every window picks its own moment at random and crosses over then.',
		// Its order *is* the random threshold, so blending more randomness in
		// would be a no-op — the panel leaves Scatter out.
		randomOrder: true,
		durationMs: 2200,
		options: {},
		controls: []
	},
	{
		value: 'wipe',
		label: 'Wipe',
		hint: 'A straight edge sweeping across at the angle you set.',
		durationMs: 1600,
		options: { angle: 90 },
		controls: [slider('angle', 'Angle', 0, 360, 5, 'degrees')]
	},
	{
		value: 'split',
		label: 'Split',
		hint: 'Two edges at once — in from both sides, or out from the middle.',
		durationMs: 1600,
		options: { axis: 'y', from: 'edges', position: 0.5 },
		controls: [
			select('axis', 'Axis', [
				{ value: 'y', label: 'Top / bottom' },
				{ value: 'x', label: 'Left / right' }
			]),
			select('from', 'Start at', [
				{ value: 'edges', label: 'The edges' },
				{ value: 'centre', label: 'The middle' }
			]),
			slider('position', 'Meeting line', 0, 1, 0.01, 'percent')
		]
	},
	{
		value: 'ripple',
		label: 'Ripple',
		hint: 'Rings spreading out from a point, or closing in on it.',
		durationMs: 1800,
		options: { centreX: 0.5, centreY: 0.5, direction: 'out' },
		controls: [
			select('direction', 'Travel', [
				{ value: 'out', label: 'Outwards' },
				{ value: 'in', label: 'Inwards' }
			]),
			slider('centreX', 'Centre X', 0, 1, 0.01, 'percent'),
			slider('centreY', 'Centre Y', 0, 1, 0.01, 'percent')
		]
	},
	{
		value: 'spiral',
		label: 'Spiral',
		hint: 'A sweep rotating around a point. Turns winds it outwards; at 0 it is a plain radar sweep.',
		durationMs: 2400,
		options: { centreX: 0.5, centreY: 0.5, turns: 1.5, direction: 'cw' },
		controls: [
			select('direction', 'Rotation', [
				{ value: 'cw', label: 'Clockwise' },
				{ value: 'ccw', label: 'Anticlockwise' }
			]),
			slider('turns', 'Turns', 0, 4, 0.1, 'count'),
			slider('centreX', 'Centre X', 0, 1, 0.01, 'percent'),
			slider('centreY', 'Centre Y', 0, 1, 0.01, 'percent')
		]
	},
	{
		value: 'rain',
		label: 'Rain',
		hint: 'Columns falling top-down, each with its own head start.',
		durationMs: 2200,
		options: { columns: 12, stagger: 0.6 },
		controls: [
			slider('columns', 'Columns', 1, 40, 1, 'count'),
			slider('stagger', 'Stagger', 0, 1, 0.01, 'percent')
		]
	},
	{
		value: 'typewriter',
		label: 'Typewriter',
		hint: 'Row by row, left to right — the scene writes itself out.',
		durationMs: 2600,
		options: { rows: 8, serpentine: false },
		controls: [
			slider('rows', 'Rows', 1, 40, 1, 'count'),
			toggle('serpentine', 'Snake back', 'Turns every other row around so the fill snakes back instead of jumping to the left margin.')
		]
	},
	{
		value: 'weave',
		label: 'Weave',
		hint: 'Rows sweeping in from alternating sides. Stagger 0 closes them all at once like a zip; turned up, each row waits for the one above.',
		durationMs: 2000,
		options: { rows: 10, stagger: 0.15, start: 'left' },
		controls: [
			slider('rows', 'Rows', 1, 40, 1, 'count'),
			slider('stagger', 'Stagger', 0, 1, 0.01, 'percent'),
			select('start', 'First row from', [
				{ value: 'left', label: 'The left' },
				{ value: 'right', label: 'The right' }
			])
		]
	},
	{
		value: 'bloom',
		label: 'Bloom',
		hint: 'Starts at a few windows and spreads to whatever is nearest — organic blobs, not a straight front.',
		durationMs: 2400,
		options: { seeds: 3 },
		controls: [slider('seeds', 'Seeds', 1, 12, 1, 'count')]
	},
	{
		value: 'blinds',
		label: 'Blinds',
		hint: 'Parallel stripes filling at once, all in the same direction.',
		durationMs: 1400,
		options: { bands: 6, angle: 90 },
		controls: [
			slider('bands', 'Bands', 1, 24, 1, 'count'),
			slider('angle', 'Angle', 0, 360, 5, 'degrees')
		]
	},
	{
		value: 'hold',
		label: 'Hold',
		sustained: true,
		hint: 'Keeps the scene exactly as the previous step left it.',
		durationMs: 800,
		options: {},
		controls: []
	},
	{
		value: 'twinkle',
		label: 'Twinkle',
		sustained: true,
		hint: 'Random churn. Rate is how often the roll is redrawn.',
		durationMs: 2000,
		options: { density: 0.35, rate: 6, mode: 'set' },
		controls: [
			select('mode', 'Churn', [
				{ value: 'set', label: 'Replace the scene' },
				{ value: 'add', label: 'Sparkle on top' },
				{ value: 'remove', label: 'Blink lit ones off' }
			]),
			slider('density', 'Density', 0, 1, 0.01, 'percent'),
			slider('rate', 'Rate', 0.5, 30, 0.5, 'rate')
		]
	},
	{
		value: 'chase',
		label: 'Chase',
		sustained: true,
		hint: 'A lit band travelling across and repeating for the length of the step.',
		durationMs: 3000,
		options: { angle: 90, wavelength: 0.5, band: 0.35, softness: 0.3, cycles: 2 },
		controls: [
			slider('angle', 'Angle', 0, 360, 5, 'degrees'),
			slider('cycles', 'Passes', 0.25, 12, 0.25, 'count'),
			slider('wavelength', 'Wavelength', 0.05, 2, 0.05, 'percent'),
			slider('band', 'Band', 0, 1, 0.01, 'percent'),
			slider('softness', 'Softness', 0, 1, 0.01, 'percent')
		]
	},
	{
		value: 'strobe',
		label: 'Strobe',
		sustained: true,
		hint: 'Everything pulses together. Scope it to the lit windows to punctuate a scene without erasing it.',
		durationMs: 1200,
		options: { rate: 4, duty: 0.5, smooth: false, scope: 'all' },
		controls: [
			select('scope', 'Affects', [
				{ value: 'all', label: 'Every window' },
				{ value: 'lit', label: 'Only the lit ones' }
			]),
			slider('rate', 'Rate', 0.5, 20, 0.5, 'rate'),
			slider('duty', 'On for', 0, 1, 0.01, 'percent'),
			toggle('smooth', 'Smooth pulse', 'A sine swell instead of a hard on/off flash.')
		]
	}
];

const KIND_BY_VALUE = new Map(ANIMATION_KINDS.map((kind) => [kind.value, kind]));

/** The spec for a kind, falling back to Fade so an unknown value from a demo file still plays. */
export function kindSpec(value) {
	return KIND_BY_VALUE.get(value) ?? KIND_BY_VALUE.get('fade');
}

export const DIRECTIONS = [
	{ value: 'on', label: 'On' },
	{ value: 'off', label: 'Off' }
];

// --- Steps -----------------------------------------------------------

let nextStepId = 1;

/** A new step with the kind's own defaults filled in. */
export function createStep(kindValue = 'fade') {
	const spec = kindSpec(kindValue);
	return {
		id: `step-${nextStepId++}`,
		kind: spec.value,
		durationMs: spec.durationMs,
		direction: 'on',
		easing: 'inOut',
		scatter: 0.15,
		options: { ...spec.options }
	};
}

function pickKnown(given, allowed) {
	const kept = {};
	for (const key of Object.keys(allowed)) {
		if (given?.[key] !== undefined) kept[key] = given[key];
	}
	return kept;
}

/**
 * Fills in everything a step is missing and drops options its kind doesn't
 * have. Steps arrive from a demo's `settings.json`, which is data — so this is
 * the boundary deciding what a file is allowed to say, the same way
 * `withDefaults` does for the flat settings.
 *
 * An existing id is kept, so re-normalising a live sequence doesn't invalidate
 * the list's `{#each}` keys or close the panel someone had open.
 */
export function normalizeStep(step) {
	const spec = kindSpec(step?.kind);
	const fresh = createStep(spec.value);
	return {
		...fresh,
		id: step?.id ?? fresh.id,
		durationMs: Number.isFinite(step?.durationMs) ? Math.max(0, step.durationMs) : fresh.durationMs,
		direction: step?.direction === 'off' ? 'off' : 'on',
		easing: EASINGS.some((e) => e.value === step?.easing) ? step.easing : fresh.easing,
		scatter: Number.isFinite(step?.scatter) ? clamp01(step.scatter) : fresh.scatter,
		options: { ...fresh.options, ...pickKnown(step?.options, fresh.options) }
	};
}

export function normalizeSteps(steps) {
	return (Array.isArray(steps) ? steps : []).map(normalizeStep);
}

/** Total run time of the sequence, in ms. */
export function totalDuration(steps) {
	return (steps ?? []).reduce((sum, step) => sum + Math.max(0, step.durationMs), 0);
}

/**
 * Which step is showing at `timeMs`, and how far into it we are.
 *
 * `loop` wraps the clock; without it the timeline holds on its last frame. A
 * sequence that is empty, or entirely zero-length, has no moment to report —
 * hence the null.
 */
export function timelineAt(steps, timeMs, loop = true) {
	const total = totalDuration(steps);
	if (!steps?.length || total <= 0) return null;

	const time = loop ? ((timeMs % total) + total) % total : Math.min(Math.max(timeMs, 0), total);
	let start = 0;
	for (let i = 0; i < steps.length; i += 1) {
		const duration = Math.max(0, steps[i].durationMs);
		if (time < start + duration || i === steps.length - 1) {
			const elapsed = Math.min(Math.max(time - start, 0), duration);
			return { index: i, elapsedMs: elapsed, progress: duration > 0 ? elapsed / duration : 1 };
		}
		start += duration;
	}
	return null;
}

/** Where each step begins on the timeline, in ms — what the scrubber divides itself by. */
export function stepOffsets(steps) {
	const offsets = [];
	let start = 0;
	for (const step of steps ?? []) {
		offsets.push(start);
		start += Math.max(0, step.durationMs);
	}
	return offsets;
}

// --- Playback --------------------------------------------------------

/**
 * The arrival order for one step: the kind's ordering, normalised, then
 * blended toward each region's own fixed threshold by `scatter`.
 *
 * That blend is the single dial that makes every geometric pattern organic. At
 * 0 a wipe is a ruler-straight edge; turned up, the same wipe frays into a
 * scattered front; at 1 it is indistinguishable from a plain Fade. Using the
 * region's *stored* threshold rather than a fresh draw is what keeps the
 * fraying stable frame to frame instead of boiling.
 *
 * Sustained kinds have no arrival order and get null.
 */
export function arrivalsFor(step, layout) {
	const spec = kindSpec(step.kind);
	if (spec.sustained) return null;

	const order = ORDERS[spec.value] ?? ORDERS.fade;
	const base = normalize(order(layout, { ...spec.options, ...step.options }));
	const scatter = clamp01(step.scatter);
	if (scatter <= 0 || spec.randomOrder) return base;
	return base.map((a, i) => clamp01(a * (1 - scatter) + layout.points[i].threshold * scatter));
}

/**
 * Levels partway through one step, given the state it started from.
 *
 * `arrivals` is passed in rather than computed here because the frame loop
 * recomputes levels sixty times a second while the ordering only changes when
 * the step's own settings do.
 */
export function stepLevels(step, from, layout, { progress = 0, elapsedMs = 0, arrivals = null } = {}) {
	const spec = kindSpec(step.kind);
	if (spec.sustained) {
		const run = SUSTAINED[spec.value] ?? SUSTAINED.hold;
		return run(
			from,
			layout,
			{ ...spec.options, ...step.options },
			elapsedMs / 1000,
			clamp01(progress)
		);
	}

	const order = arrivals ?? arrivalsFor(step, layout);
	const eased = ease(step.easing, progress);
	const target = step.direction === 'off' ? 0 : 1;
	return order.map((arrival, i) => (eased >= arrival ? target : (from[i] ?? 0)));
}

/**
 * What a step leaves behind. A transition always ends with every region at its
 * target, whatever it started from; a sustained kind ends wherever its last
 * frame put it, which is why that case is just the step evaluated at progress 1.
 */
export function stepEnd(step, from, layout) {
	const spec = kindSpec(step.kind);
	if (spec.sustained) {
		return stepLevels(step, from, layout, {
			progress: 1,
			elapsedMs: Math.max(0, step.durationMs)
		});
	}
	return from.map(() => (step.direction === 'off' ? 0 : 1));
}

/**
 * The state each step *begins* from, folded up the timeline from an all-dark
 * opening.
 *
 * Computing this once — rather than accumulating levels frame to frame — is
 * what makes the timeline seekable: any moment can be drawn without having
 * played the moments before it, which is how the scrubber, a loop restart, and
 * the offscreen video export all agree on what a given millisecond looks like.
 */
export function sequenceStarts(steps, layout) {
	const starts = [];
	let current = layout.points.map(() => 0);
	for (const step of steps ?? []) {
		starts.push(current);
		current = stepEnd(step, current, layout);
	}
	return starts;
}

/**
 * The whole thing: levels at `timeMs` into the sequence.
 *
 * The precomputed `starts` and `arrivals` are optional — pass them from a
 * `$derived` when this runs per frame, leave them out for a one-off.
 */
export function sequenceLevels(
	steps,
	layout,
	timeMs,
	{ loop = true, starts = null, arrivals = null } = {}
) {
	if (!layout.points.length) return [];
	const at = timelineAt(steps, timeMs, loop);
	if (!at) return layout.points.map(() => 0);

	const from = (starts ?? sequenceStarts(steps, layout))[at.index] ?? layout.points.map(() => 0);
	return stepLevels(steps[at.index], from, layout, {
		progress: at.progress,
		elapsedMs: at.elapsedMs,
		arrivals: arrivals ? arrivals[at.index] : null
	});
}

/**
 * What a fresh session opens on: one step, the plainest one there is.
 *
 * A ready-made five-step showreel was the other option and it made the wrong
 * first impression — it read as a fixed thing to watch rather than a stack to
 * build on. One step says "add another".
 */
export const DEFAULT_SEQUENCE = [
	{ kind: 'fade', direction: 'on', durationMs: 2200, easing: 'out', scatter: 0 }
];
