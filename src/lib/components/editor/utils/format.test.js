import { describe, expect, it } from 'vitest';
import { formatMs, formatPercent, formatPx, parsePercent } from './format.js';

describe('percent', () => {
	it('round-trips through the display string', () => {
		expect(parsePercent(formatPercent(0.35))).toBeCloseTo(0.35);
	});

	it('parses a bare number as a percentage too', () => {
		// Typing "35" into a field showing "35%" should mean the same thing.
		expect(parsePercent('35')).toBeCloseTo(0.35);
		expect(parsePercent('35%')).toBeCloseTo(0.35);
	});

	it('reports unparseable text as NaN so the caller can reject the edit', () => {
		expect(parsePercent('wide')).toBeNaN();
	});
});

describe('formatPx', () => {
	it('trims trailing zeros so a whole number reads as one', () => {
		expect(formatPx(2)).toBe('2px');
		expect(formatPx(1.5)).toBe('1.5px');
		expect(formatPx(1.005, 2)).toBe('1px');
	});
});

describe('formatMs', () => {
	it('rounds to whole milliseconds', () => {
		expect(formatMs(119.6)).toBe('120ms');
	});
});
