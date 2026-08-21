/**
 * Random mode: every region independently on or off.
 *
 * Each region gets a roll in [0,1) from the current seed, and is lit when its
 * roll falls under the Lit Chance. Keeping the rolls fixed and sliding the
 * cut-off through them is what makes the slider read as a *density* control —
 * raising it lights additional windows while leaving the already-lit ones
 * alone. Rerolling only happens on a scramble (a new seed).
 */

import { createRng } from './rng.js';

export function rollRegions(count, seed) {
	const rng = createRng(seed);
	const rolls = new Array(count);
	for (let i = 0; i < count; i += 1) rolls[i] = rng();
	return rolls;
}

export function randomLevels(rolls, litChance) {
	return rolls.map((roll) => (roll < litChance ? 1 : 0));
}
