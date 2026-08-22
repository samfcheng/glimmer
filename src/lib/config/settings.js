/**
 * Tunable constants for the app. Slider ranges are `{min, max, step}` objects
 * consumed directly by the matching sidebar control. Add tunables here, never
 * inline in a component.
 */
export const settings = {
	// --- View ---
	fitPaddingPx: 40, // breathing room left around the image when the view is fit/reset
	minZoom: 0.1,
	maxZoom: 8,
	panClickThresholdPx: 4, // a press only becomes a pan past this much movement

	// --- Random mode ---
	// Share of regions lit. Rerolled per region on scramble; the slider then
	// slides the cut-off through those fixed rolls, so raising it lights *more*
	// windows rather than reshuffling which ones are on.
	litChance: { min: 0, max: 1, step: 0.01 },
	// How long a set of lit windows holds before auto-scramble reshuffles it.
	scrambleDelay: { min: 100, max: 5000, step: 50 },

	// --- Interactive mode ---
	// Circle radius as a share of image width, so it means the same thing
	// regardless of how large the uploaded image is.
	radius: { min: 0.01, max: 1, step: 0.01 },
	// Lag of the circle behind the true cursor, as a time constant in seconds.
	// 0 pins the circle to the cursor exactly.
	responsiveness: { min: 0, max: 0.6, step: 0.01 },
	// How far in from the circle's edge regions are randomly (rather than
	// deterministically) lit, as a share of the radius. 0 = hard cut-off.
	smoothing: { min: 0, max: 1, step: 0.01 },

	// --- Waves mode ---
	// Waves per second. 0 freezes the pattern where it stands.
	waveSpeed: { min: 0, max: 2, step: 0.05 },
	// Gap between crests, as a share of the travel axis: 1 puts a single wave
	// across the whole image, 0.25 puts four.
	waveLength: { min: 0.05, max: 2, step: 0.05 },
	// How much of each wave is lit.
	waveBand: { min: 0, max: 1, step: 0.01 },
	// How much of the band's half-width is dithered rather than solid.
	waveSoftness: { min: 0, max: 1, step: 0.01 },
	// Where a radial wave starts, as an offset from the frame's middle in
	// shares of its width/height. ±0.5 sits on an edge; further is off-image.
	waveCentre: { min: -1, max: 1, step: 0.01 },

	// --- Appearance ---
	// Cross-fade between a region's dark and lit state, in milliseconds.
	fade: { min: 0, max: 1000, step: 10 },
	// How far each region grows outwards in the mask, in screen px. A hair of
	// it is needed even on a gapless SVG: two paths sharing an edge each cover
	// about half of the boundary pixel, and half over half composites to 75%
	// rather than 100%, leaving a seam of unlit base image along every shared
	// edge. Growing both sides past the seam fills it. Screen px (not viewBox
	// units) so the fix stays the same size as the artefact it covers at any
	// zoom, on an SVG of any scale.
	regionPadding: { min: 0, max: 6, step: 0.25 },

	// --- Debug ---
	// Screen width of the region outlines, in px (they never scale with zoom).
	pathWidth: { min: 0.5, max: 8, step: 0.5 },

	// --- Geometry ---
	// Max distance (in viewBox units) a flattened curve may stray from the true
	// curve. Only affects centroid accuracy — rendering uses the original `d`.
	curveTolerance: 0.25,
	maxCurveDepth: 16 // recursion guard for the adaptive flattener
};

/** Starting values for a fresh session. */
export const defaults = {
	mode: 'random',
	litChance: 0.5,
	autoScramble: false,
	scrambleDelayMs: 800,
	radiusPercent: 0.15,
	responsiveness: 0.08,
	smoothing: 0.35,
	twinkle: false,
	waveDirection: 'down',
	waveSpeed: 0.35,
	waveLength: 0.5,
	waveBand: 0.35,
	waveSoftness: 0.3,
	waveCentreX: 0,
	waveCentreY: 0,
	showCircle: false,
	showPaths: false,
	pathWidth: 1,
	fadeMs: 120,
	regionPaddingPx: 1
};

/**
 * A complete settings object from a partial one — the shape a demo's
 * `settings.json` holds, where only what differs from `defaults` is written.
 *
 * Iterating `defaults` rather than the overrides means an unknown key in the
 * file is ignored instead of landing on the state: the file is data, and
 * `defaults` is the list of what it is allowed to set.
 */
export function withDefaults(overrides = {}) {
	const resolved = { ...defaults };
	for (const key of Object.keys(defaults)) {
		if (overrides?.[key] !== undefined) resolved[key] = overrides[key];
	}
	return resolved;
}
