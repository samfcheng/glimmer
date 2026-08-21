/**
 * Waves mode: a lit band travels across the scene, switching regions on as it
 * arrives and off as it passes.
 *
 * Every direction reduces to the same one-dimensional problem — each region
 * gets a coordinate `u` along the direction of travel, and the band is a
 * repeating window sliding along `u`. Only `waveCoordinates` knows about
 * geometry; the animation itself never does.
 */

export const WAVE_DIRECTIONS = [
	{ value: 'down', label: 'Down' },
	{ value: 'up', label: 'Up' },
	{ value: 'right', label: 'Right' },
	{ value: 'left', label: 'Left' },
	{ value: 'out', label: 'Out from centre' },
	{ value: 'in', label: 'In to centre' }
];

/**
 * Position of each region along the wave's travel axis, normalised so 0 is
 * where the wave enters and 1 is where it leaves.
 *
 * Radial directions measure from a centre point out to whichever frame corner
 * is furthest from it, so 1 always means "the last region the wave reaches".
 * `centre` nudges that point off the middle of the frame, as a share of the
 * frame's width and height — ±0.5 puts it on an edge, beyond that it sits
 * outside the image entirely. It has no meaning for the linear directions,
 * which is why the sidebar only offers it for radial ones.
 */
export function waveCoordinates(regions, frame, direction, centre = { x: 0, y: 0 }) {
	const width = frame?.width || 1;
	const height = frame?.height || 1;
	const cx = frame.x + width / 2 + (centre?.x ?? 0) * width;
	const cy = frame.y + height / 2 + (centre?.y ?? 0) * height;
	// Normalising against the furthest corner (rather than a fixed half-
	// diagonal) keeps u inside 0-1 however far the centre is dragged, so
	// wavelength keeps meaning the same thing as the centre moves.
	const maxRadius =
		Math.max(
			...[
				[frame.x, frame.y],
				[frame.x + width, frame.y],
				[frame.x, frame.y + height],
				[frame.x + width, frame.y + height]
			].map(([x, y]) => Math.hypot(x - cx, y - cy))
		) || 1;

	return regions.map(({ centroid }) => {
		const down = (centroid.y - frame.y) / height;
		const right = (centroid.x - frame.x) / width;
		const out = Math.hypot(centroid.x - cx, centroid.y - cy) / maxRadius;
		switch (direction) {
			case 'up':
				return 1 - down;
			case 'right':
				return right;
			case 'left':
				return 1 - right;
			case 'out':
				return out;
			case 'in':
				return 1 - out;
			case 'down':
			default:
				return down;
		}
	});
}

/**
 * Lit level per region at `time` seconds.
 *
 * `wavelength` is the gap between crests as a share of the travel axis, and
 * `band` is how much of each wave is lit — so wavelength 0.5 with band 0.35
 * puts two waves on screen, each lighting the leading third of its cycle.
 * `speed` is waves per second; 0 freezes the pattern in place.
 *
 * `softness` dithers both edges of the band against each region's own fixed
 * threshold — the same trick the interactive circle uses, and for the same
 * reason: a region switches on at its own point in the sweep and stays on,
 * giving the wavefront a scattered edge that travels rather than shimmers.
 */
export function waveLevels(
	coordinates,
	regions,
	{ time = 0, speed = 0, wavelength = 1, band = 0.5, softness = 0, twinkle = false, random = Math.random } = {}
) {
	const levels = new Array(coordinates.length);
	const cycle = Math.max(wavelength, 1e-6);
	const litShare = Math.min(Math.max(band, 0), 1);
	const softShare = Math.min(Math.max(softness, 0), 1);
	// The band is dithered inward from both edges, so the soft span is measured
	// against its half-width — at softness 1 the whole band is dither.
	const softSpan = softShare * (litShare / 2);

	for (let i = 0; i < coordinates.length; i += 1) {
		const phase = coordinates[i] / cycle - time * speed;
		const position = phase - Math.floor(phase); // where in its cycle this region sits

		if (position >= litShare) {
			levels[i] = 0;
			continue;
		}
		if (softSpan <= 0) {
			levels[i] = 1;
			continue;
		}
		const depth = Math.min(position, litShare - position) / softSpan;
		if (depth >= 1) levels[i] = 1;
		else levels[i] = (twinkle ? random() : regions[i].threshold) < depth ? 1 : 0;
	}
	return levels;
}
