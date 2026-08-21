import { describe, expect, it } from 'vitest';
import { defaults, withDefaults } from './settings.js';

describe('withDefaults', () => {
	it('returns the defaults when nothing is overridden', () => {
		expect(withDefaults({})).toEqual(defaults);
		expect(withDefaults()).toEqual(defaults);
	});

	it('applies only the keys a demo names', () => {
		const resolved = withDefaults({ mode: 'interactive' });
		expect(resolved.mode).toBe('interactive');
		expect(resolved.litChance).toBe(defaults.litChance);
	});

	// A demo file is data, so a key that isn't a known setting is dropped
	// rather than carried onto the state.
	it('ignores unknown keys', () => {
		expect(withDefaults({ nonsense: 1 })).toEqual(defaults);
	});

	it("doesn't mutate defaults", () => {
		withDefaults({ mode: 'waves' }).mode = 'random';
		expect(defaults.mode).toBe('random');
		expect(withDefaults({}).mode).toBe(defaults.mode);
	});

	// `false` and `0` are legitimate values a demo may want to pin.
	it('keeps falsy overrides', () => {
		expect(withDefaults({ litChance: 0, autoScramble: false }).litChance).toBe(0);
	});
});
