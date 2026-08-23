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

	// The animation sequence is the one setting that is a whole array of
	// objects, so a shallow copy would hand every caller the same steps and the
	// first sidebar edit would rewrite the defaults for the session.
	it('hands out its own copy of the animation sequence', () => {
		const first = withDefaults({});
		const second = withDefaults({});
		expect(first.animationSteps).not.toBe(defaults.animationSteps);
		expect(first.animationSteps[0]).not.toBe(second.animationSteps[0]);

		first.animationSteps[0].durationMs = 12345;
		first.animationSteps[0].options.angle = 7;
		expect(withDefaults({}).animationSteps[0].durationMs).toBe(defaults.animationSteps[0].durationMs);
	});

	it('fills a sequence out of a demo file, and drops what it may not set', () => {
		const [step] = withDefaults({
			animationSteps: [{ kind: 'wipe', options: { angle: 30, nonsense: 1 } }]
		}).animationSteps;
		expect(step.kind).toBe('wipe');
		expect(step.options).toEqual({ angle: 30 });
		expect(step.direction).toBe('on');
		expect(step.id).toBeTruthy();
	});
});
