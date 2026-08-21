/**
 * Small seeded PRNG (mulberry32) — same seed, same sequence. Random mode uses
 * it so a scramble is reproducible from its seed alone, which keeps the state
 * a single number instead of an array that has to be carried around.
 */
export function createRng(seed) {
	let a = seed >>> 0;
	return function next() {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
