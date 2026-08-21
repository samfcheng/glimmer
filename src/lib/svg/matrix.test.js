import { describe, expect, it } from 'vitest';
import { applyMatrix, IDENTITY, isIdentity, multiply, parseTransform } from './matrix.js';

const at = (transform, point) => applyMatrix(parseTransform(transform), point);

describe('parseTransform', () => {
	it('returns identity for a missing transform', () => {
		expect(parseTransform(null)).toEqual(IDENTITY);
		expect(parseTransform('')).toEqual(IDENTITY);
	});

	it('handles translate with an implied y', () => {
		expect(at('translate(5)', { x: 1, y: 1 })).toEqual({ x: 6, y: 1 });
		expect(at('translate(5, 7)', { x: 1, y: 1 })).toEqual({ x: 6, y: 8 });
	});

	it('handles scale with an implied second factor', () => {
		expect(at('scale(2)', { x: 3, y: 4 })).toEqual({ x: 6, y: 8 });
		expect(at('scale(2 3)', { x: 3, y: 4 })).toEqual({ x: 6, y: 12 });
	});

	it('rotates about the origin', () => {
		const point = at('rotate(90)', { x: 1, y: 0 });
		expect(point.x).toBeCloseTo(0, 9);
		expect(point.y).toBeCloseTo(1, 9);
	});

	it('rotates about a given centre', () => {
		const point = at('rotate(180, 5, 5)', { x: 6, y: 5 });
		expect(point.x).toBeCloseTo(4, 9);
		expect(point.y).toBeCloseTo(5, 9);
	});

	it('applies a transform list left to right', () => {
		// translate then scale: the scale applies in the translated frame.
		expect(at('translate(10 0) scale(2)', { x: 1, y: 0 })).toEqual({ x: 12, y: 0 });
		expect(at('scale(2) translate(10 0)', { x: 1, y: 0 })).toEqual({ x: 22, y: 0 });
	});

	it('skips a function it does not understand', () => {
		expect(at('nonsense(3) translate(1 1)', { x: 0, y: 0 })).toEqual({ x: 1, y: 1 });
	});
});

describe('multiply', () => {
	it('composes so the right-hand matrix applies first', () => {
		const composed = multiply(parseTransform('scale(2)'), parseTransform('translate(1 0)'));
		expect(applyMatrix(composed, { x: 0, y: 0 })).toEqual({ x: 2, y: 0 });
	});

	it('leaves a matrix unchanged against identity', () => {
		const m = parseTransform('translate(3 4) rotate(20)');
		expect(multiply(IDENTITY, m)).toEqual(m);
	});
});

describe('isIdentity', () => {
	it('recognises a no-op transform chain', () => {
		expect(isIdentity(parseTransform('translate(0 0) scale(1)'))).toBe(true);
		expect(isIdentity(parseTransform('translate(1 0)'))).toBe(false);
	});
});
