/**
 * Interactive mode: a circle chases the cursor and lights the regions whose
 * centroid falls inside it.
 */

/**
 * Moves `current` a fraction of the way toward `target` for a frame of length
 * `dt` seconds, with `tau` the time constant in seconds (the time to close
 * ~63% of the gap).
 *
 * The exponential form — rather than a fixed per-frame fraction — is what keeps
 * the lag identical on a 60 Hz and a 144 Hz display. A per-frame lerp would
 * make the circle more than twice as responsive on the faster screen for the
 * same slider value.
 */
export function easeToward(current, target, tau, dt) {
	if (!current || tau <= 0 || dt <= 0) return { x: target.x, y: target.y };
	const k = 1 - Math.exp(-dt / tau);
	return {
		x: current.x + (target.x - current.x) * k,
		y: current.y + (target.y - current.y) * k
	};
}

/**
 * Lit level (0 or 1) per region for a circle at `center` with `radius`, in
 * viewBox units.
 *
 * `smoothing` (0-1) carves a falloff band that far in from the circle's edge.
 * Inside the band a region is lit only if its depth into the band clears its
 * own threshold, so the boundary breaks up into a scatter of lit and dark
 * windows instead of a clean arc.
 *
 * That threshold comes from the region itself (fixed at import), which is the
 * point: as the circle sweeps across, each window switches on at its own depth
 * and then stays on. Drawing a fresh number every frame instead — what
 * `twinkle` does — turns the same band into a 60fps shimmer.
 */
export function interactiveLevels(regions, center, radius, smoothing, { twinkle = false, random = Math.random } = {}) {
	const levels = new Array(regions.length);
	if (!center || radius <= 0) return levels.fill(0);

	const band = Math.max(0, Math.min(1, smoothing)) * radius;

	for (let i = 0; i < regions.length; i += 1) {
		const { centroid, threshold } = regions[i];
		const distance = Math.hypot(centroid.x - center.x, centroid.y - center.y);

		if (band <= 0) {
			levels[i] = distance <= radius ? 1 : 0;
			continue;
		}
		const depth = (radius - distance) / band; // 1 at the band's inner edge, 0 at the circle's rim
		if (depth >= 1) levels[i] = 1;
		else if (depth <= 0) levels[i] = 0;
		else levels[i] = (twinkle ? random() : threshold) < depth ? 1 : 0;
	}
	return levels;
}

/** True when two level arrays are identical — lets a frame skip its state write. */
export function levelsMatch(a, b) {
	if (a === b) return true;
	if (!a || !b || a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
	return true;
}
