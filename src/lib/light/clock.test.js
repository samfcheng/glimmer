import { describe, expect, it } from 'vitest';
import { frameDelta, MAX_FRAME_STEP } from './clock.js';

describe('frameDelta', () => {
	it('yields nothing on the first frame', () => {
		expect(frameDelta(0, 1000)).toBe(0);
		expect(frameDelta(null, 1000)).toBe(0);
	});

	it('converts a normal frame gap to seconds', () => {
		expect(frameDelta(1000, 1016.67)).toBeCloseTo(0.01667, 5);
	});

	it('clamps a long gap so a backgrounded tab resumes rather than jumps', () => {
		expect(frameDelta(1000, 61000)).toBe(MAX_FRAME_STEP);
	});

	it('refuses to run backwards when the clock jumps back', () => {
		expect(frameDelta(2000, 1000)).toBe(0);
	});

	it('accumulates to real time across a run of frames', () => {
		let elapsed = 0;
		let previous = 0;
		for (let i = 1; i <= 60; i += 1) {
			const time = i * (1000 / 60);
			elapsed += frameDelta(previous, time);
			previous = time;
		}
		// 60 frames at 60fps, minus the first frame's zero step.
		expect(elapsed).toBeCloseTo(59 / 60, 6);
	});
});
