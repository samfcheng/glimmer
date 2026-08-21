/**
 * Frame timing for the animated modes.
 *
 * Pulled out of the loops so the stepping rules are testable on their own —
 * a browser's `requestAnimationFrame` clock is not something a unit test can
 * drive, but the arithmetic hanging off it is.
 */

/** Longest step a single frame may take, in seconds. */
export const MAX_FRAME_STEP = 0.1;

/**
 * Seconds elapsed between two `requestAnimationFrame` timestamps.
 *
 * The first frame of a loop has nothing to measure against and yields 0. Long
 * gaps — a backgrounded tab returning after a minute — are clamped, so the
 * animation resumes rather than teleporting. A timestamp that goes backwards
 * (clock adjustments do happen) yields 0 instead of running the animation in
 * reverse.
 */
export function frameDelta(previousTime, time, maxStep = MAX_FRAME_STEP) {
	if (!previousTime) return 0;
	return Math.min(Math.max(time - previousTime, 0) / 1000, maxStep);
}
